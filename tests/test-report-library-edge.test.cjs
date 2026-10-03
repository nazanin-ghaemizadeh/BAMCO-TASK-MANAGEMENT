// Isolated HTTP/state-machine tests. Never reads credentials or calls a network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto,createHash}=require('node:crypto');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/test-report-library/index.ts','utf8'));
const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const yearId='33333333-3333-4333-8333-333333333333',fileId='44444444-4444-4444-8444-444444444444';
const bytes='%PDF-1.7\nisolated report';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}){
 let handler,seq=0;const calls=[],years=new Map(),files=new Map(),objects=new Map(),leases=new Map(),tombstones=new Set();
 const controls={...options};
 const stamp=()=>`2026-10-03T10:00:${String(++seq).padStart(2,'0')}.000Z`;
 if(!options.noYear)years.set(yearId,{id:yearId,domain:'environment',report_type:'research',jalali_year:1405,created_by:actor,created_at:stamp(),updated_at:stamp()});
 const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
 const touch=id=>{const y=years.get(id);if(y)y.updated_at=stamp()};
 const fetch=async(url,init={})=>{
  const u=new URL(url),method=init.method||'GET',path=u.pathname;calls.push({path,method,headers:init.headers,body:init.body});
  assert(init.signal,'All upstream calls carry bounded abort signals');
  if(path==='/auth/v1/user')return response({id:controls.actor||actor},controls.auth===false?401:200);
  if(path==='/rest/v1/rpc/can_access_feature'){
   assert.equal(init.headers.Authorization,'Bearer user-token');assert.equal(init.headers.apikey,'anon');
   const body=JSON.parse(init.body);assert.equal(body.p_feature_key,'documents');
   return response(controls.denied===true||controls.denied===body.p_action?false:true);
  }
  assert(calls.some(c=>c.path==='/rest/v1/rpc/can_access_feature'),'Service access must follow authorization');
  assert.equal(init.headers.Authorization,'Bearer service');
  const body=typeof init.body==='string'?JSON.parse(init.body):null;
  if(path==='/rest/v1/rpc/test_report_claim_operation'){
   if(tombstones.has(body.p_id))return response({claimed:false,deleted:true});
   if(leases.has(body.p_id))return response({claimed:false,retry_after:180});
   leases.set(body.p_id,{token:body.p_token,action:body.p_action});return response({claimed:true});
  }
  if(path==='/rest/v1/rpc/test_report_release_operation'){
   if(leases.get(body.p_id)?.token===body.p_token)leases.delete(body.p_id);return response(true);
  }
  if(path==='/rest/v1/rpc/test_report_finish_upload'){
   if(controls.finalizeReject)return response(null);
   const row=files.get(body.p_id);assert.equal(row.status,'pending');assert.equal(leases.get(body.p_id)?.token,body.p_token);
   row.status='ready';row.updated_at=stamp();touch(row.year_id);leases.delete(body.p_id);
   if(controls.finalizeLost){controls.finalizeLost=false;throw new TypeError('lost committed finalize reply')}
   return response(row);
  }
  if(path==='/rest/v1/rpc/test_report_finish_delete'){
   const row=files.get(body.p_id);assert.equal(row.status,'deleting');assert.equal(leases.get(body.p_id)?.token,body.p_token);
   files.delete(body.p_id);touch(row.year_id);tombstones.add(body.p_id);leases.delete(body.p_id);
   if(controls.deleteCommitLost){controls.deleteCommitLost=false;throw new TypeError('lost committed delete reply')}
   return response(true);
  }
  if(path.startsWith('/rest/v1/test_report_')){
   const table=path.endsWith('test_report_years')?years:files;
   const wantedId=u.searchParams.get('id')?.slice(3),wantedYear=u.searchParams.get('year_id')?.slice(3),status=u.searchParams.get('status')?.slice(3);
   const rows=[...table.values()].filter(r=>(!wantedId||r.id===wantedId)&&(!wantedYear||r.year_id===wantedYear)&&(!status||r.status===status));
   if(method==='GET')return response(u.searchParams.has('limit')?rows.slice(0,Number(u.searchParams.get('limit'))):rows,200,{'content-range':`0-0/${rows.length}`});
   if(method==='POST'){
    if(table.has(body.id)||(table===years&&[...years.values()].some(y=>y.domain===body.domain&&y.report_type===body.report_type&&y.jalali_year===body.jalali_year)))return response({code:'23505'},409);
    if(table===files){assert.equal(body.status,'pending');assert.equal(objects.size,0,'Reservation precedes object storage');if(!years.has(body.year_id))return response({code:'23503'},409)}
    const row={...body,created_at:stamp(),updated_at:stamp()};table.set(body.id,row);if(table===files)touch(row.year_id);
    if(controls.reserveLost){controls.reserveLost=false;throw new TypeError('lost reservation reply')}
    return response([row]);
   }
   if(method==='PATCH'){for(const row of rows){Object.assign(row,body,{updated_at:stamp()});if(table===files)touch(row.year_id)}return response(rows)}
   if(method==='DELETE'){if(table===years&&[...files.values()].some(f=>f.year_id===wantedId))return response({code:'23503'},409);rows.forEach(r=>table.delete(r.id));return response(rows)}
  }
  if(path===`/storage/v1/object/test-reports-private`&&method==='DELETE'){
   const row=files.get(fileId);assert.equal(row.status,'deleting','Deletion status is persisted before object removal');
   if(controls.removeFails)return response({error:'unavailable'},503);
   for(const p of body.prefixes)objects.delete(p);
   if(controls.removeLost){controls.removeLost=false;throw new TypeError('lost storage delete reply')}
   return response([]);
  }
  if(path.startsWith('/storage/v1/object/authenticated/test-reports-private/')){
   const key=decodeURIComponent(path.split('/test-reports-private/')[1]);const obj=objects.get(key);return obj?new Response(obj):response({error:'missing'},404);
  }
  if(path.startsWith('/storage/v1/object/test-reports-private/')){
   const key=decodeURIComponent(path.split('/test-reports-private/')[1]);
   assert.equal(files.get(fileId)?.status,'pending');assert.equal(init.headers['x-upsert'],'false');
   if(objects.has(key))return response({error:'Duplicate',message:'The resource already exists'},400);
   if(controls.storeFails)return response({error:'storage unavailable'},503);
   objects.set(key,await init.body.arrayBuffer());
   if(controls.storeLost){controls.storeLost=false;throw new TypeError('lost upload reply')}
   return response({Key:key});
  }
  throw Error(`Unexpected fake request ${method} ${path}`);
 };
 vm.runInNewContext(source,{Deno:{env:{get:k=>({SUPABASE_URL:'https://isolated.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[k]},serve:f=>handler=f},fetch,AbortSignal,File,Response,crypto:webcrypto,console,Uint8Array});
 return {calls,years,files,objects,leases,tombstones,controls,expire(){leases.clear()},async call(action,fields={}){
  const form=new FormData();form.set('action',action);
  const defaults=action==='upload'?{id:fileId,year_id:yearId,title:'گزارش آزمون',description:'شرح گزارش',file:new File([bytes],'گزارش.pdf',{type:'application/pdf'})}:action.endsWith('_year')?{year_id:yearId}: {file_id:fileId};
  Object.entries({...defaults,...fields}).forEach(([k,v])=>{if(v!==undefined)form.set(k,v)});
  const result=await handler(new Request('https://isolated.invalid',{method:'POST',headers:{Authorization:'Bearer user-token'},body:form}));
  return {status:result.status,body:await result.json()};
 }};
}
test('verified user and exact documents action are checked before service access',async()=>{
 for(const [action,permission]of Object.entries({upload:'create',create_year:'create',update:'edit',update_year:'edit',delete:'delete',delete_year:'delete'})){
  const f=fixture({denied:permission}),r=await f.call(action);assert.equal(r.status,403);assert.equal(f.calls.length,2);
  assert.equal(JSON.parse(f.calls[1].body).p_action,permission);
 }
 const f=fixture({auth:false});assert.equal((await f.call('upload')).status,401);assert.equal(f.calls.length,1);
});
test('upload reserves pending metadata, computes SHA-256, stores once and returns ready',async()=>{
 const f=fixture(),prior=f.years.get(yearId).updated_at,r=await f.call('upload');assert.equal(r.status,200);assert.equal(r.body.file.status,'ready');
 assert.equal(r.body.file.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(f.files.size,1);assert.equal(f.objects.size,1);
 assert.notEqual(f.years.get(yearId).updated_at,prior);assert.equal(r.body.file.created_by,actor);assert.equal(f.leases.size,0);
 const path=r.body.file.storage_path;assert.match(path,new RegExp(`^years/${yearId}/${fileId}\\.pdf$`));
 const replay=await f.call('upload');assert.equal(replay.status,200);assert.equal(replay.body.file.id,fileId);
 assert.equal(f.calls.filter(c=>c.path.startsWith('/storage/')&&c.method==='POST').length,1);
});
test('same upload ID cannot change bytes, metadata, creator or folder',async()=>{
 const f=fixture();assert.equal((await f.call('upload')).status,200);
 for(const changes of [{title:'عنوان دیگر'},{description:'تغییر'},{year_id:other},{file:new File(['different'],'گزارش.pdf',{type:'application/pdf'})}]){
  const r=await f.call('upload',changes);assert.equal(r.status,409);assert.equal(r.body.code,'idempotency_conflict');
 }
 f.controls.actor=other;assert.equal((await f.call('upload')).status,409);assert.equal(f.objects.size,1);
});
test('lost reservation reply leaves one pending row and no object; retry resumes same row',async()=>{
 const f=fixture({reserveLost:true});assert.equal((await f.call('upload')).status,503);assert.equal(f.files.size,1);assert.equal(f.files.get(fileId).status,'pending');assert.equal(f.objects.size,0);
 assert.equal((await f.call('upload')).body.code,'operation_busy');f.expire();assert.equal((await f.call('upload')).status,200);assert.equal(f.files.size,1);
});
test('lost storage response retains pending metadata and bytes without destructive compensation',async()=>{
 const f=fixture({storeLost:true});assert.equal((await f.call('upload')).status,503);assert.equal(f.files.get(fileId).status,'pending');assert.equal(f.objects.size,1);
 assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);f.expire();assert.equal((await f.call('upload')).status,200);
 assert(f.calls.some(c=>c.path.startsWith('/storage/v1/object/authenticated/')));assert.equal(f.objects.size,1);
});
test('conflicting stored bytes are never overwritten or finalized',async()=>{
 const f=fixture({storeLost:true});await f.call('upload');f.expire();f.objects.set(f.files.get(fileId).storage_path,new TextEncoder().encode('corrupted').buffer);
 const r=await f.call('upload');assert.equal(r.status,409);assert.equal(r.body.code,'object_conflict');assert.equal(f.files.get(fileId).status,'pending');
 assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
});
test('lost finalization reply is reconciled as the same ready file',async()=>{
 const f=fixture({finalizeLost:true});assert.equal((await f.call('upload')).status,503);assert.equal(f.files.get(fileId).status,'ready');
 const r=await f.call('upload');assert.equal(r.status,200);assert.equal(r.body.file.id,fileId);assert.equal(f.objects.size,1);
});
test('same ID cannot be deleted during an unresolved upload lease',async()=>{
 const f=fixture({storeLost:true});await f.call('upload');const r=await f.call('delete');assert.equal(r.status,409);assert.equal(r.body.code,'operation_busy');assert.equal(r.body.retry_after,180);
 assert.equal(f.calls.filter(c=>c.method==='DELETE').length,0);
});
test('delete marks deleting first; storage failure remains visible and retriable after reload',async()=>{
 const f=fixture();await f.call('upload');f.controls.removeFails=true;const r=await f.call('delete');assert.equal(r.status,503);assert.equal(f.files.get(fileId).status,'deleting');assert.equal(f.objects.size,1);
 f.expire();f.controls.removeFails=false;assert.equal((await f.call('delete')).status,200);assert.equal(f.files.size,0);assert.equal(f.objects.size,0);
 assert(f.tombstones.has(fileId));assert.equal((await f.call('delete')).status,200);assert.equal((await f.call('upload')).body.code,'deleted_id');
});
test('lost delete-storage reply never deletes metadata early and retries an absent object safely',async()=>{
 const f=fixture();await f.call('upload');f.controls.removeLost=true;assert.equal((await f.call('delete')).status,503);
 assert.equal(f.files.get(fileId).status,'deleting');assert.equal(f.objects.size,0);f.expire();assert.equal((await f.call('delete')).status,200);assert.equal(f.files.size,0);
});
test('lost final delete reply returns success on retry without resurrecting the ID',async()=>{
 const f=fixture();await f.call('upload');f.controls.deleteCommitLost=true;assert.equal((await f.call('delete')).status,503);assert.equal(f.files.size,0);
 assert.equal((await f.call('delete')).status,200);assert.equal((await f.call('upload')).body.code,'deleted_id');
});
test('metadata edit is ready-only and limited to title/description',async()=>{
 const f=fixture();await f.call('upload');const before=clone(f.files.get(fileId));const r=await f.call('update',{title:'عنوان تازه',description:'شرح تازه',year_id:other,storage_path:'evil'});
 assert.equal(r.status,200);assert.equal(r.body.file.title,'عنوان تازه');assert.equal(r.body.file.year_id,before.year_id);assert.equal(r.body.file.storage_path,before.storage_path);assert.equal(r.body.file.created_at,before.created_at);
 f.files.get(fileId).status='pending';assert.equal((await f.call('update',{title:'title'})).body.code,'file_not_ready');
});
test('year create validates fixed branches, uniqueness and inclusive Jalali bounds',async()=>{
 const f=fixture({noYear:true});const fields={id:yearId,domain:'environment',report_type:'research',jalali_year:'1200'};
 assert.equal((await f.call('create_year',fields)).status,200);assert.equal((await f.call('create_year',fields)).status,200);
 assert.equal((await f.call('create_year',{...fields,id:other})).status,409);
 assert.equal((await f.call('create_year',{...fields,id:other,domain:'custom'})).status,400);
 assert.equal((await f.call('create_year',{...fields,id:other,jalali_year:'1601'})).status,400);
 assert.equal((await f.call('update_year',{jalali_year:'1600'})).status,200);
 assert.equal(f.years.get(yearId).jalali_year,1600);
});
test('year deletion blocks every nonempty state and returns exact file count',async()=>{
 const f=fixture();await f.call('upload');f.files.set(other,{...f.files.get(fileId),id:other,status:'pending'});
 let r=await f.call('delete_year');assert.equal(r.status,409);assert.equal(r.body.code,'folder_not_empty');assert.equal(r.body.count,2);
 f.files.clear();r=await f.call('delete_year');assert.equal(r.status,200);assert.equal(f.years.size,0);
});
test('empty, oversized, unsupported and invalid metadata uploads fail before reservations',async()=>{
 for(const fields of [{file:new File([],'x.pdf',{type:'application/pdf'})},{file:new File(['x'],'x.exe',{type:'application/octet-stream'})},{id:'not-a-uuid'},{title:''},{title:'x'.repeat(221)}]){
  const f=fixture(),r=await f.call('upload',fields);assert(r.status>=400&&r.status<500);assert.equal(f.files.size,0);assert.equal(f.objects.size,0);
 }
 const f=fixture(),big=new File([new Uint8Array(25*1024*1024+1)],'big.pdf',{type:'application/pdf'});assert.equal((await f.call('upload',{file:big})).status,413);assert.equal(f.files.size,0);
});


test('downloadable filename extension and declared MIME must both be allowed and consistent', async()=>{
 for(const selected of [new File(['x'],'payload.exe',{type:'application/pdf'}),new File(['x'],'report.pdf',{type:'image/png'}),new File(['x'],'report.pdf',{type:'text/html'}),new File(['x'],'report.constructor',{type:''})]){
  const f=fixture(),r=await f.call('upload',{file:selected});assert.equal(r.status,400);assert.equal(r.body.code,'invalid_file_type');
  assert.equal(f.files.size,0);assert.equal(f.objects.size,0);assert.equal(f.leases.size,0);
 }
 for(const selected of [new File(['x'],'report.pdf',{type:''}),new File(['x'],'report.pdf',{type:'application/octet-stream'}),new File(['x'],'report.JPG',{type:'image/jpeg'}),new File(['x'],'report.jpeg',{type:'image/jpeg'})]){
  const f=fixture(),r=await f.call('upload',{file:selected});assert.equal(r.status,200);assert.equal(f.files.size,1);assert.equal(f.objects.size,1);
 }
});

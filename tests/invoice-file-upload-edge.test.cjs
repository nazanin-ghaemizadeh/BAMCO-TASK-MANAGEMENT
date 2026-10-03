const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const source = import(pathToFileURL(require('node:path').resolve('supabase/functions/invoice-file-upload/worker.mjs')));
const bytes = Buffer.from('%PDF-1.7\nfixture invoice');
const sha = value => createHash('sha256').update(value).digest('hex');
const sample = () => ({ id:'9007199254740993', invoice_id:'9007199254740995', payment_id:'9007199254740997', client_request_id:'00000000-0000-4000-8000-000000000001', bucket_id:'invoices-private', file_type:'receipt', file_name:'invoice.pdf', storage_path:'9007199254740995/9007199254740997/receipt/00000000-0000-4000-8000-000000000001.pdf', content_type:'application/pdf', size_bytes:String(bytes.length), sha256:sha(bytes), uploaded_by:'alice', upload_state:'pending', uploaded_object_matches:false });
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function fixture(options={}) {
 const {createInvoiceUploadHandler}=await source; const row={...sample(),...options.row}, calls=[]; let stored=options.stored || null, failFinalize=options.failFinalize || 0, postCount=0;
 const handler=createInvoiceUploadHandler({url:'https://fixture.test',anonKey:'fixture-anon',serviceKey:'fixture-private-service',fetchImpl:async(url,init)=>{
  const path=new URL(url).pathname; calls.push({path,init}); assert(init.signal,'all upstream calls have a deadline');
  if(path==='/auth/v1/user'){assert.equal(init.headers.Authorization,'Bearer alice-jwt');return json(options.authFail?{}:{id:'alice'},options.authFail?401:200)}
  if(path==='/rest/v1/rpc/get_invoice_file_upload'){assert.equal(init.headers.Authorization,'Bearer alice-jwt');assert.deepEqual(JSON.parse(init.body),{p_file_id:row.id});if(options.getterDenied)return json({},403);return json({...row,uploaded_object_matches:!!stored&&stored.equals(bytes)})}
  if(path==='/rest/v1/rpc/finalize_invoice_file'){assert.equal(init.headers.Authorization,'Bearer alice-jwt');assert.deepEqual(JSON.parse(init.body),{p_file_id:row.id});if(failFinalize-->0 || options.finalizeDenied)return json({},403);assert(stored);row.upload_state='ready';return json({...row,uploaded_object_matches:true})}
  assert(path.startsWith('/storage/v1/object/')); assert.equal(init.headers.Authorization,'Bearer fixture-private-service');assert.equal(init.headers.apikey,'fixture-private-service');
  if(init.method==='POST') {
   postCount++;assert.equal(init.headers['x-upsert'],'false');assert.equal(path,`/storage/v1/object/invoices-private/${row.storage_path}`);
   const incoming=Buffer.from(await init.body.get('').arrayBuffer());assert.equal(init.body.get('').name,row.file_name);assert.equal(init.body.get('').type,row.content_type);assert.equal(JSON.parse(init.body.get('metadata')).sha256,row.sha256);
   if(options.uploadFails)return json({error:'not committed'},500);
   if(stored)return json({error:'Duplicate'},409);
   stored=incoming;
   if(options.lostUploadResponse)throw Error('connection lost after commit');
   return json({Key:row.storage_path});
  }
  assert.equal(init.method,'GET');assert.equal(path,`/storage/v1/object/authenticated/invoices-private/${row.storage_path}`);
  if(!stored)return json({error:'not found'},404);
  return new Response(stored,{status:200,headers:{'Content-Type':options.storedMime || row.content_type}});
 }});
 const request=({authorization='Bearer alice-jwt',name='invoice.pdf',type='application/pdf',contents=bytes,extra={},method='POST'}={})=>{
  const form=new FormData();form.set('file_id',row.id);form.set('file',new File([contents],name,{type}));for(const [key,value]of Object.entries(extra))form.set(key,value);
  return handler(new Request('https://edge.test/functions/v1/invoice-file-upload',{method,headers:authorization?{Authorization:authorization}:{},body:method==='POST'?form:undefined}));
 };
 return {row,calls,request,handler,get stored(){return stored},get postCount(){return postCount}};
}
test('upload requires caller authentication before accepting bytes or service access',async()=>{
 const f=await fixture();assert.equal((await f.request({authorization:''})).status,401);assert.equal(f.calls.length,0);
 const denied=await fixture({authFail:true});assert.equal((await denied.request()).status,401);assert.equal(denied.calls.length,1);
 assert.equal((await f.request({method:'GET'})).status,405);
});
test('upload uses exact IDs, caller RLS and fixed service-side non-upsert; response is the final linked row',async()=>{
 const f=await fixture();const response=await f.request();assert.equal(response.status,200);const result=await response.json();assert.equal(result.file.id,'9007199254740993');assert.equal(result.file.payment_id,'9007199254740997');assert.equal(result.file.upload_state,'ready');assert.equal(f.postCount,1);assert(f.stored.equals(bytes));
 assert.deepEqual(f.calls.map(call=>call.path),['/auth/v1/user','/rest/v1/rpc/get_invoice_file_upload',`/storage/v1/object/invoices-private/${f.row.storage_path}`,'/rest/v1/rpc/finalize_invoice_file']);
});
test('unrelated uploader and revoked caller access cannot reach service Storage',async()=>{
 for(const config of [{row:{uploaded_by:'bob'}},{getterDenied:true}]){const f=await fixture(config);assert.equal((await f.request()).status,403);assert(!f.calls.some(call=>call.path.startsWith('/storage/')))}
});
for(const [label,override]of Object.entries({name:{name:'other.pdf'},mime:{type:'text/html'},size:{contents:Buffer.from('short')},bytes:{contents:Buffer.from(bytes.toString().replace('fixture','changed'))}}))test(`changed ${label} is rejected before any privileged upload`,async()=>{
 const f=await fixture();const response=await f.request(override);assert.equal(response.status,409);assert(!f.calls.some(call=>call.path.startsWith('/storage/')));
});
test('client-supplied paths, buckets or upsert flags are never accepted',async()=>{
 for(const extra of [{path:'foreign/private.pdf'},{bucket:'other'},{upsert:'true'}]){const f=await fixture();assert.equal((await f.request({extra})).status,400);assert(!f.calls.some(call=>call.path.startsWith('/storage/')))}
 const wrong=await fixture({row:{storage_path:'elsewhere/private.pdf'}});assert.equal((await wrong.request()).status,409);assert(!wrong.calls.some(call=>call.path.startsWith('/storage/')));
});
test('duplicate and uncertain committed uploads verify exact stored bytes before finalizing',async()=>{
 for(const config of [{stored:bytes},{lostUploadResponse:true}]){const f=await fixture(config);assert.equal((await f.request()).status,200);assert(f.calls.some(call=>call.path.startsWith('/storage/v1/object/authenticated/')));assert(f.postCount<=1);assert(!f.calls.some(call=>call.init.method==='DELETE'))}
});
test('existing mismatched bytes or MIME are never overwritten or finalized',async()=>{
 for(const config of [{stored:Buffer.from('wrong bytes')},{stored:bytes,storedMime:'text/html'}]){const f=await fixture(config);assert.equal((await f.request()).status,409);assert.equal(f.calls.filter(call=>call.path.endsWith('/finalize_invoice_file')).length,0);assert(!f.calls.some(call=>call.init.method==='DELETE'));if(config.stored)assert(f.stored.equals(config.stored))}
});
test('failed Storage leaves the reservation pending; retry after failed finalize skips reupload',async()=>{
 const missing=await fixture({uploadFails:true});assert.equal((await missing.request()).status,502);assert.equal(missing.row.upload_state,'pending');assert.equal(missing.calls.filter(call=>call.path.endsWith('/finalize_invoice_file')).length,0);
 const committed=await fixture({failFinalize:1});assert.equal((await committed.request()).status,403);assert.equal(committed.row.upload_state,'pending');assert.equal((await committed.request()).status,200);assert.equal(committed.postCount,1);
});
test('ready retries still verify bytes and caller finalization; failed permission changes never trigger cleanup',async()=>{
 const f=await fixture({stored:bytes,row:{upload_state:'ready'},finalizeDenied:true});assert.equal((await f.request()).status,403);assert.equal(f.postCount,0);assert(f.calls.some(call=>call.path.includes('/authenticated/')));assert(!f.calls.some(call=>call.init.method==='DELETE'));
});
test('oversized request bodies and errors do not expose privileged credentials',async()=>{
 const f=await fixture();const body=new Uint8Array(6*1024*1024+65537);const response=await f.handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer alice-jwt','Content-Type':'multipart/form-data; boundary=fixture','Content-Length':String(body.length)},body}));assert.equal(response.status,413);assert(!f.calls.some(call=>call.path.startsWith('/storage/')));assert.doesNotMatch(await response.text(),/fixture-private-service|alice-jwt/);
});
test('the original filename is preserved exactly, including surrounding spaces',async()=>{
 const name=' invoice.pdf ';const f=await fixture({row:{file_name:name}});const response=await f.request({name});assert.equal(response.status,200);assert.equal((await response.json()).file.file_name,name);assert.equal(f.postCount,1);
});

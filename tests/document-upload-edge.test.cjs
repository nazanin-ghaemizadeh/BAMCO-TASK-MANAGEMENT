const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/document-library/index.ts','utf8'));
function fixture(options={}){
 let handler,stored={id:20,category_id:10,title:'راهنما',version:1,storage_path:'old.pdf'},pending=[];const deleted=[],logs=[];
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const fetch=async(url,init={})=>{const u=new URL(url),method=init.method||'GET';assert(init.signal,'Every upstream request has a deadline');
  if(u.pathname==='/auth/v1/user')return response({id:'manager'});
  if(u.pathname==='/rest/v1/profiles')return response([{active:true,role:options.role||'manager'}]);
  if(u.pathname==='/rest/v1/document_categories')return response([{id:10}]);
  if(u.pathname==='/rest/v1/documents'){if(method==='GET')return response([stored]);if(options.writeFail)return response({message:'write rejected'},409);stored={...stored,...JSON.parse(init.body)};return response([stored])}
  if(u.pathname==='/rest/v1/security_audit_log'){if(options.hold)return new Promise(r=>pending.push(()=>r(response({}))));return response({},options.auditFail?500:200)}
  if(u.pathname.startsWith('/storage/v1/object/')){if(method==='DELETE'){deleted.push(...JSON.parse(init.body).prefixes);if(options.hold)return new Promise(r=>pending.push(()=>r(response({}))));return response({},options.cleanupFail?500:200)}return response({})}
  throw Error(u.pathname);
 };
 const background=[];vm.runInNewContext(source,{Deno:{env:{get:k=>({SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'})[k]},serve:f=>handler=f},EdgeRuntime:{waitUntil:p=>background.push(p)},fetch,AbortSignal,File,Response,crypto,console:{error:(...args)=>logs.push(args)}});
 return {deleted,logs,background,get stored(){return stored},release(){pending.splice(0).forEach(f=>f())},async save(action='replace'){const form=new FormData();form.set('action',action);form.set('document_id','20');form.set('category_id','10');form.set('title','راهنما');form.set('file',new File(['%PDF-1.7'],'guide.pdf',{type:'application/pdf'}));return handler(new Request('https://fixture.test',{method:'POST',headers:{Authorization:'Bearer manager'},body:form}))}};
}
test('replacement confirms the new version without waiting for old-file cleanup or audit',async()=>{const f=fixture({hold:true});const r=await f.save();assert.equal(r.status,200);assert.equal((await r.json()).document.version,2);assert.notEqual(f.stored.storage_path,'old.pdf');assert.deepEqual(f.deleted,['old.pdf']);f.release();await Promise.all(f.background)});
test('post-commit cleanup and audit errors cannot delete or roll back the new file',async()=>{const f=fixture({cleanupFail:true,auditFail:true});assert.equal((await f.save()).status,200);await Promise.all(f.background);assert.equal(f.stored.version,2);assert(!f.deleted.includes(f.stored.storage_path));assert(f.logs.length)});
test('a rejected metadata write removes the new orphan, preserving the old file',async()=>{const f=fixture({writeFail:true});assert.equal((await f.save()).status,500);assert.equal(f.stored.storage_path,'old.pdf');assert.equal(f.deleted.length,1);assert.notEqual(f.deleted[0],'old.pdf')});
test('non-managers cannot upload a guide',async()=>{const f=fixture({role:'owner'});assert.equal((await f.save()).status,403);assert.equal(f.stored.version,1)});

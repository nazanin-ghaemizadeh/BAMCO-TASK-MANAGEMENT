const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {JSDOM}=require('jsdom');
for(const [name,script,flags] of [
 ['workspace SQL isolates records, grants, foreign keys and provisioning','scripts/test-management-workspaces-sql.mjs',[]],
 ['workspace Edge runtime fixes the schema and validates membership','scripts/test-workspace-edge-runtime.mjs',['--experimental-strip-types']]
])test(name,{timeout:120000},()=>{
 const result=spawnSync(process.execPath,[...flags,script],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:110000,maxBuffer:2*1024*1024});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
test('authenticated accounts resolve their workspace automatically and cannot switch it manually',async t=>{
 const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
 const dom=new JSDOM(html,{url:'https://bamco.test/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window,calls=[];
 for(const name of ['Request','Response','Headers'])w[name]=globalThis[name];
 let resolved={key:'quality',schema_name:'bamco_quality',title:'کنترل کیفیت',is_system_manager:false};
 w.fetch=async(input,init)=>{calls.push(new Request(input,init));return Response.json([])};
 w.eval(fs.readFileSync('assets/js/department-entry.js','utf8'));
 w.eval(fs.readFileSync('assets/js/core/application.js','utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.Bamco.state.token='signed-in';
 w.BamcoData={rpc:async name=>{assert.equal(name,'resolve_my_workspace');return resolved}};
 assert.equal(w.document.querySelector('#departmentEntry'),null);
 for(const [key,schema,title] of [['quality','bamco_quality','کنترل کیفیت'],['process','bamco_process','مدیریت فرآیند'],['product','public','مهندسی توسعه و تکوین محصول']]){
  resolved={key,schema_name:schema,title,is_system_manager:key==='product'};
  const identity=await w.BamcoWorkspace.identify();
  assert.equal(identity.key,key);assert.equal(w.BamcoWorkspace.key(),key);
  assert.equal(w.document.querySelector('[data-workspace-label]').textContent,w.BamcoWorkspace.title());
  await w.fetch('https://zhhongjhhbvpmoquvkhl.supabase.co/rest/v1/tasks');
  assert.equal(calls.at(-1).headers.get('Accept-Profile'),key==='product'?null:'bamco_'+key);
  if(key!=='product')assert.equal(calls.at(-1).headers.get('Content-Profile'),'bamco_'+key);
  await w.fetch('https://zhhongjhhbvpmoquvkhl.supabase.co/storage/v1/object/authenticated/documents-private/a.pdf');
  assert.ok(calls.at(-1).url.includes('/'+(key==='product'?'':key+'-')+'documents-private/'));
  await w.fetch('https://zhhongjhhbvpmoquvkhl.supabase.co/functions/v1/admin-users',{method:'POST',body:'{}'});
  assert.ok(calls.at(-1).url.endsWith('/'+(key==='product'?'':key+'-')+'admin-users'));
  await w.fetch('https://zhhongjhhbvpmoquvkhl.supabase.co/functions/v1/session-audit',{method:'POST',keepalive:true,body:'{\"action\":\"end\"}'});
  assert.equal(calls.at(-1).keepalive,true);assert.equal(await calls.at(-1).text(),'{\"action\":\"end\"}');
 }
 assert.throws(()=>w.BamcoWorkspace.select('process'),/فقط از حساب کاربری/);
});

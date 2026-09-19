const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(file,'utf8');

test('home settles in one paint instead of multi-second repair timers',()=>{
 const src=read('assets/js/card-home.js');
 assert.doesNotMatch(src,/\[0,40,120,300,700,1400\]/);
 assert.doesNotMatch(src,/homeTimers/);
 assert.doesNotMatch(src,/setTimeout\([^\n]*1800/);
 assert.match(src,/showHome\(\);document\.body\.classList\.add\('home-access-settled'\)/);
 assert.doesNotMatch(src,/repairObserver\.observe\(document\.body/);
});

test('avatar runtime has one canonical loader and no polling storm',()=>{
 const topbar=read('assets/js/login-avatar-workload-fix-20260911.js');
 const finalRuntime=read('assets/js/final-production-fixes-20260911.js');
 assert.doesNotMatch(topbar,/\[0,100,350,900,1800\]/);
 assert.doesNotMatch(topbar,/observe\(document\.body/);
 assert.match(topbar,/bamcoMedia\.bindAvatar\(el,state\.profile\)/);
 assert.doesNotMatch(topbar,/lastSource|loadingPath/);
 assert.doesNotMatch(finalRuntime,/setInterval\(/);
 assert.doesNotMatch(finalRuntime,/cache:'no-store'/);
 assert.doesNotMatch(finalRuntime,/select\('profiles'/);
 assert.match(finalRuntime,/window\.refreshProfileAvatar/);
});

test('authenticated avatars revalidate across reloads and invalidate after edits without persistent stale bytes',async()=>{
 const source=read('assets/js/media-cache.js');
 const disk=new Map();let calls=0;
 const make=()=>{
  const dom=new JSDOM('',{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window;
  w.state={user:{id:'one'},token:'valid'};w.SB_URL='https://db.test';w.SB_KEY='public';
  w.fetch=async()=>{calls++;return new Response('avatar-'+calls)};w.Response=Response;w.AbortController=AbortController;
  w.URL.createObjectURL=()=> 'blob:avatar-'+calls;w.URL.revokeObjectURL=()=>{};
  w.caches={open:async()=>({match:async k=>disk.get(k)?.clone(),put:async(k,v)=>disk.set(k,v.clone()),keys:async()=>[...disk.keys()].map(url=>({url})),delete:async k=>disk.delete(k)}),delete:async()=>{disk.clear()}};
  w.eval(source);return {dom,w};
 };
 let a=make();await a.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,1);a.dom.window.close();
 let b=make();await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,2);assert.equal(disk.size,0);
 await b.w.bamcoMedia.invalidate('avatars','people/me.jpg');
 await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,3);b.dom.window.close();
});

test('resource views and People avatars warm after first paint while observers stay scoped',()=>{
 const prefetch=read('assets/js/feature-prefetch.js');
 const structure=read('assets/js/feature-structure.js');
 assert.match(prefetch,/requestAnimationFrame/);
 assert.match(prefetch,/requestIdleCallback/);
 assert.match(prefetch,/refreshDocuments/);
 assert.match(prefetch,/refreshSites/);
 assert.match(prefetch,/warmAvatars/);
 assert.match(prefetch,/select\('profiles','select=id,avatar_path,updated_at&order=id'\)/);
 assert.match(prefetch,/bamcoMedia\.get\('avatars',p\.avatar_path,p\.updated_at\)/);
 assert.match(prefetch,/button\.dataset\.view==='people'/);
 assert.match(prefetch,/document\.addEventListener\('click',[\s\S]*?,true\)/);
 assert.doesNotMatch(structure,/observe\(document\.body/);
 assert.match(structure,/observe\(documents/);
 assert.match(structure,/observe\(sites/);
});

test('canonical bundle input directly includes late runtime modules',()=>{
 const build=read('scripts/build-static-bundles.mjs');
 assert.match(build,/task-bulk-delete-20260912\.js/);
 assert.match(build,/task-toolbar-actions-20260912\.js/);
 assert.match(build,/final-production-fixes-20260911\.js/);
 assert.match(build,/feature-prefetch\.js/);
 assert.doesNotMatch(build,/avatar-final-20260911\.js/);
});

test('release workflow builds and regression-gates bundles before publishing cache keys',()=>{
 const workflow=read('.github/workflows/release-version.yml');
 const buildAt=workflow.indexOf('npm run build:assets');
 const testAt=workflow.indexOf('npm run test:regression');
 const bumpAt=workflow.indexOf('Bump release marker');
 assert(buildAt>=0&&testAt>buildAt&&bumpAt>testAt);
 assert.match(workflow,/git add version\.json index\.html assets\/js\/bamco\.bundle\.js assets\/css\/bamco\.bundle\.css/);
});

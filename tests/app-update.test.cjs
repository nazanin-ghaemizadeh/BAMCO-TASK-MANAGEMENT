const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/app-update-v2.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function page({current=release.version,latest=release.version,published=latest,stored={},url='https://bamco.test/?bamco_update=2026.09.17.73&bamco_reload=1'}={}){
 const dom=new JSDOM(`<!doctype html><html><head><meta name="bamco-app-version" content="${current}"></head><body><section class="bamco-update-notice">legacy error</section></body></html>`,{url,runScripts:'outside-only'});
 const w=dom.window;
 for(const [key,value] of Object.entries(stored))w.localStorage.setItem(key,value);
 const navigations=[],toasts=[];w.__bamcoUpdateNavigate=href=>navigations.push(href);w.bamcoToast=(...args)=>toasts.push(args);
 w.fetch=async input=>{
  const href=String(input);
  if(href.includes('version.json'))return new Response(JSON.stringify({version:latest}),{status:200,headers:{'Content-Type':'application/json'}});
  if(href.includes('bamco_probe='))return new Response(`<!doctype html><meta name="bamco-app-version" content="${published}">`,{status:200,headers:{'Content-Type':'text/html'}});
  throw new Error('unexpected fetch '+href);
 };
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,navigations,toasts};
}

test('release file, document version and V2 updater cache key stay aligned',()=>{
 assert.match(html,new RegExp(`<meta name="bamco-app-version" content="${release.version.replaceAll('.','\\.')}"`));
 assert.match(html,new RegExp(`assets/js/app-update-v2\\.js\\?v=${release.version.replaceAll('.','\\.')}`));
 assert.match(html,/id="bamcoUpdateRecoveryBootstrap"/);
});

test('legacy failed-update state is removed immediately and never renders the old error again',async()=>{
 const {dom,navigations}=page({stored:{
  'bamco.app.pending-version':'2026.09.17.73',
  'bamco.app.update-attempts':'9',
  'bamco.app.dismissed-version':'2026.09.17.73'
 }});await pause(25);const w=dom.window;
 assert.equal(w.localStorage.getItem('bamco.app.pending-version'),null);
 assert.equal(w.localStorage.getItem('bamco.app.update-attempts'),null);
 assert.equal(w.localStorage.getItem('bamco.app.dismissed-version'),null);
 assert.equal(w.document.querySelector('.bamco-update-notice'),null);
 assert.equal(navigations.length,0);
 assert.equal(w.location.search,'');
 dom.window.close();
});

test('a newer fully published deployment announces and triggers one cache-busted navigation',async()=>{
 const {dom,navigations,toasts}=page({current:'2026.09.17.74',latest:'2026.09.17.75',published:'2026.09.17.75',url:'https://bamco.test/'});await pause(25);
 assert.equal(navigations.length,1);
 assert.equal(toasts.length,1);assert.equal(toasts[0][0],'سامانه در حال به‌روزرسانی است.');assert.equal(toasts[0][1].title,'به‌روزرسانی سامانه');
 assert.match(navigations[0],/bamco_v=2026\.09\.17\.75/);
 assert.match(navigations[0],/bamco_reload=/);
 assert.equal(dom.window.document.querySelector('.bamco-update-notice'),null);
 dom.window.close();
});

test('every installed version change produces a visible success notice',async()=>{
 const {dom,navigations,toasts}=page({current:'2026.09.17.76',latest:'2026.09.17.76',stored:{'bamco.app.installed-version':'2026.09.17.75'},url:'https://bamco.test/?bamco_v=2026.09.17.76'});await pause(25);
 assert.equal(navigations.length,0);assert.equal(toasts.length,1);
 assert.equal(toasts[0][0],'سامانه به‌روزرسانی شد');assert.equal(toasts[0][1].title,'سامانه به‌روزرسانی شد');
 assert.equal(dom.window.localStorage.getItem('bamco.app.installed-version'),'2026.09.17.76');dom.window.close();
});

test('a version race never reloads until version.json and the published document agree',async()=>{
 const {dom,navigations}=page({current:'2026.09.17.74',latest:'2026.09.17.75',published:'2026.09.17.74',url:'https://bamco.test/'});await pause(25);
 assert.equal(navigations.length,0);
 assert.equal(dom.window.document.querySelector('.bamco-update-notice'),null);
 dom.window.close();
});

test('the same target version cannot enter a reload loop within the session',async()=>{
 const {dom,navigations}=page({current:'2026.09.17.74',latest:'2026.09.17.75',published:'2026.09.17.75',url:'https://bamco.test/'});await pause(25);
 assert.equal(navigations.length,1);
 await dom.window.bamcoAppUpdate.check();await pause(10);
 assert.equal(navigations.length,1);
 dom.window.close();
});


test('update notice never exposes version details or release notes',()=>{
 assert.doesNotMatch(source,/releaseNotes|release-notes-version/);
 assert.doesNotMatch(source,/نسخه \$\{current\}|نسخه \$\{latest\}/);
 assert.match(source,/notify\('سامانه به‌روزرسانی شد'/);
});

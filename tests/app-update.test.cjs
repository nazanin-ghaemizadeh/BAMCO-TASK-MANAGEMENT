const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/app-update.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const release=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function page({latest=release.version,stored={}}={}){
 const dom=new JSDOM(`<!doctype html><html><head><meta name="bamco-app-version" content="${release.version}"></head><body></body></html>`,{url:'https://bamco.test/',runScripts:'outside-only'});const w=dom.window;
 for(const [key,value] of Object.entries(stored))w.localStorage.setItem(key,value);
 w.fetch=async()=>new Response(JSON.stringify({version:latest}),{status:200});w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));return dom;
}

test('release file, document version and updater cache key stay aligned',()=>{
 assert.match(html,new RegExp(`<meta name="bamco-app-version" content="${release.version.replaceAll('.','\\.')}"`));
 assert.match(html,new RegExp(`assets/js/app-update\\.js\\?v=${release.version.replaceAll('.','\\.')}`));
});

test('returning users receive one successful-upgrade notice without reinstall instructions',async()=>{
 const dom=page({stored:{'bamco.cache-reset.workspace-20260910-2':'1'}});await pause(20);const text=dom.window.document.body.textContent;
 assert.match(text,/سامانه ارتقا یافت/);assert.match(text,/نیازی به نصب مجدد نیست/);assert.equal(dom.window.localStorage.getItem('bamco.app.installed-version'),release.version);dom.window.close();
});

test('a newer deployment offers an in-app update and can be dismissed once per version',async()=>{
 const dom=page({latest:'2026.09.14.1',stored:{'bamco.app.installed-version':release.version}});await pause(20);const d=dom.window.document;
 assert.match(d.body.textContent,/نسخه جدید سامانه آماده است/);assert(d.querySelector('.bamco-update-now'));d.querySelector('.bamco-update-later').click();assert.equal(dom.window.localStorage.getItem('bamco.app.dismissed-version'),'2026.09.14.1');assert.equal(d.querySelector('.bamco-update-notice'),null);dom.window.close();
});

test('two unsuccessful reloads show reinstall only as the fallback',async()=>{
 const dom=page({latest:'2026.09.14.1',stored:{'bamco.app.installed-version':release.version,'bamco.app.pending-version':'2026.09.14.1','bamco.app.update-attempts':'2'}});await pause(20);const text=dom.window.document.body.textContent;
 assert.match(text,/به‌روزرسانی خودکار کامل نشد/);assert.match(text,/Home Screen/);dom.window.close();
});

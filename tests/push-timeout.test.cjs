const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(options={}){
 const dom=new JSDOM('<div id="settingsView"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,calls=[];let tick,sub=null;
 w.state={profile:{id:'owner'},token:'token'};if(options.auth)w.bamcoAuth={snapshot:()=>1,isCurrent:s=>s===1};w.SB_URL='https://example.test';w.SB_KEY='key';w.isSecureContext=true;w.PushManager=function(){};w.matchMedia=()=>({matches:true});
 w.Notification={permission:'default',requestPermission:async()=>{calls.push('permission');w.Notification.permission='granted';return 'granted'}};
 const nativeTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>nativeTimeout(fn,ms>=12000?30:ms);w.setInterval=fn=>tick=fn;
 const subscription={endpoint:'endpoint',toJSON:()=>({endpoint:'endpoint'}),unsubscribe:async()=>{sub=null;calls.push('browser-unsubscribe');return true}};
 const reg={active:{},pushManager:{getSubscription:async()=>sub,subscribe:async()=>{calls.push('browser-subscribe');sub=subscription;return sub}}};
 w.navigator.serviceWorker={register:()=>options.stuck?new Promise(()=>{}):Promise.resolve(reg),ready:new Promise(()=>{})};
 w.fetch=async(url,init)=>{const action=JSON.parse(init.body).action;calls.push(action);if(options.networkStuck)return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new w.DOMException('Aborted','AbortError'))));return{ok:true,json:async()=>({publicKey:'YWJj'})}};
 w.eval(fs.readFileSync('assets/js/push-notifications.js','utf8'));tick();return{w,calls,button:w.document.querySelector('button'),status:w.document.querySelector('.push-status'),close:()=>dom.window.close()};
}
test('click gives immediate progress, ignores double clicks and toggles without another config or permission request',async t=>{
 const f=fixture();t.after(f.close);f.button.click();assert(f.button.disabled);assert.match(f.status.textContent,/در حال فعال/);f.button.click();await pause(20);
 assert.equal(f.button.dataset.enabled,'true');assert.deepEqual(f.calls,['permission','config','browser-subscribe','subscribe']);f.button.click();await pause(20);
 assert.equal(f.button.dataset.enabled,'false');assert.equal(f.button.disabled,false);assert.deepEqual(f.calls,['permission','config','browser-subscribe','subscribe','unsubscribe','browser-unsubscribe']);
});
test('a service worker that never becomes ready releases the button for retry',async t=>{
 const f=fixture({stuck:true});t.after(f.close);f.button.click();await pause(60);assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/دوباره تلاش/);assert(!f.calls.includes('subscribe'));
});
test('a stalled network request is aborted and releases the button',async t=>{
 const f=fixture({networkStuck:true});t.after(f.close);f.button.click();await pause(60);assert.equal(f.button.disabled,false);assert.match(f.status.textContent,/دوباره تلاش/);assert.notEqual(f.button.dataset.enabled,'true');
});

test('push controls remain usable after normal token renewal',async t=>{
 const f=fixture({auth:true});t.after(f.close);f.w.state.token='renewed';f.button.click();await pause(20);assert.equal(f.button.dataset.enabled,'true');f.button.click();await pause(20);assert.equal(f.button.dataset.enabled,'false');
});

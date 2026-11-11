/* Presence-aware session audit: user activity controls inactivity; heartbeat controls connected state. */
(()=>{'use strict';
if(window.__bamcoSessionRuntime)return;window.__bamcoSessionRuntime=true;
const KEY='bamco.session.id.v1',DEVICE_KEY='bamco.device.id.v1',SIGNAL_KEY='bamco.session.signal.v1';
let starting=null,confirmedId=null,ending=false,generation=0,lastActivity=Date.now(),lastActivitySent=0;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function makeUuid(){
 const c=globalThis.crypto;
 if(c?.randomUUID)return c.randomUUID();
 const bytes=new Uint8Array(16);
 if(c?.getRandomValues)c.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 return[...bytes].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('')
}
function deviceId(){let id='';try{id=localStorage.getItem(DEVICE_KEY)||''}catch{}if(!uuidPattern.test(id)){id=makeUuid();try{localStorage.setItem(DEVICE_KEY,id)}catch{}}return id}
const DEVICE_ID=deviceId();
function noteActivity(){if(state?.token&&!ending)lastActivity=Date.now();}
for(const event of ['pointerdown','keydown','touchstart'])document.addEventListener(event,noteActivity,{passive:true});
const call=async(action,extra={},options={})=>{
 if(typeof state==='undefined'||!state.token)return null;
 return api('/functions/v1/session-audit',{method:'POST',body:{action,device_id:DEVICE_ID,...extra},...options});
};
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('bamco-session-presence-v1'):null;
function refreshVisibleSessionReport(){
 try{const id=state?.view,view=document.getElementById(id+'View');if(!state?.token||document.hidden||!['activeSessions','loginActivity','loginReport'].includes(id)||!view||view.classList.contains('hidden')||view.querySelector('.workspace-loading')||view.querySelector('[data-report-search]')?.value||view.contains(document.activeElement)||document.querySelector('dialog[open]')||window.bamcoSelection?.ids?.('#'+id+'View').length)return;window.bamcoTabs?.render?.(id,true)?.catch?.(error=>console.warn('BAMCO session report',error.message))}catch{}
}
function announce(type){const detail={type,at:Date.now(),device_id:DEVICE_ID};try{channel?.postMessage(detail)}catch{}try{localStorage.setItem(SIGNAL_KEY,JSON.stringify(detail));localStorage.removeItem(SIGNAL_KEY)}catch{}}
channel?.addEventListener('message',refreshVisibleSessionReport);
window.addEventListener('storage',e=>{if(e.key===SIGNAL_KEY&&e.newValue)refreshVisibleSessionReport()});
function start(){
 if(!state?.token||ending)return Promise.resolve(null);
 const cachedId=sessionStorage.getItem(KEY);
 if(cachedId&&cachedId===confirmedId)return Promise.resolve(cachedId);
 if(!starting){
  const epoch=generation;
  const request=call('start',{app_version:'sessions-presence-20260911-1'}).then(data=>{
   const id=data?.session?.id;if(!id)throw Error('ثبت نشست انجام نشد؛ دوباره وارد شوید.');
   if(epoch===generation&&!ending&&state.token){sessionStorage.setItem(KEY,id);confirmedId=id;lastActivity=Date.now();lastActivitySent=lastActivity;announce('start')}
   return id;
  }).finally(()=>{if(starting===request)starting=null});
  starting=request;
 }
 return starting;
}
async function heartbeat({strict=false}={}){
 if(!state?.token||ending)return;const epoch=generation,id=sessionStorage.getItem(KEY);if(!id||id!==confirmedId)return start();
 try{
  const sentActivity=lastActivity,active=sentActivity>lastActivitySent;
  const data=await call(active?'heartbeat':'status',{session_id:id});
  if(epoch!==generation||ending||!state.token)return;
  if(active)lastActivitySent=sentActivity;
  if(data?.ended||data?.revoked||data?.expired){const reason=data?.ended_reason;clear();showLogin();toast(reason==='replaced'?'این ورود با ورود تازه‌تری در همین مرورگر جایگزین شده است.':'نشست شما پایان یافته است. دوباره وارد شوید.',true)}
 }catch(error){if(!state?.token)clear();if(strict)throw error;console.warn('BAMCO session heartbeat',error.message)}
}
async function end(reason='logout',options={}){
 if(ending)return;ending=true;generation++;
 try{
  let id=sessionStorage.getItem(KEY);
  if(!id&&starting&&!options.keepalive)id=await starting.catch(()=>null);
  if(!state?.token)return;
  const data=await call('end',{session_id:id,reason},options);
  if(!data?.ended)throw Error('پایان نشست از سرور تأیید نشد.');
  clear();announce(reason);
 }finally{ending=false}
}
function clear(){generation++;sessionStorage.removeItem(KEY);starting=null;confirmedId=null}
window.bamcoSession={start,heartbeat,end,clear,noteActivity,currentId:()=>sessionStorage.getItem(KEY),deviceId:()=>DEVICE_ID};
// Presence is independent from user activity: even an idle, open tab checks in.
setInterval(()=>heartbeat().catch(error=>console.warn('BAMCO session heartbeat',error.message)),30000);
// Session management screens should not wait for the older 15-second report poll.
setInterval(refreshVisibleSessionReport,5000);
document.addEventListener('visibilitychange',()=>{if(state?.token)heartbeat().catch(error=>console.warn('BAMCO session',error.message));if(!document.hidden)refreshVisibleSessionReport()});
// Closing/reloading a real page ends its visible presence immediately. BFCache
// navigation is exempt because the same page instance can resume.
window.addEventListener('pagehide',event=>{if(event.persisted||!state?.token||ending)return;void end('closed',{keepalive:true}).catch(()=>{})});
})();

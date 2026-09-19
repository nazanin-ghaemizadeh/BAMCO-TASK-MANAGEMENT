(()=>{
'use strict';
if(window.__bamcoAppUpdateV2)return;
window.__bamcoAppUpdateV2=true;

const current=document.querySelector('meta[name="bamco-app-version"]')?.content||'';
const installedKey='bamco.app.installed-version';
const announcedKey='bamco.app.announced-update';
const legacyKeys=['bamco.app.pending-version','bamco.app.update-attempts','bamco.app.dismissed-version'];
const updateParams=['bamco_update','bamco_reload','bamco_probe','bamco_v'];
let checking=false,lastCheck=0;

const read=(storage,key)=>{try{return storage.getItem(key)||''}catch{return''}};
const write=(storage,key,value)=>{try{value?storage.setItem(key,value):storage.removeItem(key)}catch{}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function notify(message,{title='به‌روزرسانی سامانه',duration=9000,icon='↻'}={}){
 const show=()=>{
  if(typeof window.bamcoToast!=='function')return false;
  window.bamcoToast(message,{kind:'info',title,duration,icon});
  return true;
 };
 if(show())return;
 let tries=0;const timer=setInterval(()=>{if(show()||++tries>40)clearInterval(timer)},100);
}
function removeLegacyNotice(){
 document.querySelectorAll('.bamco-update-notice').forEach(node=>node.remove());
}
function clearLegacyState(){
 for(const key of legacyKeys)write(localStorage,key,'');
 removeLegacyNotice();
}
function cleanUpdateQuery(){
 try{
  const url=new URL(location.href);let changed=false;
  for(const key of updateParams)if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true}
  if(changed)history.replaceState(history.state,'',url.pathname+(url.search?url.search:'')+url.hash);
 }catch{}
}
async function clearAppCaches(){
 if('serviceWorker' in navigator){
  const registrations=await navigator.serviceWorker.getRegistrations().catch(()=>[]);
  await Promise.all(registrations.filter(registration=>{
   const script=registration.active?.scriptURL||registration.waiting?.scriptURL||registration.installing?.scriptURL||'';
   return script&&!new URL(script,location.href).pathname.endsWith('/push-sw.js');
  }).map(registration=>registration.unregister().catch(()=>false)));
 }
 if('caches' in window){
  const names=await caches.keys().catch(()=>[]);
  await Promise.all(names.filter(name=>/bamco/i.test(name)&&!/sticker/i.test(name)).map(name=>caches.delete(name).catch(()=>false)));
 }
}
async function latestVersion(){
 const url=new URL('version.json',location.href);url.searchParams.set('check',String(Date.now()));
 const response=await fetch(url.href,{cache:'no-store',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('version check failed');
 const data=await response.json();return String(data?.version||'').trim();
}
async function publishedDocumentVersion(){
 const url=new URL('./',location.href);url.searchParams.set('bamco_probe',String(Date.now()));
 const response=await fetch(url.href,{cache:'no-store',headers:{Accept:'text/html'}});
 if(!response.ok)throw Error('document probe failed');
 const html=await response.text();
 const match=html.match(/<meta\s+name=["']bamco-app-version["']\s+content=["']([^"']+)["']/i)
   ||html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']bamco-app-version["']/i);
 return String(match?.[1]||'').trim();
}
function navigate(version){
 const key=`bamco.update.reload.${version}`;
 const now=Date.now(),last=Number(read(sessionStorage,key)||0);
 if(last&&now-last<60000)return false;
 write(sessionStorage,key,String(now));
 const url=new URL(location.href);
 for(const keyName of updateParams)url.searchParams.delete(keyName);
 url.searchParams.set('bamco_v',version);
 url.searchParams.set('bamco_reload',String(now));
 if(typeof window.__bamcoUpdateNavigate==='function')window.__bamcoUpdateNavigate(url.href);
 else location.replace(url.href);
 return true;
}
function confirmInstalledVersion(){
 const previous=read(localStorage,installedKey);
 if(previous&&current&&previous!==current){
  notify('سامانه به‌روزرسانی شد',{title:'سامانه به‌روزرسانی شد',duration:8000,icon:'✓'});
 }
 if(current)write(localStorage,installedKey,current);
}
async function check(force=false){
 if(checking||(!force&&Date.now()-lastCheck<30000))return;
 checking=true;lastCheck=Date.now();clearLegacyState();
 try{
  const latest=await latestVersion();
  if(!latest||!current)return;
  if(latest===current){
   confirmInstalledVersion();
   cleanUpdateQuery();
   return;
  }
  const published=await publishedDocumentVersion();
  if(published!==latest)return;
  const announced=read(sessionStorage,announcedKey);
  if(announced!==latest){
   write(sessionStorage,announcedKey,latest);
   notify('سامانه در حال به‌روزرسانی است.',{duration:8000});
  }
  await clearAppCaches();
  if(typeof window.__bamcoUpdateNavigate!=='function')await sleep(650);
  navigate(latest);
 }catch{}finally{checking=false}
}

clearLegacyState();
document.addEventListener('DOMContentLoaded',()=>void check(true),{once:true});
window.addEventListener('pageshow',()=>void check(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check(true)});
window.addEventListener('focus',()=>void check());
window.addEventListener('online',()=>void check(true));
setInterval(()=>void check(),300000);
window.bamcoAppUpdate={check:()=>check(true),current,latestVersion,publishedDocumentVersion,clearLegacyState};
})();

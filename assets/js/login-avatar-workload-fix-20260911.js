(()=>{
'use strict';
if(window.__bamcoTopbarAvatarFix20260911V3)return;
window.__bamcoTopbarAvatarFix20260911V3=true;
const q=(s,r=document)=>r?.querySelector?.(s)||null;
let repairFrame=0,loadingPath='',loadingPromise=null,lastPath='',lastSource='';

function profile(){return typeof state!=='undefined'?state.profile:null}
function token(){return typeof state!=='undefined'?state.token:''}
function initial(){const p=profile();return String(p?.display_name||p?.full_name||'ب').trim().charAt(0)||'ب'}

function ensureHeaderAccount(){
  const app=q('#appView'),top=q('#appView>.card-topbar'),tools=q('.header-tools'),account=q('.account');
  if(!app||app.classList.contains('hidden')||!top)return false;
  if(tools&&tools.parentElement!==top)top.appendChild(tools);
  if(tools&&account&&account.parentElement!==tools)tools.prepend(account);
  return !!(tools&&account&&account.parentElement===tools&&tools.parentElement===top);
}
function paintInitial(el){
  if(!el)return;
  el.replaceChildren(document.createTextNode(initial()));
  el.classList.remove('has-image');
  el.removeAttribute('data-avatar-loaded');
  el.style.removeProperty('background-image');
}
function paintImage(el,src,path){
  if(!el||!src)return;
  const current=el.querySelector('img[data-profile-avatar]');
  if(current&&el.dataset.avatarLoaded===String(path))return;
  const img=document.createElement('img');
  img.dataset.profileAvatar='1';
  img.alt='تصویر پروفایل';
  img.src=src;
  img.decoding='async';
  img.style.cssText='width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;border-radius:50%!important';
  el.replaceChildren(img);
  el.classList.add('has-image');
  el.dataset.avatarLoaded=String(path||'');
  el.style.removeProperty('background-image');
}
async function avatarSource(path){
  if(lastPath===path&&lastSource)return lastSource;
  if(window.bamcoMedia?.get)return window.bamcoMedia.get('avatars',path);
  const encoded=String(path).split('/').map(encodeURIComponent).join('/');
  const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/avatars/${encoded}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${token()}`},cache:'no-cache'});
  if(!res.ok)throw new Error(`avatar ${res.status}`);
  return URL.createObjectURL(await res.blob());
}
async function refresh(){
  const p=profile(),auth=token();
  if(!p||!auth)return false;
  ensureHeaderAccount();
  const path=String(p.avatar_path||'');
  const targets=[q('#avatar'),q('#profileAvatarPreview')].filter(Boolean);
  if(!path){targets.forEach(paintInitial);return true}
  // Header and settings are separate consumers.  Do not stop after only one of
  // them has the current image (the header is normally painted first).
  if(targets.length&&targets.every(el=>el.querySelector('img[data-profile-avatar]')&&el.dataset.avatarLoaded===path))return true;
  if(loadingPath===path&&loadingPromise)return loadingPromise;
  loadingPath=path;
  loadingPromise=(async()=>{
    try{
      const src=await avatarSource(path);
      const now=profile();
      if(!now||String(now.avatar_path||'')!==path)return false;
      lastPath=path;lastSource=src;
      ensureHeaderAccount();
      [q('#avatar'),q('#profileAvatarPreview')].filter(Boolean).forEach(el=>paintImage(el,src,path));
      return true;
    }catch(err){
      console.error('topbar-avatar-load',err);
      const currentTargets=[q('#avatar'),q('#profileAvatarPreview')].filter(Boolean);
      if(!currentTargets.some(el=>el.querySelector('img[data-profile-avatar]')))currentTargets.forEach(paintInitial);
      return false;
    }finally{
      if(loadingPath===path){loadingPath='';loadingPromise=null}
    }
  })();
  return loadingPromise;
}
function schedule(){
  ensureHeaderAccount();
  [0,100,350,900,1800].forEach(ms=>setTimeout(()=>{
    const app=q('#appView');
    if(app&&!app.classList.contains('hidden'))void refresh();
  },ms));
}
function repair(){
  if(repairFrame)return;
  repairFrame=requestAnimationFrame(()=>{
    repairFrame=0;
    const app=q('#appView');if(!app||app.classList.contains('hidden'))return;
    const ready=ensureHeaderAccount(),avatar=q('#avatar'),p=profile(),path=String(p?.avatar_path||'');
    if(ready&&path&&(!avatar?.querySelector('img[data-profile-avatar]')||avatar.dataset.avatarLoaded!==path))void refresh();
  });
}
function boot(){
  window.refreshProfileAvatar=refresh;
  window.bamcoTopbarAvatar={refresh,repair:ensureHeaderAccount};
  const app=q('#appView');
  if(app)new MutationObserver(()=>{if(!app.classList.contains('hidden'))schedule()}).observe(app,{attributes:true,attributeFilter:['class']});
  const avatar=q('#avatar');if(avatar)new MutationObserver(repair).observe(avatar,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  new MutationObserver(repair).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('.welcome-dismiss,.home-return'))setTimeout(()=>void refresh(),0)},true);
  addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  if(app&&!app.classList.contains('hidden'))schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

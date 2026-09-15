(()=>{
'use strict';
if(window.__bamcoTopbarAvatarFix20260911V4)return;
window.__bamcoTopbarAvatarFix20260911V4=true;
const q=(s,r=document)=>r?.querySelector?.(s)||null;
let refreshFrame=0,loadingPath='',loadingPromise=null,lastPath='',lastSource='';

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
  if(el.textContent!==initial()||el.children.length)el.replaceChildren(document.createTextNode(initial()));
  el.classList.remove('has-image');
  el.removeAttribute('data-avatar-loaded');
  el.style.removeProperty('background-image');
}
function paintImage(el,src,path){
  if(!el||!src)return;
  const current=el.querySelector('img[data-profile-avatar]');
  if(current&&el.dataset.avatarLoaded===String(path)&&current.src===src)return;
  const img=current||document.createElement('img');
  img.dataset.profileAvatar='1';
  img.alt='تصویر پروفایل';
  img.decoding='async';
  img.loading='eager';
  img.src=src;
  img.style.cssText='width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;border-radius:50%!important';
  if(!current)el.replaceChildren(img);
  el.classList.add('has-image');
  el.dataset.avatarLoaded=String(path||'');
  el.style.removeProperty('background-image');
}
async function avatarSource(path){
  if(lastPath===path&&lastSource)return lastSource;
  if(window.bamcoMedia?.get)return window.bamcoMedia.get('avatars',path);
  const encoded=String(path).split('/').map(encodeURIComponent).join('/');
  const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/avatars/${encoded}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${token()}`},cache:'force-cache'});
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
  if(targets.length&&targets.every(el=>el.querySelector('img[data-profile-avatar]')&&el.dataset.avatarLoaded===path))return true;
  if(loadingPath===path&&loadingPromise)return loadingPromise;
  loadingPath=path;
  loadingPromise=(async()=>{
    try{
      const src=await avatarSource(path),now=profile();
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
  if(refreshFrame)return;
  refreshFrame=requestAnimationFrame(()=>{
    refreshFrame=0;
    const app=q('#appView');
    if(app&&!app.classList.contains('hidden'))void refresh();
  });
}
function resetSource(){lastPath='';lastSource='';loadingPath='';loadingPromise=null}
function boot(){
  window.refreshProfileAvatar=refresh;
  window.bamcoTopbarAvatar={refresh,repair:ensureHeaderAccount,reset:resetSource};
  const app=q('#appView');
  if(app)new MutationObserver(()=>{if(!app.classList.contains('hidden'))schedule()}).observe(app,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{
    if(e.target.closest('#logoutBtn'))resetSource();
    else if(e.target.closest('[data-view="settings"],.welcome-dismiss,.home-return'))schedule();
  },true);
  addEventListener('pageshow',schedule);
  if(app&&!app.classList.contains('hidden'))schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

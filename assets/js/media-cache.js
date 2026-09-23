/* A single, session-scoped image owner for the directory, header and previews. */
(()=>{'use strict';
const cache=new Map(),urls=new Set(),bindings=new WeakMap();
let generation=0;
const imageCacheName='bamco-auth-images-v2';
const imageBuckets=new Set(['avatars','stickers','group-avatars']);
const validPath=path=>path&&!String(path).split('/').includes('..');
const personById=id=>window.BamcoProfiles?.get?.(id)||(state.profiles||[]).find(p=>String(p?.id)===String(id))||(String(state.profile?.id)===String(id)?state.profile:null);
const cacheKey=(user,bucket,path)=>new URL('media-cache/'+encodeURIComponent(user)+'/'+encodeURIComponent(bucket)+'/'+encodeURIComponent(path),location.href).href;
async function diskCache(){if(!window.caches)return null;try{return await caches.open(imageCacheName)}catch{return null}}
function avatarRevision(path,revision){
 if(revision!=null)return String(revision);
 const people=[state.profile,...(state.profiles||[])];
 return String(people.find(p=>p?.avatar_path===path)?.updated_at||'legacy-session');
}
async function get(bucket,path,revision){
 if(!imageBuckets.has(bucket)||!validPath(path))throw Error('مسیر تصویر نامعتبر است');
 const user=state.user?.id,epoch=generation,session=window.bamcoAuth?.snapshot?.();
 if(!user||!state.token)throw Error('برای دریافت تصویر وارد سامانه شوید.');
 const current=()=>generation===epoch&&state.user?.id===user&&!!state.token&&(!session||window.bamcoAuth.isCurrent(session));
 const version=bucket==='avatars'?avatarRevision(path,revision):'';
 const key=JSON.stringify([user,bucket,String(path),version]);
 if(!cache.has(key)){
  const pending=(async()=>{
   // Avatars must never reuse the old path-only persistent cache. Immutable new
   // paths and updated_at revisions also cover legacy clients replacing avatar.png.
   const disk=bucket==='avatars'?null:await diskCache(),diskKey=cacheKey(user,bucket,path);let blob=null;
   if(disk)try{const hit=await disk.match(diskKey);if(hit)blob=await hit.blob()}catch{}
   if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
   if(!blob){
    const encoded=String(path).split('/').map(encodeURIComponent).join('/'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const suffix=bucket==='avatars'?'?cacheNonce='+encodeURIComponent(version==='legacy-session'?String(epoch)+'-'+Date.now():version):'';
    try{
     const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/${bucket}/${encoded}${suffix}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`},cache:bucket==='avatars'?'no-store':'force-cache',signal:controller.signal});
     if(!res.ok)throw Error('دریافت تصویر انجام نشد');blob=await res.blob();
    }finally{clearTimeout(timer)}
    if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
    if(disk)try{await disk.put(diskKey,new Response(blob));const entries=await disk.keys();await Promise.all(entries.slice(0,Math.max(0,entries.length-96)).map(entry=>disk.delete(entry)));if(!current())await disk.delete(diskKey)}catch{}
   }
   if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
   const url=URL.createObjectURL(blob);urls.add(url);return url;
  })();
  cache.set(key,pending);pending.catch(()=>{if(cache.get(key)===pending)cache.delete(key)});
 }
 return cache.get(key);
}
async function invalidate(bucket,path,user=state.user?.id){
 if(!imageBuckets.has(bucket)||!validPath(path)||!user)return;
 // Consumers may still be displaying the previous version. Only retire its cache
 // entry here; revoke URLs at session teardown, never when a different photo loads.
 for(const key of cache.keys()){const [u,b,p]=JSON.parse(key);if(u===user&&b===bucket&&p===String(path))cache.delete(key)}
 const disk=await diskCache();if(disk)try{await disk.delete(cacheKey(user,bucket,path))}catch{}
}
function paintInitial(el,p){
 const initial=String(p?.display_name||p?.full_name||'ب').trim().charAt(0)||'ب';
 if(el.textContent!==initial||el.children.length)el.replaceChildren(document.createTextNode(initial));
 el.classList.remove('has-image');el.style.removeProperty('background-image');delete el.dataset.avatarLoaded;
}
async function bindAvatar(el,p){
 if(!el||!p||el.dataset.avatarDraft==='true')return false;
 el.dataset.profilePhoto=String(p.id);el.dataset.avatarPreview='true';
 if(!el.hasAttribute('tabindex')&&!el.closest('button,a,input,label'))el.tabIndex=0;
 const user=state.user?.id,epoch=generation,path=String(p.avatar_path||''),revision=avatarRevision(path,p.updated_at);
 const signature=JSON.stringify([user,p.id,path,revision,epoch]);
 const previous=bindings.get(el);
 if(previous?.signature===signature&&(previous.loading||(!path&&!el.children.length)||(path&&el.querySelector(':scope>img')?.src===previous.src)))return previous.promise;
 const binding={signature,promise:null,loading:!!path,src:''};bindings.set(el,binding);
 const current=()=>bindings.get(el)===binding&&el.isConnected&&generation===epoch&&state.user?.id===user&&!!state.token&&el.dataset.avatarDraft!=='true';
 if(!path){paintInitial(el,p);binding.promise=Promise.resolve(true);return binding.promise}
 // A different person's recycled cell must never show the previous person's photo.
 if(el.dataset.avatarPerson!==String(p.id))paintInitial(el,p);
 el.dataset.avatarPerson=String(p.id);
 binding.promise=(async()=>{
  try{
   const src=await get('avatars',path,revision);if(!current())return false;
   let img=el.querySelector(':scope>img');if(!img){img=document.createElement('img');el.replaceChildren(img)}
   img.alt='تصویر پروفایل';img.dataset.profileAvatar='1';img.decoding='async';
   img.style.cssText='width:100%;height:100%;object-fit:cover;display:block;border-radius:50%';
   if(img.src!==src)img.src=src;binding.src=src;
   el.style.removeProperty('background-image');el.dataset.avatarLoaded=path;el.classList.add('has-image');return true;
  }catch{
   if(current()){paintInitial(el,p);bindings.delete(el)}return false;
  }finally{binding.loading=false}
 })();return binding.promise;
}
async function avatars(root,people){
 if(!root)return;const byId=new Map((people||[]).map(p=>[String(p.id),p]));
 await Promise.all([...root.querySelectorAll('[data-profile-photo]')].map(el=>{const p=byId.get(String(el.dataset.profilePhoto));return p?bindAvatar(el,p):Promise.resolve(false)}));
}
async function groups(root,threads){const byId=new Map(threads.map(t=>[t.id,t]));await Promise.all([...root.querySelectorAll('[data-thread-photo]')].map(async el=>{const t=byId.get(el.dataset.threadPhoto);if(!t?.avatar_path)return;try{const src=await get('group-avatars',t.avatar_path);if(!el.isConnected)return;let img=el.querySelector(':scope>img');if(!img){img=document.createElement('img');img.alt='';el.replaceChildren(img)}if(img.src!==src)img.src=src;el.classList.add('has-image')}catch{}}))}
function ensureAvatarViewer(){
 let dialog=document.querySelector('#bamcoAvatarViewer');if(dialog)return dialog;
 const style=document.createElement('style');style.id='bamcoAvatarViewerCss';style.textContent='#bamcoAvatarViewer{width:min(430px,calc(100vw - 28px));margin:auto;border:0;border-radius:20px;padding:0;overflow:hidden;background:#fff;box-shadow:0 22px 70px #102f245c}#bamcoAvatarViewer::backdrop{background:#102f2475;backdrop-filter:blur(4px)}#bamcoAvatarViewer .bamco-avatar-viewer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 17px;border-bottom:1px solid #dce7e1;color:#174d3c}#bamcoAvatarViewer .bamco-avatar-viewer-head b{font-size:18px}#bamcoAvatarViewer .bamco-avatar-viewer-close{width:38px;height:38px;border:1px solid #cdded5;border-radius:11px;background:#f8fbf9;color:#17644b;font-size:24px;line-height:1;cursor:pointer}#bamcoAvatarViewer .bamco-avatar-viewer-body{display:grid;place-items:center;min-height:300px;padding:22px;background:#f4f8f6}#bamcoAvatarViewer .bamco-avatar-viewer-body img{display:block;width:min(340px,78vw);aspect-ratio:1;object-fit:cover;border-radius:50%;border:5px solid #fff;box-shadow:0 10px 28px #176b4d2b}#bamcoAvatarViewer .bamco-avatar-viewer-initial{display:grid;place-items:center;width:min(340px,78vw);aspect-ratio:1;border-radius:50%;border:5px solid #fff;background:#dfeee6;color:#17644b;font-size:100px;font-weight:700;box-shadow:0 10px 28px #176b4d2b}';document.head.append(style);
 dialog=document.createElement('dialog');dialog.id='bamcoAvatarViewer';dialog.dir='rtl';dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});document.body.append(dialog);return dialog;
}
async function openAvatarViewer(id){
 const person=personById(id);if(!person)return false;
 const label=person.display_name||person.full_name||person.email||'کاربر';const dialog=ensureAvatarViewer();
 dialog.innerHTML=`<div class="bamco-avatar-viewer-head"><b>${String(label).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}</b><button type="button" class="bamco-avatar-viewer-close" aria-label="بستن">×</button></div><div class="bamco-avatar-viewer-body"><span class="bamco-avatar-viewer-initial">${String(label).trim().charAt(0)||'ب'}</span></div>`;
 dialog.querySelector('.bamco-avatar-viewer-close').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
 if(!person.avatar_path)return true;
 try{const src=await get('avatars',person.avatar_path,person.updated_at);if(!dialog.open)return false;const image=document.createElement('img');image.src=src;image.alt=`تصویر پروفایل ${label}`;dialog.querySelector('.bamco-avatar-viewer-body')?.replaceChildren(image)}catch{}return true;
}
function previewTarget(target){return target?.closest?.('[data-profile-photo],#avatar,#profileAvatarPreview')||null}
function installAvatarPreview(){
 document.addEventListener('click',event=>{const el=previewTarget(event.target);if(!el||el.dataset.avatarDraft==='true')return;const id=el.dataset.profilePhoto||el.dataset.avatarPerson;if(!id)return;event.preventDefault();event.stopImmediatePropagation();void openAvatarViewer(id)},true);
 document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;const el=previewTarget(event.target);if(!el||el.dataset.avatarDraft==='true')return;const id=el.dataset.profilePhoto||el.dataset.avatarPerson;if(!id)return;event.preventDefault();void openAvatarViewer(id)},true);
}
function clear(){generation++;if(window.caches)caches.delete(imageCacheName).catch(()=>{});cache.clear();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear()}
document.addEventListener('click',e=>{if(e.target.closest('#logoutBtn'))clear()});
installAvatarPreview();
window.bamcoMedia={get,avatars,bindAvatar,groups,invalidate,clear,openAvatarViewer};
})();

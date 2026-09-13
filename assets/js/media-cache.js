/* Authenticated image requests are shared across chat, directory and previews. */
(()=>{'use strict';const cache=new Map(),urls=new Set();
let generation=0;
const stickerCacheName='bamco-stickers-images-v1';
async function get(bucket,path){
 if(!['avatars','stickers','group-avatars'].includes(bucket)||!path||String(path).split('/').includes('..'))throw Error('مسیر تصویر نامعتبر است');
 const user=state.user?.id,epoch=generation,session=window.bamcoAuth?.snapshot?.();
 if(!user||!state.token)throw Error('برای دریافت تصویر وارد سامانه شوید.');
 const current=()=>generation===epoch&&state.user?.id===user&&!!state.token&&(!session||window.bamcoAuth.isCurrent(session));
 const key=user+':'+bucket+':'+path;
 if(!cache.has(key)){
  const pending=(async()=>{
   let disk=null,blob=null;
   const diskKey=new URL('sticker-cache/'+encodeURIComponent(user)+'/'+encodeURIComponent(path),location.href).href;
   if(bucket==='stickers'&&window.caches)try{disk=await caches.open(stickerCacheName);const hit=await disk.match(diskKey);if(hit)blob=await hit.blob()}catch{}
   if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
   if(!blob){
    const encoded=String(path).split('/').map(encodeURIComponent).join('/'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/${bucket}/${encoded}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`},cache:bucket==='avatars'?'no-cache':'force-cache',signal:controller.signal});if(!res.ok)throw Error('دریافت تصویر انجام نشد');blob=await res.blob()}finally{clearTimeout(timer)}
    if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
    if(disk)try{await disk.put(diskKey,new Response(blob));const entries=await disk.keys();await Promise.all(entries.slice(0,Math.max(0,entries.length-32)).map(entry=>disk.delete(entry)));if(!current())await disk.delete(diskKey)}catch{}
   }
   if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
   const url=URL.createObjectURL(blob);urls.add(url);return url;
  })();
  cache.set(key,pending);pending.catch(()=>{if(cache.get(key)===pending)cache.delete(key)});
 }
 return cache.get(key);
}
async function avatars(root,people){const byId=new Map(people.map(p=>[p.id,p]));await Promise.all([...root.querySelectorAll('[data-profile-photo]')].map(async el=>{const p=byId.get(el.dataset.profilePhoto);if(!p?.avatar_path)return;try{const src=await get('avatars',p.avatar_path);if(!el.isConnected)return;const img=document.createElement('img');img.src=src;img.alt='';el.replaceChildren(img);el.classList.add('has-image')}catch{}}))}
async function groups(root,threads){const byId=new Map(threads.map(t=>[t.id,t]));await Promise.all([...root.querySelectorAll('[data-thread-photo]')].map(async el=>{const t=byId.get(el.dataset.threadPhoto);if(!t?.avatar_path)return;try{const src=await get('group-avatars',t.avatar_path);if(!el.isConnected)return;const img=document.createElement('img');img.src=src;img.alt='';el.replaceChildren(img);el.classList.add('has-image')}catch{}}))}
function clear(){generation++;if(window.caches)caches.delete(stickerCacheName).catch(()=>{});cache.clear();urls.forEach(URL.revokeObjectURL);urls.clear()}
document.addEventListener('click',e=>{if(e.target.closest('#logoutBtn'))clear()});window.bamcoMedia={get,avatars,groups,clear};
})();

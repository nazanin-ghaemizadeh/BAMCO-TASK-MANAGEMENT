/* Authenticated image requests are shared across chat, directory and previews. */
(()=>{'use strict';const cache=new Map(),urls=new Set();
let generation=0;
const imageCacheName='bamco-auth-images-v2';
const imageBuckets=new Set(['avatars','stickers','group-avatars']);
const validPath=path=>path&&!String(path).split('/').includes('..');
const cacheKey=(user,bucket,path)=>new URL('media-cache/'+encodeURIComponent(user)+'/'+encodeURIComponent(bucket)+'/'+encodeURIComponent(path),location.href).href;
async function diskCache(){if(!window.caches)return null;try{return await caches.open(imageCacheName)}catch{return null}}
async function get(bucket,path){
 if(!imageBuckets.has(bucket)||!validPath(path))throw Error('مسیر تصویر نامعتبر است');
 const user=state.user?.id,epoch=generation,session=window.bamcoAuth?.snapshot?.();
 if(!user||!state.token)throw Error('برای دریافت تصویر وارد سامانه شوید.');
 const current=()=>generation===epoch&&state.user?.id===user&&!!state.token&&(!session||window.bamcoAuth.isCurrent(session));
 const key=user+':'+bucket+':'+path;
 if(!cache.has(key)){
  const pending=(async()=>{
   const disk=await diskCache(),diskKey=cacheKey(user,bucket,path);let blob=null;
   if(disk)try{const hit=await disk.match(diskKey);if(hit)blob=await hit.blob()}catch{}
   if(!current())throw Error('نشست دریافت تصویر پایان یافته است.');
   if(!blob){
    const encoded=String(path).split('/').map(encodeURIComponent).join('/'),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/${bucket}/${encoded}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`},cache:'force-cache',signal:controller.signal});if(!res.ok)throw Error('دریافت تصویر انجام نشد');blob=await res.blob()}finally{clearTimeout(timer)}
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
async function invalidate(bucket,path,user=state.user?.id){if(!imageBuckets.has(bucket)||!validPath(path)||!user)return;const key=user+':'+bucket+':'+path;const value=cache.get(key);cache.delete(key);try{const url=await value;if(url){urls.delete(url);URL.revokeObjectURL(url)}}catch{}const disk=await diskCache();if(disk)try{await disk.delete(cacheKey(user,bucket,path))}catch{}}
async function avatars(root,people){const byId=new Map(people.map(p=>[p.id,p]));await Promise.all([...root.querySelectorAll('[data-profile-photo]')].map(async el=>{const p=byId.get(el.dataset.profilePhoto);if(!p?.avatar_path)return;try{const src=await get('avatars',p.avatar_path);if(!el.isConnected)return;let img=el.querySelector(':scope>img');if(!img){img=document.createElement('img');img.alt='';el.replaceChildren(img)}if(img.src!==src)img.src=src;el.classList.add('has-image')}catch{}}))}
async function groups(root,threads){const byId=new Map(threads.map(t=>[t.id,t]));await Promise.all([...root.querySelectorAll('[data-thread-photo]')].map(async el=>{const t=byId.get(el.dataset.threadPhoto);if(!t?.avatar_path)return;try{const src=await get('group-avatars',t.avatar_path);if(!el.isConnected)return;let img=el.querySelector(':scope>img');if(!img){img=document.createElement('img');img.alt='';el.replaceChildren(img)}if(img.src!==src)img.src=src;el.classList.add('has-image')}catch{}}))}
function clear(){generation++;if(window.caches)caches.delete(imageCacheName).catch(()=>{});cache.clear();urls.forEach(URL.revokeObjectURL);urls.clear()}
document.addEventListener('click',e=>{if(e.target.closest('#logoutBtn'))clear()});window.bamcoMedia={get,avatars,groups,invalidate,clear};
})();

(()=>{
'use strict';
let registration=null,publicKey='',busy=false,boundUser='',openedNotification=false;
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window)&&window.isSecureContext;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>navigator.standalone||matchMedia('(display-mode: standalone)').matches;
async function call(action,extra={}){const r=await fetch(SB_URL+'/functions/v1/web-push',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'ثبت اعلان انجام نشد.');return data}
async function ready(){if(!supported())return;registration=await navigator.serviceWorker.register(new URL('push-sw.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'});await navigator.serviceWorker.ready;const config=await call('config');publicKey=config.publicKey;return registration}
function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
function mount(){const host=document.querySelector('#userSettingsView')||document.querySelector('#profileView')||document.querySelector('#settingsView');if(!host||host.querySelector('#pushSettings'))return;
 const box=document.createElement('section');box.id='pushSettings';box.className='push-settings';box.innerHTML='<h3>اعلان روی این دستگاه</h3><p>برای دریافت اعلان هنگام بسته‌بودن سامانه، دریافت اعلان را فعال کنید.</p><p role="status" class="push-status"></p><button type="button" class="primary">فعال‌سازی اعلان</button>';host.append(box);const status=box.querySelector('.push-status'),button=box.querySelector('button');
 if(ios()&&!installed()){status.textContent='در آیفون، ابتدا BAMCO را به صفحه اصلی اضافه کنید و از همان آیکن وارد شوید.';button.disabled=true;return}
 if(!supported()){status.textContent='این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.';button.disabled=true;return}
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{
  // Request permission synchronously from the user gesture (required on iOS).
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('مجوز اعلان داده نشد؛ آن را در تنظیمات مرورگر فعال کنید.');
  await ready();const existing=await registration.pushManager.getSubscription();
  if(existing&&button.dataset.enabled==='true'){await call('unsubscribe',{endpoint:existing.endpoint});await existing.unsubscribe();button.dataset.enabled='false';button.textContent='فعال‌سازی اعلان';status.textContent='اعلان این دستگاه غیرفعال شد.'}
  else {const sub=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});await call('subscribe',{subscription:sub.toJSON()});button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است؛ حتی هنگام بسته‌بودن سامانه.'}
 }catch(e){status.textContent=e.message}finally{busy=false;button.disabled=false}};
 ready().then(async()=>{const sub=await registration.pushManager.getSubscription();if(sub){await call('subscribe',{subscription:sub.toJSON()});button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است.'}}).catch(e=>{status.textContent=e.message});
}
async function unsubscribe(){if(!supported())return;const r=registration||await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);const s=await r?.pushManager.getSubscription();if(s){try{await call('unsubscribe',{endpoint:s.endpoint})}finally{await s.unsubscribe()}}}
window.bamcoPush={unsubscribe};
setInterval(()=>{if(typeof state==='undefined'||!state.profile)return;if(boundUser!==state.profile.id){boundUser=state.profile.id;document.querySelector('#pushSettings')?.remove()}mount();if(!openedNotification&&new URL(location.href).searchParams.has('notification')){openedNotification=true;showView('messages');const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(null,'',url)}},1500);
})();

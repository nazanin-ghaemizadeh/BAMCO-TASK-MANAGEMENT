(()=>{
'use strict';
let registration=null,publicKey='',busy=false,boundUser='',openedNotification=false;
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window)&&window.isSecureContext;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>navigator.standalone||matchMedia('(display-mode: standalone)').matches;
async function call(action,extra={}){const r=await fetch(SB_URL+'/functions/v1/web-push',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'ثبت اعلان انجام نشد.');return data}
async function ready(){if(!supported())return;registration=await navigator.serviceWorker.register(new URL('push-sw.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'});await navigator.serviceWorker.ready;const config=await call('config');publicKey=config.publicKey;return registration}
function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
const preferenceKey=()=> 'bamco.push.disabled.'+state.profile.id;
const optedOut=()=>{try{return localStorage.getItem(preferenceKey())==='1'}catch{return false}};
function preference(disabled){try{if(disabled)localStorage.setItem(preferenceKey(),'1');else localStorage.removeItem(preferenceKey())}catch{}}
function mount(){const view=document.querySelector('#settingsView');const host=view?.querySelector('.manager-form')||view;if(!host||view.querySelector('#pushSettings'))return;
 const box=document.createElement('section');box.id='pushSettings';box.className='push-settings';box.innerHTML='<h3>اعلان روی این دستگاه</h3><p>دریافت اعلان به‌صورت پیش‌فرض روشن است؛ برای نمایش روی این دستگاه، اجازه مرورگر لازم است.</p><p role="status" class="push-status"></p><button type="button" class="primary">فعال‌سازی اعلان</button>';host.prepend(box);const status=box.querySelector('.push-status'),button=box.querySelector('button');
 if(ios()&&!installed()){status.textContent='در آیفون، ابتدا BAMCO را به صفحه اصلی اضافه کنید و از همان آیکن وارد شوید.';button.disabled=true;return}
 if(!supported()){status.textContent='این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.';button.disabled=true;return}
 button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;try{
  // Request permission synchronously from the user gesture (required on iOS).
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('مجوز اعلان داده نشد؛ آن را در تنظیمات مرورگر فعال کنید.');
  await ready();const existing=await registration.pushManager.getSubscription();
  if(existing&&button.dataset.enabled==='true'){await call('unsubscribe',{endpoint:existing.endpoint});await existing.unsubscribe();preference(true);button.dataset.enabled='false';button.textContent='فعال‌سازی اعلان';status.textContent='اعلان این دستگاه غیرفعال شد.'}
  else {const sub=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});await call('subscribe',{subscription:sub.toJSON()});preference(false);button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است؛ حتی هنگام بسته‌بودن سامانه.'}
 }catch(e){status.textContent=e.message}finally{busy=false;button.disabled=false}};
 if(optedOut()){status.textContent='اعلان این دستگاه به انتخاب شما غیرفعال است.';return}
 if(Notification.permission!=='granted'){status.textContent=Notification.permission==='denied'?'اعلان در مرورگر مسدود است؛ اجازه را از تنظیمات مرورگر فعال کنید.':'منتظر اجازه شما در مرورگر؛ برای دریافت اعلان، فعال‌سازی اعلان را بزنید.';return}
 busy=true;button.disabled=true;
 ready().then(async()=>{const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});await call('subscribe',{subscription:sub.toJSON()});button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است.'}).catch(e=>{status.textContent='فعال‌سازی خودکار انجام نشد؛ فعال‌سازی اعلان را بزنید. '+e.message}).finally(()=>{busy=false;button.disabled=false});
}
async function unsubscribe(){if(!supported())return;const r=registration||await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);const s=await r?.pushManager.getSubscription();if(s){try{await call('unsubscribe',{endpoint:s.endpoint})}finally{await s.unsubscribe()}}}
window.bamcoPush={unsubscribe};
document.addEventListener('click',event=>{if(event.target.closest('[data-view="settings"],#headerSettingsBtn')&&typeof state!=='undefined'&&state.profile)mount()});
setInterval(()=>{if(typeof state==='undefined'||!state.profile)return;if(boundUser!==state.profile.id){boundUser=state.profile.id;document.querySelector('#pushSettings')?.remove()}mount();if(!openedNotification&&new URL(location.href).searchParams.has('notification')){openedNotification=true;showView('messages');const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(null,'',url)}},1500);
})();

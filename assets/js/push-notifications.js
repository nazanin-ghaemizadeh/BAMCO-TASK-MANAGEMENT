(()=>{
'use strict';
let registration=null,publicKey='',boundUser='',openedNotification=false;
const timeoutMessage='پاسخ دریافت نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
function bounded(promise,ms=12000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(timeoutMessage)),ms)})]).finally(()=>clearTimeout(timer))}
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window)&&window.isSecureContext;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>navigator.standalone||matchMedia('(display-mode: standalone)').matches;
async function call(action,extra={},token=state.token){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(SB_URL+'/functions/v1/web-push',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'ثبت اعلان انجام نشد.');return data}catch(e){throw e.name==='AbortError'?Error(timeoutMessage):e}finally{clearTimeout(timer)}}
async function ready(){if(!supported())return;registration=await bounded(navigator.serviceWorker.register(new URL('push-sw.js',document.baseURI),{scope:new URL('./',document.baseURI).pathname,updateViaCache:'none'}));if(!registration.active)await bounded(navigator.serviceWorker.ready);return registration}
async function subscription(reg,token){const existing=await bounded(reg.pushManager.getSubscription());if(existing)return existing;if(!publicKey){const config=await call('config',{},token);if(!config.publicKey)throw Error('کلید اعلان سامانه تنظیم نشده است.');publicKey=config.publicKey}return bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)}))}
function bytes(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
const preferenceKey=()=> 'bamco.push.disabled.'+state.profile.id;
const optedOut=()=>{try{return localStorage.getItem(preferenceKey())==='1'}catch{return false}};
function preference(disabled){try{if(disabled)localStorage.setItem(preferenceKey(),'1');else localStorage.removeItem(preferenceKey())}catch{}}
function mount(){const view=document.querySelector('#settingsView');const host=view?.querySelector('.manager-form')||view;if(!host||view.querySelector('#pushSettings'))return;
 const box=document.createElement('section');box.id='pushSettings';box.className='push-settings';box.innerHTML='<h3>اعلان روی این دستگاه</h3><p>دریافت اعلان به‌صورت پیش‌فرض روشن است؛ برای نمایش روی این دستگاه، اجازه مرورگر لازم است.</p><p role="status" class="push-status"></p><button type="button" class="primary">فعال‌سازی اعلان</button>';host.prepend(box);const status=box.querySelector('.push-status'),button=box.querySelector('button');
 if(ios()&&!installed()){status.textContent='در آیفون، ابتدا BAMCO را به صفحه اصلی اضافه کنید و از همان آیکن وارد شوید.';button.disabled=true;return}
 if(!supported()){status.textContent='این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.';button.disabled=true;return}
 let busy=false;const userId=state.profile.id,token=state.token,session=window.bamcoAuth?.snapshot?.(),current=()=>box.isConnected&&state.profile?.id===userId&&(session?window.bamcoAuth.isCurrent(session):state.token===token);
 const start=message=>{busy=true;button.disabled=true;button.setAttribute('aria-busy','true');status.textContent=message};
 const finish=()=>{busy=false;button.disabled=false;button.removeAttribute('aria-busy')};
 button.onclick=async()=>{if(busy||!current())return;const disabling=button.dataset.enabled==='true';start(disabling?'در حال غیرفعال‌سازی اعلان…':'در حال فعال‌سازی اعلان…');try{
  // Request permission synchronously from the user gesture (required on iOS).
  if(!disabling){const permission=Notification.permission==='granted'?'granted':await bounded(Notification.requestPermission(),60000);if(permission!=='granted')throw Error('مجوز اعلان داده نشد؛ آن را در تنظیمات مرورگر فعال کنید.');}
  if(!current())return;const reg=await ready();if(!current())return;
  if(disabling){const existing=await bounded(reg.pushManager.getSubscription());if(!current())return;if(existing){await call('unsubscribe',{endpoint:existing.endpoint},state.token);await bounded(existing.unsubscribe())}if(!current())return;preference(true);button.dataset.enabled='false';button.textContent='فعال‌سازی اعلان';status.textContent='اعلان این دستگاه غیرفعال شد.'}
  else {const sub=await subscription(reg,state.token);if(!current())return;await call('subscribe',{subscription:sub.toJSON()},state.token);if(!current())return;preference(false);button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است؛ حتی هنگام بسته‌بودن سامانه.'}
 }catch(e){if(current())status.textContent=e.message}finally{finish()}};
 if(optedOut()){status.textContent='اعلان این دستگاه به انتخاب شما غیرفعال است.';return}
 if(Notification.permission!=='granted'){status.textContent=Notification.permission==='denied'?'اعلان در مرورگر مسدود است؛ اجازه را از تنظیمات مرورگر فعال کنید.':'منتظر اجازه شما در مرورگر؛ برای دریافت اعلان، فعال‌سازی اعلان را بزنید.';return}
 start('در حال بررسی اعلان این دستگاه…');
 ready().then(async reg=>{if(!current())return;const sub=await subscription(reg,state.token);if(!current())return;await call('subscribe',{subscription:sub.toJSON()},state.token);if(!current())return;button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است.'}).catch(e=>{if(current())status.textContent='فعال‌سازی خودکار انجام نشد؛ فعال‌سازی اعلان را بزنید. '+e.message}).finally(finish);
}
async function unsubscribe(){if(!supported())return;const r=registration||await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);const s=await r?.pushManager.getSubscription();if(s){try{await call('unsubscribe',{endpoint:s.endpoint})}finally{await s.unsubscribe()}}}
window.bamcoPush={unsubscribe};
document.addEventListener('click',event=>{if(event.target.closest('[data-view="settings"],#headerSettingsBtn')&&typeof state!=='undefined'&&state.profile)mount()});
setInterval(()=>{if(typeof state==='undefined'||!state.profile)return;const identity=String(state.profile.id);if(boundUser!==identity){boundUser=identity;document.querySelector('#pushSettings')?.remove()}mount();if(!openedNotification&&new URL(location.href).searchParams.has('notification')){openedNotification=true;showView('messages');const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(null,'',url)}},1500);
})();

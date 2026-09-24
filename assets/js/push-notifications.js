(()=>{
'use strict';
let registration=null,publicKey='',boundUser='',openedNotification=false,noticeIdentity='',noticeSeeded=false,lastNoticePoll=0;
const seenNoticeIds=new Set();
const timeoutMessage='پاسخ دریافت نشد؛ اتصال را بررسی و دوباره تلاش کنید.';
const faText=value=>String(value??'').replace(/\d/g,digit=>'۰۱۲۳۴۵۶۷۸۹'[digit]);
function bounded(promise,ms=12000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(timeoutMessage)),ms)})]).finally(()=>clearTimeout(timer))}
const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window)&&window.isSecureContext;
const ios=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const installed=()=>navigator.standalone||matchMedia('(display-mode: standalone)').matches;
async function call(action,extra={},token=state.token){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(SB_URL+'/functions/v1/web-push',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'ثبت اعلان انجام نشد.');return data}catch(e){throw e.name==='AbortError'?Error(timeoutMessage):e}finally{clearTimeout(timer)}}
function bytes(s){const normalized=String(s||'').replace(/-/g,'+').replace(/_/g,'/'),padded=normalized+'='.repeat((4-normalized.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0))}
function canonicalKey(value){return String(value||'').trim().replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function encodeKey(buffer){if(!buffer)return'';let binary='';for(const byte of new Uint8Array(buffer))binary+=String.fromCharCode(byte);return canonicalKey(btoa(binary))}
function serializeSubscription(sub){const raw=typeof sub?.toJSON==='function'?sub.toJSON():{};const p256dh=encodeKey(sub?.getKey?.('p256dh'))||canonicalKey(raw?.keys?.p256dh);const auth=encodeKey(sub?.getKey?.('auth'))||canonicalKey(raw?.keys?.auth);return{endpoint:String(sub?.endpoint||raw?.endpoint||''),expirationTime:sub?.expirationTime??raw?.expirationTime??null,keys:{p256dh,auth}}}
function sameKey(buffer,expected){if(!buffer)return false;const actual=new Uint8Array(buffer);if(actual.length!==expected.length)return false;for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i])return false;return true}
async function ready(){if(!supported())throw Error('این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.');const base=new URL('./',document.baseURI),script=new URL('push-sw.js',document.baseURI),regs=typeof navigator.serviceWorker.getRegistrations==='function'?await bounded(navigator.serviceWorker.getRegistrations()):[];await Promise.all(regs.filter(r=>{const u=r.active?.scriptURL||r.waiting?.scriptURL||r.installing?.scriptURL||'';if(!u)return false;try{return new URL(u).origin===location.origin&&r.scope.startsWith(base.href)&&!new URL(u).pathname.endsWith('/push-sw.js')}catch{return false}}).map(r=>r.unregister().catch(()=>false)));registration=await bounded(navigator.serviceWorker.register(script.href,{scope:base.pathname,updateViaCache:'none'}));try{await bounded(registration.update(),8000)}catch{}if(!registration.active)await bounded(navigator.serviceWorker.ready);if(typeof navigator.serviceWorker.getRegistration==='function')registration=await bounded(navigator.serviceWorker.getRegistration(base.href))||registration;return registration}
async function subscription(reg,token,{renew=false}={}){if(!publicKey){const config=await call('config',{},token);if(!config.publicKey)throw Error('کلید اعلان سامانه تنظیم نشده است.');publicKey=config.publicKey}const expected=bytes(publicKey);let existing=await bounded(reg.pushManager.getSubscription());if(existing&&(renew||!sameKey(existing.options?.applicationServerKey,expected))){try{await call('unsubscribe',{endpoint:existing.endpoint},token)}catch{}await bounded(existing.unsubscribe());existing=null}if(existing)return existing;return bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:expected}),20000)}
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
  else {const sub=await subscription(reg,state.token,{renew:true});if(!current())return;await call('subscribe',{subscription:serializeSubscription(sub)},state.token);if(!current())return;preference(false);button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است؛ حتی هنگام بسته‌بودن سامانه.'}
 }catch(e){if(current())status.textContent=e.message}finally{finish()}};
 if(optedOut()){status.textContent='اعلان این دستگاه به انتخاب شما غیرفعال است.';return}
 if(Notification.permission!=='granted'){status.textContent=Notification.permission==='denied'?'اعلان در مرورگر مسدود است؛ اجازه را از تنظیمات مرورگر فعال کنید.':'منتظر اجازه شما در مرورگر؛ برای دریافت اعلان، فعال‌سازی اعلان را بزنید.';return}
 start('در حال بررسی اعلان این دستگاه…');
 ready().then(async reg=>{if(!current())return;const sub=await subscription(reg,state.token);if(!current())return;await call('subscribe',{subscription:serializeSubscription(sub)},state.token);if(!current())return;button.dataset.enabled='true';button.textContent='غیرفعال‌سازی اعلان';status.textContent='اعلان این دستگاه فعال است.'}).catch(e=>{if(current())status.textContent='فعال‌سازی خودکار انجام نشد؛ فعال‌سازی اعلان را بزنید. '+e.message}).finally(finish);
}
async function unsubscribe(){if(!supported())return;const r=registration||await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);const s=await r?.pushManager.getSubscription();if(s){try{await call('unsubscribe',{endpoint:s.endpoint})}finally{await s.unsubscribe()}}}
async function showForegroundAlerts(){
 const user=state.profile?.id,api=window.BamcoData;if(!user||!state.token||!api?.selectAll||typeof Notification==='undefined'||Notification.permission!=='granted'||!supported())return;
 const now=Date.now();if(now-lastNoticePoll<15000)return;lastNoticePoll=now;
 if(noticeIdentity!==String(user)){noticeIdentity=String(user);noticeSeeded=false;seenNoticeIds.clear()}
 try{
  const rows=await api.selectAll('notifications',`user_id=eq.${encodeURIComponent(user)}&read_at=is.null&select=id,title,body,notification_type,created_at&order=id.desc&limit=20`);
  if(!Array.isArray(rows)||noticeIdentity!==String(state.profile?.id))return;
  const fresh=rows.filter(row=>!seenNoticeIds.has(String(row.id)));
  const deliver=noticeSeeded?fresh:fresh.filter(row=>row.notification_type==='task_alert');
  rows.forEach(row=>seenNoticeIds.add(String(row.id)));noticeSeeded=true;
  if(!deliver.length)return;
  const reg=await ready();
  for(const row of deliver)await reg.showNotification(faText(row.title||'BAMCO'),{body:faText(String(row.body||'اعلان جدید در سامانه').slice(0,700)),icon:new URL('assets/images/bamco-icon-192.png',document.baseURI).href,badge:new URL('assets/images/bamco-icon-192.png',document.baseURI).href,tag:'bamco-'+row.id,dir:'rtl',lang:'fa',data:{url:new URL('./?notification='+encodeURIComponent(row.id),document.baseURI).href}});
 }catch{}
}
window.bamcoPush={unsubscribe};
document.addEventListener('click',event=>{if(event.target.closest('[data-view="settings"],#headerSettingsBtn')&&typeof state!=='undefined'&&state.profile)mount()});
setInterval(()=>{if(typeof state==='undefined'||!state.profile)return;const identity=String(state.profile.id);if(boundUser!==identity){boundUser=identity;document.querySelector('#pushSettings')?.remove()}mount();void showForegroundAlerts();if(!openedNotification&&new URL(location.href).searchParams.has('notification')){openedNotification=true;showView('messages');const url=new URL(location.href);url.searchParams.delete('notification');history.replaceState(null,'',url)}},1500);
})();

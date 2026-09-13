(()=>{
'use strict';
if(window.__bamcoAppUpdateV1)return;
window.__bamcoAppUpdateV1=true;

const current=document.querySelector('meta[name="bamco-app-version"]')?.content||'';
const keys={
 installed:'bamco.app.installed-version',
 dismissed:'bamco.app.dismissed-version',
 pending:'bamco.app.pending-version',
 attempts:'bamco.app.update-attempts'
};
const legacyMarker='bamco.cache-reset.workspace-20260910-2';
let checking=false,lastCheck=0,notice=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const read=key=>{try{return localStorage.getItem(key)||''}catch{return''}};
const write=(key,value)=>{try{value?localStorage.setItem(key,value):localStorage.removeItem(key)}catch{}};

function installStyle(){
 if(document.querySelector('#bamcoAppUpdateStyle'))return;
 const style=document.createElement('style');style.id='bamcoAppUpdateStyle';style.textContent=`
 .bamco-update-notice{position:fixed;z-index:2147483000;top:max(14px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(620px,calc(100vw - 28px));box-sizing:border-box;direction:rtl;text-align:right;background:#fff;border:1px solid #b8d2c6;border-radius:16px;box-shadow:0 14px 42px rgba(24,67,52,.22);padding:15px 17px;color:#173f35;font-family:"B Nazanin",BNazanin,Tahoma,sans-serif}
 .bamco-update-notice[hidden]{display:none!important}.bamco-update-notice h2{margin:0 0 5px;font-size:20px;line-height:1.55;font-weight:700}.bamco-update-notice p{margin:0;color:#526b61;font-size:16px;line-height:1.75}.bamco-update-notice small{display:block;margin-top:3px;color:#7b8f87;font-size:13px}
 .bamco-update-actions{display:flex;justify-content:flex-start;gap:8px;flex-wrap:wrap;margin-top:12px}.bamco-update-actions button{min-height:40px;border-radius:10px;padding:7px 14px;font:inherit;font-weight:400!important;cursor:pointer}.bamco-update-now{border:1px solid #176b4d;background:#176b4d;color:#fff}.bamco-update-later{border:1px solid #c7d7d0;background:#fff;color:#274d40}
 .bamco-update-notice.is-error{border-color:#e3aaaa}.bamco-update-notice.is-error h2{color:#9d3030}
 @media(max-width:600px){.bamco-update-notice{top:max(8px,env(safe-area-inset-top));width:calc(100vw - 16px);padding:13px 14px;border-radius:13px}.bamco-update-notice h2{font-size:18px}.bamco-update-notice p{font-size:15px}.bamco-update-actions{display:grid;grid-template-columns:1fr 1fr}.bamco-update-actions button{width:100%}}
 `;document.head.append(style);
}

function closeNotice(){notice?.remove();notice=null}
function showNotice({title,message,version,kind='info',primary,secondary='بعداً'}){
 closeNotice();installStyle();notice=document.createElement('section');notice.className='bamco-update-notice'+(kind==='error'?' is-error':'');notice.setAttribute('role',kind==='error'?'alert':'status');notice.setAttribute('aria-live','assertive');notice.innerHTML=`<h2>${esc(title)}</h2><p>${esc(message)}</p>${version?`<small>نسخه ${esc(version)}</small>`:''}<div class="bamco-update-actions">${primary?`<button type="button" class="bamco-update-now">${esc(primary.label)}</button>`:''}<button type="button" class="bamco-update-later">${esc(secondary)}</button></div>`;
 document.body.append(notice);
 notice.querySelector('.bamco-update-now')?.addEventListener('click',primary?.action);
 notice.querySelector('.bamco-update-later').addEventListener('click',()=>{if(version)write(keys.dismissed,version);closeNotice()});
}

async function clearAppCaches(){
 if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations().catch(()=>[]);await Promise.all(registrations.map(registration=>registration.unregister().catch(()=>false)))}
 if('caches' in window){const names=await caches.keys().catch(()=>[]);await Promise.all(names.filter(name=>/bamco/i.test(name)&&!/sticker/i.test(name)).map(name=>caches.delete(name).catch(()=>false)))}
}

async function applyUpdate(version){
 const button=notice?.querySelector('.bamco-update-now');if(button){button.disabled=true;button.textContent='در حال به‌روزرسانی…'}
 try{await clearAppCaches()}catch{}
 write(keys.pending,version);write(keys.attempts,String(Number(read(keys.attempts)||0)+1));write(keys.dismissed,'');
 const url=new URL(location.href);url.searchParams.set('bamco_update',version);url.searchParams.set('bamco_reload',String(Date.now()));location.replace(url.href);
}

function showAvailable(version){
 if(read(keys.dismissed)===version)return;
 showNotice({title:'نسخه جدید سامانه آماده است',message:'برای فعال‌شدن اصلاحات و امکانات جدید، سامانه را به‌روزرسانی کنید. نصب مجدد لازم نیست.',version,primary:{label:'به‌روزرسانی اکنون',action:()=>applyUpdate(version)}});
}
function showSuccess(version){
 write(keys.installed,version);write(keys.pending,'');write(keys.attempts,'0');write(keys.dismissed,'');
 showNotice({title:'سامانه ارتقا یافت',message:'نسخه جدید با موفقیت فعال شد و نیازی به نصب مجدد نیست.',version,secondary:'متوجه شدم'});
}
function showReinstall(version){
 showNotice({title:'به‌روزرسانی خودکار کامل نشد',message:'ابتدا یک‌بار دیگر تلاش کنید. اگر همچنان همین پیام را دیدید، میان‌بر سامانه را از Home Screen حذف و دوباره اضافه کنید؛ حساب و اطلاعات سامانه حذف نمی‌شود.',version,kind:'error',primary:{label:'تلاش مجدد',action:()=>applyUpdate(version)},secondary:'بعداً انجام می‌دهم'});
}

async function latestVersion(){
 const response=await fetch(`version.json?check=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('version check failed');const data=await response.json();return String(data?.version||'').trim();
}
async function check(force=false){
 if(checking||(!force&&Date.now()-lastCheck<30000))return;checking=true;lastCheck=Date.now();
 try{
  const latest=await latestVersion();if(!latest||!current)return;
  const pending=read(keys.pending),installed=read(keys.installed),attempts=Number(read(keys.attempts)||0);
  if(pending&&current===pending){showSuccess(current);return}
  if(pending&&current!==pending&&attempts>=2){showReinstall(pending);return}
  if(latest!==current){showAvailable(latest);return}
  if(installed&&installed!==current){showSuccess(current);return}
  if(!installed){const returning=!!read(legacyMarker);write(keys.installed,current);if(returning)showSuccess(current)}
 }catch{}finally{checking=false}
}

document.addEventListener('DOMContentLoaded',()=>void check(true),{once:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check(true)});
window.addEventListener('focus',()=>void check());
window.addEventListener('online',()=>void check(true));
setInterval(()=>void check(),300000);
window.bamcoAppUpdate={check:()=>check(true),current};
})();

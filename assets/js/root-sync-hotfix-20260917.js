(()=>{
'use strict';
if(window.__bamcoRootSyncHotfix20260917)return;
window.__bamcoRootSyncHotfix20260917=true;

const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const fa=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const en=v=>String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/* Request tables: keep real request rows newest-first and number only visible data rows.
   Empty/colspan rows are status messages and must never be overwritten. */
function requestIdForRow(row){
  const stored=Number(row?.dataset?.requestId);
  if(Number.isFinite(stored)&&stored>0)return stored;
  const first=row?.cells?.[0];
  if(!first||first.colSpan>1)return null;
  const parsed=Number(en(first.textContent).replace(/[^0-9]/g,''));
  if(!Number.isFinite(parsed)||parsed<=0)return null;
  row.dataset.requestId=String(parsed);
  return parsed;
}
function normalizeRequestTable(body){
  if(!body)return;
  const rows=qa(':scope > tr',body).filter(row=>{
    if(row.classList?.contains('empty'))return false;
    if(!row.cells||row.cells.length<2||row.cells[0]?.colSpan>1)return false;
    return requestIdForRow(row)!==null;
  });
  if(!rows.length)return;
  const sorted=[...rows].sort((a,b)=>requestIdForRow(b)-requestIdForRow(a));
  const changed=sorted.some((row,index)=>row!==rows[index]);
  if(changed)sorted.forEach(row=>body.appendChild(row));
  sorted.forEach((row,index)=>{
    const first=row.cells?.[0];
    if(first)first.textContent=fa(index+1);
  });
}
function repairRequestTables(){
  normalizeRequestTable(q('#approvalBody'));
  normalizeRequestTable(q('#requestHistoryBody'));
}

const requestObserver=new MutationObserver(repairRequestTables);
function watchRequestTables(){
  ['#approvalBody','#requestHistoryBody'].forEach(sel=>{
    const el=q(sel);if(el)requestObserver.observe(el,{childList:true});
  });
  repairRequestTables();
}

document.addEventListener('click',e=>{
  if(e.target.closest('[data-view="approvals"],[data-view="requestHistory"]')){
    setTimeout(repairRequestTables,0);setTimeout(repairRequestTables,180);setTimeout(repairRequestTables,700);
  }
},true);

/* iOS/Safari Persian + emoji bidi repair. Keep stored message text untouched; only rendering is isolated. */
function installBidiCss(){
  if(q('#bamcoPersianChatBidi20260917'))return;
  const style=document.createElement('style');style.id='bamcoPersianChatBidi20260917';
  style.textContent=`
  .chat-bubble,.chat-bubble p,.chat-bubble .message-text,.chat-message,.chat-message p,
  [data-chat-message],[data-message-body],.conversation-message,.conversation-message p{
    direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;
    overflow-wrap:anywhere;word-break:normal;
  }
  .chat-bubble img.emoji,.chat-message img.emoji,[data-chat-message] img.emoji{unicode-bidi:isolate;direction:ltr}
  .chat-bubble [dir="ltr"],.chat-message [dir="ltr"],[data-chat-message] [dir="ltr"]{unicode-bidi:isolate!important}
  `;document.head.append(style);
}

/* Avatar freshness: avatar_path may intentionally stay unchanged when the image is replaced.
   Therefore persistent cache keyed only by path is unsafe across devices. Bypass it for avatars. */
function installFreshAvatarLoader(){
  const media=window.bamcoMedia;if(!media||media.__freshAvatar20260917||typeof media.get!=='function')return false;
  const original=media.get.bind(media);let lastUrl='';
  media.get=async function(bucket,path){
    if(bucket!=='avatars')return original(bucket,path);
    if(!path)throw Error('مسیر تصویر نامعتبر است');
    const authToken=typeof state!=='undefined'?state.token:'';
    if(!authToken)throw Error('برای دریافت تصویر وارد سامانه شوید.');
    const encoded=String(path).split('/').map(encodeURIComponent).join('/');
    const res=await fetch(`${SB_URL}/storage/v1/object/authenticated/avatars/${encoded}?fresh=${Date.now()}`,{
      headers:{apikey:SB_KEY,Authorization:`Bearer ${authToken}`},cache:'no-store'
    });
    if(!res.ok)throw Error('دریافت تصویر انجام نشد');
    const url=URL.createObjectURL(await res.blob());
    if(lastUrl)try{URL.revokeObjectURL(lastUrl)}catch{}
    lastUrl=url;return url;
  };
  media.__freshAvatar20260917=true;
  return true;
}

function boot(){
  installBidiCss();watchRequestTables();
  if(!installFreshAvatarLoader()){
    let tries=0;const timer=setInterval(()=>{if(installFreshAvatarLoader()||++tries>40)clearInterval(timer)},100);
  }
  addEventListener('pageshow',()=>{repairRequestTables();try{window.refreshProfileAvatar?.()}catch{}},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){repairRequestTables();try{window.refreshProfileAvatar?.()}catch{}}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

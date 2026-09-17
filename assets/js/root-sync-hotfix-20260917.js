(()=>{
'use strict';
if(window.__bamcoRootSyncHotfix20260917)return;
window.__bamcoRootSyncHotfix20260917=true;

const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const fa=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const en=v=>String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const requestStatusLabels={pending:'در انتظار بررسی',in_review:'در زنجیره تأیید',needs_revision:'برگشت جهت اصلاح',approved:'تأیید',rejected:'رد',cancelled:'لغوشده'};

/* Request tables: the visible number is a stable UI row number starting at 1.
   The real request id stays in data-request-id so workflow actions and history remain linked. */
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
function requestCreatedAt(id){
  try{
    const rows=[...(state?.requests||[]),...(state?.requestHistory||[])];
    return rows.find(r=>String(r.id)===String(id))?.created_at||'';
  }catch{return''}
}
function normalizeRequestTable(body){
  if(!body)return;
  const rows=qa(':scope > tr',body).filter(row=>{
    if(row.classList?.contains('empty'))return false;
    if(!row.cells||row.cells.length<2||row.cells[0]?.colSpan>1)return false;
    return requestIdForRow(row)!==null;
  });
  if(!rows.length)return;
  const sorted=[...rows].sort((a,b)=>{
    const aid=requestIdForRow(a),bid=requestIdForRow(b);
    const at=Date.parse(requestCreatedAt(aid)||0),bt=Date.parse(requestCreatedAt(bid)||0);
    return (bt-at)||(bid-aid);
  });
  if(sorted.some((row,index)=>row!==rows[index]))sorted.forEach(row=>body.appendChild(row));
  sorted.forEach((row,index)=>{
    const first=row.cells?.[0];
    if(first)first.textContent=fa(index+1);
  });
}
function decorateHistoryRows(){
  const body=q('#requestHistoryBody');if(!body)return;
  let byId=new Map();try{byId=new Map((state?.requestHistory||[]).map(r=>[String(r.id),r]))}catch{}
  qa(':scope > tr[data-request-id]',body).forEach(row=>{
    const record=byId.get(String(row.dataset.requestId));
    if(record&&row.cells?.[5])row.cells[5].textContent=requestStatusLabels[record.request_status]||record.request_status||'—';
  });
}
function repairRequestTables(){
  normalizeRequestTable(q('#approvalBody'));
  normalizeRequestTable(q('#requestHistoryBody'));
  decorateHistoryRows();
}

let workflowSync=null,lastWorkflowSync=0;
async function syncRequestWorkflow(force=false){
  if(workflowSync||(!force&&Date.now()-lastWorkflowSync<12000))return workflowSync;
  try{if(typeof state==='undefined'||!state?.token||typeof window.bamcoRequestSync?.refresh!=='function')return null}catch{return null}
  lastWorkflowSync=Date.now();
  workflowSync=(async()=>{
    try{
      await window.bamcoRequestSync.refresh();
      repairRequestTables();
    }catch{}
  })().finally(()=>{workflowSync=null});
  return workflowSync;
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
    void syncRequestWorkflow(true);
    setTimeout(repairRequestTables,0);setTimeout(repairRequestTables,180);setTimeout(repairRequestTables,700);
  }
},true);

/* Persian + English + emoji must remain in logical order on Safari/iOS.
   Emoji artwork is an inline neutral object, so isolate it from RTL text instead of allowing it
   to participate in the surrounding bidi run. Stored message text is never modified. */
function installBidiCss(){
  if(q('#bamcoPersianChatBidi20260917'))return;
  const style=document.createElement('style');style.id='bamcoPersianChatBidi20260917';
  style.textContent=`
  .chat-body[dir="rtl"]{direction:rtl!important;text-align:right!important;unicode-bidi:plaintext!important;white-space:pre-wrap!important}
  .chat-body[dir="ltr"]{direction:ltr!important;text-align:left!important;unicode-bidi:plaintext!important;white-space:pre-wrap!important}
  .chat-body .bamco-emoji,.chat-body .bamco-emoji-fallback,.chat-body .chat-emoji-glyph,
  .chat-bubble .bamco-emoji,.chat-bubble .bamco-emoji-fallback{
    display:inline-block!important;direction:ltr!important;unicode-bidi:isolate!important;vertical-align:-.25em!important
  }
  .chat-body .chat-sticker{display:block!important;direction:ltr!important;unicode-bidi:isolate!important;margin-inline:auto!important}
  .chat-bubble blockquote{unicode-bidi:plaintext!important}
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
  installBidiCss();watchRequestTables();void syncRequestWorkflow(false);
  if(!installFreshAvatarLoader()){
    let tries=0;const timer=setInterval(()=>{if(installFreshAvatarLoader()||++tries>40)clearInterval(timer)},100);
  }
  addEventListener('pageshow',()=>{repairRequestTables();void syncRequestWorkflow(false);try{window.refreshProfileAvatar?.()}catch{}},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){repairRequestTables();void syncRequestWorkflow(false);try{window.refreshProfileAvatar?.()}catch{}}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

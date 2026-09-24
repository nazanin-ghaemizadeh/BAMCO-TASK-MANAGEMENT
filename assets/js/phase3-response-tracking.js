(()=>{
'use strict';
const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>typeof fa==='function'?fa(v):String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const labels={replied:'پاسخ داده',awaiting:'بدون پاسخ',failed:'خطای ارسال',reminder_needed:'نیازمند یادآوری'};
const channels={portal:'داخل سامانه',email:'ایمیل',both:'هر دو'};
let rows=[],selected=new Set(),sending=false,loading=false,dateTarget=null,preparedReminder=null;
const eligible=r=>r&&r.response_status!=='replied'&&!r.replied_at&&r.delivery_status!=='cancelled';
const responseFeature=()=>window.BamcoNavigationCatalog?.featureForRoute?.('responseTracking')||'responseTracking';
const responseCan=(action='view')=>window.BamcoAccess?.can?.(responseFeature(),action)===true;
const responseSession=()=>typeof state!=='undefined'&&!!state?.token;
function recipientFallback(row,fallback='—'){return row?.display_name||row?.recipient_display_name||row?.recipient_name||row?.full_name||row?.recipient_full_name||row?.email||row?.recipient_email||fallback}
function recipientName(row,fallback='—'){return window.BamcoProfiles?.label?.(row?.recipient_id,recipientFallback(row,fallback))||recipientFallback(row,fallback)}
function recipientProfiles(source){
  const store=window.BamcoProfiles,profiles=[];
  for(const row of source||[]){
    const id=row?.recipient_id;if(!id)continue;
    const profile={id};
    const add=(key,value)=>{if(value!==undefined&&value!==null&&value!=='')profile[key]=value};
    add('display_name',row.display_name??row.recipient_display_name);
    add('full_name',row.full_name??row.recipient_full_name);
    add('email',row.email??row.recipient_email);
    add('avatar_path',row.avatar_path);
    add('updated_at',row.profile_updated_at??row.updated_at);
    add('active',row.active);
    // A response-tracking row may be a historical projection. Do not let one
    // without a profile revision erase a fresher canonical profile.
    if(store?.get?.(id)&&!profile.updated_at)continue;
    profiles.push(profile);
  }
  if(profiles.length)store?.upsert?.(profiles,{source:'response-tracking-directory'});
  return profiles;
}
function denyResponse(action='view'){window.BamcoAccess?.denied?.(responseFeature(),action,{route:'responseTracking'});return false}
async function ensureResponseAccess(action='view'){
  const access=window.BamcoAccess;
  if(!responseSession()||typeof access?.can!=='function')return false;
  if(!access.isReady?.())await access.refresh?.();
  return responseCan(action)||denyResponse(action);
}
function syncResponseAccess(){
  const button=q('#nav button[data-view="responseTracking"]'),view=q('#responseTrackingView'),canView=responseCan('view'),canCreate=responseCan('create'),canExport=responseCan('export');
  if(button){button.dataset.featureKey=responseFeature();button.classList.toggle('hidden',!canView);button.disabled=!canView;button.setAttribute('aria-hidden',canView?'false':'true');button.setAttribute('aria-disabled',canView?'false':'true')}
  if(view)view.dataset.featureKey=responseFeature();
  q('#sendResponseReminder')?.toggleAttribute('disabled',!canCreate||sending||![...selected].some(id=>eligible(rows.find(x=>String(x.delivery_id)===id))));
  q('[data-response-export]')?.toggleAttribute('disabled',!canExport);
  if(responseSession()&&!canView&&typeof state!=='undefined'&&state.view==='responseTracking')window.bamcoShowHome?.();
}

function currentMonthRange(){
  try{
    const p=currentJalali(),from=jalaliToISO(p.y,p.m,1),next=p.m===12?jalaliToISO(p.y+1,1,1):jalaliToISO(p.y,p.m+1,1);
    if(!from||!next)return{from:'',to:'',fromText:'',toText:''};
    const end=new Date(next+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-1);
    const to=end.toISOString().slice(0,10);
    return{from,to,fromText:jalaliText(from),toText:jalaliText(to)};
  }catch{return{from:'',to:'',fromText:'',toText:''}}
}
function iso(value,end=false){
  const v=String(value||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)),p=v.match(/\d+/g)?.map(Number);
  if(!p||p.length!==3||p.some(Number.isNaN))return'';
  try{const out=jalaliToISO(p[0],p[1],p[2]);return out?out+(end?'T23:59:59':'T00:00:00'):''}catch{return''}
}
function filtered(){
  const from=iso(q('#responseFrom')?.value),to=iso(q('#responseTo')?.value,true);
  return rows.filter(x=>x.delivery_status!=='cancelled'&&(!from||String(x.sent_at||'')>=from)&&(!to||String(x.sent_at||'')<=to));
}
function ensureStyles(){
  if(q('#bamcoResponseTrackingRootCss'))return;
  const s=document.createElement('style');s.id='bamcoResponseTrackingRootCss';s.textContent=`
    #responseTrackingView .response-command-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;border-top:1px solid #d9e4de;border-bottom:1px solid #d9e4de;margin:0 0 12px}
    #responseTrackingView .response-command-row>*{flex:0 0 auto}
    #responseTrackingView .response-command-row button{font-weight:400!important}
    #responseTrackingView .response-date-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    #responseTrackingView .response-date-controls label{display:flex;align-items:center;gap:5px;margin:0;white-space:nowrap}
    #responseTrackingView .response-date-field{display:grid;grid-template-columns:minmax(126px,154px) 36px;gap:4px;align-items:center}
    #responseTrackingView .response-date-field input{height:38px;text-align:center}
    #responseTrackingView .response-date-field button{height:38px;width:36px;padding:0}
    #responseTrackingView [data-response-home]{order:1}
    #responseTrackingView .response-date-controls{order:2}
    #responseTrackingView [data-response-refresh]{order:3}
    #responseTrackingView [data-response-access]{order:4}
    #responseTrackingView [data-response-export]{order:5}
    #responseTrackingView #reminderSendChannel{order:6;height:38px;min-width:132px}
    #responseTrackingView #sendResponseReminder{order:7}
    #responseTrackingView table{border-collapse:collapse;width:100%}
    #responseTrackingView table th,#responseTrackingView table td{border:1px solid #cbd9d3}
    #responseTrackingView tbody tr[data-delivery]{cursor:pointer}
    #responseTrackingView tbody tr.suite-selected>td{background:#e9f4ef!important}
    #responseTrackingView .response-recipient{display:inline-flex;align-items:center;gap:7px;min-width:0}
    #responseTrackingView .response-recipient-avatar{width:28px;height:28px;flex:0 0 28px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#edf6f1;border:1px solid #c8ddd2;color:#176d52;font-weight:700}
    #responseTrackingView .response-recipient-avatar img{width:100%;height:100%;object-fit:cover}
    @media(max-width:760px){#responseTrackingView .response-date-controls{width:100%}.response-command-row{align-items:stretch!important}}
  `;document.head.append(s);
}
function install(){
  if(q('#responseTrackingView')){syncResponseAccess();window.BamcoAccess?.applyNavigation?.();return}
  const workspace=q('.workspace'),anchor=q('#nav button[data-view="templates"]');if(!workspace)return;
  ensureStyles();
  const btn=document.createElement('button');btn.dataset.view='responseTracking';btn.dataset.featureKey=responseFeature();btn.innerHTML='<b>↩</b><span>پیگیری پاسخ</span>';(anchor?.parentElement||q('#nav'))?.insertBefore(btn,anchor||null);
  const range=currentMonthRange();
  workspace.insertAdjacentHTML('beforeend',`<section id="responseTrackingView" class="view hidden" data-feature-key="${esc(responseFeature())}" data-feature-action="view"><div class="panel table-panel response-tracking"><div class="panel-head"><div><h3>پیگیری پاسخ‌ها</h3><small>پاسخ هر فرد در کنار همان پیام ارسالی نمایش داده می‌شود.</small></div></div><div class="response-command-row bamco-command-bar"><button type="button" class="ghost" data-response-home>بازگشت به خانه</button><div class="response-date-controls"><label><span>از تاریخ</span><span class="response-date-field"><input id="responseFrom" class="jalali-input" readonly value="${esc(range.fromText)}"><button type="button" class="ghost" data-response-tracking-date="from" aria-label="انتخاب تاریخ شروع">▦</button></span></label><label><span>تا تاریخ</span><span class="response-date-field"><input id="responseTo" class="jalali-input" readonly value="${esc(range.toText)}"><button type="button" class="ghost" data-response-tracking-date="to" aria-label="انتخاب تاریخ پایان">▦</button></span></label></div><button type="button" class="ghost" data-response-refresh>تازه‌سازی</button><button type="button" class="ghost hidden" data-response-access data-feature-access-control="local">مدیریت دسترسی</button><button type="button" class="ghost" data-response-export data-feature-key="${esc(responseFeature())}" data-feature-action="export">خروجی اکسل</button><select id="reminderSendChannel" aria-label="کانال یادآوری" data-feature-key="${esc(responseFeature())}" data-feature-action="create"><option value="portal">داخل سامانه</option><option value="email">ایمیل</option><option value="both">هر دو</option></select><button id="sendResponseReminder" type="button" class="primary" data-feature-key="${esc(responseFeature())}" data-feature-action="create">ارسال یادآوری</button></div><div class="table-wrap"><table class="workspace-table"><thead><tr><th>شناسه</th><th>فرد</th><th>تاریخ ارسال</th><th>کانال</th><th>موضوع</th><th>پاسخ</th><th>تاریخ پاسخ</th><th>تعداد یادآوری</th><th>آخرین یادآوری</th></tr></thead><tbody id="responseTrackingBody"></tbody></table></div></div></section>`);
  btn.onclick=()=>void openResponseTracking();
  qa('#responseFrom,#responseTo').forEach(x=>x.addEventListener('input',()=>{selected.clear();render()}));
  q('#sendResponseReminder').onclick=sendReminder;
  q('[data-response-home]').onclick=()=>window.bamcoShowHome?.();
  q('[data-response-refresh]').onclick=()=>void load(true);
  q('[data-response-access]').onclick=()=>window.bamcoAccessEditor?.open?.({featureKey:responseFeature(),title:'مدیریت دسترسی پیگیری پاسخ'});
  q('[data-response-export]').onclick=exportVisible;
  q('#responseTrackingBody').onclick=e=>{if(e.target.closest('button,input,select'))return;if(!responseCan('create'))return denyResponse('create');const tr=e.target.closest('[data-delivery]');if(!tr||sending||!eligible(rows.find(x=>String(x.delivery_id)===tr.dataset.delivery)))return;selected.has(tr.dataset.delivery)?selected.delete(tr.dataset.delivery):selected.add(tr.dataset.delivery);render()};
  qa('[data-response-tracking-date]').forEach(b=>b.onclick=e=>{e.preventDefault();openDate(b.dataset.responseTrackingDate)});
  window.addEventListener('bamco:feature-access-changed',syncResponseAccess);
  syncResponseAccess();
  window.BamcoAccess?.applyNavigation?.();
}
function render(){
  const list=filtered(),body=q('#responseTrackingBody');if(!body)return;
  const valid=new Set(list.filter(eligible).map(x=>String(x.delivery_id)));selected=new Set([...selected].filter(id=>valid.has(id)));
  body.innerHTML=list.map(x=>{const name=recipientName(x),avatar=x.recipient_id?`<span class="response-recipient-avatar" data-profile-photo="${esc(x.recipient_id)}" aria-label="تصویر ${esc(name)}">${esc(name.trim()[0]||'—')}</span>`:'';return `<tr data-delivery="${esc(x.delivery_id)}" class="${selected.has(String(x.delivery_id))?'suite-selected':''}" aria-selected="${selected.has(String(x.delivery_id))}"><td>${digits(x.delivery_id)}</td><td><span class="response-recipient">${avatar}<span>${esc(name)}</span></span></td><td>${esc(x.sent_at?jalaliDateTime(x.sent_at):'—')}</td><td>${esc(channels[x.channel]||x.channel||'—')}</td><td>${esc(x.subject||'—')}</td><td class="response-${esc(x.response_status||'')}">${esc(labels[x.response_status]||x.response_status||'—')}</td><td>${esc(x.replied_at?jalaliDateTime(x.replied_at):'—')}</td><td>${digits(x.reminder_count||0)}</td><td>${esc(x.last_reminded_at?jalaliDateTime(x.last_reminded_at):'—')}</td></tr>`}).join('')||'<tr><td colspan="9" class="empty">ارسالی مطابق فیلترها وجود ندارد.</td></tr>';
  const profiles=list.map(row=>window.BamcoProfiles?.get?.(row.recipient_id)).filter(Boolean);if(profiles.length)void window.bamcoMedia?.avatars?.(body,profiles);
  const send=q('#sendResponseReminder');if(send)send.disabled=!responseCan('create')||sending||![...selected].some(id=>{const r=rows.find(x=>String(x.delivery_id)===id);return eligible(r)});
  syncResponseAccess();
}
async function openResponseTracking(){if(!await ensureResponseAccess())return false;if(typeof showView==='function')showView('responseTracking');setTimeout(()=>void load(),0);return true}
async function load(force=false){
  if(!await ensureResponseAccess()||loading&&!force)return;loading=true;const refresh=q('[data-response-refresh]');if(refresh)refresh.disabled=true;
  try{
    rows=await selectAll('message_response_tracking','select=*&order=sent_at.desc');
    recipientProfiles(rows);
    render();
  }catch(err){toast(err.message,true)}finally{loading=false;if(refresh)refresh.disabled=false}
}
async function exportVisible(){
  if(!await ensureResponseAccess('export'))return;
  const button=q('[data-response-export]');if(button)button.disabled=true;
  try{
    const table=q('#responseTrackingView table');if(!table)return;
    if(typeof window.bamcoExportTable==='function'){await window.bamcoExportTable(table);return}
    const X=await window.ensureBamcoXLSX(),data=[...table.rows].map(r=>[...r.cells].map(c=>c.textContent.trim())),ws=X.utils.aoa_to_sheet(data),wb=X.utils.book_new();ws['!views']=[{rightToLeft:true}];ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:data.length-1,c:data[0].length-1}})};X.utils.book_append_sheet(wb,ws,'پیگیری پاسخ');wb.Workbook={Views:[{RTL:true}]};X.writeFile(wb,'پیگیری پاسخ.xlsx',{compression:true});
  }catch(err){toast(err.message,true)}finally{if(button)button.disabled=false}
}
async function sendReminder(){
  if(!await ensureResponseAccess('create')||sending)return;
  const items=rows.filter(x=>selected.has(String(x.delivery_id))&&eligible(x));
  if(!items.length)return toast('حداقل یک ارسال بدون پاسخ را انتخاب کنید.',true);
  const channel=q('#reminderSendChannel').value;
  if(channel!=='portal'){
    const missing=items.filter(x=>!String(x.recipient_email||'').trim());
    if(missing.length)return toast(`برای ${[...new Set(missing.map(x=>recipientName(x)))].join('، ')} ایمیل ثبت نشده است.`,true);
  }
  sending=true;render();
  try{
    const ids=items.map(x=>x.delivery_id),key=JSON.stringify([ids.map(String).sort(),channel]);
    if(!preparedReminder||preparedReminder.key!==key)preparedReminder={key,ids,channel,requestId:crypto.randomUUID()};
    const bid=await rpc('prepare_message_reminders',{p_delivery_ids:ids,p_channel:channel,p_request_id:preparedReminder.requestId});
    preparedReminder.id=bid;
    const snapshots=await selectAll('message_snapshots',`select=*&batch_id=eq.${bid}&order=id`);
    if(!snapshots.length)throw Error('پیش‌نمایش یادآوری ساخته نشد.');
    if(!q('#reminderPreviewDialog')){
      document.body.insertAdjacentHTML('beforeend','<dialog id="reminderPreviewDialog" class="modal bamco-dialog" dir="rtl"><div class="modal-head"><h3>پیش‌نمایش یادآوری</h3></div><div id="reminderPreviewContent"></div><p id="reminderResult" role="status" style="white-space:pre-wrap"></p><div class="modal-actions"><button id="cancelReminderPreview" type="button" class="ghost">بستن</button><button id="confirmReminderSend" type="button" class="primary">تأیید و ارسال</button></div></dialog>');
      q('#cancelReminderPreview').onclick=()=>{if(!sending)q('#reminderPreviewDialog').close()};
      q('#reminderPreviewDialog').addEventListener('cancel',e=>{if(sending)e.preventDefault()});
      q('#confirmReminderSend').onclick=confirmReminder;
    }
    q('#reminderResult').textContent='';
    q('#reminderPreviewContent').innerHTML=snapshots.map(s=>`<section><h4>${esc(s.recipient_name)}</h4><p>کانال: ${esc(channels[channel])}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(BamcoMessageRender.bodyText(s))}</div></section>`).join('<hr>');
    q('#confirmReminderSend').textContent='تأیید و ارسال';q('#confirmReminderSend').disabled=false;q('#reminderPreviewDialog').showModal();
  }catch(err){toast(err.message,true)}finally{sending=false;render()}
}
async function confirmReminder(){
  if(!await ensureResponseAccess('create')||sending||!preparedReminder?.id)return;
  sending=true;render();q('#confirmReminderSend').disabled=true;
  const pending=preparedReminder;let error='';
  try{
    await rpc('queue_message_batch',{p_batch_id:pending.id});
    if(pending.channel!=='portal'){
      const result=await api('/functions/v1/send-message-queue',{method:'POST',body:{batch_id:pending.id}});
      if(result.failed||result.pending||result.errors?.length)error=result.error||result.errors?.map(x=>x.message).join('؛ ')||'برخی ارسال‌ها هنوز تکمیل نشده‌اند.';
    }
  }catch(err){error=err.message}
  try{
    const deliveries=await selectAll('message_deliveries',`select=id,recipient_id,channel,status,error_message&batch_id=eq.${pending.id}&order=id`);
    const ok=deliveries.filter(d=>['sent','delivered'].includes(d.status)),failed=deliveries.filter(d=>d.status==='failed'),waiting=deliveries.filter(d=>!['sent','delivered','failed','cancelled'].includes(d.status));
    q('#reminderResult').textContent=`${digits(ok.length)} ارسال موفق؛ ${digits(failed.length)} ناموفق؛ ${digits(waiting.length)} در انتظار تکمیل\n`+deliveries.map(d=>`${recipientName(rows.find(r=>r.recipient_id===d.recipient_id),d.recipient_id)} — ${channels[d.channel]}: ${['sent','delivered'].includes(d.status)?'موفق':d.error_message||d.status}`).join('\n')+(error?'\n'+error:'');
    if(deliveries.length&&ok.length===deliveries.length){selected.clear();preparedReminder=null;}
    // Retry reuses the same batch: successful channels are never resent.
    q('#confirmReminderSend').textContent='بررسی / تلاش مجدد همین ارسال';
    q('#confirmReminderSend').disabled=!preparedReminder;
  }catch(err){q('#reminderResult').textContent=(error?error+'\n':'')+'دریافت نتیجه ناموفق: '+err.message;q('#confirmReminderSend').disabled=false;}
  finally{await load(true);sending=false;render()}
}

function openDate(kind){
  const input=q(kind==='from'?'#responseFrom':'#responseTo'),dialog=q('#calendarDialog');if(!input||!dialog)return;
  dateTarget={kind,input};const now=currentJalali(),raw=String(input.value||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)),m=raw.match(/\d+/g)?.map(Number),p=m?.length===3?{y:m[0],m:m[1],d:m[2]}:now;
  q('#calendarLabel').textContent=kind==='from'?'انتخاب تاریخ شروع':'انتخاب تاریخ پایان';q('#calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${digits(y)}</option>`).join('');q('#calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');q('#calYear').value=String(p.y);q('#calMonth').value=String(p.m);fillCalendarDays();q('#calDay').value=String(p.d);dialog.showModal();
}
function commitDate(clear=false){
  if(!dateTarget)return false;const input=dateTarget.input;input.value=clear?'':digits(`${q('#calYear').value}/${String(q('#calMonth').value).padStart(2,'0')}/${String(q('#calDay').value).padStart(2,'0')}`);dateTarget=null;q('#calendarDialog')?.close();selected.clear();render();return true;
}
document.addEventListener('click',e=>{if(!dateTarget)return;if(e.target.closest?.('#setDateBtn')){e.preventDefault();e.stopImmediatePropagation();commitDate(false)}else if(e.target.closest?.('#clearDateBtn')){e.preventDefault();e.stopImmediatePropagation();commitDate(true)}},true);
window.bamcoTableData=window.bamcoTableData||{};window.bamcoTableData.responseTrackingView=()=>filtered().map(x=>({id:String(x.delivery_id),values:[x.delivery_id,recipientName(x),x.sent_at?jalaliDateTime(x.sent_at):'—',channels[x.channel]||x.channel,x.subject,labels[x.response_status]||x.response_status,x.replied_at?jalaliDateTime(x.replied_at):'—',x.reminder_count||0]}));
document.addEventListener('bamco:profiles-updated',()=>{if(rows.length&&q('#responseTrackingBody'))render()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();setTimeout(install,600);
})();

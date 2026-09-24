(()=>{
'use strict';
if(window.__bamcoCanonicalReportsLiveSyncV6)return;
window.__bamcoCanonicalReportsLiveSyncV6=true;
const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>typeof fa==='function'?fa(v):String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
let responseRows=[],dateTarget=null,rawTabRender=null,responseDeleting=false,monitoringStartedAt=null,domainRefreshTimer=0;
function installCss(){
 q('#bamcoCanonicalReportCss')?.remove();const s=document.createElement('style');s.id='bamcoCanonicalReportCss';s.textContent=`
 #performanceReportView .canonical-report,#responseReportView .canonical-report{min-height:160px}
 .canonical-report-tools{display:flex!important;align-items:center!important;gap:9px!important;flex-wrap:wrap!important;margin:0 0 12px}
 .canonical-date-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
 .canonical-date-controls label{display:flex;align-items:center;gap:6px;margin:0;white-space:nowrap}
 .canonical-date-field{display:grid;grid-template-columns:minmax(128px,158px) 38px;gap:5px;align-items:center}
 .canonical-date-field input{height:38px;border:1px solid #c7d5cf;border-radius:8px;background:#fff;padding:0 9px;text-align:center;font-family:"B Nazanin",BNazanin,Tahoma,sans-serif}
 .canonical-date-field button{height:38px;width:38px;padding:0}
 .canonical-report .workspace-table{border-collapse:collapse!important;border-spacing:0!important;width:100%}
 .canonical-report .workspace-table th,.canonical-report .workspace-table td{border:1px solid #cbd9d3!important}
 .canonical-report .empty{text-align:center!important;padding:28px!important;color:#71867d}
 #performanceReportView .performance-command-row{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:nowrap!important;overflow-x:auto!important;padding:2px 0 7px!important;scrollbar-width:thin}
 #performanceReportView .performance-command-row>*{flex:0 0 auto!important}
 #performanceReportView .performance-command-row .canonical-date-controls{display:contents!important}
 #performanceReportView .completion-cell{padding:6px 8px!important;min-width:155px}
 #performanceReportView .performance-progress{position:relative!important;height:22px!important;min-width:138px!important;border:1px solid #c8d6d0!important;border-radius:999px!important;background:#edf2ef!important;overflow:hidden!important;isolation:isolate!important}
 #performanceReportView .performance-progress>i{position:absolute!important;top:0!important;bottom:0!important;right:0!important;width:var(--p,0%)!important;z-index:0!important}
 #performanceReportView .performance-progress>span{position:absolute!important;inset:0!important;display:grid!important;place-items:center!important;z-index:1!important;color:#173f33!important}
 #performanceReportView .performance-progress.high>i{background:#58ad78!important}#performanceReportView .performance-progress.medium>i{background:#72b5ad!important}#performanceReportView .performance-progress.warning>i{background:#e4b45e!important}#performanceReportView .performance-progress.low>i{background:#db7a73!important}
 #responseReportView .response-command-row{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;padding:10px 0!important;margin:0 0 10px!important;border-top:1px solid #d9e4de!important;border-bottom:1px solid #d9e4de!important}
 #responseReportView .response-command-row>*{flex:0 0 auto!important}
 #responseReportView .response-command-row button{font-weight:400!important}
 #responseReportView .response-search-row{display:flex;align-items:center;gap:8px;margin:0 0 10px}
 #responseReportView .response-search-row input{min-width:240px;flex:1 1 300px}
 #responseReportView tbody tr[data-delivery-id]{cursor:pointer}
 #responseReportView tbody tr.suite-selected>td{background:#e9f4ef!important}
 #responseReportView [data-response-bulk-delete]{color:#b54040!important;border-color:#e3aaaa!important;background:#fff5f5!important;white-space:nowrap!important}
 #responseReportView [data-response-bulk-delete]:disabled{opacity:.45!important;cursor:not-allowed!important}
 .workspace-loading{display:none!important}
 @media(max-width:900px){#responseReportView .response-command-row .canonical-date-controls{width:100%}.response-search-row input{width:100%}}
 `;document.head.append(s);
}
function markReportOwners(){for(const id of ['performanceReportView','responseReportView']){const view=q('#'+id);if(view)view.dataset.canonicalReportOwner='6'}}
function panel(view,title,tools,table){view.innerHTML=`<div class="panel workspace-panel canonical-report"><div class="panel-head"><h3>${esc(title)}</h3></div>${tools||''}${table||''}</div>`}
function currentMonthRange(){try{const p=currentJalali(),from=jalaliToISO(p.y,p.m,1),next=p.m===12?jalaliToISO(p.y+1,1,1):jalaliToISO(p.y,p.m+1,1);if(!from||!next)return null;const d=new Date(next+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);const to=d.toISOString().slice(0,10);return{from,to,fromText:jalaliText(from),toText:jalaliText(to)}}catch{return null}}
function inputIso(input){const raw=typeof en==='function'?en(input?.value||''):String(input?.value||''),m=raw.match(/\d+/g)?.map(Number);return m?.length===3?jalaliToISO(m[0],m[1],m[2])||'':''}
function profileFor(id){return window.BamcoProfiles?.get?.(id)||(state.profiles||[]).find(x=>String(x.id)===String(id))||null}
function personName(id,fallback='—'){const canonical=window.BamcoProfiles?.label?.(id,'');return canonical||profileFor(id)?.display_name||profileFor(id)?.full_name||profileFor(id)?.email||fallback}
function personRole(id){return profileFor(id)?.role||''}
const uniqueWorkflowRows=rows=>[...new Map((rows||[]).filter(Boolean).map((row,index)=>[row?.id==null?`snapshot-${index}`:String(row.id),row])).values()];
function workflowRows(){return uniqueWorkflowRows(state.definitionRequests?.length?state.definitionRequests:[...(state.requests||[]),...(state.requestHistory||[])]);}
async function refreshWorkflowRows(){
 const actor=state.user?.id,token=state.token,load=window.bamcoLoadRequestWorkflow;
 if(!actor||!token)return workflowRows();
 if(typeof load!=='function')throw Error('کارتابل تأیید هنوز آماده نیست.');
 const workflow=await load();
 if(actor!==state.user?.id||token!==state.token)return[];
 state.requests=workflow.requests||[];
 state.requestHistory=workflow.history||[];
 state.requestRoutes=workflow.routes||[];
 state.definitionRequests=uniqueWorkflowRows([...state.requests,...state.requestHistory]);
 return workflowRows();
}
function within(value,from,to){const day=String(value||'').slice(0,10);return !!day&&(!from||day>=from)&&(!to||day<=to)}
function afterMonitoringStart(value){return !monitoringStartedAt||String(value||'')>=monitoringStartedAt}
async function loadMonitoringStart(){
 if(monitoringStartedAt!==null)return monitoringStartedAt;
 try{const rows=await selectAll('app_settings','select=key,value&key=eq.performance_monitoring_started_at&limit=1'),raw=rows?.[0]?.value;monitoringStartedAt=String(raw?.value||raw||'').trim()}catch{}
 if(!monitoringStartedAt)monitoringStartedAt='2026-09-14T00:00:00Z';
 return monitoringStartedAt;
}
function temporal(t){try{return window.bamcoTaskPresentation?.(t)?.temporal||String(t?.due_state||'')}catch{return String(t?.due_state||'')}}
function terminal(t){try{return !!window.bamcoOptions?.terminal?.(t)}catch{return false}}
function completed(t){try{if(window.bamcoOptions?.completed?.(t))return true}catch{}const value=String(t?.status||t?.status_key||'').replace(/\u200c/g,' ').trim();return ['انجام شده','انجام‌شده','completed','done'].includes(value.toLowerCase())}
const renderEpoch={performanceReport:0,responseReport:0};
function perfTools(range){return `<div class="workspace-report-tools canonical-report-tools performance-command-row"><div class="canonical-date-controls"><label><span>تاریخ شروع</span><span class="canonical-date-field"><input id="canonicalPerfFrom" data-performance-from class="jalali-input" readonly value="${esc(range?.fromText||'')}"><button type="button" class="ghost" data-canonical-date="perf-from" aria-label="انتخاب تاریخ شروع">▦</button></span></label><label><span>تاریخ پایان</span><span class="canonical-date-field"><input id="canonicalPerfTo" data-performance-to class="jalali-input" readonly value="${esc(range?.toText||'')}"><button type="button" class="ghost" data-canonical-date="perf-to" aria-label="انتخاب تاریخ پایان">▦</button></span></label><button type="button" class="ghost" data-canonical-perf-clear data-performance-clear>حذف بازه</button></div><button type="button" class="ghost" data-canonical-refresh="performanceReport">تازه‌سازی</button><button type="button" class="ghost" data-canonical-export="performance">خروجی اکسل</button></div>`}
async function renderPerformance(force=false){
 const epoch=++renderEpoch.performanceReport,view=q('#performanceReportView');if(!view)return;const range=currentMonthRange();
 if(force||!q('.canonical-report',view))panel(view,'گزارش عملکرد',perfTools(range),'<div class="table-wrap"><table class="workspace-table"><thead></thead><tbody><tr><td class="empty">در حال دریافت اطلاعات…</td></tr></tbody></table></div>');window.bamcoInteriorUI?.decorateView?.(view);
 const from=inputIso(q('#canonicalPerfFrom')),to=inputIso(q('#canonicalPerfTo'));
 let requests=[];try{[requests]=await Promise.all([refreshWorkflowRows(),loadMonitoringStart()])}catch(err){if(epoch===renderEpoch.performanceReport&&state.view==='performanceReport')showError(view,err,'performanceReport');return}
 if(epoch!==renderEpoch.performanceReport||state.view!=='performanceReport')return;const table=q('table',view);if(!table)return;
 const tasks=state.tasks||[],ids=[...new Set([...tasks.map(t=>t.owner_id),...tasks.map(t=>t.created_by),...requests.map(r=>r.requested_by)])].filter(Boolean),defaultRange=!!range&&from===range.from&&to===range.to,metrics=window.bamcoDashboardMetrics;
 const headers=['متولی','کل واگذارشده','فعال','هشدار','دیرکرد',defaultRange?'محول‌شده در این ماه':'محول‌شده در بازه',defaultRange?'انجام‌شده در این ماه':'انجام‌شده در بازه','درصد تکمیل',defaultRange?'درخواست تعریف وظیفه این ماه (برای دیگران)':'درخواست تعریف وظیفه در بازه (برای دیگران)',defaultRange?'درخواست تعریف وظیفه این ماه (برای خود)':'درخواست تعریف وظیفه در بازه (برای خود)'];
 table.tHead.innerHTML='<tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';
 table.tBodies[0].innerHTML=ids.map((id,i)=>{const all=tasks.filter(t=>String(t.owner_id)===String(id)),active=all.filter(t=>!t.archived&&!terminal(t)),due=all.filter(t=>t.due_date&&(!from||String(t.due_date).slice(0,10)>=from)&&(!to||String(t.due_date).slice(0,10)<=to)),done=due.filter(completed),pct=due.length?Math.round(done.length/due.length*100):0,level=pct>=80?'high':pct>=60?'medium':pct>=40?'warning':'low',definitionRequests=requests.filter(r=>String(r.requested_by)===String(id)&&r.request_type==='create'&&within(r.created_at,from,to)),forSelf=definitionRequests.filter(r=>String(r.proposed_data?.owner_id||r.requested_by)===String(id)).length,forOthers=definitionRequests.length-forSelf;return `<tr data-canonical-row="1" data-workspace-index="${i}"><td>${esc(personName(id))}</td><td>${digits(all.length)}</td><td>${digits(active.length)}</td><td>${digits(active.filter(t=>temporal(t)==='دوره هشدار').length)}</td><td>${digits(active.filter(t=>temporal(t)==='دیرکرد').length)}</td><td>${digits(due.length)}</td><td>${digits(done.length)}</td><td class="completion-cell"><div class="performance-progress ${level}" style="--p:${Math.max(0,Math.min(100,pct))}%"><i></i><span>${digits(pct)}٪</span></div></td><td title="درخواست‌های تعریف وظیفه برای دیگران" data-definition-metric="for-others">${digits(forOthers)}</td><td title="درخواست‌های تعریف وظیفه برای خود" data-definition-metric="for-self">${digits(forSelf)}</td></tr>`}).join('')||'<tr><td colspan="10" class="empty">رکوردی ثبت نشده است.</td></tr>';
}
function responseLabel(v){return({replied:'پاسخ داده',awaiting:'بدون پاسخ',failed:'خطای ارسال',reminder_needed:'نیازمند یادآوری'})[v]||v||'—'}
function channel(v){return v==='email'?'ایمیل':v==='portal'?'داخل سامانه':v==='both'?'هر دو':v||'—'}
function responseVisible(){const from=inputIso(q('#canonicalResponseFrom')),to=inputIso(q('#canonicalResponseTo'));return responseRows.filter(x=>x.delivery_status!=='cancelled'&&(!from||String(x.sent_at||'').slice(0,10)>=from)&&(!to||String(x.sent_at||'').slice(0,10)<=to))}
function syncResponseDelete(){const b=q('#responseReportView [data-response-bulk-delete]');if(!b)return;const ids=window.bamcoSelection?.ids?.('#responseReportBody')||[];b.disabled=responseDeleting||!ids.length;b.textContent=ids.length>1?`حذف ${digits(ids.length)} رکورد`:'حذف رکورد'}
function reconcileResponseSelection(list){const selection=window.bamcoSelection;if(!selection?.ids||!selection?.set)return;const valid=new Set(list.map(x=>String(x.delivery_id))),keep=selection.ids('#responseReportBody').filter(id=>valid.has(String(id)));selection.set('#responseReportBody',keep)}
function renderResponseRows(){const body=q('#responseReportBody');if(!body)return;const list=responseVisible(),total=list.length;body.innerHTML=list.map((x,i)=>`<tr data-canonical-row="1" data-delivery-id="${esc(x.delivery_id)}"><td>${digits(total-i)}</td><td>${esc(personName(x.recipient_id,x.recipient_name||x.recipient_email||'—'))}</td><td>${esc(channel(x.channel))}</td><td>${esc(x.subject||'—')}</td><td>${esc(x.sent_at?jalaliDateTime(x.sent_at):'—')}</td><td>${esc(responseLabel(x.response_status))}</td><td>${esc(x.reply_text||'—')}</td><td>${esc(channel(x.reply_channel))}</td><td>${esc(x.replied_at?jalaliDateTime(x.replied_at):'—')}</td><td>${digits(x.reminder_count||0)}</td></tr>`).join('')||'<tr><td colspan="10" class="empty">رکوردی مطابق فیلترها وجود ندارد.</td></tr>';reconcileResponseSelection(list);syncResponseDelete()}
function responseTools(range){return `<div class="response-command-row"><button type="button" class="ghost" data-response-home>بازگشت به خانه</button><div class="canonical-date-controls"><label><span>از تاریخ</span><span class="canonical-date-field"><input id="canonicalResponseFrom" class="jalali-input" readonly value="${esc(range?.fromText||'')}"><button type="button" class="ghost" data-canonical-date="response-from" aria-label="انتخاب تاریخ شروع">▦</button></span></label><label><span>تا تاریخ</span><span class="canonical-date-field"><input id="canonicalResponseTo" class="jalali-input" readonly value="${esc(range?.toText||'')}"><button type="button" class="ghost" data-canonical-date="response-to" aria-label="انتخاب تاریخ پایان">▦</button></span></label></div><button type="button" class="ghost" data-canonical-refresh="responseReport">تازه‌سازی</button><button type="button" class="ghost" data-canonical-export="response">خروجی اکسل</button><button type="button" class="ghost" data-response-bulk-delete disabled>حذف رکورد</button></div>`}
async function renderResponse(force=false){
 const epoch=++renderEpoch.responseReport,view=q('#responseReportView');if(!view)return;
 if(force||!q('.canonical-report',view)){const range=currentMonthRange();panel(view,'گزارش پاسخ‌ها',responseTools(range),`<div class="table-wrap"><table class="workspace-table"><thead><tr><th>ردیف</th><th>فرد</th><th>کانال</th><th>موضوع</th><th>ارسال</th><th>وضعیت پاسخ</th><th>پاسخ</th><th>کانال پاسخ</th><th>تاریخ پاسخ</th><th>تعداد یادآوری</th></tr></thead><tbody id="responseReportBody"><tr><td colspan="10" class="empty">در حال دریافت اطلاعات…</td></tr></tbody></table></div>`);window.bamcoInteriorUI?.decorateView?.(view)}
 try{const loaded=await selectAll('message_response_tracking','select=*&order=sent_at.desc');if(epoch!==renderEpoch.responseReport)return;responseRows=loaded;window.__bamcoResponseRows=responseRows}catch(err){if(epoch===renderEpoch.responseReport&&state.view==='responseReport')showError(view,err,'responseReport');return}
 if(epoch!==renderEpoch.responseReport||state.view!=='responseReport')return;renderResponseRows();
}
async function deleteResponses(){const ids=(window.bamcoSelection?.ids?.('#responseReportBody')||[]).map(Number).filter(Number.isFinite);if(!ids.length)return;if(!await window.bamcoConfirm(ids.length===1?'رکورد انتخاب‌شده حذف شود؟':`${digits(ids.length)} رکورد انتخاب‌شده حذف شوند؟`))return;responseDeleting=true;syncResponseDelete();try{const changed=await rpc('cancel_message_deliveries',{p_ids:ids});if(Number(changed)!==ids.length)throw Error('حذف همه ردیف‌های انتخاب‌شده تأیید نشد.');responseRows=responseRows.filter(x=>!ids.includes(Number(x.delivery_id)));window.bamcoSelection?.clear?.('#responseReportBody');renderResponseRows();toast(`${digits(ids.length)} رکورد حذف شد.`)}catch(err){toast(err.message,true)}finally{responseDeleting=false;syncResponseDelete()}}
function showError(view,err,id){const box=q('.canonical-report',view);if(box)box.innerHTML=`<div class="workspace-error" role="alert"><b>اطلاعات گزارش دریافت نشد.</b><p>${esc(err?.message||'خطای نامشخص')}</p><button type="button" class="ghost" data-canonical-refresh="${id}">تلاش مجدد</button></div>`}
async function exportReport(kind){
 const view=q(kind==='performance'?'#performanceReportView':'#responseReportView');if(!view)return;
 let data;
 if(kind==='response'){
  const list=responseVisible(),headers=['ردیف','فرد','کانال','موضوع','ارسال','وضعیت پاسخ','پاسخ','کانال پاسخ','تاریخ پاسخ','تعداد یادآوری'];
  data=[headers,...list.map((x,i)=>[list.length-i,personName(x.recipient_id,x.recipient_name||x.recipient_email||'—'),channel(x.channel),x.subject||'—',x.sent_at?jalaliDateTime(x.sent_at):'—',responseLabel(x.response_status),x.reply_text||'—',channel(x.reply_channel),x.replied_at?jalaliDateTime(x.replied_at):'—',x.reminder_count||0])];
 }else{const table=q('table',view);if(!table)return;data=[...table.rows].filter(r=>!r.hidden).map(r=>[...r.cells].map(c=>c.textContent.trim()))}
 if(!data.length)return;const X=await window.ensureBamcoXLSX(),ws=X.utils.aoa_to_sheet(data),wb=X.utils.book_new();ws['!views']=[{rightToLeft:true}];ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,data.length-1),c:Math.max(0,data[0].length-1)}})};ws['!cols']=data[0].map((_,i)=>({wch:kind==='response'?[8,22,15,32,20,18,34,16,20,14][i]:i===0?24:16}));wb.Workbook={Views:[{RTL:true}]};X.utils.book_append_sheet(wb,ws,kind==='performance'?'گزارش عملکرد':'گزارش پاسخ‌ها');X.writeFile(wb,(kind==='performance'?'گزارش عملکرد':'گزارش پاسخ‌ها')+'.xlsx',{compression:true})
}
function openCalendar(kind){const input=q(kind==='perf-from'?'#canonicalPerfFrom':kind==='perf-to'?'#canonicalPerfTo':kind==='response-from'?'#canonicalResponseFrom':'#canonicalResponseTo');if(!input)return;dateTarget={kind,input};const now=currentJalali(),raw=typeof en==='function'?en(input.value||''):String(input.value||''),m=raw.match(/\d+/g)?.map(Number),p=m?.length===3?{y:m[0],m:m[1],d:m[2]}:now;q('#calendarLabel').textContent=kind.includes('from')?'انتخاب تاریخ شروع':'انتخاب تاریخ پایان';q('#calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${digits(y)}</option>`).join('');q('#calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');q('#calYear').value=String(p.y);q('#calMonth').value=String(p.m);fillCalendarDays();q('#calDay').value=String(p.d);q('#calendarDialog').showModal()}
function commitDate(clear=false){if(!dateTarget)return;const {kind,input}=dateTarget;input.value=clear?'':digits(`${q('#calYear').value}/${String(q('#calMonth').value).padStart(2,'0')}/${String(q('#calDay').value).padStart(2,'0')}`);dateTarget=null;q('#calendarDialog')?.close();if(kind.startsWith('perf'))void renderPerformance(false);else{window.bamcoSelection?.clear?.('#responseReportBody');renderResponseRows()}}
function patchTabs(){const tabs=window.bamcoTabs;if(!tabs?.render)return false;if(!rawTabRender)rawTabRender=tabs.render.bind(tabs);if(tabs.__canonicalReportsV6)return true;tabs.render=(id,...args)=>id==='performanceReport'?renderPerformance(false):id==='responseReport'?renderResponse(false):rawTabRender(id,...args);tabs.__canonicalReportsV6=true;return true}
function refreshVisibleReport(detail={}){
 const domain=String(detail.domain||detail.table||'').toLowerCase();
 if(!state?.token||!['profiles','organization','tasks','workflow','notifications','access'].includes(domain))return;
 clearTimeout(domainRefreshTimer);
 domainRefreshTimer=setTimeout(()=>{
  if(state.view==='performanceReport')void renderPerformance(false);
  else if(state.view==='responseReport'&&['notifications','profiles','access'].includes(domain))void renderResponse(false);
 },60);
}
function bindReportControls(){
 document.addEventListener('click',e=>{
  const refresh=e.target.closest?.('[data-canonical-refresh]');if(refresh){e.preventDefault();e.stopImmediatePropagation();refresh.dataset.canonicalRefresh==='performanceReport'?void renderPerformance(false):void renderResponse(false);return}
  const date=e.target.closest?.('[data-canonical-date]');if(date){e.preventDefault();e.stopImmediatePropagation();openCalendar(date.dataset.canonicalDate);return}
  if(dateTarget&&e.target.closest?.('#setDateBtn')){e.preventDefault();e.stopImmediatePropagation();commitDate(false);return}
  if(dateTarget&&e.target.closest?.('#clearDateBtn')){e.preventDefault();e.stopImmediatePropagation();commitDate(true);return}
  if(e.target.closest?.('[data-canonical-perf-clear]')){e.preventDefault();q('#canonicalPerfFrom').value='';q('#canonicalPerfTo').value='';void renderPerformance(false);return}
  if(e.target.closest?.('#responseReportView [data-response-home]')){e.preventDefault();e.stopImmediatePropagation();window.bamcoShowHome?.();return}
  if(e.target.closest?.('#responseReportView [data-response-bulk-delete]')){e.preventDefault();e.stopImmediatePropagation();void deleteResponses();return}
  const exp=e.target.closest?.('[data-canonical-export]');if(exp){e.preventDefault();e.stopImmediatePropagation();void exportReport(exp.dataset.canonicalExport);return}
  const nav=e.target.closest?.('#nav [data-view="performanceReport"],#nav [data-view="responseReport"]');if(nav)setTimeout(()=>{if(state.view==='performanceReport')void renderPerformance(false);else if(state.view==='responseReport')void renderResponse(false)},0);
 },false);
 document.addEventListener('bamco-selection-change',e=>{if(e.target.closest?.('#responseReportView'))syncResponseDelete()});
}
function watchVisibility(){for(const [id,render] of [['performanceReport',renderPerformance],['responseReport',renderResponse]]){const view=q('#'+id+'View');if(!view)continue;new MutationObserver(()=>{if(state.view===id&&!view.classList.contains('hidden')&&!q('.canonical-report',view))void render(false)}).observe(view,{attributes:true,attributeFilter:['class']})}}
function boot(){installCss();markReportOwners();patchTabs();bindReportControls();watchVisibility();document.addEventListener('bamco:domain-invalidated',event=>refreshVisibleReport(event.detail));document.addEventListener('bamco:profiles-updated',()=>refreshVisibleReport({domain:'profiles'}));document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshVisibleReport({domain:'profiles'})});window.addEventListener('focus',()=>refreshVisibleReport({domain:'profiles'}));const app=q('#appView');if(app)new MutationObserver(()=>{if(!app.classList.contains('hidden')){patchTabs();refreshVisibleReport({domain:'profiles'})}}).observe(app,{attributes:true,attributeFilter:['class']});window.bamcoLiveSync={refresh:()=>refreshVisibleReport({domain:'profiles'}),interval:null};window.bamcoCanonicalReports={renderPerformance,renderResponse,visibleResponse:responseVisible}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

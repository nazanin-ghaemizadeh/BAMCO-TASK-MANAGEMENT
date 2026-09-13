(()=>{
'use strict';
if(window.__bamcoRuntimeFixes20260911)return;
window.__bamcoRuntimeFixes20260911=true;
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const escHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function installStyles(){
  if(q('#bamcoRuntimeFixes20260911Css'))return;
  const style=document.createElement('style');style.id='bamcoRuntimeFixes20260911Css';style.textContent=`
    @media(max-width:700px){
      html body #departmentEntry{min-height:100dvh!important;height:auto!important;overflow:auto!important;justify-content:flex-start!important;padding:18px 12px 24px!important}
      html body #departmentEntry header{margin:0 auto 16px!important;max-width:430px!important}
      html body #departmentEntry header img{width:166px!important;height:104px!important;padding:15px 20px!important;border-radius:14px!important}
      html body #departmentEntry h1{font-size:21px!important;line-height:1.7!important;margin:12px 0 2px!important}
      html body #departmentEntry header p{font-size:16px!important;line-height:1.6!important}
      html body #departmentEntry .department-grid{grid-template-columns:1fr!important;gap:10px!important;width:100%!important;max-width:430px!important}
      html body #departmentEntry .department-grid button{aspect-ratio:auto!important;min-height:96px!important;width:100%!important;display:grid!important;grid-template-columns:58px minmax(0,1fr) auto!important;align-items:center!important;justify-content:stretch!important;gap:12px!important;padding:12px 14px!important;border-radius:14px!important;text-align:right!important;text-align-last:right!important}
      html body #departmentEntry .department-icon{width:54px!important;height:54px!important;border-radius:13px!important}
      html body #departmentEntry .department-icon svg{width:32px!important;height:32px!important}
      html body #departmentEntry .department-grid strong{font-size:17px!important;line-height:1.7!important;text-align:right!important;text-align-last:right!important}
      html body #departmentEntry .department-state{font-size:13px!important;white-space:nowrap!important;padding:4px 8px!important}
      html body.content-only #appView #sidebar.sidebar,
      html body.content-only #appView #sidebar.sidebar.collapsed{position:fixed!important;inset:0 0 auto 0!important;left:0!important;right:0!important;top:0!important;width:100%!important;max-width:none!important;min-width:0!important;height:130px!important;max-height:130px!important;transform:none!important;margin:0!important;border-left:0!important;border-right:0!important;border-radius:0!important;overflow:visible!important}
      html body.content-only #appView .workspace,
      html body.content-only #appView.app:has(#sidebar.collapsed) .workspace{margin-left:0!important;margin-right:0!important;width:100%!important;max-width:none!important;padding-right:10px!important;padding-left:10px!important}
      html body.content-only #appView #collapseBtn{display:none!important}
    }
    #systemOptionsView .catalog-section,#systemOptionsView .table-wrap,#systemOptionsView .catalog-table{width:100%!important;max-width:none!important}
    #systemOptionsView .catalog-table{table-layout:auto!important}

    /* Dashboard cards: semantic color coding. */
    #dashboardCards article{border-width:1px!important;border-style:solid!important;box-shadow:0 7px 20px rgba(25,72,57,.08)!important;transition:transform .15s ease,box-shadow .15s ease!important}
    #dashboardCards article:hover{transform:translateY(-2px)!important;box-shadow:0 10px 24px rgba(25,72,57,.13)!important}
    #dashboardCards article[data-key="total"]{background:linear-gradient(145deg,#e3f5ee,#f7fcfa)!important;border-color:#9bcab8!important;color:#155c45!important}
    #dashboardCards article[data-key="in_progress"]{background:linear-gradient(145deg,#e5f1ff,#f8fbff)!important;border-color:#a9c9ee!important;color:#245f9b!important}
    #dashboardCards article[data-key="waiting"]{background:linear-gradient(145deg,#f1eaff,#fbf9ff)!important;border-color:#cbb8ec!important;color:#68479a!important}
    #dashboardCards article[data-key="overdue"]{background:linear-gradient(145deg,#ffe7e5,#fff9f8)!important;border-color:#efb0aa!important;color:#a03c34!important}
    #dashboardCards article[data-key="warning"]{background:linear-gradient(145deg,#fff0ca,#fffaf0)!important;border-color:#eacb78!important;color:#8a6412!important}
    #dashboardCards article[data-key="archive_total"]{background:linear-gradient(145deg,#edf1f3,#fbfcfc)!important;border-color:#c7d0d4!important;color:#55666e!important}
    #dashboardCards article[data-key="pending_requests"]{background:linear-gradient(145deg,#ffe9d6,#fff9f3)!important;border-color:#efbd91!important;color:#9a5b22!important}
    #dashboardCards article[data-key="create_requests"]{background:linear-gradient(145deg,#e2f6e8,#f8fcf9)!important;border-color:#a8d4b5!important;color:#277445!important}
    #dashboardCards article[data-key="unscheduled"]{background:linear-gradient(145deg,#e8eef1,#f9fbfc)!important;border-color:#b9c9d0!important;color:#4c6873!important}
    #dashboardCards article strong{color:inherit!important}
    .dashboard-chart-card:has(#workloadChart){min-height:470px!important}
    #workloadChart{min-height:430px!important}

    /* Performance completion bar. */
    #performanceReportView .completion-cell{min-width:145px!important}
    .performance-progress{position:relative;height:24px;min-width:120px;border-radius:999px;background:#e8eeeb;overflow:hidden;border:1px solid #d0dbd6;direction:ltr}
    .performance-progress>i{position:absolute;inset:0 auto 0 0;width:var(--p);border-radius:999px;transition:width .25s ease}
    .performance-progress>span{position:absolute;inset:0;display:grid;place-items:center;font-family:"B Nazanin",BNazanin,Tahoma,sans-serif;font-weight:700;color:#213f35;direction:rtl}
    .performance-progress.high>i{background:#69bd87}.performance-progress.medium>i{background:#efbe55}.performance-progress.low>i{background:#e87870}

    #requestReportView .workspace-metrics,#responseReportView .workspace-metrics{display:none!important}
    .report-date-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .report-date-field{display:grid;grid-template-columns:minmax(120px,160px) 38px;gap:5px;align-items:center}
    .report-date-field input{height:38px;border:1px solid #c7d5cf;border-radius:8px;background:#fff;padding:0 9px;text-align:center;font-family:"B Nazanin",BNazanin,Tahoma,sans-serif}
    .report-date-field button{height:38px;width:38px;padding:0}
    #responseReportView .workspace-report-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #responseReportView .workspace-report-tools>[data-response-search]{min-width:220px;flex:1 1 240px}
    #responseReportView td.response-text{white-space:pre-wrap;min-width:220px;max-width:460px;text-align:justify}
    #responseReportView td.response-replied{font-weight:700;color:#18734f}
    #responseReportView td.response-awaiting,#responseReportView td.response-reminder_needed{font-weight:700;color:#9c6a17}
    #responseReportView td.response-failed{font-weight:700;color:#b53d3d}
    @media(max-width:760px){.report-date-controls{width:100%}.report-date-field{flex:1 1 calc(50% - 8px)}#responseReportView .workspace-report-tools>*{max-width:100%}}
  `;document.head.append(style);
}

function clearLegacyMobileShell(){
  if(!matchMedia('(max-width:700px)').matches)return;
  const marker='bamco.mobile-shell-reset.20260911.1';
  try{
    if(!localStorage.getItem(marker)){
      for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage)){
        if(/(?:sidebar|side-bar|nav).*(?:collapse|collapsed|drawer|mobile|width)|(?:collapse|collapsed|drawer|mobile).*(?:sidebar|nav)/i.test(key))storage.removeItem(key);
      }
      localStorage.setItem(marker,'1');
      if(typeof caches!=='undefined')caches.keys().then(async names=>{for(const name of names){if(/bamco/i.test(name)&&!/sticker/i.test(name))await caches.delete(name)}}).catch(()=>{});
    }
  }catch{}
  const normalize=()=>{
    const sidebar=q('#sidebar');if(!sidebar)return;
    // Only remove state that exists; unconditional classList.remove triggers
    // another attribute mutation even when its value is already unchanged.
    for(const name of ['collapsed','mobile-open','sidebar-open','drawer-open','open-mobile']){
      if(sidebar.classList.contains(name))sidebar.classList.remove(name);
    }
    for(const p of ['width','max-width','min-width','height','max-height','left','right','top','bottom','transform','margin-left','margin-right'])if(sidebar.style.getPropertyValue(p))sidebar.style.removeProperty(p);
    const toggle=q('#collapseBtn');if(toggle&&toggle.getAttribute('aria-expanded')!=='false')toggle.setAttribute('aria-expanded','false');
  };
  normalize();
  const sidebar=q('#sidebar');if(sidebar&&!sidebar.dataset.mobileShellGuard){
    sidebar.dataset.mobileShellGuard='1';new MutationObserver(normalize).observe(sidebar,{attributes:true,attributeFilter:['class','style']});
  }
  addEventListener('resize',normalize,{passive:true});
}

function tableAoA(table){
  const headerCells=[...(table.tHead?.rows?.[0]?.cells||[])],keep=headerCells.map((th,i)=>({i,name:th.textContent.trim()})).filter(x=>x.name&&x.name!=='عملیات');
  const rows=[...table.tBodies[0]?.rows||[]].filter(r=>!r.querySelector('.empty'));
  return [keep.map(x=>x.name),...rows.map(row=>keep.map(x=>row.cells[x.i]?.textContent.trim()||''))];
}
function fitSheet(X,ws,data){
  ws['!views']=[{rightToLeft:true}];
  const cols=data[0]?.length||0;ws['!cols']=Array.from({length:cols},(_,c)=>({wch:Math.min(48,Math.max(11,...data.map(r=>String(r[c]??'').length+2)))}));
}
async function exportSystemOptions(view){
  const tables=qa('.catalog-table',view);if(tables.length<2)throw Error('هر دو جدول وضعیت و اولویت هنوز آماده نشده‌اند.');
  const X=await window.ensureBamcoXLSX(),wb=X.utils.book_new();
  const sheets=[['وضعیت',tables[0]],['اولویت',tables[1]]];
  for(const [name,table] of sheets){const data=tableAoA(table),ws=X.utils.aoa_to_sheet(data);fitSheet(X,ws,data);X.utils.book_append_sheet(wb,ws,name)}
  wb.__bamcoCatalogColors=true;wb.Workbook={Views:[{RTL:true}]};
  X.writeFile(wb,'وضعیت‌ها و اولویت‌ها.xlsx',{compression:true});
  if(typeof toast==='function')toast('فایل Excel با دو شیت وضعیت و اولویت آماده شد.');
}
function patchOptionsExport(){
  const apply=()=>{
    const original=window.bamcoExportTable;if(typeof original!=='function'||original.__bamcoOptionsTwoSheets)return false;
    const wrapped=async table=>{const view=table?.closest?.('.view');if(view?.id==='systemOptionsView')return exportSystemOptions(view);return original(table)};
    wrapped.__bamcoOptionsTwoSheets=true;wrapped.__bamcoOriginal=original;window.bamcoExportTable=wrapped;return true;
  };
  if(!apply()){let tries=0;const timer=setInterval(()=>{if(apply()||++tries>50)clearInterval(timer)},100)}
}
function fixCatalogReset(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('#systemOptionsView .suite-reset');if(!btn)return;
    const options=btn.closest('.suite-table-options'),host=options?.previousElementSibling,table=host?.matches('.table-wrap')?host.querySelector('table'):host?.querySelector?.('table');if(!table)return;
    setTimeout(()=>{
      table.querySelector(':scope>colgroup')?.remove();
      table.style.removeProperty('width');table.style.removeProperty('min-width');table.style.removeProperty('table-layout');
      table.style.setProperty('width','100%','important');table.style.setProperty('table-layout','auto','important');
      qa('th,td',table).forEach(cell=>{cell.style.removeProperty('width');cell.style.removeProperty('min-width');cell.style.removeProperty('max-width')});
      const last=table.tHead?.rows?.[0]?.cells?.[table.tHead.rows[0].cells.length-1];if(last){last.style.removeProperty('width');last.style.removeProperty('min-width');last.style.removeProperty('max-width')}
      requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    },0);
  },true);
}

function dashboardBucket(task){
  try{const p=window.bamcoTaskPresentation?.(task);if(p?.temporal==='دیرکرد')return'دیرکرد';if(String(p?.temporal||'').includes('هشدار'))return'دوره هشدار'}catch{}
  const value=String(task?.due_state||'');if(value==='دیرکرد')return'دیرکرد';if(value.includes('هشدار'))return'دوره هشدار';return'فاقد شرایط دیرکرد';
}
function dashboardFilters(){return{owner:q('#dashOwner')?.value||'همه',priority:q('#dashPriority')?.value||'همه',status:q('#dashStatus')?.value||'همه',bucket:q('#dashBucket')?.value||'همه'}}
function taskMatchesDashboard(task,filters=dashboardFilters()){
  if(filters.owner!=='همه'&&typeof ownerName==='function'&&norm(ownerName(task))!==norm(filters.owner))return false;
  if(filters.priority!=='همه'&&norm(task?.priority)!==norm(filters.priority))return false;
  if(filters.status!=='همه'&&norm(task?.status)!==norm(filters.status))return false;
  if(filters.bucket!=='همه'&&norm(dashboardBucket(task))!==norm(filters.bucket))return false;
  return true;
}
function requestMatchesDashboard(request,filters){
  const base=(state.tasks||[]).find(t=>String(t.id)===String(request.task_id))||{};
  const candidate={...base,...(request.proposed_data||{})};
  if(!candidate.owner_id&&request.request_type==='create')candidate.owner_id=request.requested_by;
  if(filters.owner!=='همه'){
    const profile=(state.profiles||[]).find(p=>String(p.id)===String(candidate.owner_id));
    const name=profile?.full_name||profile?.display_name||profile?.excel_name||profile?.email||'';
    if(norm(name)!==norm(filters.owner))return false;
  }
  if(filters.priority!=='همه'&&norm(candidate.priority)!==norm(filters.priority))return false;
  if(filters.status!=='همه'&&norm(candidate.status)!==norm(filters.status))return false;
  if(filters.bucket!=='همه'&&norm(dashboardBucket(candidate))!==norm(filters.bucket))return false;
  return true;
}
function postprocessDashboard(){
  const cards=q('#dashboardCards');if(!cards)return;
  const manager=typeof isManager==='function'&&isManager(),filters=dashboardFilters();
  const managementKeys=['pending_requests','create_requests','unscheduled'];
  managementKeys.forEach(key=>{const card=q(`article[data-key="${key}"]`,cards);if(card)card.style.display=manager?'':'none'});
  if(manager){
    const requests=[...(state.requests||[]),...(state.requestHistory||[])];
    const pending=(state.requests||[]).filter(r=>['pending','in_review'].includes(r.request_status)&&requestMatchesDashboard(r,filters)).length;
    const created=requests.filter(r=>r.request_type==='create'&&requestMatchesDashboard(r,filters)).length;
    const active=(state.tasks||[]).filter(t=>!t.archived&&!window.bamcoOptions?.terminal(t)&&taskMatchesDashboard(t,filters));
    const unscheduled=active.filter(t=>!t.start_date&&!t.due_date).length;
    for(const [key,value] of [['pending_requests',pending],['create_requests',created],['unscheduled',unscheduled]]){const strong=q(`article[data-key="${key}"] strong`,cards);if(strong)strong.textContent=fa(value)}
  }
  // Canvas dimensions are owned by the chart renderer, not the card updater.
}
function patchDashboard(){
  const wrap=()=>{const original=window.renderDashboard;if(typeof original!=='function'||original.__bamcoSemanticCards)return false;const enhanced=function(...args){const out=original.apply(this,args);requestAnimationFrame(postprocessDashboard);return out};enhanced.__bamcoSemanticCards=true;window.renderDashboard=enhanced;return true};
  if(!wrap()){let tries=0;const timer=setInterval(()=>{if(wrap()||++tries>40)clearInterval(timer)},100)}
  ['dashOwner','dashPriority','dashStatus','dashBucket'].forEach(id=>q('#'+id)?.addEventListener('change',()=>setTimeout(postprocessDashboard,0)));
  q('#resetDashFilters')?.addEventListener('click',()=>setTimeout(postprocessDashboard,0));
  document.addEventListener('click',e=>{if(e.target.closest('#nav [data-view="dashboard"]'))setTimeout(postprocessDashboard,80)},true);
  setTimeout(postprocessDashboard,250);
}

function currentMonthRange(){
  const p=persianParts(new Date());if(!p)return null;
  const from=jalaliToISO(p.y,p.m,1),to=p.m===12?jalaliToISO(p.y+1,1,1):jalaliToISO(p.y,p.m+1,1);return{from,to,p};
}
function enhancePerformanceReport(){
  const view=q('#performanceReportView'),table=q('table',view);if(!table||q('th[data-month-assigned]',table))return;
  const head=table.tHead?.rows?.[0];if(!head||head.cells.length<8)return;
  if([...head.cells].some(cell=>/^محول‌شده در (این ماه|بازه)$/.test(cell.textContent.trim())))return;
  const marker=document.createElement('th');marker.dataset.monthAssigned='1';marker.textContent='محول‌شده در این ماه';head.insertBefore(marker,head.cells[6]);
  const range=currentMonthRange();
  qa('tbody tr[data-workspace-index]',table).forEach(row=>{
    const ownerId=row.cells[0]?.textContent.trim(),due=range?(state.tasks||[]).filter(t=>String(t.owner_id)===String(ownerId)&&t.due_date&&t.due_date.slice(0,10)>=range.from&&t.due_date.slice(0,10)<range.to):[],done=due.filter(t=>window.bamcoOptions?.completed(t)).length,pct=due.length?Math.round(done/due.length*100):0;
    const assigned=document.createElement('td');assigned.textContent=fa(due.length);row.insertBefore(assigned,row.cells[6]);
    if(row.cells[7])row.cells[7].textContent=fa(done);
    const pctCell=row.cells[8];if(pctCell){pctCell.classList.add('completion-cell');const level=pct>=80?'high':pct>=50?'medium':'low';pctCell.innerHTML=`<div class="performance-progress ${level}" style="--p:${Math.max(0,Math.min(100,pct))}%"><i></i><span>${fa(pct)}٪</span></div>`}
  });
  const note=q('.report-definition',view);if(note&&range)note.textContent=`درصد تکمیل = کارهای انجام‌شده با تاریخ پایان در ماه جاری ÷ کل کارهای محول‌شده با تاریخ پایان در ماه جاری. ماه جاری: ${fa(range.p.y)}/${fa(String(range.p.m).padStart(2,'0'))}.`;
}

function visibleReportData(view){
  const table=q('table',view);if(!table)return null;
  const headers=[...(table.tHead?.rows?.[0]?.cells||[])],keep=headers.map((th,i)=>({i,name:th.textContent.trim()})).filter(x=>x.name&&x.name!=='عملیات');
  const rows=qa('tbody tr',table).filter(r=>!r.querySelector('.empty')&&!r.hidden&&!r.classList.contains('workspace-search-hidden')&&!r.classList.contains('suite-filtered-out')&&getComputedStyle(r).display!=='none');
  return[keep.map(x=>x.name),...rows.map(r=>keep.map(x=>r.cells[x.i]?.textContent.trim()||''))];
}
async function exportFilteredReport(view,title){
  const data=visibleReportData(view);if(!data||data.length<2)throw Error('ردیف فیلترشده‌ای برای خروجی وجود ندارد.');
  const X=await window.ensureBamcoXLSX(),ws=X.utils.aoa_to_sheet(data),wb=X.utils.book_new();fitSheet(X,ws,data);ws['!autofilter']={ref:X.utils.encode_range({s:{r:0,c:0},e:{r:data.length-1,c:(data[0]?.length||1)-1}})};ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};wb.__bamcoPeopleBorders=true;wb.Workbook={Views:[{RTL:true}]};X.utils.book_append_sheet(wb,ws,'گزارش');X.writeFile(wb,title+'.xlsx',{compression:true});toast('فایل Excel فیلترشده، راست‌چین و خط‌کشی‌شده آماده شد.');
}
function enhanceRequestReport(){
  const view=q('#requestReportView');if(!view)return;q('.workspace-metrics',view)?.remove();const exp=q('[data-report-export]',view);if(exp&&exp.textContent!=='خروجی اکسل')exp.textContent='خروجی اکسل';
}

let responseRows=[],responseBusy=false,responseDateTarget=null;
const responseLabels={replied:'پاسخ داده',awaiting:'بدون پاسخ',failed:'خطای ارسال',reminder_needed:'نیازمند یادآوری'};
const channelLabel=v=>v==='email'?'ایمیل':v==='portal'?'داخل سامانه':v==='both'?'هر دو':v||'—';
function reportDateIso(value,end=false){const bits=en(value||'').match(/\d+/g)?.map(Number);if(!bits||bits.length!==3)return'';const iso=jalaliToISO(bits[0],bits[1],bits[2]);return iso?(iso+(end?'T23:59:59':'T00:00:00')):''}
function responseFilteredRows(){
  const view=q('#responseReportView'),from=reportDateIso(q('[data-response-from]',view)?.value),to=reportDateIso(q('[data-response-to]',view)?.value,true),term=(q('[data-response-search]',view)?.value||'').trim().toLocaleLowerCase();
  return responseRows.filter(x=>(!from||String(x.sent_at||'')>=from)&&(!to||String(x.sent_at||'')<=to)&&(!term||[x.delivery_id,x.recipient_name,x.recipient_email,x.subject,x.reply_text,responseLabels[x.response_status],channelLabel(x.channel),channelLabel(x.reply_channel)].some(v=>String(v||'').toLocaleLowerCase().includes(term))));
}
function renderResponseRows(){
  const body=q('#responseReportBody');if(!body)return;const rows=responseFilteredRows();body.innerHTML=rows.map(x=>`<tr><td>${fa(x.delivery_id)}</td><td>${escHtml(x.recipient_name||x.recipient_email||'—')}</td><td>${channelLabel(x.channel)}</td><td>${escHtml(x.subject||'—')}</td><td>${x.sent_at?jalaliDateTime(x.sent_at):'—'}</td><td class="response-${escHtml(x.response_status)}">${responseLabels[x.response_status]||escHtml(x.response_status||'—')}</td><td class="response-text">${escHtml(x.reply_text||'—')}</td><td>${channelLabel(x.reply_channel)}</td><td>${x.replied_at?jalaliDateTime(x.replied_at):'—'}</td><td>${fa(x.reminder_count||0)}</td></tr>`).join('')||'<tr><td colspan="10" class="empty">رکوردی مطابق بازه و فیلتر انتخاب‌شده وجود ندارد.</td></tr>';
}
function renderResponseShell(){
  const view=q('#responseReportView');if(!view)return;view.innerHTML=`<div class="panel workspace-panel response-report-custom" data-response-custom="1"><div class="panel-head"><h3>گزارش پاسخ‌ها</h3><div class="workspace-actions"><button class="ghost" data-response-refresh="1">تازه‌سازی</button></div></div><div class="workspace-report-tools"><div class="report-date-controls"><label>از تاریخ ارسال<span class="report-date-field"><input data-response-from class="jalali-input" readonly placeholder="۱۴۰۵/۰۶/۰۱"><button type="button" class="ghost report-date-button" data-response-date="from" aria-label="انتخاب تاریخ شروع">▦</button></span></label><label>تا تاریخ ارسال<span class="report-date-field"><input data-response-to class="jalali-input" readonly placeholder="۱۴۰۵/۰۶/۳۱"><button type="button" class="ghost report-date-button" data-response-date="to" aria-label="انتخاب تاریخ پایان">▦</button></span></label><button type="button" class="ghost" data-response-clear-dates>حذف بازه</button></div><input type="search" data-response-search placeholder="جست‌وجو در گزارش…" aria-label="جست‌وجو در گزارش"><button type="button" class="ghost" data-report-export="response-custom">خروجی اکسل فیلترشده</button></div><div class="table-wrap"><table class="workspace-table"><thead><tr><th>شناسه</th><th>فرد</th><th>کانال ارسال</th><th>موضوع</th><th>ارسال</th><th>وضعیت پاسخ</th><th>پاسخ</th><th>کانال پاسخ</th><th>تاریخ پاسخ</th><th>تعداد یادآوری</th></tr></thead><tbody id="responseReportBody"></tbody></table></div></div>`;renderResponseRows();
}
async function loadResponseReport(){
  const view=q('#responseReportView');if(!view||responseBusy||!(typeof isManager==='function'&&isManager()))return;responseBusy=true;try{responseRows=await selectAll('message_response_tracking','select=*&order=sent_at.desc');renderResponseShell()}catch(err){view.innerHTML=`<div class="panel workspace-panel"><div class="workspace-error" role="alert"><b>گزارش پاسخ دریافت نشد.</b><p>${escHtml(err.message)}</p></div></div>`}finally{responseBusy=false}
}
function openResponseCalendar(target){
  const input=q(target==='from'?'[data-response-from]':'[data-response-to]',q('#responseReportView'));if(!input)return;responseDateTarget=input;const bits=en(input.value||'').match(/\d+/g)?.map(Number),now=currentJalali(),p=bits?.length===3?{y:bits[0],m:bits[1],d:bits[2]}:now;q('#calendarLabel').textContent=target==='from'?'از تاریخ ارسال':'تا تاریخ ارسال';q('#calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${fa(y)}</option>`).join('');q('#calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');q('#calYear').value=String(p.y);q('#calMonth').value=String(p.m);fillCalendarDays();q('#calDay').value=String(p.d);q('#calendarDialog').showModal();
}
function installReportInteractions(){
  document.addEventListener('click',e=>{
    const date=e.target.closest('#responseReportView [data-response-date]');if(date){e.preventDefault();e.stopImmediatePropagation();return openResponseCalendar(date.dataset.responseDate)}
    const clear=e.target.closest('#responseReportView [data-response-clear-dates]');if(clear){q('[data-response-from]',q('#responseReportView')).value='';q('[data-response-to]',q('#responseReportView')).value='';renderResponseRows();return}
    const refresh=e.target.closest('#responseReportView [data-response-refresh]');if(refresh){e.preventDefault();e.stopImmediatePropagation();return loadResponseReport()}
    const exportBtn=e.target.closest('#requestReportView [data-report-export],#responseReportView [data-report-export]');if(exportBtn){e.preventDefault();e.stopImmediatePropagation();const view=exportBtn.closest('.view');exportFilteredReport(view,view.id==='requestReportView'?'گزارش درخواست‌ها - فیلترشده':'گزارش پاسخ‌ها - فیلترشده').catch(err=>toast(err.message,true));return}
    if(responseDateTarget&&e.target.closest('#setDateBtn')){e.preventDefault();e.stopImmediatePropagation();responseDateTarget.value=fa(`${q('#calYear').value}/${String(q('#calMonth').value).padStart(2,'0')}/${String(q('#calDay').value).padStart(2,'0')}`);responseDateTarget=null;q('#calendarDialog').close();renderResponseRows();return}
    if(responseDateTarget&&e.target.closest('#clearDateBtn')){e.preventDefault();e.stopImmediatePropagation();responseDateTarget.value='';responseDateTarget=null;q('#calendarDialog').close();renderResponseRows();return}
    const nav=e.target.closest('#nav [data-view]');if(nav){const id=nav.dataset.view;if(id==='performanceReport')setTimeout(enhancePerformanceReport,180);else if(id==='requestReport')setTimeout(enhanceRequestReport,180);else if(id==='responseReport')setTimeout(loadResponseReport,180)}
  },true);
  document.addEventListener('input',e=>{if(e.target.matches('#responseReportView [data-response-search]'))renderResponseRows()});
  q('#calendarDialog')?.addEventListener('close',()=>{responseDateTarget=null});
}
function observeReportViews(){
  const setup=(id,fn)=>{const view=q('#'+id+'View');if(!view)return;let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>fn(view),30)}).observe(view,{childList:true,subtree:false})};
  setup('performanceReport',()=>enhancePerformanceReport());setup('requestReport',()=>enhanceRequestReport());setup('responseReport',view=>{if(!q('[data-response-custom]',view)&&!q('.workspace-loading',view))loadResponseReport()});
}

function boot(){installStyles();clearLegacyMobileShell();patchOptionsExport();fixCatalogReset();patchDashboard();installReportInteractions();observeReportViews();setTimeout(()=>{enhancePerformanceReport();enhanceRequestReport();if(state?.view==='responseReport')loadResponseReport()},400)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

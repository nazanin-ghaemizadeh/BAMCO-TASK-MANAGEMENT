(()=>{
'use strict';
if(window.__bamcoDashboardResponseFixes20260911V2)return;
window.__bamcoDashboardResponseFixes20260911V2=true;
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const faNum=v=>typeof fa==='function'?fa(v):String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);

function installCss(){
 let s=q('#bamcoDashboardResponseFixesCss');if(!s){s=document.createElement('style');s.id='bamcoDashboardResponseFixesCss';document.head.append(s)}
 s.textContent=`
 html body #dashboardCards article{background:#fff!important;background-image:none!important;border:1px solid transparent!important;box-shadow:0 8px 22px rgba(28,67,54,.11)!important;overflow:hidden!important;position:relative!important}
 html body #dashboardCards article::before{content:"";position:absolute;inset:0;opacity:1;pointer-events:none;z-index:0}
 html body #dashboardCards article>*{position:relative;z-index:1}
 html body #dashboardCards article[data-key="total"]::before{background:linear-gradient(135deg,#d9f3e8,#f2fbf7)}
 html body #dashboardCards article[data-key="in_progress"]::before{background:linear-gradient(135deg,#dcecff,#f4f9ff)}
 html body #dashboardCards article[data-key="waiting"]::before{background:linear-gradient(135deg,#eee3ff,#faf6ff)}
 html body #dashboardCards article[data-key="overdue"]::before{background:linear-gradient(135deg,#ffd9d6,#fff3f2)}
 html body #dashboardCards article[data-key="warning"]::before{background:linear-gradient(135deg,#ffe9ad,#fff8e7)}
 html body #dashboardCards article[data-key="archive_total"]::before{background:linear-gradient(135deg,#e4eaed,#f7f9fa)}
 html body #dashboardCards article[data-key="pending_requests"]::before{background:linear-gradient(135deg,#ffe0c2,#fff5eb)}
 html body #dashboardCards article[data-key="create_requests"]::before{background:linear-gradient(135deg,#d7f1df,#f2fbf5)}
 html body #dashboardCards article[data-key="unscheduled"]::before{background:linear-gradient(135deg,#dfe9ed,#f5f9fa)}
 html body #dashboardCards article[data-key="total"]{border-color:#94c8b3!important;color:#155c45!important}
 html body #dashboardCards article[data-key="in_progress"]{border-color:#a8c7e9!important;color:#245f9b!important}
 html body #dashboardCards article[data-key="waiting"]{border-color:#c8b0eb!important;color:#69459a!important}
 html body #dashboardCards article[data-key="overdue"]{border-color:#efa8a2!important;color:#a43e36!important}
 html body #dashboardCards article[data-key="warning"]{border-color:#e5c264!important;color:#86600e!important}
 html body #dashboardCards article[data-key="archive_total"]{border-color:#c3cdd2!important;color:#53666e!important}
 html body #dashboardCards article[data-key="pending_requests"]{border-color:#e9b27f!important;color:#92551d!important}
 html body #dashboardCards article[data-key="create_requests"]{border-color:#9fceb0!important;color:#257044!important}
 html body #dashboardCards article[data-key="unscheduled"]{border-color:#b6c8cf!important;color:#486671!important}
 html body #dashboardCards article small,html body #dashboardCards article strong{color:inherit!important}
 html body .dashboard-chart-card:has(#workloadChart){min-height:490px!important;height:auto!important}
 html body #workloadChart{display:block!important;width:100%!important;height:445px!important;min-height:445px!important}
 html body #performanceReportView .report-definition{display:none!important}

 #responseReportView .workspace-report-tools{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important}
 #responseReportView .report-date-controls{display:flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important}
 #responseReportView .report-date-controls>label{display:flex!important;flex-direction:row!important;align-items:center!important;gap:6px!important;margin:0!important;white-space:nowrap!important}
 #responseReportView .report-date-controls>label>.response-date-caption{display:inline-block!important;white-space:nowrap!important;font-weight:400!important}
 #responseReportView .report-date-field{display:grid!important;grid-template-columns:minmax(128px,160px) 38px!important;gap:5px!important;align-items:center!important}
 #responseReportView .response-danger-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:nowrap!important}
 #responseReportView .response-primary-actions{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:nowrap!important}
 #responseReportView [data-response-clear-dates],#responseReportView [data-response-delete-selected]{color:#b54040!important;border-color:#e4b0b0!important;background:#fff5f5!important;font-weight:400!important;white-space:nowrap!important}
 #responseReportView [data-response-delete-selected]:disabled{opacity:.45!important;cursor:not-allowed!important}
 #responseReportView [data-report-export],#responseReportView [data-response-refresh]{font-weight:400!important;white-space:nowrap!important}
 #responseReportView [data-response-search]{min-width:230px!important;flex:1 1 260px!important}
 #responseReportView tbody tr[data-delivery-id]{cursor:pointer!important}
 #responseReportView tbody tr.response-row-selected>td{background:#e9f4ef!important;box-shadow:inset 0 1px #9fc9b7,inset 0 -1px #9fc9b7}
 #responseReportView th.response-hidden-operation,#responseReportView td.response-hidden-operation{display:none!important}
 @media(max-width:900px){
   #responseReportView .workspace-report-tools{align-items:stretch!important}
   #responseReportView .report-date-controls{width:100%!important}
   #responseReportView [data-response-search]{width:100%!important;flex-basis:100%!important}
 }
 `;
}

function dashboardFilterRows(){
 const rows=(state?.tasks||[]).filter(t=>!t.archived&&!window.bamcoOptions?.terminal(t));
 const owner=q('#dashOwner')?.value||'همه',priority=q('#dashPriority')?.value||'همه',status=q('#dashStatus')?.value||'همه',bucket=q('#dashBucket')?.value||'همه';
 return rows.filter(t=>{
  if(owner!=='همه'&&typeof ownerName==='function'&&norm(ownerName(t))!==norm(owner))return false;
  if(priority!=='همه'&&norm(t.priority)!==norm(priority))return false;
  if(status!=='همه'&&norm(t.status)!==norm(status))return false;
  if(bucket!=='همه'){
   const due=String(t.due_state||'');const b=due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد';
   if(norm(b)!==norm(bucket))return false;
  }
  return true;
 });
}
function drawWorkload(){
 if(typeof window.bamcoDrawWorkload==='function')return window.bamcoDrawWorkload();
 const canvas=q('#workloadChart');if(!canvas||q('#dashboardView')?.classList.contains('hidden'))return;
 const rows=dashboardFilterRows(),groups=new Map();
 for(const t of rows){const owner=typeof ownerName==='function'?(ownerName(t)||'—'):'—',p=String(t.priority||'بدون اولویت');if(!groups.has(owner))groups.set(owner,new Map());const m=groups.get(owner);m.set(p,(m.get(p)||0)+1)}
 const owners=[...groups.entries()].sort((a,b)=>[...b[1].values()].reduce((x,y)=>x+y,0)-[...a[1].values()].reduce((x,y)=>x+y,0)).slice(0,10);
 const priorities=[...new Set(rows.map(t=>String(t.priority||'بدون اولویت')))];
 const dpr=window.devicePixelRatio||1,w=Math.max(420,canvas.parentElement?.clientWidth||canvas.clientWidth||800),h=445;
 canvas.dataset.logicalHeight=String(h);canvas.style.height=h+'px';canvas.style.width='100%';
 const pixelW=Math.round(w*dpr),pixelH=Math.round(h*dpr);if(canvas.width!==pixelW)canvas.width=pixelW;if(canvas.height!==pixelH)canvas.height=pixelH;
 const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#173f35';ctx.font='bold 21px "B Nazanin",Tahoma,serif';ctx.fillText('حجم کار فعال به تفکیک متولی',w-18,31);
 if(!owners.length){ctx.textAlign='center';ctx.fillStyle='#7a8e85';ctx.font='18px "B Nazanin",Tahoma,serif';ctx.fillText('اطلاعاتی برای نمایش وجود ندارد',w/2,h/2);return}
 const left=60,right=Math.max(left+220,w-185),top=62,bottom=h-82,max=Math.max(1,...owners.map(([,m])=>[...m.values()].reduce((a,b)=>a+b,0))),gap=16,bw=Math.max(42,Math.min(78,((right-left)-gap*(owners.length+1))/owners.length)),scale=(bottom-top)/max;
 for(let step=0;step<=5;step++){const y=bottom-(bottom-top)*step/5;ctx.strokeStyle='#edf2f0';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#879a91';ctx.textAlign='right';ctx.font='12px "B Nazanin",Tahoma,serif';ctx.fillText(faNum(Math.round(max*step/5)),left-8,y+4)}
 let x=left+Math.max(0,(right-left-(owners.length*bw+(owners.length+1)*gap))/2)+gap;
 for(const [owner,m] of owners){let y=bottom;for(const p of priorities){const value=m.get(p)||0;if(!value)continue;const height=value*scale;ctx.fillStyle=window.bamcoOptions?.color?.('priority',p)||'#76a68f';ctx.fillRect(x,y-height,bw,height);ctx.textAlign='center';ctx.font=(height<18?'bold 11px ':'bold 12px ')+'"B Nazanin",Tahoma,serif';ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.92)';ctx.strokeText(faNum(value),x+bw/2,y-height/2+4);ctx.fillStyle='#20372f';ctx.fillText(faNum(value),x+bw/2,y-height/2+4);y-=height}ctx.fillStyle='#435b51';ctx.textAlign='center';ctx.font='12px "B Nazanin",Tahoma,serif';const short=String(owner).replace(/^(جناب آقای|سرکار خانم|مهندس|آقای|خانم)\s+/,'');ctx.fillText(short.length>16?short.slice(0,15)+'…':short,x+bw/2,bottom+20);x+=bw+gap}
 let ly=82;for(const p of priorities){ctx.fillStyle=window.bamcoOptions?.color?.('priority',p)||'#76a68f';ctx.fillRect(w-44,ly-10,16,16);ctx.fillStyle='#435b51';ctx.textAlign='right';ctx.font='14px "B Nazanin",Tahoma,serif';ctx.fillText(p,w-52,ly+2);ly+=27}
}
function paintDashboardCards(){qa('#dashboardCards article').forEach(card=>{card.style.removeProperty('background');card.style.removeProperty('background-image')})}
function hookDashboard(){
 const apply=()=>{const original=window.renderDashboard;if(typeof original!=='function'||original.__bamcoWorkloadFixV2)return false;const wrapped=function(...args){const out=original.apply(this,args);paintDashboardCards();return out};wrapped.__bamcoWorkloadFixV2=true;window.renderDashboard=wrapped;return true};
 if(!apply()){let n=0,t=setInterval(()=>{if(apply()||++n>50)clearInterval(t)},100)}
 document.addEventListener('click',e=>{if(e.target.closest('#resetDashFilters,#nav [data-view="dashboard"]'))requestAnimationFrame(paintDashboardCards)},true);
}
function removePerformanceDefinition(){q('#performanceReportView .report-definition')?.remove()}

let responseRowsCache=[],selectedDeliveryId=null,responseEnhanceBusy=false;
function responseDateIso(value,end=false){const raw=typeof en==='function'?en(value||''):String(value||''),bits=raw.match(/\d+/g)?.map(Number);if(!bits||bits.length!==3||typeof jalaliToISO!=='function')return'';const iso=jalaliToISO(bits[0],bits[1],bits[2]);return iso?iso+(end?'T23:59:59':'T00:00:00'):''}
function responseFiltered(rows){const view=q('#responseReportView'),from=responseDateIso(q('[data-response-from]',view)?.value),to=responseDateIso(q('[data-response-to]',view)?.value,true),term=(q('[data-response-search]',view)?.value||'').trim().toLocaleLowerCase();return rows.filter(x=>x.delivery_status!=='cancelled'&&(!from||String(x.sent_at||'')>=from)&&(!to||String(x.sent_at||'')<=to)&&(!term||[x.recipient_name,x.recipient_email,x.subject,x.reply_text,x.delivery_id].some(v=>String(v||'').toLocaleLowerCase().includes(term)))).sort((a,b)=>Number(b.delivery_id)-Number(a.delivery_id))}
function responseLabel(v){return({replied:'پاسخ داده',awaiting:'بدون پاسخ',failed:'خطای ارسال',reminder_needed:'نیازمند یادآوری'})[v]||v||'—'}
function channel(v){return v==='email'?'ایمیل':v==='portal'?'داخل سامانه':v==='both'?'هر دو':v||'—'}
function syncDeleteButton(){const b=q('#responseReportView [data-response-delete-selected]');if(!b)return;const visible=!!selectedDeliveryId&&responseFiltered(responseRowsCache).some(x=>String(x.delivery_id)===String(selectedDeliveryId));b.disabled=!visible;b.title=visible?'حذف ردیف انتخاب‌شده':'ابتدا یک ردیف را انتخاب کنید'}
function renderResponseTable(){
 const body=q('#responseReportBody');if(!body)return;const rows=responseFiltered(responseRowsCache),total=rows.length;
 body.innerHTML=rows.map((x,i)=>`<tr data-delivery-id="${esc(x.delivery_id)}" class="${String(selectedDeliveryId)===String(x.delivery_id)?'response-row-selected':''}"><td>${faNum(total-i)}</td><td>${esc(x.recipient_name||x.recipient_email||'—')}</td><td>${channel(x.channel)}</td><td>${esc(x.subject||'—')}</td><td>${x.sent_at&&typeof jalaliDateTime==='function'?jalaliDateTime(x.sent_at):'—'}</td><td>${responseLabel(x.response_status)}</td><td>${esc(x.reply_text||'—')}</td><td>${channel(x.reply_channel)}</td><td>${x.replied_at&&typeof jalaliDateTime==='function'?jalaliDateTime(x.replied_at):'—'}</td><td>${faNum(x.reminder_count||0)}</td><td class="response-hidden-operation"><button type="button" data-response-delete="${esc(x.delivery_id)}">حذف</button></td></tr>`).join('')||'<tr><td colspan="11" class="empty">رکوردی مطابق فیلترها وجود ندارد.</td></tr>';
 syncDeleteButton();
}
async function reloadResponseRows(){responseRowsCache=await selectAll('message_response_tracking','select=*&order=delivery_id.desc');window.__bamcoResponseRows=responseRowsCache;renderResponseTable()}
function setDateLabel(label,text){if(!label)return;let caption=q('.response-date-caption',label);if(!caption){caption=document.createElement('span');caption.className='response-date-caption';const field=q('.report-date-field',label);label.insertBefore(caption,field||label.firstChild)}caption.textContent=text;[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.textContent='')}
function enhanceResponseShell(){
 const view=q('#responseReportView'),table=q('table',view),tools=q('.workspace-report-tools',view);if(!view||!table||!tools||responseEnhanceBusy)return;responseEnhanceBusy=true;
 try{
  const head=table.tHead?.rows?.[0];if(head){let op=[...head.cells].find(c=>c.textContent.trim()==='عملیات');if(!op){op=document.createElement('th');op.textContent='عملیات';head.append(op)}op.classList.add('response-hidden-operation')}
  const date=q('.report-date-controls',tools);if(date){const labels=qa(':scope>label',date);setDateLabel(labels[0],'از تاریخ');setDateLabel(labels[1],'تا تاریخ');let danger=q('.response-danger-actions',date);if(!danger){danger=document.createElement('div');danger.className='response-danger-actions';const clear=q('[data-response-clear-dates]',date);if(clear)danger.append(clear);const del=document.createElement('button');del.type='button';del.className='ghost';del.dataset.responseDeleteSelected='1';del.textContent='حذف رکورد';del.disabled=true;danger.append(del);date.append(danger)}}
  let primary=q('.response-primary-actions',tools);if(!primary){primary=document.createElement('div');primary.className='response-primary-actions';const refresh=q('[data-response-refresh]',view),exp=q('[data-report-export]',tools);if(refresh)primary.append(refresh);if(exp){exp.textContent='خروجی اکسل';primary.append(exp)}tools.insertBefore(primary,tools.firstChild)}
  tools.dataset.responseLayoutV2='1';
  reloadResponseRows().catch(()=>{});
 }finally{responseEnhanceBusy=false}
}
async function softDeleteSelected(){
 if(!selectedDeliveryId)return toast('ابتدا یک ردیف را انتخاب کنید.',true);
 if(!confirm('رکورد انتخاب‌شده از گزارش پاسخ‌ها حذف شود؟'))return;
 const id=selectedDeliveryId;await update('message_deliveries',`id=eq.${encodeURIComponent(id)}`,{status:'cancelled'});responseRowsCache=responseRowsCache.filter(x=>String(x.delivery_id)!==String(id));selectedDeliveryId=null;window.__bamcoResponseRows=responseRowsCache;renderResponseTable();toast('رکورد حذف شد و شناسه‌های نمایشی به‌روزرسانی شدند.');
}
function hookResponse(){
 document.addEventListener('click',e=>{
  const row=e.target.closest('#responseReportView tbody tr[data-delivery-id]');if(row&&!e.target.closest('button,input,select')){selectedDeliveryId=String(row.dataset.deliveryId);qa('#responseReportView tbody tr[data-delivery-id]').forEach(r=>r.classList.toggle('response-row-selected',r===row));syncDeleteButton();return}
  const del=e.target.closest('#responseReportView [data-response-delete-selected]');if(del){e.preventDefault();e.stopImmediatePropagation();if(del.disabled)return;del.disabled=true;softDeleteSelected().catch(err=>{toast(err.message,true);syncDeleteButton()});return}
  if(e.target.closest('#responseReportView [data-response-clear-dates]'))setTimeout(()=>{selectedDeliveryId=null;renderResponseTable()},0);
  if(e.target.closest('#nav [data-view="responseReport"]'))setTimeout(enhanceResponseShell,120);
 },true);
 document.addEventListener('input',e=>{if(e.target.matches('#responseReportView [data-response-search]'))setTimeout(()=>{selectedDeliveryId=null;renderResponseTable()},0)});
 document.addEventListener('click',e=>{if(e.target.closest('#responseReportView #setDateBtn,#responseReportView #clearDateBtn'))setTimeout(()=>{selectedDeliveryId=null;renderResponseTable()},30)},true);
 const view=q('#responseReportView');if(view){let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(q('table',view))enhanceResponseShell()},35)}).observe(view,{childList:true,subtree:false})}
 if(state?.view==='responseReport')setTimeout(enhanceResponseShell,160);
}
function boot(){installCss();hookDashboard();removePerformanceDefinition();hookResponse();const perf=q('#performanceReportView');if(perf)new MutationObserver(removePerformanceDefinition).observe(perf,{childList:true,subtree:true});setTimeout(()=>{paintDashboardCards();if(state?.view==='dashboard')requestAnimationFrame(drawWorkload)},120)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

/* Shared table sorting, filtering, sizing and export controls. */
(()=>{
'use strict';
const latin=value=>String(value??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
function compareValues(a,b){a=latin(a).trim();b=latin(b).trim();const number=v=>/^[+-]?\d+(\.\d+)?$/.test(v.replace(/[,٬]/g,''))?Number(v.replace(/[,٬]/g,'')):NaN;const an=number(a),bn=number(b);return Number.isFinite(an)&&Number.isFinite(bn)?an-bn:a.localeCompare(b,'fa',{numeric:true,sensitivity:'base'})}
if(typeof module!=='undefined'&&module.exports)module.exports={compareValues};
if(typeof document==='undefined')return;
window.BAMCO_COMPARE_VALUES=compareValues;window.BAMCO_TASK_SORT=window.BAMCO_TASK_SORT||{};
function install(){
 const root=document.querySelector('#appView');if(!root)return;document.body.classList.add('table-suite');
 const settings=new WeakMap();let scheduled=false;
 const observer=new MutationObserver(records=>{if(records.every(r=>r.target.nodeType===1&&r.target.closest('.table-pagination,#archivePager,.suite-table-options')))return;schedule()});
 const observe=()=>observer.observe(root,{childList:true,subtree:true});
 function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;observer.disconnect();scan();observe()})}
 function dataRows(table){return [...(table.tBodies[0]?.rows||[])].filter(r=>!(r.cells.length===1&&r.cells[0].colSpan>1))}
 function clear(){window.bamcoSelection?.clear();root.querySelectorAll('tr.suite-selected').forEach(r=>{r.classList.remove('suite-selected');r.setAttribute('aria-selected','false')})}
 function sort(table,index,direction){
  const model=settings.get(table);if(!model.sort)model.unsorted=dataRows(table);model.sort={index,direction};
  const rows=dataRows(table);rows.sort((a,b)=>direction*compareValues(a.cells[index]?.textContent,b.cells[index]?.textContent));
  rows.forEach(row=>table.tBodies[0].append(row));
  [...table.tHead.rows[0].cells].forEach((th,i)=>{if(i===index)th.setAttribute('aria-sort',direction===1?'ascending':'descending');else th.removeAttribute('aria-sort')});
  model.fingerprint=rows.map(r=>r.dataset.taskId||r.dataset.requestId||r.dataset.id||r.textContent).join('\n');
  table.closest('.view')?.querySelector('.focus-scroll')?.scrollTo({top:0});
 }
 function applyColumnWidth(table,th,width){
  width=Math.max(64,Math.min(900,width));th.style.setProperty('width',width+'px','important');
  let group=table.querySelector(':scope>colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group)}
  while(group.children.length<table.tHead.rows[0].cells.length)group.append(document.createElement('col'));
  group.children[th.cellIndex].style.width=width+'px';
  const model=settings.get(table);model.widths[th.cellIndex]=width;
  try{localStorage.setItem(model.key,JSON.stringify(model.widths))}catch{}
 }
 function resize(e){
  const handle=e.target.closest('.suite-resize,.column-resize-handle,.vehicle-col-resize');if(!handle)return;
  const th=handle.closest('th'),table=th?.closest('table');if(!table||!settings.has(table))return;
  e.preventDefault();e.stopImmediatePropagation();
  const start=e.clientX,width=th.getBoundingClientRect().width;let moved=false;
  const move=event=>{moved=true;applyColumnWidth(table,th,width+start-event.clientX)};
  const end=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',end);removeEventListener('pointercancel',end);if(moved){table.dataset.resizeDone='1';setTimeout(()=>delete table.dataset.resizeDone,120)}};
  addEventListener('pointermove',move);addEventListener('pointerup',end);addEventListener('pointercancel',end);
 }
 function tableOptions(table,model){
  if(model.options?.isConnected)return;
  const options=document.createElement('details');options.className='suite-table-options';options.innerHTML='<summary>تنظیمات جدول</summary><div class="suite-options-panel"><label><input type="checkbox" class="suite-density"> نمایش فشرده</label><button type="button" class="suite-clear-sort">حذف مرتب‌سازی</button><button type="button" class="suite-reset">بازنشانی عرض ستون‌ها</button><div class="suite-columns"></div></div>';
  const host=table.closest('.focus-scroll')||table.parentElement;host.after(options);model.options=options;
  const heads=[...table.tHead.rows[0].cells];heads.forEach((th,i)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;label.append(input,document.createTextNode(th.textContent.trim()));options.querySelector('.suite-columns').append(label);input.addEventListener('change',()=>{model.hiddenColumns=model.hiddenColumns||new Set();if(input.checked)model.hiddenColumns.delete(i);else model.hiddenColumns.add(i);table.querySelectorAll('tr').forEach(row=>row.cells[i]?.classList.toggle('suite-column-hidden',!input.checked));const col=table.querySelector('colgroup')?.children[i];if(col)col.style.display=input.checked?'':'none'})});
  const density=options.querySelector('.suite-density');density.checked=true;density.addEventListener('change',e=>table.classList.toggle('suite-compact',e.target.checked));
  options.querySelector('.suite-clear-sort').addEventListener('click',()=>{model.sort=null;table.querySelectorAll('[aria-sort]').forEach(th=>th.removeAttribute('aria-sort'));const scope=table.closest('#kanbanView')?'kanban':table.closest('#archiveView')?'archive':null;if(scope){delete window.BAMCO_TASK_SORT[scope];renderTasks(scope==='archive')}else if(table.tBodies[0]?.id==='approvalBody'){renderRequests()}else if(table.tBodies[0]?.id==='requestHistoryBody'){renderRequestHistory()}else if(model.unsorted?.every(r=>r.isConnected&&r.closest('table')===table)){model.unsorted.forEach(r=>table.tBodies[0].append(r))}});
  options.querySelector('.suite-reset').addEventListener('click',()=>{model.widths={};try{localStorage.removeItem(model.key)}catch{};heads.forEach(th=>{th.style.removeProperty('width');th.style.removeProperty('min-width')});table.querySelectorAll('col').forEach(col=>col.style.removeProperty('width'))});
 }
 function decorate(table){
  const heads=table.tHead?.rows[0];if(!heads||table.closest('dialog'))return;
  const first=heads.cells[0];if(first&&(first.textContent.trim()==='انتخاب'||first.classList.contains('unified-select-head'))){table.querySelectorAll('tr').forEach(row=>{if(row.cells.length>1)row.cells[0].remove()});table.querySelector('colgroup')?.children[0]?.remove()}
  let model=settings.get(table);if(!model){const view=table.closest('.view');const key='bamco.table.widths.v4.'+(view?.id||'table')+'.'+[...view.querySelectorAll('table')].indexOf(table);let widths={};try{widths=JSON.parse(localStorage.getItem(key)||'{}')}catch{}model={key,widths};settings.set(table,model)}
  table.classList.add('suite-table','suite-compact');table.setAttribute('aria-multiselectable','true');
  [...heads.cells].forEach((th,i)=>{
   if(!th.querySelector('.suite-resize,.column-resize-handle,.vehicle-col-resize')){const handle=document.createElement('span');handle.className='suite-resize';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','تغییر عرض '+th.textContent.trim());th.append(handle)}
   if(th.tabIndex<0)th.tabIndex=0;th.title='کلیک برای مرتب‌سازی؛ لبه ستون برای تغییر عرض';
   if(model.widths[i])applyColumnWidth(table,th,model.widths[i]);
  });
  dataRows(table).forEach(row=>{if(!row.closest('thead'))row.tabIndex=0;[...row.cells].forEach(cell=>{const text=cell.textContent.trim(),english=/[A-Za-z]/.test(text)&&!/[\u0600-\u06ff]/.test(text);cell.classList.toggle('suite-english',english)})});
  const scope=table.closest('#kanbanView')?'kanban':table.closest('#archiveView')?'archive':null;
  const nativeSort=scope&&window.BAMCO_TASK_SORT[scope];if(nativeSort){[...heads.cells].forEach((th,i)=>{if(i===nativeSort.index)th.setAttribute('aria-sort',nativeSort.direction===1?'ascending':'descending');else th.removeAttribute('aria-sort')})}
  else if(model.sort){const fingerprint=dataRows(table).map(r=>r.dataset.taskId||r.dataset.requestId||r.dataset.id||r.textContent).join('\n');if(fingerprint!==model.fingerprint)sort(table,model.sort.index,model.sort.direction)}
  if(model.hiddenColumns)table.querySelectorAll('tr').forEach(row=>[...row.cells].forEach((cell,i)=>cell.classList.toggle('suite-column-hidden',model.hiddenColumns.has(i))));
  addFilters(table,model);
  tableOptions(table,model);
 }
 function addFilters(table,model){
  if(table.tHead.querySelector('.column-filters,.vehicle-filters'))return;
  model.filters=model.filters||{};let tr=table.tHead.querySelector('.suite-filters');
  if(!tr){tr=document.createElement('tr');tr.className='suite-filters';table.tHead.append(tr);[...table.tHead.rows[0].cells].forEach((th,i)=>{const cell=document.createElement('th'),select=document.createElement('select');select.setAttribute('aria-label','فیلتر '+th.textContent.trim());select.dataset.filterColumn=i;cell.append(select);tr.append(cell);select.addEventListener('change',()=>{model.filters[i]=select.value;apply();select.dispatchEvent(new Event('input',{bubbles:true}))})})}
  const rows=dataRows(table);[...tr.cells].forEach((th,i)=>{const select=th.querySelector('select'),values=[...new Set(rows.map(r=>r.cells[i]?.textContent.trim()||''))].filter(Boolean).sort(compareValues);const signature=JSON.stringify(values);if(select.dataset.values!==signature){select.replaceChildren(new Option('همه',''),...values.map(v=>new Option(v,v)));select.dataset.values=signature;select.value=model.filters[i]||''}});
  function apply(){dataRows(table).forEach(row=>row.classList.toggle('suite-filtered-out',Object.entries(model.filters).some(([i,v])=>v&&row.cells[i]?.textContent.trim()!==v)))}apply();
 }
 function ensureTableToolbar(table){
  const panel=table.closest('.panel,.table-panel'),head=panel?.querySelector(':scope>.panel-head');if(!panel||!head)return null;
  const scope=panel.closest('.view')||panel;
  let bar=scope.querySelector(':scope>.bamco-command-bar')||panel.querySelector(':scope>.task-toolbar,:scope>.vehicle-toolbar,:scope>.prod-toolbar,:scope>.people-actions,:scope>.manager-toolbar,:scope>.workspace-actions,:scope>.workspace-report-tools,:scope>.bamco-management-toolbar,:scope>.suite-toolbar');
  if(!bar){bar=document.createElement('div');bar.className='suite-toolbar';head.after(bar)}
  const search=head.querySelector('input.search,input[type=search],.toolbar-search');if(search)bar.append(search);
  if(![...scope.querySelectorAll('button')].some(b=>/خروجی اکسل|خروج از اکسل/.test(b.textContent))){
   const button=document.createElement('button');button.type='button';button.className='ghost';button.dataset.managementExport='all';button.textContent='خروجی اکسل';
   button.addEventListener('click',async()=>{button.disabled=true;try{if(!window.bamcoExportTable)throw Error('امکانات خروجی هنوز بارگذاری نشده است.');await window.bamcoExportTable(table)}catch(err){toast(err.message,true)}finally{button.disabled=false}});bar.append(button);
  }
  if(!window.bamcoInteriorUI&&!bar.querySelector('.content-back')){const home=document.createElement('button');home.type='button';home.className='content-back ghost';home.textContent='⌂ خانه';home.addEventListener('click',()=>window.bamcoShowHome?.());bar.prepend(home)}
  return bar;
 }
 function toolbars(){
  root.querySelectorAll('.view table').forEach(ensureTableToolbar);
  root.querySelectorAll('.task-toolbar,.vehicle-toolbar,.prod-toolbar,.people-actions,.manager-toolbar,.workspace-actions,.workspace-report-tools,.bamco-management-toolbar,.suite-toolbar').forEach(bar=>{
   if(bar.matches('.panel-head')&&!bar.querySelector('button'))return;
   bar.classList.add('suite-toolbar');
   [...bar.children].forEach(el=>{let rank=80;const t=el.textContent.trim(),id=el.id||'';
    if(el.matches('.content-back'))rank=0;else if(el.matches('#addTaskBtn,.vehicle-add')||/افزودن/.test(t))rank=10;
    else if(/Edit|edit/.test(id)||el.matches('.vehicle-edit')||/^ویرایش/.test(t))rank=20;
    else if(/Delete|delete/.test(id)||el.matches('.vehicle-delete')||/^حذف/.test(t))rank=30;
    else if(/Archive|Restore/.test(id)||/آرشیو فعالیت|بازگردانی/.test(t))rank=40;
    else if(el.matches('#importBtn,#archiveImportBtn,.vehicle-import')||/ورود از اکسل/.test(t))rank=50;
    else if(el.matches('#kanbanExportBtn,#archiveExportBtn,.vehicle-export')||/خروجی اکسل/.test(t))rank=60;
    if(el.matches('input.search,input.toolbar-search,.vehicle-search,.task-search-toggle,.vehicle-search-toggle,.search-toggle'))rank=100;
    el.style.order=rank;
   });
  });
 }
 function scan(){root.querySelectorAll('.view table').forEach(decorate);toolbars()}
 document.addEventListener('input',e=>{const field=e.target;if(!field.matches('textarea,input[type=text]')||field.closest('#loginVerification'))return;const english=/[A-Za-z]/.test(field.value)&&!/[\u0600-\u06ff]/.test(field.value);field.classList.toggle('suite-english',english);field.dir=english?'ltr':'rtl'});
 document.addEventListener('pointerdown',resize,true);
 document.addEventListener('click',e=>{
  const th=e.target.closest('thead tr:first-child th'),table=th?.closest('table');
  if(table?.classList.contains('suite-table')&&!e.target.closest('input,select,button,.suite-resize,.column-resize-handle,.vehicle-col-resize')){
   e.preventDefault();e.stopImmediatePropagation();if(table.dataset.resizeDone)return;
   const direction=th.getAttribute('aria-sort')==='ascending'?-1:1;const scope=table.closest('#kanbanView')?'kanban':table.closest('#archiveView')?'archive':null;if(scope){window.BAMCO_TASK_SORT[scope]={index:th.cellIndex,direction};renderTasks(scope==='archive');return}observer.disconnect();sort(table,th.cellIndex,direction);observe();return;
  }
  if(e.target.closest('.content-back,#nav [data-view],#logoutBtn')){clear();return}
  if(!e.target.closest('table,button,a,input,select,textarea,label,dialog,summary,.suite-table-options,.table-pagination,#archivePager,.task-toolbar,.vehicle-toolbar,.prod-toolbar'))clear();
 },true);
 document.addEventListener('keydown',e=>{
  const handle=e.target.closest('.suite-resize,.column-resize-handle,.vehicle-col-resize');
  if(handle&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const th=handle.closest('th');applyColumnWidth(th.closest('table'),th,th.getBoundingClientRect().width+(e.key==='ArrowLeft'?12:-12));return}
  if(e.key==='Escape'&&!e.target.closest('dialog'))clear();
  if(['Enter',' '].includes(e.key)&&e.target.matches('table.suite-table tbody tr,table.suite-table thead tr:first-child th')){e.preventDefault();e.stopImmediatePropagation();e.target.click()}
 },true);
 scan();observe();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
(()=>{
'use strict';
if(window.__bamcoTaskBulkDelete20260912V6)return;
window.__bamcoTaskBulkDelete20260912V6=true;
window.__bamcoTaskBulkDelete20260912V5=true;
window.__bamcoTaskBulkDelete20260912V4=true;
window.__bamcoTaskBulkDelete20260912V3=true;
window.__bamcoTaskBulkDelete20260912V2=true;
window.__bamcoTaskBulkDelete20260912V1=true;

const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const faDigits=value=>typeof fa==='function'?fa(value):String(value??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const config={
  kanban:{body:'#kanbanBody',view:'#kanbanView',del:'#kanbanDeleteBtn',single:['#kanbanEditBtn','#kanbanArchiveBtn']},
  archive:{body:'#archiveBody',view:'#archiveView',del:'#archiveDeleteBtn',single:['#archiveEditBtn','#archiveRestoreBtn']}
};
const picked={kanban:new Set(),archive:new Set()};
const lastPicked={kanban:null,archive:null};
const seeded={kanban:false,archive:false};
let deleting=false;

function ensureStyles(){
  if(q('#bamcoTaskBulkDeleteSelectionStyleV3'))return;
  q('#bamcoTaskBulkDeleteSelectionStyleV2')?.remove();
  const style=document.createElement('style');
  style.id='bamcoTaskBulkDeleteSelectionStyleV3';
  style.textContent=`
    #kanbanBody tr[data-task-id],#archiveBody tr[data-task-id]{cursor:pointer!important}
    html body #kanbanBody tr.task-selected>td,html body #archiveBody tr.task-selected>td,
    html body #kanbanBody tr[aria-selected="true"]>td,html body #archiveBody tr[aria-selected="true"]>td,
    html body #kanbanBody tr[data-bamco-selected="1"]>td,html body #archiveBody tr[data-bamco-selected="1"]>td{
      background:#cfe9dc!important;color:#173f33!important;
      box-shadow:inset 0 1px 0 #86bea6,inset 0 -1px 0 #86bea6!important
    }
    html body #kanbanBody tr.task-selected>td:first-child,html body #archiveBody tr.task-selected>td:first-child,
    html body #kanbanBody tr[aria-selected="true"]>td:first-child,html body #archiveBody tr[aria-selected="true"]>td:first-child{
      box-shadow:inset -4px 0 0 #218764,inset 0 1px 0 #86bea6,inset 0 -1px 0 #86bea6!important
    }
    html body #kanbanBody tr.task-selected:hover>td,html body #archiveBody tr.task-selected:hover>td{background:#c6e4d6!important}
    #kanbanView .task-pick,#archiveView .task-pick,[data-bamco-task-select-all]{accent-color:#176b4d}
  `;
  document.head.appendChild(style);
}

function purgeRequestReport(){
  q('#nav button[data-view="requestReport"]')?.remove();
  q('#requestReportView')?.remove();
  const tabs=window.bamcoTabs;
  if(tabs&&!tabs.__bamcoRequestReportRemoved){
    const owns=typeof tabs.owns==='function'?tabs.owns.bind(tabs):null;
    const render=typeof tabs.render==='function'?tabs.render.bind(tabs):null;
    tabs.owns=id=>id==='requestReport'?false:!!owns?.(id);
    tabs.render=(id,...args)=>id==='requestReport'?Promise.resolve(false):render?.(id,...args);
    tabs.__bamcoRequestReportRemoved=true;
  }
  if(typeof state!=='undefined'&&state?.view==='requestReport'){
    state.view='dashboard';
    try{typeof showView==='function'&&showView('dashboard')}catch{}
  }
}

function scopeFromElement(el){
  if(el?.closest?.('#archiveView')||el?.closest?.('#archiveBody'))return'archive';
  if(el?.closest?.('#kanbanView')||el?.closest?.('#kanbanBody'))return'kanban';
  return null;
}
function visibleIds(scope){return qa(`${config[scope].body} tr[data-task-id]`).map(row=>String(row.dataset.taskId))}
function ids(scope){return [...picked[scope]]}
function removeLegacySelectAll(){qa('[data-bamco-task-select-all]').forEach(input=>{const label=input.closest('label');if(label)label.remove();else input.remove()})}
function syncToolbar(scope){
  const list=ids(scope),count=list.length;
  if(typeof state!=='undefined'&&state?.selected)state.selected[scope]=count===1?Number(list[0]):null;
  const del=q(config[scope].del);if(del){del.disabled=count===0;del.textContent=count>1?`حذف (${faDigits(count)})`:'حذف';del.dataset.selectionCount=String(count)}
  for(const selector of config[scope].single){const button=q(selector);if(button)button.disabled=count!==1}
  removeLegacySelectAll();
}
function decorate(scope,{prune=true}={}){
  const body=q(config[scope].body);if(!body)return;
  const visible=new Set(visibleIds(scope));
  if(!seeded[scope]){if(picked[scope].size===0&&typeof state!=='undefined'&&state?.selected?.[scope]!=null&&visible.has(String(state.selected[scope])))picked[scope].add(String(state.selected[scope]));seeded[scope]=true;}
  if(prune)for(const id of [...picked[scope]])if(!visible.has(id))picked[scope].delete(id);
  qa('tr[data-task-id]',body).forEach(row=>{
    const id=String(row.dataset.taskId),input=q('input.task-pick',row),selected=picked[scope].has(id);
    if(input){input.checked=selected;input.setAttribute('aria-checked',selected?'true':'false');input.style.setProperty('display','none','important');input.setAttribute('aria-hidden','true')}
    row.classList.toggle('task-selected',selected);row.setAttribute('aria-selected',selected?'true':'false');row.dataset.bamcoSelected=selected?'1':'0';
  });
  syncToolbar(scope);
}
function clear(scope){
  picked[scope].clear();lastPicked[scope]=null;
  if(typeof state!=='undefined'&&state?.selected)state.selected[scope]=null;
  decorate(scope,{prune:false});
}
function setVisible(scope,checked){
  const visible=visibleIds(scope);for(const id of visible){if(checked)picked[scope].add(id);else picked[scope].delete(id)}
  if(checked&&visible.length)lastPicked[scope]=visible[visible.length-1];
  decorate(scope,{prune:false});
}
function toggleRow(scope,id,shiftKey=false){
  id=String(id);const visible=visibleIds(scope),set=picked[scope],last=lastPicked[scope];
  if(shiftKey&&last&&visible.includes(last)&&visible.includes(id)){
    const a=visible.indexOf(last),b=visible.indexOf(id),[from,to]=a<b?[a,b]:[b,a];
    for(let i=from;i<=to;i++)set.add(visible[i]);
  }else if(set.has(id))set.delete(id);else set.add(id);
  lastPicked[scope]=id;
  if(typeof state!=='undefined'&&state?.selected)state.selected[scope]=set.size===1?Number([...set][0]):null;
  decorate(scope,{prune:false});
}
function optimisticResequence(tasks){
  const numbered=tasks.filter(t=>Number.isFinite(Number(t?.legacy_id))).sort((a,b)=>Number(a.legacy_id)-Number(b.legacy_id)||Number(a.id)-Number(b.id));
  numbered.forEach((task,index)=>{task.legacy_id=index+1});
}
function renderBoth(){
  try{typeof renderTasks==='function'&&renderTasks(false)}catch(err){console.warn('kanban render after delete failed',err)}
  try{typeof renderTasks==='function'&&renderTasks(true)}catch(err){console.warn('archive render after delete failed',err)}
  queueMicrotask(()=>{decorate('kanban');decorate('archive')});
}
async function deleteSelected(scope){
  if(deleting)return;
  if(typeof isManager==='function'&&!isManager())return;
  let selected=ids(scope);
  if(!selected.length&&typeof state!=='undefined'&&state?.selected?.[scope]!=null)selected=[String(state.selected[scope])];
  if(!selected.length){typeof toast==='function'&&toast('ابتدا یک یا چند ردیف را انتخاب کنید.',true);return}
  const selectedSet=new Set(selected),tasks=(state?.tasks||[]).filter(task=>selectedSet.has(String(task.id)));
  if(!tasks.length){clear(scope);return}
  const question=tasks.length===1?`وظیفه «${tasks[0].title}» برای همیشه حذف شود؟`:`${faDigits(tasks.length)} وظیفه انتخاب‌شده برای همیشه حذف شوند و شناسه‌ها بازشماری شوند؟`;
  if(typeof window.bamcoConfirm==='function'&&!await window.bamcoConfirm(question))return;
  if(typeof window.bamcoConfirm!=='function'&&!window.confirm(question))return;

  deleting=true;const before=(state.tasks||[]).map(task=>({...task})),restoreIds=[...selected];
  const deleteButtons=[q('#kanbanDeleteBtn'),q('#archiveDeleteBtn')].filter(Boolean);deleteButtons.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true')});
  state.tasks=(state.tasks||[]).filter(task=>!selectedSet.has(String(task.id)));optimisticResequence(state.tasks);clear(scope);renderBoth();
  try{
    const deleted=await rpc('delete_tasks_and_resequence',{p_task_ids:selected.map(Number)});
    if(Number(deleted)!==tasks.length)throw new Error('تعداد ردیف‌های حذف‌شده با انتخاب شما مطابقت ندارد.');
    try{const taskRevision=state.taskRevision||0,rows=await selectAll('task_status_view','select=*&order=id.desc');if(Array.isArray(rows)&&taskRevision===(state.taskRevision||0))state.tasks=rows}catch(refreshError){console.warn('authoritative task refresh after delete failed',refreshError)}
    renderBoth();
    if(typeof toast==='function')toast(tasks.length===1?'وظیفه حذف شد و شناسه‌ها بازشماری شد.':`${faDigits(tasks.length)} وظیفه حذف شدند و شناسه‌ها بازشماری شد.`);
    window.dispatchEvent(new CustomEvent('bamco:tasks-deleted',{detail:{scope,ids:selected,count:tasks.length}}));
  }catch(err){
    state.tasks=before;for(const id of restoreIds)picked[scope].add(String(id));renderBoth();
    if(typeof toast==='function')toast('حذف روی سرور انجام نشد؛ ردیف‌ها بازگردانده شدند. '+(err?.message||err),true);
  }finally{
    deleting=false;deleteButtons.forEach(button=>button.removeAttribute('aria-busy'));decorate('kanban');decorate('archive');
  }
}

// Own task selection and deletion at the earliest practical capture point so
// legacy single-selection handlers cannot collapse a multi-row selection.
window.addEventListener('click',event=>{
  const button=event.target?.closest?.('#kanbanDeleteBtn,#archiveDeleteBtn');
  if(button){event.preventDefault();event.stopImmediatePropagation();void deleteSelected(button.id.startsWith('archive')?'archive':'kanban');return}
  const row=event.target?.closest?.('#kanbanBody tr[data-task-id],#archiveBody tr[data-task-id]');if(!row)return;
  if(event.target?.closest?.('button,a,select,textarea'))return;
  const scope=scopeFromElement(row);if(!scope)return;
  event.preventDefault();event.stopImmediatePropagation();toggleRow(scope,row.dataset.taskId,!!event.shiftKey);
},true);

window.addEventListener('change',event=>{
  const all=event.target?.closest?.('[data-bamco-task-select-all]');if(!all)return;
  const scope=all.dataset.bamcoTaskSelectAll;if(!config[scope])return;
  event.stopImmediatePropagation();setVisible(scope,all.checked);
},true);

function boot(){
  ensureStyles();removeLegacySelectAll();purgeRequestReport();
  const app=q('#appView');if(app)new MutationObserver(()=>purgeRequestReport()).observe(app,{childList:true,subtree:true});
  for(const scope of Object.keys(config)){
    const body=q(config[scope].body);if(body){new MutationObserver(()=>queueMicrotask(()=>decorate(scope))).observe(body,{childList:true,subtree:true});decorate(scope)}
  }
  window.bamcoTaskSelection={ids,clear,setVisible,toggle:toggleRow,deleteSelected,count:scope=>picked[scope]?.size||0};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

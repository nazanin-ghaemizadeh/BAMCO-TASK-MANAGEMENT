(()=>{
'use strict';
if(window.__bamcoTaskToolbarActions20260912V1)return;
window.__bamcoTaskToolbarActions20260912V1=true;

const q=(s,r=document)=>r?.querySelector?.(s)||null;
const qa=(s,r=document)=>[...(r?.querySelectorAll?.(s)||[])];
const config={
  kanban:{body:'#kanbanBody',edit:'#kanbanEditBtn',secondary:'#kanbanArchiveBtn'},
  archive:{body:'#archiveBody',edit:'#archiveEditBtn',secondary:'#archiveRestoreBtn'}
};
let busy=false;

function selectedIds(scope){
  const api=window.bamcoTaskSelection;
  const fromApi=typeof api?.ids==='function'?api.ids(scope).map(String):[];
  if(fromApi.length)return [...new Set(fromApi)];
  const body=q(config[scope]?.body);if(!body)return[];
  return qa('tr[data-task-id]',body)
    .filter(row=>row.classList.contains('task-selected')||row.getAttribute('aria-selected')==='true'||row.dataset.bamcoSelected==='1')
    .map(row=>String(row.dataset.taskId));
}
function selectedTask(scope){
  const ids=selectedIds(scope);if(ids.length!==1)return null;
  return (state?.tasks||[]).find(task=>String(task.id)===ids[0])||null;
}
function sync(scope){
  const count=selectedIds(scope).length;
  const edit=q(config[scope].edit),secondary=q(config[scope].secondary);
  if(edit)edit.disabled=count!==1;
  if(secondary)secondary.disabled=count!==1;
  if(typeof state!=='undefined'&&state?.selected)state.selected[scope]=count===1?Number(selectedIds(scope)[0]):null;
}
function syncAll(){sync('kanban');sync('archive')}
function openEditor(task){
  const fn=window.openTask||(typeof openTask==='function'?openTask:null);
  if(!fn)throw Error('فرم ویرایش وظیفه در دسترس نیست.');
  fn(task);
}
async function archiveSelected(task){
  const fn=window.archiveTask||(typeof archiveTask==='function'?archiveTask:null);
  if(!fn)throw Error('عملیات آرشیو در دسترس نیست.');
  await fn(task.id);
}
async function restoreSelected(task){
  const fn=window.restoreTask||(typeof restoreTask==='function'?restoreTask:null);
  if(fn){await fn(task.id);return}
  if(typeof isManager==='function'&&!isManager())return;
  if(typeof window.bamcoConfirm==='function'&&!await window.bamcoConfirm(`وظیفه «${task.title}» به کانبان بازگردانده شود؟`))return;
  if(!task.owner_id||!task.start_date||!task.due_date){
    openEditor({...task,status:window.bamcoOptions?.label?.('status','doing')||'در حال انجام',done_date:null,_restoring:true});
    const hint=q('#taskDialogHint');if(hint)hint.textContent='برای بازگشت به کانبان، متولی و تاریخ شروع و پایان را کامل کنید.';
    return;
  }
  await rpc('restore_tasks_to_kanban_and_resequence',{p_task_ids:[Number(task.id)]});
  window.bamcoTaskSelection?.clear?.('archive');
  if(typeof toast==='function')toast('وظیفه به کانبان بازگردانده و شماره‌ها بازشماری شد.');
  if(typeof refresh==='function')await refresh();
}
async function run(scope,action){
  if(busy)return;
  const task=selectedTask(scope);
  if(!task){sync(scope);if(typeof toast==='function')toast('ابتدا دقیقاً یک ردیف را انتخاب کنید.',true);return}
  try{
    busy=true;
    if(action==='edit')openEditor(task);
    else if(action==='archive')await archiveSelected(task);
    else if(action==='restore')await restoreSelected(task);
  }catch(err){if(typeof toast==='function')toast(err?.message||String(err),true)}
  finally{busy=false;queueMicrotask(syncAll)}
}

window.addEventListener('click',event=>{
  const button=event.target?.closest?.('#kanbanEditBtn,#kanbanArchiveBtn,#archiveEditBtn,#archiveRestoreBtn');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.id==='kanbanEditBtn')void run('kanban','edit');
  else if(button.id==='kanbanArchiveBtn')void run('kanban','archive');
  else if(button.id==='archiveEditBtn')void run('archive','edit');
  else void run('archive','restore');
},true);

function watch(scope){
  const body=q(config[scope].body);if(!body)return;
  new MutationObserver(()=>queueMicrotask(()=>sync(scope))).observe(body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-selected','data-bamco-selected']});
}
function boot(){watch('kanban');watch('archive');syncAll();window.bamcoTaskToolbarActions={sync:syncAll,selectedIds,selectedTask}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

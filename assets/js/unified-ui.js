(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const picked={kanban:new Set(),archive:new Set()};let taskActionBusy=false;
  const canManageTaskScope=()=>typeof window.bamcoOrganizationAccess?.canManageTasks==='function'
    ?window.bamcoOrganizationAccess.canManageTasks()
    :(typeof isManager==='function'&&isManager());

  function scopeInfo(scope){return {view:q(`#${scope}View`),body:q(`#${scope}Body`),archived:scope==='archive'}}
  function cleanup(scope){
    const {view}=scopeInfo(scope);if(!view)return;
    q('.unified-select-head',view)?.remove();q('.unified-select-filter',view)?.remove();
    qa('.unified-select-cell',view).forEach(x=>x.remove());
  }
  function syncToolbar(scope){
    const count=picked[scope].size,single=count===1;
    q(`#${scope}EditBtn`)?.toggleAttribute('disabled',taskActionBusy||!count);
    q(`#${scope}DeleteBtn`)?.toggleAttribute('disabled',taskActionBusy||!count||!canManageTaskScope());
    q(scope==='kanban'?'#kanbanArchiveBtn':'#archiveRestoreBtn')?.toggleAttribute('disabled',taskActionBusy||!count||(scope==='archive'&&!canManageTaskScope()));
  }
  function decorate(scope){
    const {view,body}=scopeInfo(scope);if(!view||!body)return;
    const header=q('thead tr:first-child',view),filters=q('thead .column-filters',view);if(!header||!filters)return;
    const rows=qa('tr[data-task-id]',body),visible=new Set(rows.map(r=>String(r.dataset.taskId)));
    picked[scope]=new Set([...picked[scope]].filter(id=>visible.has(id)||state.tasks.some(t=>String(t.id)===id)));
    rows.forEach(row=>{const selected=picked[scope].has(String(row.dataset.taskId));row.classList.toggle('task-selected',selected);row.setAttribute('aria-selected',String(selected));row.tabIndex=0});
    syncToolbar(scope);
  }
  function installTaskSelection(){
    if(typeof renderTasks!=='function'||typeof tableFilters==='undefined')return;
    const base=renderTasks;
    renderTasks=function(archived){const scope=archived?'archive':'kanban';cleanup(scope);const out=base(archived);decorate(scope);return out};
    document.addEventListener('bamco-selection-change',e=>{const scope=e.target.closest('#archiveView')?'archive':e.target.closest('#kanbanView')?'kanban':null;if(!scope)return;picked[scope]=new Set(e.detail.ids);state.selected[scope]=picked[scope].size===1?Number([...picked[scope]][0]):null;decorate(scope)});
    window.bamcoClearTaskSelection=()=>{for(const scope of ['kanban','archive'])window.bamcoSelection?.clear('#'+scope+'Body')};
    renderTasks(false);renderTasks(true);
  }
  async function bulkAction(scope,kind){
    const ids=[...picked[scope]];if(!ids.length||taskActionBusy)return;
    if(kind==='edit'){if(ids.length!==1){toast('برای ویرایش فقط یک ردیف را انتخاب کنید.',true);return}const task=state.tasks.find(t=>String(t.id)===ids[0]);if(task)openTask(task);return}
    if((kind==='restore'||kind==='delete')&&!canManageTaskScope()){toast('این عملیات فقط برای بالادستِ همین شاخه سازمانی مجاز است.',true);return}
    if(kind==='restore'&&ids.some(id=>{const t=state.tasks.find(x=>String(x.id)===id);return !t?.owner_id||!t.start_date||!t.due_date})){if(ids.length===1){await restoreTask(Number(ids[0]));return}toast('برای بازگردانی گروهی، متولی و تاریخ شروع و پایان همه وظایف باید کامل باشد. موارد ناقص را تکی بازگردانید.',true);return}
    const labels={archive:'تکمیل و آرشیو',restore:'بازگردانی به کانبان',delete:'حذف'};
    if(!await window.bamcoConfirm(`${labels[kind]} برای ${fa(ids.length)} وظیفه انتخاب‌شده انجام شود؟`))return;
    taskActionBusy=true;syncToolbar(scope);
    try{
      if(kind==='restore'&&canManageTaskScope())await rpc('restore_tasks_to_kanban_and_resequence',{p_task_ids:ids.map(Number)});
      if(kind==='delete'&&canManageTaskScope())await rpc('delete_tasks_and_resequence',{p_task_ids:ids.map(Number)});
      for(const id of ids){
        if(kind==='archive'){const t=state.tasks.find(x=>String(x.id)===id);if(canManageTaskScope())await update('tasks',`id=eq.${id}`,{archived:true,archived_at:new Date().toISOString(),status:'انجام شده',done_date:t.done_date||new Date().toISOString().slice(0,10)});else await rpc('submit_change_request',{p_request_type:'complete',p_task_id:Number(id),p_proposed_data:{done_date:new Date().toISOString().slice(0,10)},p_note:null})}
      }
      window.bamcoSelection.clear('#'+scope+'Body');toast(`${fa(ids.length)} وظیفه با موفقیت پردازش شد.`);await refresh();
    }catch(err){toast(err.message,true)}finally{taskActionBusy=false;syncToolbar(scope)}
  }
  function interceptBulk(){
    const map={kanbanEditBtn:['kanban','edit'],archiveEditBtn:['archive','edit'],kanbanArchiveBtn:['kanban','archive'],archiveRestoreBtn:['archive','restore'],kanbanDeleteBtn:['kanban','delete'],archiveDeleteBtn:['archive','delete']};
    document.addEventListener('click',e=>{const hit=Object.entries(map).find(([id])=>e.target.closest(`#${id}`));if(!hit)return;e.preventDefault();e.stopImmediatePropagation();bulkAction(...hit[1])},true);
  }
  function orderToolbars(){
    const order=(toolbar,selectors)=>{if(!toolbar)return;selectors.forEach(s=>{const el=q(s,toolbar);if(el)toolbar.appendChild(el)})};
    order(q('#kanbanView .task-toolbar,#kanbanView .toolbar'),['#addTaskBtn','.task-search-toggle','.search-toggle','#kanbanSearch','#importBtn','[data-import-tasks]','#kanbanExportBtn','[data-export-tasks]','#kanbanEditBtn','#kanbanArchiveBtn','#kanbanDeleteBtn']);
    order(q('#archiveView .task-toolbar,#archiveView .toolbar'),['.task-search-toggle','.search-toggle','#archiveSearch','#archiveImportBtn','[data-import-tasks]','#archiveExportBtn','[data-export-tasks]','#archiveEditBtn','#archiveRestoreBtn','#archiveDeleteBtn']);
    qa('.vehicle-toolbar').forEach(t=>order(t,['.vehicle-add','.vehicle-search-toggle','.vehicle-search','.vehicle-import','.vehicle-export','.vehicle-edit','.vehicle-delete','.vehicle-upload','.vehicle-blank']));
  }
  function normalizeViews(){
    qa('#appView .view .table-wrap table').forEach(t=>t.classList.add('vehicle-data-table'));
    qa('#appView .view>.panel').forEach(p=>{if(q('table',p))p.classList.add('vehicle-panel')});
    const page=q('#stickersView .desktop-sticker-page');
    if(page&&q('#desktopStickerSet option')?.textContent.includes('ثبت نشده'))page.innerHTML='<div class="sticker-empty-state"><div><b>هنوز نسخه‌ای تعریف نشده است</b><span>برای ساخت نسخه اول، روی «افزودن نسخه جدید» بزنید و تصاویر وضعیت‌ها را بارگذاری کنید.</span><br><button id="emptyAddSticker" class="primary" type="button">افزودن نسخه اول</button></div></div>'+page.innerHTML;
    q('#emptyAddSticker')?.addEventListener('click',()=>q('#addDesktopStickerSet')?.click());
  }
  let booted=false;
  function boot(){
    if(booted)return;booted=true;
    installTaskSelection();interceptBulk();orderToolbars();normalizeViews();
    setTimeout(()=>{orderToolbars();normalizeViews()},500)
  }
  function waitForApp(){
    const app=q('#appView');if(!app)return;
    if(!app.classList.contains('hidden'))return boot();
    const observer=new MutationObserver(()=>{
      if(!app.classList.contains('hidden')){observer.disconnect();boot()}
    });
    observer.observe(app,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForApp,{once:true});else waitForApp();
})();

/* Account deletion hands active tasks directly to the existing Kanban. */
(()=>{'use strict';
 const q=s=>document.querySelector(s);
 let scope=null;
 const canTransfer=()=>window.BamcoAccess?.can?.('kanban','edit')===true;
 const denied=()=>window.BamcoAccess?.denied?.('kanban','edit')||false;
 const profileLabel=p=>window.BamcoProfiles?.label?.(p?.id,p?.display_name||p?.full_name||p?.email||'کاربر')||p?.display_name||p?.full_name||p?.email||'کاربر';
 const active=t=>!t.archived&&!['انجام شده','متوقف'].includes(norm(t.status));
 const includes=t=>!scope||(scope.ids.has(String(t.id))&&!t.owner_id&&!!t.owner_deleted_at&&active(t));
 function sync(){
  if(!scope)return;
  const count=state.tasks.filter(includes).length;
  q('#peopleTransferText').textContent=`${fa(scope.people.length)} حساب حذف شد؛ سوابق و ${fa(scope.retained)} وظیفه حفظ شد. `+(count?`${fa(count)} کار فعال ${scope.people.map(p=>p.full_name).join('، ')} نیازمند متولی است. هر ردیف را انتخاب کنید و «تغییر متولی» را بزنید.`:'همه کارهای فعال تعیین تکلیف شده‌اند؛ کاری برای واگذاری باقی نمانده است.');
  const button=q('#transferOwnerBtn');if(button)button.disabled=!count||!canTransfer();
  if(!count&&!scope.completionNotified){scope.completionNotified=true;toast(scope.people.length===1?'فرد با موفقیت حذف شد و وظایفش منتقل شد.':'افراد با موفقیت حذف شدند و وظایفشان منتقل شد.');}
 }
 function open(people,activeTasks,retained){
  const former=new Map(people.map(p=>[p.id,p])),serverRows=new Map(activeTasks.map(t=>[String(t.id),t]));
  const ids=new Set(activeTasks.map(t=>String(t.id)));
  state.tasks=state.tasks.map(t=>{
   if(serverRows.has(String(t.id))){const row=serverRows.get(String(t.id));serverRows.delete(String(t.id));return row}
   const person=former.get(t.owner_id);if(!person)return t;
   if(active(t))ids.add(String(t.id));
   return {...t,owner_id:null,former_owner_name:person.full_name,owner_deleted_at:new Date().toISOString()};
  });
  state.tasks.push(...serverRows.values());scope={ids,people,retained,completionNotified:false};
  let banner=q('#peopleTransferBanner');if(!banner){
   banner=document.createElement('div');banner.id='peopleTransferBanner';banner.className='manager-note people-transfer-banner';
   banner.innerHTML='<p id="peopleTransferText" role="status"></p><div class="manager-toolbar"><button id="transferOwnerBtn" type="button" class="ghost" data-feature-key="kanban" data-feature-action="edit">تغییر متولی</button><button id="showAllKanbanTasks" type="button" class="ghost">نمایش همه کارهای کانبان</button></div>';
   const table=q('#kanbanBody').closest('.table-wrap');table.before(banner);
   q('#transferOwnerBtn').onclick=editOwner;
   q('#showAllKanbanTasks').onclick=()=>{scope=null;banner.hidden=true;window.bamcoSelection.clear('#kanbanBody');renderTasks(false)};
  }
  banner.hidden=false;tableFilters.kanban={};q('#kanbanSearch').value='';delete q('#kanbanSearch').dataset.taskFocusId;
  q('#nav [data-view="kanban"]').click();window.bamcoSelection.clear('#kanbanBody');renderTasks(false);sync();
 }
 function editOwner(){
  if(!canTransfer())return denied();
  const ids=window.bamcoSelection.ids('#kanbanBody');
  if(ids.length!==1)return toast('برای تغییر متولی فقط یک وظیفه را انتخاب کنید.',true);
  const task=state.tasks.find(t=>String(t.id)===ids[0]);if(!task||!includes(task))return;
  let dialog=q('#transferOwnerDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='transferOwnerDialog';dialog.className='modal bamco-dialog small';document.body.append(dialog)}
  dialog.innerHTML=`<form><div class="modal-head"><h3>تغییر متولی وظیفه</h3></div><p>${safe(task.title)}</p><div class="manager-form"><label>متولی جدید<select name="owner_id" required><option value="">انتخاب کنید…</option>${state.profiles.filter(p=>p.active!==false).map(p=>`<option value="${safe(p.id)}">${safe(profileLabel(p))}</option>`).join('')}</select></label></div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="submit" class="primary">ذخیره متولی</button><button type="button" class="ghost">انصراف</button></div></form>`;
  dialog.querySelector('button[type="button"]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(!canTransfer())return denied();const form=event.currentTarget,button=form.querySelector('[type="submit"]');if(button.disabled)return;
   const ownerId=form.elements.owner_id.value;if(!ownerId)return;button.disabled=true;
   try{
    const version=task.row_version==null?'':`&row_version=eq.${encodeURIComponent(task.row_version)}`;
    const rows=await update('tasks',`id=eq.${encodeURIComponent(task.id)}&owner_id=is.null&archived=eq.false${version}`,{owner_id:ownerId});
    if(!Array.isArray(rows)||rows.length!==1)throw Error('این وظیفه هم‌زمان تغییر کرده است؛ کانبان را تازه‌سازی و دوباره انتخاب کنید.');
    state.tasks=state.tasks.map(t=>String(t.id)===String(task.id)?{...t,...rows[0],former_owner_name:null,owner_deleted_at:null}:t);
    dialog.close();window.bamcoSelection.clear('#kanbanBody');renderTasks(false);
   }catch(err){form.querySelector('.form-error').textContent=err.message}finally{button.disabled=false}
  };
  dialog.showModal();
 }
 document.addEventListener('click',event=>{if(event.target.closest('#logoutBtn')){scope=null;const banner=q('#peopleTransferBanner');if(banner)banner.hidden=true}},true);
 window.addEventListener('bamco:feature-access-changed',()=>{if(!canTransfer())q('#transferOwnerDialog')?.close?.();sync();window.BamcoAccess?.applyNavigation?.()});
 window.bamcoTaskTransfer={open,includes,sync};
})();

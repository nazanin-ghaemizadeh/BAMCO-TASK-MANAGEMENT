/* Keep orphaned work in a focused reassignment dialog after account deletion. */
(()=>{'use strict';
 const q=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let pending=[];
 const canTransfer=()=>window.BamcoAccess?.can?.('kanban','edit')===true;
 const active=t=>!t.archived&&!['انجام شده','متوقف'].includes(norm(t.status));
 function open(people,activeTasks,retained){
  const former=new Map(people.map(p=>[String(p.id),p]));
  const rows=new Map(activeTasks.map(t=>[String(t.id),t]));
  const affected=new Set(activeTasks.filter(active).map(t=>String(t.id)));
  state.tasks=state.tasks.map(t=>{
   if(rows.has(String(t.id))){const row=rows.get(String(t.id));rows.delete(String(t.id));return row}
   const person=former.get(String(t.owner_id));if(!person)return t;
   if(active(t))affected.add(String(t.id));
   return {...t,owner_id:null,former_owner_name:person.full_name,owner_deleted_at:new Date().toISOString()};
  });
  state.tasks.push(...rows.values());
  pending=[...affected].map(id=>state.tasks.find(t=>String(t.id)===id)).filter(t=>t&&active(t)&&!t.owner_id);
  let dialog=q('#peopleTransferDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='peopleTransferDialog';dialog.className='modal bamco-dialog people-transfer-dialog';document.body.append(dialog)}
  const options=(state.profiles||[]).filter(p=>p.active!==false).map(p=>'<option value="'+esc(p.id)+'">'+esc(window.BamcoProfiles?.label?.(p.id,p.full_name)||p.full_name||p.email)+'</option>').join('');
  dialog.innerHTML='<div class="modal-head"><h3>تعیین متولی فعالیت‌ها</h3></div><p>'+fa(people.length)+' فرد حذف شد؛ '+fa(retained)+' فعالیت در سوابق باقی ماند.</p><div class="people-transfer-list">'+(pending.length?pending.map(t=>'<div class="people-transfer-item" data-task="'+esc(t.id)+'"><div><b>شناسه '+esc(fa(t.legacy_id||t.id))+'</b><strong>'+esc(t.title)+'</strong><small>متولی پیشین: '+esc(t.former_owner_name||people.find(p=>String(p.id)===String(t.owner_id))?.full_name||'—')+'</small></div><label>متولی جدید<select aria-label="متولی فعالیت '+esc(fa(t.legacy_id||t.id))+'"><option value="">انتخاب کنید</option>'+options+'</select></label><button type="button" class="ghost" data-save-task="'+esc(t.id)+'">ذخیره متولی</button><p class="form-error" role="alert"></p></div>').join(''):'<p>فعالیت بی‌متولی وجود ندارد.</p>')+'</div><div class="modal-actions"><button type="button" class="ghost" data-close-transfer>بستن</button></div>';
  dialog.querySelector('[data-close-transfer]').onclick=()=>dialog.close();
  dialog.onclick=async event=>{
   const button=event.target.closest('[data-save-task]');if(!button)return;
   const task=pending.find(t=>String(t.id)===button.dataset.saveTask),item=button.closest('.people-transfer-item'),ownerId=item.querySelector('select').value;
   if(!task||!ownerId)return item.querySelector('.form-error').textContent='متولی جدید را انتخاب کنید.';
   if(!canTransfer())return window.BamcoAccess?.denied?.('kanban','edit');
   button.disabled=true;item.querySelector('.form-error').textContent='';
   try{
    const version=task.row_version==null?'':'&row_version=eq.'+encodeURIComponent(task.row_version);
    const saved=await update('tasks','id=eq.'+encodeURIComponent(task.id)+'&owner_id=is.null&archived=eq.false'+version,{owner_id:ownerId});
    if(!Array.isArray(saved)||saved.length!==1)throw Error('فعالیت تغییر کرده است؛ صفحه را تازه‌سازی کنید.');
    state.tasks=state.tasks.map(t=>String(t.id)===String(task.id)?{...t,...saved[0],former_owner_name:null,owner_deleted_at:null}:t);
    pending=pending.filter(t=>String(t.id)!==String(task.id));item.remove();toast('متولی فعالیت ذخیره شد.');
   }catch(error){item.querySelector('.form-error').textContent=error.message}finally{button.disabled=false}
  };
  if(!dialog.open)dialog.showModal();
 }
 document.addEventListener('click',event=>{if(event.target.closest('#logoutBtn'))q('#peopleTransferDialog')?.close()},true);
 window.bamcoTaskTransfer={open,includes:()=>true,sync(){}};
})();

/* One owner for public, group, private and task conversations. */
(()=>{
 'use strict';
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={groupChat:'گفت‌وگوی عمومی و گروه‌ها',directMessages:'گفت‌وگوی خصوصی',taskChats:'گفت‌وگوی مرتبط با وظیفه'};
 const label=p=>p.display_name||p.full_name||'کاربر';let serial=0,currentView='',selectedTask=null;
 // Choose each new color as far as possible from those already used, across
 // hue, saturation and lightness. Never cycle a short palette or repeat a fill.
 function taskPalette(count){
  if(!count)return[];
  const candidates=[],seen=new Set(),steps=Math.max(30,Math.ceil(count/12)*2);
  const linear=v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const lab=rgb=>{const [r,g,b]=rgb.map(linear),f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116,x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);return[116*y-16,500*(x-y),200*(y-z)]};
  for(let i=0;i<steps;i++)for(const saturation of [.45,.65,.85])for(const lightness of [.32,.44,.58,.72,.84]){
   const h=(155+i*360/steps)%360,a=saturation*Math.min(lightness,1-lightness);
   const rgb=[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1))))});
   const fill='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');if(seen.has(fill))continue;seen.add(fill);
   const [r,g,b]=rgb.map(linear),luminance=.2126*r+.7152*g+.0722*b;
   candidates.push({fill,ink:luminance>.179?'#000000':'#ffffff',lab:lab(rgb),distance:Infinity});
  }
  const palette=[];let next=candidates.findIndex(c=>c.lab[0]>50&&c.lab[0]<65);
  while(palette.length<count&&candidates.length){
   const chosen=candidates.splice(Math.max(0,next),1)[0];palette.push(chosen);let farthest=-1;next=0;
   for(let i=0;i<candidates.length;i++){const c=candidates[i],distance=c.lab.reduce((sum,v,j)=>sum+(v-chosen.lab[j])**2,0);c.distance=Math.min(c.distance,distance);if(c.distance>farthest){farthest=c.distance;next=i}}
  }
  return palette;
 }
 const directory=()=>rpc('chat_directory_v2',{});
 function loading(host,text='در حال دریافت اطلاعات…'){host.innerHTML=`<div class="conversation-empty" role="status">${esc(text)}</div>`}
 function failure(host,error){host.innerHTML=`<div class="workspace-error" role="alert"><p>${esc(error.message||'دریافت اطلاعات انجام نشد.')}</p><button type="button" class="ghost" data-conversation-refresh>تلاش دوباره</button></div>`}
 function personButton(p){return `<button type="button" class="conversation-item" data-person="${esc(p.id)}" data-person-name="${esc(label(p))}"><span class="conversation-avatar" data-profile-photo="${esc(p.id)}" aria-hidden="true">${esc(label(p).trim()[0])}</span><span><strong>${esc(label(p))}</strong><small>${p.role==='manager'?'مدیر':'متولی'}</small></span><span class="conversation-arrow" aria-hidden="true">‹</span></button>`}
 function selectItem(button,host){qa('.conversation-item.active',host).forEach(b=>{b.classList.remove('active');b.removeAttribute('aria-current')});button.classList.add('active');button.setAttribute('aria-current','true')}
 const digits=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);let threadRows=[];
 function setCount(host,count,className='nav-count'){
  if(!host)return;let badge=q('.'+className,host);
  if(!badge){badge=document.createElement('i');badge.className=className+' nav-count';host.appendChild(badge)}
  badge.textContent=count?digits(count):'';badge.setAttribute('aria-label',count?digits(count)+' پیام خوانده‌نشده':'');
 }
 function routeFor(t){return t.task_id?'taskChats':['public','group'].includes(t.thread_type)?'groupChat':'directMessages'}
 function syncUnread(rows=threadRows){
  const counts={groupChat:0,directMessages:0,taskChats:0};
  for(const t of rows||[])counts[routeFor(t)]+=Number(t.unread_count)||0;
  for(const [route,count] of Object.entries(counts))setCount(q(`#nav button[data-view="${route}"]`),count,'conversation-route-count');
  setCount(q('#nav .nav-group[data-group="conversations"]>.nav-group-toggle'),Object.values(counts).reduce((a,b)=>a+b,0),'conversation-nav-count');
 }
 function syncUnreadTotal(count){setCount(q('#nav .nav-group[data-group="conversations"]>.nav-group-toggle'),Number(count)||0,'conversation-nav-count')}
 function threadButton(t){const kind=t.system_recipient_id?'system':t.thread_type,task=t.task_id?(state.tasks||[]).find(x=>String(x.id)===String(t.task_id)):null,sub=t.system_recipient_id?'پیام‌های خودکار · قابل پاسخ':t.task_id?'وظیفه '+digits(task?.legacy_id||t.task_id)+' · '+(task?.title||''):kind==='public'?'عمومی · همه کاربران':kind==='group'?'گروه':'خصوصی';return `<button type="button" class="conversation-item ${t.task_id?'conversation-task':''}" data-thread="${esc(t.id)}" data-title="${esc(t.title)}" data-kind="${kind}" data-task-id="${t.task_id||''}" data-person-id="${esc(t.person_id||'')}" data-group-photo="${esc(t.avatar_path||'')}" data-read-only="${t.is_active===false}"><span class="conversation-avatar" ${t.person_id&&!t.system_recipient_id?`data-profile-photo="${esc(t.person_id)}"`:`data-thread-photo="${esc(t.id)}"`}>${kind==='system'?'◉':kind==='public'?'<img src="assets/images/bamco-icon-192.png" alt="لوگوی شرکت">':kind==='group'?'♙':esc(t.title?.[0]||'گ')}</span><span><strong>${esc(t.title)}</strong><small>${esc(sub)}</small>${t.last_message?`<small class="conversation-preview">${esc(t.last_message.startsWith('BAMCO_')?'پیوست یا استیکر':t.last_message)}</small>`:''}</span>${Number(t.unread_count)?`<b class="conversation-unread">${digits(t.unread_count)}</b>`:''}</button>`}
 async function refreshThreads(view){const epoch=serial,rows=await rpc('chat_conversation_list',{});if(epoch!==serial)return;threadRows=rows||[];syncUnread(threadRows);const id=view.id.replace(/View$/,''),filtered=threadRows.filter(t=>id==='groupChat'?['public','group'].includes(t.thread_type):id==='taskChats'?!!t.task_id:t.thread_type==='direct'&&!t.task_id),list=q('.conversation-list',view),activeId=q('.conversation-item.active',list)?.dataset.thread;list.innerHTML=filtered.map(threadButton).join('')||'<div class="conversation-empty">هنوز گفت‌وگویی آغاز نشده است.</div>';const activeButton=qa('[data-thread]',list).find(b=>b.dataset.thread===activeId);if(activeButton)selectItem(activeButton,list);bamcoMedia.groups(list,filtered.filter(t=>t.thread_type!=='public'));window.bamcoEmoji?.render(list);bamcoMedia.avatars(list,await directory());return filtered}
 async function newConversation(view){selectedTask=null;window.bamcoChat.close();const host=q('.conversation-stage',view);loading(host);const people=(await directory()).filter(p=>p.id!==state.user.id);if(!host.isConnected)return;
  if(view.id==='taskChatsView'){
   const tasks=(state.tasks||[]).filter(t=>!t.archived&&(isManager()||t.owner_id===state.user.id));
   host.innerHTML=`<div class="conversation-recipient-head"><h4>انتخاب وظیفه</h4><p>وظیفه را انتخاب کنید؛ سپس مخاطب گفت‌وگو را مشخص کنید.</p>${isManager()?`<label class="conversation-owner-filter"><span>متولی</span><select data-task-owner><option value="">همه متولی‌ها</option>${people.map(p=>`<option value="${esc(p.id)}">${esc(label(p))}</option>`).join('')}<option value="${esc(state.user.id)}">وظایف من</option></select></label>`:''}</div><div class="conversation-task-choices"></div>`;
   const palette=taskPalette(tasks.length),taskColors=new Map(tasks.map((t,index)=>[t.id,palette[index]]));
   const paint=()=>{const owner=q('[data-task-owner]',host)?.value; q('.conversation-task-choices',host).innerHTML=tasks.filter(t=>!owner||t.owner_id===owner).map(t=>`<button type="button" class="conversation-task-tile" style="--task-fill:${taskColors.get(t.id).fill};--task-ink:${taskColors.get(t.id).ink}" data-task-choice="${t.id}" aria-label="${esc(t.title)}" data-preview="${esc([t.title,t.description,'متولی: '+ownerName(t),t.status].filter(Boolean).join('\n'))}"><span class="conversation-task-id">${esc(digits(t.legacy_id||t.id))}</span></button>`).join('')||'<div class="conversation-empty">وظیفه‌ای برای این متولی وجود ندارد.</div>'};paint();if(q('[data-task-owner]',host))q('[data-task-owner]',host).onchange=paint;
  }else{host.innerHTML=`<div class="conversation-recipient-head"><h4>شروع گفت‌وگوی خصوصی</h4><input type="search" data-recipient-search placeholder="جست‌وجوی مخاطب…"></div><div class="conversation-recipient-grid">${people.map(personButton).join('')}</div>`;bamcoMedia.avatars(host,people)}
 }
 async function render(id){
  if(!Object.hasOwn(names,id))return;const epoch=++serial;currentView=id;selectedTask=null;window.bamcoChat?.close();const view=q('#'+id+'View');if(!view)return;
  view.innerHTML=`<div class="panel conversation-panel"><div class="panel-head"><h3>${names[id]}</h3></div><div class="manager-toolbar"><button type="button" class="ghost" data-conversation-refresh>تازه‌سازی</button>${id==='groupChat'?(isManager()?'<button type="button" class="ghost" data-create-group>＋ ایجاد گروه</button>':''):'<button type="button" class="ghost" data-new-conversation>＋ شروع گفت‌وگو</button>'}</div><div class="prod-chat conversation-layout"><section class="conversation-sidebar"><label class="conversation-search"><span>زنجیره‌های گفت‌وگو</span><input type="search" data-conversation-search placeholder="جست‌وجو…"></label><div class="conversation-list"></div></section><section class="conversation-stage"><div class="conversation-empty">یک زنجیره را انتخاب کنید یا گفت‌وگوی تازه‌ای شروع کنید.</div></section></div></div>`;
  try{if(id==='groupChat')await rpc('chat_ensure_public',{});if(epoch!==serial)return;const rows=await refreshThreads(view);if(epoch!==serial)return;const general=q('[data-kind=public]',view);if(general)await openThread(general,view);else if(!rows?.length&&id!=='groupChat')await newConversation(view)}catch(error){if(epoch===serial)failure(q('.conversation-list',view),error)}
 }
 async function openThread(button,view){
  const epoch=serial,host=q('.conversation-stage',view),id=button.dataset.thread,title=button.dataset.title,kind=button.dataset.kind;
  selectItem(button,q('.conversation-list',view));
  const readOnly=button.dataset.readOnly==='true',actions=[];
  if(kind==='group'){
   actions.push({label:isManager()?'تنظیمات گروه':'اطلاعات گروه',run:()=>groupDialog(id,title,!isManager(),button.dataset.groupPhoto||'')});
   actions.push({label:'خروج از گروه',run:async()=>{if(!await window.bamcoConfirm(`از گروه «${title}» خارج می‌شوید؟`))return;await rpc('chat_leave_group',{p_thread_id:id});if(epoch===serial)await render('groupChat')}});
  }
  if(!readOnly&&!['public','system'].includes(kind)&&isManager())actions.push(deleteAction(id,title,currentView));
  await window.bamcoChat.mount(host,{id,title,readOnly,companyLogo:kind==='public',personId:kind==='system'?null:button.dataset.personId||null,groupPhoto:button.dataset.groupPhoto||'',subtitle:readOnly?'حساب مخاطب حذف شده؛ سابقه گفت‌وگو':kind==='public'?'عمومی · همه کاربران':kind==='group'?'گروه · اعضای انتخاب‌شده':kind==='system'?'پیام‌های خودکار سامانه · پاسخ در همین زنجیره':button.dataset.taskId?'وظیفه '+digits((state.tasks||[]).find(t=>String(t.id)===button.dataset.taskId)?.legacy_id||button.dataset.taskId):'خصوصی',actions});
 }
 function deleteAction(id,title,view){return{label:'حذف گفت‌وگو',danger:true,run:async()=>{if(!await window.bamcoConfirm(`گفت‌وگوی «${title}» حذف شود؟`))return;await rpc('chat_delete_thread',{p_thread_id:id});await render(view)}}}
 async function chooseTask(button,view){
  const epoch=serial;selectedTask=(state.tasks||[]).find(t=>String(t.id)===button.dataset.taskChoice);if(!selectedTask)return;
  const task=selectedTask,host=q('.conversation-stage',view);selectItem(button,q('.conversation-list',view));window.bamcoChat.close();loading(host,'در حال دریافت مخاطبان…');
  try{const people=(await directory()).filter(p=>p.id!==state.user.id);if(epoch!==serial||selectedTask!==task)return;
   host.innerHTML=`<div class="conversation-recipient-head"><small>وظیفه ${esc(digits(task.legacy_id||task.id))}</small><h4>${esc(task.title)}</h4><p>با چه کسی درباره این وظیفه گفت‌وگو می‌کنید؟</p><input type="search" data-recipient-search placeholder="جست‌وجوی نام مخاطب…" aria-label="جست‌وجوی مخاطب"></div><div class="conversation-recipient-grid">${people.map(personButton).join('')||'<p>مخاطبی در دسترس نیست.</p>'}</div>`;
  bamcoMedia.avatars(host,people);
  }catch(error){if(epoch===serial)failure(host,error)}
 }
 async function choosePerson(button,view){
  const epoch=serial,task=selectedTask,host=q('.conversation-stage',view),userId=button.dataset.person,title=button.dataset.personName,route=view.id.replace(/View$/,'');
  button.disabled=true;
  try{const id=task?await rpc('chat_ensure_task_direct',{p_task_id:Number(task.id),p_other_user:userId}):await rpc('chat_ensure_direct',{p_other_user:userId});if(epoch!==serial||task!==selectedTask)return;
   if(route==='directMessages')selectItem(button,q('.conversation-list',view));
   await window.bamcoChat.mount(host,{id,personId:userId,title,subtitle:task?`وظیفه ${digits(task.legacy_id||task.id)} · ${task.title}`:'خصوصی · فقط این گفت‌وگو',actions:[...(task?[{label:'انتخاب وظیفه دیگر',run:()=>newConversation(view)}]:[]),...(isManager()?[deleteAction(id,title,route)]:[])]});
   await refreshThreads(view);
  }catch(error){failure(host,error)}finally{if(button.isConnected)button.disabled=false}
 }
 async function groupDialog(id=null,title='',readOnly=false,photoPath=''){
  let photoFile=null,removePhoto=false,previewUrl='';
  let dialog=q('#groupManageDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='groupManageDialog';dialog.className='modal bamco-dialog group-manage-dialog';document.body.append(dialog)}
  dialog.innerHTML='<div class="conversation-empty" role="status">در حال دریافت اعضا…</div>';dialog.showModal();
  try{const [people,members]=await Promise.all([directory(),id?rpc('chat_group_members',{p_thread_id:id}):Promise.resolve([])]);if(!dialog.open)return;
   const selected=new Set(members.map(m=>m.user_id));selected.add(state.user.id);const owners=new Set(members.filter(m=>m.member_role==='owner').map(m=>m.user_id));owners.add(state.user.id);
   dialog.innerHTML=`<form id="conversationGroupForm"><div class="modal-head"><div><h3>${readOnly?'اعضای گروه':id?'مدیریت گروه':'ایجاد گروه'}</h3><p>${readOnly?esc(title):'نام گروه را بنویسید و اعضا را انتخاب کنید.'}</p></div><button type="button" class="ghost bamco-icon-button" data-group-close aria-label="بستن">×</button></div>${readOnly?'':`<label>نام گروه<input name="title" required minlength="2" maxlength="120" value="${esc(title)}" placeholder="نام گروه"></label>`}${readOnly?'':`<div class="group-photo-picker"><span class="conversation-avatar group-photo-preview">♙</span><div><button type="button" class="ghost" data-choose-group-photo>انتخاب عکس گروه</button><button type="button" class="ghost" data-remove-group-photo>حذف عکس</button><small>PNG، JPG یا WebP؛ حداکثر ۵ مگابایت</small></div><input type="file" name="group_photo" accept="image/png,image/jpeg,image/webp" hidden></div>`}<label>جست‌وجوی اعضا<input type="search" data-member-search placeholder="نام فرد…"></label><div class="group-selection-count" role="status"></div><div class="group-member-grid">${people.filter(p=>!readOnly||selected.has(p.id)).map(p=>`<label class="group-member-option"><input type="checkbox" name="members" value="${p.id}" ${selected.has(p.id)?'checked':''} ${readOnly||owners.has(p.id)?'disabled':''}><span class="conversation-avatar" data-profile-photo="${esc(p.id)}">${esc(label(p).trim()[0])}</span><span><strong>${esc(label(p))}</strong><small>${p.id===state.user.id?'شما':p.role==='manager'?'مدیر':'متولی'}</small></span></label>`).join('')}</div><p class="form-error" role="alert"></p><div class="modal-actions">${readOnly?'':`<button type="submit" class="primary">${id?'ذخیره تغییرات':'ایجاد گروه'}</button>`}<button type="button" class="ghost" data-group-close>${readOnly?'بستن':'انصراف'}</button></div></form>`;
   bamcoMedia.avatars(dialog,people);
   if(!readOnly){const preview=q('.group-photo-preview',dialog),fileInput=q('[name=group_photo]',dialog),paint=src=>{preview.replaceChildren();if(src){const img=document.createElement('img');img.src=src;img.alt='عکس گروه';preview.append(img)}else preview.textContent='♙'};
    if(photoPath)bamcoMedia.get('group-avatars',photoPath).then(src=>{if(!photoFile&&!removePhoto&&dialog.open)paint(src)}).catch(()=>{});
    q('[data-choose-group-photo]',dialog).onclick=()=>fileInput.click();q('[data-remove-group-photo]',dialog).onclick=()=>{photoFile=null;removePhoto=true;fileInput.value='';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';paint('')};
    fileInput.onchange=()=>{const file=fileInput.files?.[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){q('.form-error',dialog).textContent='عکس باید PNG، JPG یا WebP و حداکثر ۵ مگابایت باشد.';fileInput.value='';return}photoFile=file;removePhoto=false;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);paint(previewUrl);q('.form-error',dialog).textContent=''};
    dialog.addEventListener('close',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},{once:true});
   }
   const count=()=>q('.group-selection-count',dialog).textContent=qa('input[name=members]:checked',dialog).length.toLocaleString('fa-IR')+' عضو انتخاب شده';count();dialog.onchange=count;
   q('[data-member-search]',dialog).oninput=e=>qa('.group-member-option',dialog).forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(e.target.value.trim().toLowerCase()));
   qa('[data-group-close]',dialog).forEach(b=>b.onclick=()=>dialog.close());
   q('form',dialog).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=q('[type=submit]',form),error=q('.form-error',form);if(!button||button.disabled)return;
    const ids=qa('input[name=members]:checked',form).map(x=>x.value),groupTitle=form.elements.title.value.trim();if(ids.length<2){error.textContent='حداقل یک نفر دیگر را به گروه اضافه کنید.';return}
    button.disabled=true;error.textContent='';try{if(id)await rpc('chat_manage_group',{p_thread_id:id,p_title:groupTitle,p_member_ids:ids,p_delete:false});else id=await rpc('chat_create_group',{p_title:groupTitle,p_member_ids:ids});if(photoFile){const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[photoFile.type],path=id+'/'+crypto.randomUUID()+'.'+ext,res=await fetch(SB_URL+'/storage/v1/object/group-avatars/'+path,{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':photoFile.type},body:photoFile});if(!res.ok)throw Error('گروه ذخیره شد، اما بارگذاری عکس انجام نشد؛ دوباره ذخیره کنید.');try{await rpc('chat_set_group_avatar',{p_thread_id:id,p_avatar_path:path})}catch(error){await fetch(SB_URL+'/storage/v1/object/group-avatars',{method:'DELETE',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})}).catch(()=>{});throw error}}else if(removePhoto)await rpc('chat_set_group_avatar',{p_thread_id:id,p_avatar_path:null});dialog.close();await render('groupChat');const view=q('#groupChatView'),saved=qa('[data-thread]',view).find(b=>b.dataset.thread===id);if(saved)await openThread(saved,view)}catch(err){error.textContent=err.message||'ذخیره گروه انجام نشد.'}finally{button.disabled=false}
   };
  }catch(error){dialog.innerHTML=`<p class="form-error" role="alert">${esc(error.message)}</p><button type="button" class="ghost" data-group-close>بستن</button>`;q('[data-group-close]',dialog).onclick=()=>dialog.close()}
 }
 document.addEventListener('click',async e=>{
  const view=e.target.closest('#groupChatView,#directMessagesView,#taskChatsView');if(!view)return;
  try{if(e.target.closest('[data-new-conversation]'))return newConversation(view);if(e.target.closest('[data-create-group]'))return groupDialog();if(e.target.closest('[data-conversation-refresh]'))return render(view.id.replace(/View$/,''));
   const thread=e.target.closest('[data-thread]');if(thread)return await openThread(thread,view);
   const task=e.target.closest('[data-task-choice]');if(task)return await chooseTask(task,view);
   const person=e.target.closest('[data-person]');if(person)return await choosePerson(person,view);
  }catch(error){failure(q('.conversation-stage',view),error)}
 });
 document.addEventListener('input',e=>{if(e.target.matches('[data-conversation-search],[data-recipient-search]')){const host=e.target.closest('.conversation-sidebar,.conversation-stage');qa('.conversation-item',host).forEach(b=>b.hidden=!b.textContent.toLowerCase().includes(e.target.value.trim().toLowerCase()))}});
 document.addEventListener('click',e=>{if(e.target.closest('.content-back,#nav [data-view]')){serial++;window.bamcoChat?.close()}},true);
 const refreshCurrent=()=>{const view=q('#'+currentView+'View');if(state.token&&view&&!view.classList.contains('hidden'))return refreshThreads(view)};document.addEventListener('bamco-inbox-updated',()=>{refreshCurrent()?.catch(error=>console.warn('Conversation list',error.message))});
 window.bamcoConversations={refresh:refreshCurrent,syncUnread,syncUnreadTotal,async open(threadId){const rows=await rpc('chat_conversation_list',{}),t=rows.find(x=>x.id===threadId);if(!t)throw Error('این گفت‌وگو در دسترس نیست.');const route=routeFor(t);showView(route);await render(route);const view=q('#'+route+'View'),button=qa('[data-thread]',view).find(b=>b.dataset.thread===threadId);if(button)await openThread(button,view)},owns:id=>Object.hasOwn(names,id),render,close(){serial++;selectedTask=null;window.bamcoChat?.close()}};
})();

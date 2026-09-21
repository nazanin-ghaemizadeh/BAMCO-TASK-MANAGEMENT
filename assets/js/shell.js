/* module:shell:1 */
(()=>{
  'use strict';
  const q=(s,root=document)=>root.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace)return;
  nav.insertAdjacentHTML('beforeend','<button data-view="people" class="manager-only"><b>♙</b><span>افراد و نقش‌ها</span></button><button data-view="templates" class="manager-only"><b>≡</b><span>متن پیام‌ها</span></button><button data-view="stickers" class="manager-only"><b>◇</b><span>مدیریت استیکرها</span></button><button data-view="settings"><b>⚙</b><span>تنظیمات</span></button>');
  workspace.insertAdjacentHTML('beforeend',`
  <section id="peopleView" class="view hidden manager-only"><div class="panel table-panel"><div class="panel-head"><div><h3>مدیریت افراد و نقش‌ها</h3><small>نقش سازمانی از جایگاه در ساختار سازمانی خوانده می‌شود؛ سطح دسترسی سامانه جداست.</small></div><input id="peopleSearch" class="search" placeholder="جست‌وجو…"></div><div class="people-actions"><button id="addPersonBtn" class="primary">＋ افزودن فرد</button><button id="editPersonBtn" class="ghost">ویرایش</button><button id="deletePersonBtn" class="danger">حذف</button></div><div class="table-wrap"><table class="manager-table"><thead><tr><th>فرد</th><th>نقش سازمانی</th><th>سمت سازمانی</th><th>دسترسی سامانه</th><th>جنسیت</th><th>پست الکترونیک سازمانی</th><th>نام کاربری</th><th>رمز عبور</th><th>عنوان خطاب</th><th>فعال</th></tr></thead><tbody id="peopleBody"></tbody></table></div></div></section>
  <section id="templatesView" class="view hidden manager-only"><div class="panel"><div class="panel-head"><div><h3>متن پیام‌ها</h3><small>متن پیام داخل سامانه بر اساس وضعیت متولی</small></div><div class="manager-toolbar"><select id="templateState"><option value="state1">وضعیت مطلوب</option><option value="state2">یادآوری</option><option value="state3">نیازمند توجه</option><option value="state4">پیگیری جدی</option><option value="state5">اقدام فوری</option><option value="followup">یادآوری مجدد</option></select><button id="saveTemplateBtn" class="primary">ذخیره متن</button></div></div><div class="manager-note">متغیرها: [عنوان مخاطب]، [تعداد هشدار]، [تعداد دیرکرد]، [جدول امور هشداری]، [جدول امور دیرکردی]، [استیکر] و [تاریخ گزارش]</div><textarea id="templateBody" class="template-editor"></textarea></div></section>
  <section id="stickersView" class="view hidden manager-only"><div class="panel"><div class="panel-head"><div><h3>مدیریت استیکرها</h3><small>نسخه را تعریف کنید و ده تصویر آن را در پایگاه داده بارگذاری کنید.</small></div></div><div id="stickerGrid" hidden></div></div></section>
  <section id="settingsView" class="view hidden"><div class="panel"><div class="panel-head"><div><h3>تنظیمات حساب کاربری</h3><small>نام نمایشی، تصویر پروفایل و امنیت حساب</small></div></div><div class="manager-form"><label>نام نمایشی<input id="profileDisplayName"></label><label>پست الکترونیک سازمانی<input id="profileEmail" class="english" dir="ltr" readonly></label><label>نام کاربری<input id="profileLoginName" class="english" dir="ltr" autocomplete="off" spellcheck="false"></label><div class="profile-photo-field"><div id="profileAvatarPreview" class="profile-avatar-preview">ب</div><div><b>تصویر پروفایل</b><p>PNG، JPG یا WebP تا ۸ مگابایت</p><button id="chooseAvatarBtn" type="button" class="ghost">انتخاب و تنظیم عکس</button><input id="profileAvatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></div></div><div class="account-security-box"><div><h4>تغییر رمز عبور</h4><p>رمز حساب خود را از این بخش تغییر دهید.</p></div><button id="changePasswordBtn" type="button" class="primary">تغییر رمز عبور</button></div></div><div class="modal-actions"><button id="saveProfileBtn" class="primary">ذخیره تنظیمات حساب</button></div></div></section>
  <dialog id="personDialog" class="modal manager-modal"><form id="personForm"><div class="modal-head"><div><h3 id="personDialogTitle">افزودن فرد</h3><p>نقش سازمانی پس از ثبت شخص، از طریق جایگاه او در ساختار سازمانی تعیین می‌شود.</p></div><button type="button" data-person-close>×</button></div><div class="manager-form"><label>نام فرد<input name="full_name" required></label><label>سطح دسترسی سامانه<select name="system_access"><option value="owner">کاربر سامانه</option><option value="manager">مدیر سامانه</option></select></label><label>جنسیت<select name="gender"><option>آقا</option><option>خانم</option></select></label><label>پست الکترونیک سازمانی (اختیاری)<input name="email" class="english" dir="ltr" type="email" placeholder="name@bamco.ir"></label><label>عنوان خطاب<input name="salutation"></label><label class="person-message-channel">کانال پیش‌فرض پیام<select name="default_message_channel"><option value="portal">داخل سامانه</option><option value="email">ایمیل</option><option value="both">هر دو</option></select><small>بدون ایمیل، پیام فقط داخل سامانه ارسال می‌شود.</small></label><label>فعال<select name="active"><option value="true">بله</option><option value="false">خیر</option></select></label></div><div id="personLoginActions" class="modal-actions hidden"><button id="editPersonLoginBtn" class="ghost" type="button">نام کاربری و رمز موقت</button></div><p id="personError" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="ghost" data-person-close>انصراف</button><button type="submit" class="primary">ذخیره</button></div></form></dialog>`);
  document.body.append(q('#personDialog'));
  let people=[],editing=null,selected=new Set();
  function syncPersonSelection(){
    selected=new Set([...selected].filter(id=>people.some(p=>p.id===id)));
    document.querySelectorAll('#peopleBody tr[data-id]').forEach(row=>{const chosen=selected.has(row.dataset.id);row.classList.toggle('person-selected',chosen);row.setAttribute('aria-selected',String(chosen))});
    q('#editPersonBtn').disabled=!people.length;q('#editPersonBtn').title=selected.size>1?'ویرایش فقط برای یک فرد مجاز است':'ویرایش فرد';q('#deletePersonBtn').disabled=!selected.size;
  }
  document.addEventListener('bamco-selection-change',e=>{if(e.target.closest('#peopleView')){selected=new Set(e.detail.ids);syncPersonSelection()}});
  async function edge(body={},method='POST'){const result=await api('/functions/v1/admin-users',{method,body});if(!result?.ok)throw new Error(result?.error||'عملیات حساب کاربری تأیید نشد.');return result}
  function mergeProfile(previous,incoming){
    if(!previous)return {...incoming};
    const oldTime=Date.parse(previous.updated_at)||0,newTime=Date.parse(incoming.updated_at)||0;
    if(oldTime>newTime)return {...incoming,...previous};
    return {...previous,...incoming};
  }
  function syncProfiles(rows,{replaceAll=false}={}){
    const known=new Map([...(state.profiles||[]),...people,state.profile].filter(Boolean).map(p=>[p.id,p]));
    const merged=(rows||[]).map(p=>mergeProfile(known.get(p.id),p));
    for(const p of merged)known.set(p.id,p);
    state.profiles=replaceAll?merged:[...known.values()];
    people=replaceAll?merged:people.map(p=>known.get(p.id)||p);
    if(state.profile&&known.has(state.profile.id))state.profile=known.get(state.profile.id);
    void window.bamcoMedia?.avatars(document,state.profiles);
    void window.refreshProfileAvatar?.();
    return state.profiles;
  }
  let peopleLoad=null,profileRefresh=null,lastProfileRefresh=0;
  async function loadPeople({refreshOrganization=true}={}){
    if(peopleLoad)return peopleLoad;
    const user=state.user?.id,session=window.bamcoAuth?.snapshot?.();
    const job=(async()=>{
      const rows=await select('profiles','select=id,email,login_name,must_change_password,password_changed_at,full_name,display_name,role,gender,salutation,active,default_message_channel,messaging_enabled,avatar_path,updated_at&order=full_name');
      if(!state.token||state.user?.id!==user||(session&&!window.bamcoAuth.isCurrent(session)))return;
      syncProfiles(rows,{replaceAll:true});renderPeople();
      if(refreshOrganization)try{await window.bamcoOrganization?.load?.({ensureProfiles:false});renderPeople()}catch{}
    })();peopleLoad=job;
    try{return await job}finally{if(peopleLoad===job)peopleLoad=null}
  }
  async function refreshProfileMetadata(force=false){
    if(typeof state==='undefined'||!state.token||!state.user||document.hidden)return;
    if(profileRefresh||(!force&&Date.now()-lastProfileRefresh<15000))return profileRefresh;
    lastProfileRefresh=Date.now();
    const user=state.user.id,session=window.bamcoAuth?.snapshot?.();
    const job=(async()=>{
      if(isManager()&&!q('#peopleView').classList.contains('hidden'))return loadPeople();
      const rows=await select('profiles',`id=eq.${user}&select=*`);
      if(!state.token||state.user?.id!==user||(session&&!window.bamcoAuth.isCurrent(session)))return;
      if(rows.length)syncProfiles(rows);
    })();profileRefresh=job;
    try{return await job}catch{ /* Keep the last confirmed image when offline. */ }
    finally{if(profileRefresh===job)profileRefresh=null}
  }
  function organizationFor(person){return window.bamcoOrganization?.userOrganization?.(person.id)||null}
  function organizationRole(person){return organizationFor(person)?.role?.title||'بدون نقش سازمانی'}
  function organizationPosition(person){return organizationFor(person)?.position?.title||'بدون جایگاه'}
  function systemAccess(person){return person.role==='manager'?'مدیر سامانه':'کاربر سامانه'}
  function renderPeople(){const term=q('#peopleSearch').value.trim().toLowerCase(),rows=people.filter(p=>!term||[p.full_name,p.email,p.login_name,p.salutation,organizationRole(p),organizationPosition(p)].some(v=>String(v||'').toLowerCase().includes(term)));q('#peopleBody').innerHTML=rows.map(p=>{const initial=esc(String(p.display_name||p.full_name||'ب').trim().charAt(0)||'ب');return `<tr data-id="${p.id}" class="${selected.has(p.id)?'person-selected':''}"><td><span class="people-avatar" data-profile-photo="${esc(p.id)}" aria-label="تصویر ${esc(p.full_name)}">${initial}</span>${esc(p.full_name)}</td><td>${esc(organizationRole(p))}</td><td>${esc(organizationPosition(p))}</td><td>${esc(systemAccess(p))}</td><td>${esc(p.gender||'—')}</td><td class="english">${esc(p.email||'—')}</td><td class="english" dir="ltr">${esc(p.login_name||'—')}</td><td><button type="button" class="ghost" data-person-credentials="${esc(p.id)}" title="ویرایش نام کاربری و تعیین رمز موقت">${p.must_change_password?'رمز موقت؛ نیازمند تغییر':'تعیین رمز جدید'}</button>${p.password_changed_at?`<small class="credential-date">آخرین تغییر: ${esc(new Date(p.password_changed_at).toLocaleString('fa-IR'))}</small>`:''}</td><td>${esc(p.salutation||'—')}</td><td>${p.active!==false?'بله':'خیر'}</td></tr>`}).join('')||'<tr><td colspan="10" class="empty">کاربری ثبت نشده است.</td></tr>';syncPersonSelection();if(window.bamcoMedia?.avatars)void window.bamcoMedia.avatars(q('#peopleBody'),rows)}
  function syncMessageAvailability(){const f=q('#personForm'),hasEmail=!!f.elements.email.value.trim(),channel=f.elements.default_message_channel;channel.disabled=false;[...channel.options].forEach(o=>o.disabled=o.value!=='portal'&&!hasEmail);if(!hasEmail||!channel.value)channel.value='portal';q('#personLoginActions').classList.toggle('hidden',!editing)}
  function openPerson(p=null){editing=p;const f=q('#personForm');f.reset();q('#personError').textContent='';f.elements.system_access.value='owner';f.elements.active.value='true';if(p){for(const k of ['full_name','gender','email','salutation','active','default_message_channel'])if(f.elements[k])f.elements[k].value=String(p[k]??'');f.elements.system_access.value=p.role==='manager'?'manager':'owner'}q('#personDialogTitle').textContent=p?'ویرایش فرد':'افزودن فرد';syncMessageAvailability();q('#personDialog').showModal()}
  function pickPersonToEdit(){
    if(selected.size>1)return toast('برای ویرایش فقط یک فرد را انتخاب کنید. حذف چندتایی مجاز است.',true);
    const person=people.find(p=>selected.has(p.id));if(person)return openPerson(person);
    let dialog=q('#personPickerDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='personPickerDialog';dialog.className='modal small bamco-dialog';document.body.append(dialog)}
    dialog.innerHTML=`<form><div class="modal-head"><h3>انتخاب فرد برای ویرایش</h3></div><label>فرد<select name="person" required><option value="">انتخاب کنید…</option>${people.map(p=>`<option value="${esc(p.id)}">${esc(p.full_name)} — ${esc(organizationRole(p))}</option>`).join('')}</select></label><div class="modal-actions"><button type="submit" class="primary">ویرایش</button><button type="button" class="ghost">انصراف</button></div></form>`;
    q('button[type=button]',dialog).onclick=()=>dialog.close();q('form',dialog).onsubmit=e=>{e.preventDefault();const p=people.find(p=>p.id===e.currentTarget.elements.person.value);if(!p)return;window.bamcoSelection.set('#peopleBody',[p.id]);dialog.close();openPerson(p)};dialog.showModal();
  }
  async function savePerson(e){
    e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type="submit"]');if(submit.disabled)return;
    const data=Object.fromEntries(new FormData(form));data.role=data.system_access;delete data.system_access;data.active=data.active==='true';data.email=String(data.email||'').trim()||null;data.messaging_enabled=true;data.default_message_channel=data.email?(data.default_message_channel||'portal'):'portal';if(editing)data.user_id=editing.id;
    q('#personError').textContent='';submit.disabled=true;
    try{const result=await edge(data);q('#personDialog').close();if(result.temporary_password)showInitialCredentials(result);await loadPeople();if(!result.temporary_password)toast('اطلاعات فرد ذخیره شد.')}
    catch(err){q('#personError').textContent=err.message;toast(err.message,true)}
    finally{submit.disabled=false}
  }
  function showInitialCredentials(result){
    let dialog=q('#initialCredentials');if(!dialog){dialog=document.createElement('dialog');dialog.id='initialCredentials';dialog.className='modal bamco-dialog';dialog.setAttribute('aria-labelledby','initialCredentialsTitle');document.body.append(dialog)}
    const editable=!!result.credential_editable,created=!!result.temporary_password;
    dialog.innerHTML=`<form><div class="modal-head"><h3 id="initialCredentialsTitle">${created?'حساب ساخته شد':'اطلاعات ورود فرد'}</h3></div><p>${created?'رمز موقت فقط همین‌بار نمایش داده می‌شود. آن را امن به کاربر تحویل دهید؛ کاربر در اولین ورود رمز خود را تغییر می‌دهد.':'برای تعیین رمز موقت جدید، کادر رمز را تکمیل کنید. خالی بماند، رمز فعلی تغییر نمی‌کند.'}</p><div class="credentials-field"><label for="initialLoginName"><span>نام کاربری</span></label><input id="initialLoginName" name="login_name" class="english" dir="ltr" ${editable?'required':'readonly'} autocomplete="off" spellcheck="false" value="${esc(result.login_name)}"></div><div class="credentials-field"><label for="initialTemporaryPassword"><span>رمز عبور موقت</span></label><input id="initialTemporaryPassword" name="temporary_password" class="english" dir="ltr" ${editable?'minlength="12"':'readonly'} autocomplete="new-password" spellcheck="false" value="${esc(result.temporary_password||'')}"></div><p class="form-error" role="alert"></p><div class="modal-actions">${editable?'<button type="submit" class="primary">ذخیره اطلاعات ورود</button>':''}<button type="button" class="ghost">${created?'ثبت کردم؛ بستن':'بستن'}</button></div></form>`;
    const form=q('form',dialog);let busy=false;
    q('button[type="button"]',dialog).onclick=()=>{if(!busy)dialog.close()};
    dialog.oncancel=event=>{if(busy)event.preventDefault()};
    form.onsubmit=async event=>{
      event.preventDefault();if(!editable||busy)return;busy=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);q('.form-error',dialog).textContent='';
      try{const saved=await edge({action:'save_credentials',user_id:result.id,login_name:form.elements.login_name.value,temporary_password:form.elements.temporary_password.value});form.elements.login_name.value=saved.login_name;q('#initialCredentialsTitle').textContent='اطلاعات ورود ذخیره شد';result.login_name=saved.login_name;await loadPeople();if(state.profile.id===result.id){state.profile.login_name=saved.login_name;state.user.email=saved.login_name.includes('@')?saved.login_name:saved.login_name+'@no-email.invalid'}void window.bamcoInbox?.load();}
      catch(err){q('.form-error',dialog).textContent=err.message}
      finally{busy=false;buttons.forEach(b=>b.disabled=false)}
    };
    dialog.addEventListener('close',()=>dialog.replaceChildren(),{once:true});dialog.showModal();
  }
  async function editPersonLogin(){
    if(!editing)return;const personId=editing.id,button=q('#editPersonLoginBtn');button.disabled=true;
    try{const result=await edge({action:'get_credentials',user_id:personId});if(editing?.id===personId&&q('#personDialog').open)showInitialCredentials(result)}catch(err){q('#personError').textContent=err.message}finally{button.disabled=false}
  }
  let deletingPeople=false;
  async function removePerson(){
    if(deletingPeople)return;const chosen=people.filter(p=>selected.has(p.id));if(!chosen.length)return toast('حداقل یک فرد را انتخاب کنید.',true);
    deletingPeople=true;const button=q('#deletePersonBtn');button.disabled=true;
    try{
      if(!await window.bamcoConfirm(`حساب ${chosen.length.toLocaleString('fa-IR')} فرد انتخاب‌شده برای همیشه حذف شود؟\n${chosen.map(p=>p.full_name).join('، ')}\nحساب، نشست‌ها و دسترسی‌ها حذف می‌شوند. وظایف و تاریخ‌هایشان باقی می‌مانند؛ متولی جدید را در کانبان برای هر وظیفه جداگانه انتخاب کنید. سوابق و درخواست‌های باز برای بررسی باقی می‌مانند؛ پیام‌های در صف به این حساب متوقف می‌شوند.`))return;
      let retained=0;const errors=[],failed=[],warnings=[],deleted=[],activeTasks=[];
      for(const p of chosen){try{const result=await edge({user_id:p.id},'DELETE');deleted.push(p);retained+=Number(result.tasks_retained||0);if(Array.isArray(result.active_tasks))activeTasks.push(...result.active_tasks);if(result.cleanup_warning)warnings.push(result.cleanup_warning)}catch(err){failed.push(p.id);errors.push(p.full_name+': '+err.message)}}
      const deletedIds=new Set(deleted.map(p=>p.id));people=people.filter(p=>!deletedIds.has(p.id));state.profiles=state.profiles.filter(p=>!deletedIds.has(p.id));renderPeople();window.bamcoSelection.set('#peopleBody',failed);
      if(deleted.length)window.bamcoTaskTransfer.open(deleted,activeTasks,retained);
      if(errors.length||warnings.length)toast(`${deleted.length.toLocaleString('fa-IR')} حساب حذف شد.\n`+[...errors,...warnings].join('\n'),true);
    }catch(err){toast(err.message,true)}finally{deletingPeople=false;syncPersonSelection()}
  }
  let pendingBlob=null,pendingUrl='',cropImage=null,zoom=1,offX=0,offY=0,drag=false,last=null;
  function paint(el,url=''){if(!el)return;el.textContent=(state.profile.display_name||state.profile.full_name||'ب').trim()[0];el.classList.toggle('has-image',!!url);el.style.backgroundImage=url?`url("${url}")`:''}
  window.refreshProfileAvatar=()=>Promise.all([q('#avatar'),q('#profileAvatarPreview')].filter(Boolean).map(el=>window.bamcoMedia.bindAvatar(el,state.profile)));
  function metrics(){const base=Math.max(360/cropImage.naturalWidth,360/cropImage.naturalHeight),scale=base*zoom,maxX=Math.max(0,(cropImage.naturalWidth*scale-360)/2),maxY=Math.max(0,(cropImage.naturalHeight*scale-360)/2);offX=Math.max(-maxX,Math.min(maxX,offX));offY=Math.max(-maxY,Math.min(maxY,offY));return{scale,x:(360-cropImage.naturalWidth*scale)/2+offX,y:(360-cropImage.naturalHeight*scale)/2+offY}}
  function draw(){if(!cropImage)return;const c=q('#avatarCropCanvas'),ctx=c.getContext('2d'),m=metrics();ctx.clearRect(0,0,360,360);ctx.drawImage(cropImage,m.x,m.y,cropImage.naturalWidth*m.scale,cropImage.naturalHeight*m.scale);ctx.fillStyle='rgba(5,25,19,.55)';ctx.beginPath();ctx.rect(0,0,360,360);ctx.arc(180,180,164,0,Math.PI*2,true);ctx.fill('evenodd');ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(180,180,164,0,Math.PI*2);ctx.stroke()}
  function openCrop(file){if(!file)return;if(file.size>8*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('فایل باید تصویر PNG، JPG یا WebP و حداکثر ۸ مگابایت باشد.',true);const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);cropImage=img;zoom=1;offX=offY=0;q('#avatarCropZoom').value=1;draw();q('#avatarCropDialog').showModal()};img.onerror=()=>toast('تصویر قابل خواندن نیست.',true);img.src=url}
  function point(e){const r=q('#avatarCropCanvas').getBoundingClientRect();return{x:(e.clientX-r.left)*360/r.width,y:(e.clientY-r.top)*360/r.height}}
  function applyCrop(){if(!cropImage)return;const out=document.createElement('canvas'),m=metrics(),ctx=out.getContext('2d');out.width=out.height=512;ctx.save();ctx.beginPath();ctx.arc(256,256,256,0,Math.PI*2);ctx.clip();ctx.drawImage(cropImage,m.x*512/360,m.y*512/360,cropImage.naturalWidth*m.scale*512/360,cropImage.naturalHeight*m.scale*512/360);ctx.restore();out.toBlob(blob=>{if(!blob)return toast('آماده‌سازی تصویر انجام نشد.',true);pendingBlob=blob;q('#profileAvatarPreview').dataset.avatarDraft='true';if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl=URL.createObjectURL(blob);paint(q('#profileAvatarPreview'),pendingUrl);q('#avatarCropDialog').close();toast('برش عکس آماده است؛ ذخیره تنظیمات حساب را بزنید.');},'image/png')}
  async function saveProfile(){
    const button=q('#saveProfileBtn');if(button.disabled)return;button.disabled=true;
    const user=state.user?.id,profileId=state.profile.id,session=window.bamcoAuth?.snapshot?.(),savedBlob=pendingBlob;
    const current=()=>state.user?.id===user&&!!state.token&&(!session||window.bamcoAuth.isCurrent(session));
    try{
      const login=q('#profileLoginName').value.trim().toLowerCase();
      if(login!==(state.profile.login_name||state.user?.email||'')){
        const saved=await edge({action:'save_own_login',login_name:login});
        if(!current())return;
        state.profile.login_name=saved.login_name;
        state.user.email=saved.login_name.includes('@')?saved.login_name:saved.login_name+'@no-email.invalid';
        void window.bamcoInbox?.load();
      }
      const display_name=q('#profileDisplayName').value.trim();let avatar_path=state.profile.avatar_path||null;
      if(savedBlob){
        // Never overwrite a cached object. Updating the profile row publishes the new image.
        avatar_path=`${profileId}/avatar-${crypto.randomUUID()}.png`;
        const path=avatar_path.split('/').map(encodeURIComponent).join('/');
        const response=await fetch(`${SB_URL}/storage/v1/object/avatars/${path}`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`,'x-upsert':'false','Content-Type':'image/png'},body:savedBlob});
        if(!response.ok)throw new Error((await response.json().catch(()=>({}))).message||'آپلود تصویر انجام نشد.');
      }
      if(!current())return;
      const rows=await update('profiles',`id=eq.${profileId}`,{display_name,avatar_path,updated_at:new Date().toISOString()});
      if(!current())return;
      const saved=rows?.find(p=>p.id===profileId);
      if(!saved||saved.avatar_path!==avatar_path)throw new Error('ذخیره تصویر در حساب تأیید نشد؛ دوباره تلاش کنید.');
      if(pendingBlob===savedBlob){
        pendingBlob=null;q('#profileAvatarPreview').removeAttribute('data-avatar-draft');
        if(pendingUrl){URL.revokeObjectURL(pendingUrl);pendingUrl=''}
      }
      syncProfiles([{...state.profile,...saved}]);
      if(!q('#peopleView').classList.contains('hidden'))renderPeople();
      q('#userName').textContent=display_name||state.profile.full_name;
      await window.refreshProfileAvatar();
      profileChannel?.postMessage({type:'profile-saved'});
      toast('تنظیمات حساب و تصویر پروفایل ذخیره و همگام شد.');
    }catch(err){if(current())toast(err.message,true)}finally{button.disabled=false}
  }
  function loadSettings(){q('#profileDisplayName').value=state.profile.display_name||state.profile.full_name||'';q('#profileEmail').value=state.profile.email||'';q('#profileLoginName').value=state.profile.login_name||state.user?.email||'';window.refreshProfileAvatar()}
  window.bamcoPeople={refresh:loadPeople,syncProfiles,refreshProfileMetadata,async open(id){if(!isManager())return;showView('people');await loadPeople();const person=people.find(p=>p.id===id);if(person){window.bamcoSelection.set('#peopleBody',[id]);openPerson(person)}}};
  window.bamcoAccount={open(){showView('settings');loadSettings()}};
  let profileChannel=null;try{if(window.BroadcastChannel){profileChannel=new BroadcastChannel('bamco-profile-sync');profileChannel.onmessage=e=>{if(e.data?.type==='profile-saved')void refreshProfileMetadata(true)}}}catch{}
  addEventListener('focus',()=>void refreshProfileMetadata());
  addEventListener('pageshow',()=>void refreshProfileMetadata());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshProfileMetadata()});
  setInterval(()=>void refreshProfileMetadata(),30000);
  document.addEventListener('click',e=>{if(e.target.closest('#logoutBtn')){
    people=[];peopleLoad=null;profileRefresh=null;lastProfileRefresh=0;pendingBlob=null;
    if(pendingUrl)URL.revokeObjectURL(pendingUrl);pendingUrl='';q('#profileAvatarPreview').removeAttribute('data-avatar-draft');
  }});

  document.addEventListener('DOMContentLoaded',()=>{
    q('#peopleBody').addEventListener('click',async e=>{const button=e.target.closest('[data-person-credentials]');if(!button)return;e.stopPropagation();if(selected.size>1)return toast('برای ویرایش اطلاعات ورود فقط یک فرد را انتخاب کنید.',true);button.disabled=true;try{showInitialCredentials(await edge({action:'get_credentials',user_id:button.dataset.personCredentials}))}catch(err){toast(err.message,true)}finally{button.disabled=false}});
    syncPersonSelection();q('#peopleSearch').addEventListener('input',renderPeople);q('#peopleBody').addEventListener('dblclick',e=>{if(e.target.closest('button'))return;if(selected.size>1)return toast('برای ویرایش فقط یک فرد را انتخاب کنید.',true);const row=e.target.closest('[data-id]'),person=people.find(x=>x.id===row?.dataset.id);if(person){window.bamcoSelection.set('#peopleBody',[person.id]);openPerson(person)}});q('#addPersonBtn').addEventListener('click',()=>openPerson());q('#editPersonBtn').addEventListener('click',pickPersonToEdit);q('#deletePersonBtn').addEventListener('click',removePerson);q('#personForm').addEventListener('submit',savePerson);q('#editPersonLoginBtn').addEventListener('click',editPersonLogin);q('#personForm').elements.email.addEventListener('input',syncMessageAvailability);document.querySelectorAll('[data-person-close]').forEach(x=>x.addEventListener('click',()=>q('#personDialog').close()));
    q('#chooseAvatarBtn').addEventListener('click',()=>q('#profileAvatar').click());q('#profileAvatar').addEventListener('change',e=>{openCrop(e.target.files[0]);e.target.value=''});q('#avatarCropZoom').addEventListener('input',e=>{zoom=Number(e.target.value);draw()});const canvas=q('#avatarCropCanvas');canvas.addEventListener('pointerdown',e=>{drag=true;last=point(e);canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=point(e);offX+=p.x-last.x;offY+=p.y-last.y;last=p;draw()});canvas.addEventListener('pointerup',()=>drag=false);canvas.addEventListener('pointercancel',()=>drag=false);q('#applyAvatarCrop').addEventListener('click',applyCrop);q('#saveProfileBtn').addEventListener('click',saveProfile);q('#changePasswordBtn').addEventListener('click',()=>{q('#cancelPasswordBtn').classList.remove('hidden');q('#passwordForm').reset();q('#passwordDialog').showModal()});
    q('#nav').addEventListener('click',e=>{const view=e.target.closest('button[data-view]')?.dataset.view;if(view==='people'&&isManager())loadPeople().catch(err=>toast(err.message,true));if(view==='settings')setTimeout(loadSettings)});
    document.addEventListener('bamco:organization-updated',()=>{if(!q('#peopleView').classList.contains('hidden'))renderPeople()});
  });
})();



/* Avatar rendering is owned by bamcoMedia; no competing timed loaders. */

/* Inbox displays the same immutable report used by the sender. Sending is owned by message-center. */
(()=>{
 const q=s=>document.querySelector(s),nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace)return;let rows=[],alerts=[],epoch=0,lastAlertSignature='',threadNames=new Map();const pendingDismissals=new Set();const kinds={credentials_changed:'تغییر اطلاعات ورود',public_chat:'گفت‌وگوی عمومی',group_chat:'گروه',direct_chat:'شخصی',task_chat:'گفت‌وگوی وظیفه',daily:'گزارش وضعیت امور روزانه',reminder:'یادآور',manual:'پیام سامانه',system:'پیام سامانه',system_reply:'پاسخ به پیام سامانه'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 nav.insertAdjacentHTML('beforeend','<button data-view="messages"><b>✉</b><span>پیام‌ها</span><i id="messageBadge" class="message-badge"></i></button><button data-view="sentMessages" class="manager-only"><b>✓</b><span>پیام‌های ارسال‌شده</span></button>');
 workspace.insertAdjacentHTML('beforeend','<section id="messagesView" class="view hidden"><div class="panel"><div class="panel-head"><h3>پیام‌های من</h3></div><div class="manager-toolbar"><button id="refreshMessages" class="ghost">تازه‌سازی</button><button id="clearAllMessages" class="danger" type="button" disabled>پاک کردن همه اعلان‌ها</button></div><div id="messageList" class="message-list"></div></div></section><section id="sentMessagesView" class="view hidden manager-only"></section>');
 let loading=null;
 async function load(){if(loading)return loading;const job=loadInbox();loading=job;try{return await job}finally{if(loading===job)loading=null}}
 async function loadInbox(){if(!state.profile||state.profile.must_change_password||pendingDismissals.size)return;const run=++epoch;try{const [received,deliveries,snapshots,notes]=await Promise.all([selectAll('portal_message_recipients',`recipient_id=eq.${state.profile.id}&dismissed_at=is.null&select=*,portal_messages(*)&order=message_id.desc`),selectAll('message_deliveries',`recipient_id=eq.${state.profile.id}&channel=eq.portal&select=portal_message_id,snapshot_id,chat_thread_id`),selectAll('message_snapshots',`recipient_id=eq.${state.profile.id}&select=*`),selectAll('notifications',`user_id=eq.${state.profile.id}&dismissed_at=is.null&select=*&order=created_at.desc`)]);if(run!==epoch||!state.profile)return;const changed=lastAlertSignature!==JSON.stringify(notes);alerts=notes,unreadChatNotes=alerts.filter(x=>!x.read_at&&x.entity_type==='chat_thread').length;window.bamcoConversations?.syncUnreadTotal?.(unreadChatNotes);if(changed){const threads=await rpc('chat_conversation_list',{});if(run!==epoch||!state.profile)return;window.bamcoConversations?.syncUnread?.(threads);window.bamcoConversations?.syncUnreadTotal?.(Math.max(unreadChatNotes,threads.reduce((sum,t)=>sum+(Number(t.unread_count)||0),0)));threadNames=new Map(threads.map(t=>[t.id,t.task_id?'وظیفه '+fa(t.task_id)+' · '+t.title:t.title]));lastAlertSignature=JSON.stringify(notes);document.dispatchEvent(new CustomEvent('bamco-inbox-updated'))}const linked=new Set(deliveries.filter(d=>d.chat_thread_id).map(d=>String(d.portal_message_id)));rows=received.filter(x=>!linked.has(String(x.message_id)));const snapById=new Map(snapshots.map(s=>[String(s.id),s])),byMessage=new Map(deliveries.map(d=>[String(d.portal_message_id),snapById.get(String(d.snapshot_id))]));q('#messageBadge').textContent=fa(rows.filter(x=>!x.read_at).length+alerts.filter(x=>!x.read_at).length).replace(/^۰$/,'');
 q('#messageList').innerHTML=alerts.map(n=>`<article tabindex="0" role="button" class="message-card message-notification ${n.read_at?'':'unread'}" data-notification="${n.id}"><div class="message-meta"><span class="message-kind">${esc(kinds[n.notification_type]||'اعلان سامانه')}</span><time>${jalaliDateTime(n.created_at)}</time><button type="button" class="message-dismiss" data-dismiss-notification="${n.id}" aria-label="حذف اعلان از پیام‌های من" title="حذف اعلان">×</button></div><h4>${esc(kinds[n.notification_type]&&n.entity_type==='chat_thread'&&!['daily','reminder','manual','system'].includes(n.notification_type)?threadNames.get(n.entity_id)||n.title:n.title)}</h4><p>${esc(n.body||'')}</p><span class="message-open">باز کردن ${n.entity_type==='chat_thread'?'گفت‌وگو':'جزئیات'} ←</span></article>`).join('')+rows.map(x=>{const m=x.portal_messages||{},s=byMessage.get(String(x.message_id));return `<article class="message-card ${x.read_at?'':'unread'}" data-mid="${x.message_id}"><div class="message-meta"><b>${esc(m.subject)}</b><span>${jalaliDateTime(m.created_at)}</span><button type="button" class="message-dismiss" data-dismiss-message="${x.message_id}" aria-label="حذف پیام از پیام‌های من" title="حذف پیام">×</button></div><div class="message-report-body">${s?BamcoMessageRender.html(s):`<p style="white-space:pre-wrap">${esc(m.body)}</p>`}</div><div class="message-actions">${m.require_ack&&!x.acknowledged_at?'<button class="ghost ack-message">تأیید دریافت</button>':''}${m.allow_reply?`<button class="ghost reply-message">${x.replied_at?'ویرایش پاسخ':'پاسخ'}</button><div class="message-reply-box hidden"><textarea aria-label="پاسخ شما" placeholder="پاسخ شما…">${esc(x.reply_text||'')}</textarea><button class="primary save-reply">ثبت پاسخ</button></div>`:''}${x.replied_at?'<small>پاسخ شما ثبت شده است.</small>':''}</div></article>`}).join('')||'<div class="empty">پیامی برای شما ثبت نشده است.</div>';
 syncClearAll();await Promise.all(rows.map(async x=>{const s=byMessage.get(String(x.message_id));if(!s?.sticker_path)return;try{const src=await bamcoMedia.get('stickers',s.sticker_path);if(run===epoch){const host=q(`#messageList [data-mid="${x.message_id}"] .message-report-body`);if(host)host.innerHTML=BamcoMessageRender.html(s,{stickerUrl:src})}}catch{}}));
 }catch(err){toast(err.message,true)}}
 let clearingAll=false;
 function syncClearAll(){const button=q('#clearAllMessages');if(button)button.disabled=clearingAll||!(alerts.length||rows.length)}
 function updateBadge(){q('#messageBadge').textContent=fa(rows.filter(x=>!x.read_at).length+alerts.filter(x=>!x.read_at).length).replace(/^۰$/,'')}
 async function dismiss(button){
  const isNote=button.hasAttribute('data-dismiss-notification'),id=isNote?button.dataset.dismissNotification:button.dataset.dismissMessage,key=(isNote?'n:':'m:')+id,actor=state.profile?.id;
  if(!actor||pendingDismissals.has(key))return;
  pendingDismissals.add(key);++epoch;button.disabled=true;
  try{
   const row=isNote?alerts.find(x=>String(x.id)===id):rows.find(x=>String(x.message_id)===id),now=new Date().toISOString();
   const saved=await update(isNote?'notifications':'portal_message_recipients',isNote?`id=eq.${id}&user_id=eq.${actor}`:`message_id=eq.${id}&recipient_id=eq.${actor}`,{dismissed_at:now,read_at:row?.read_at||now});
   if(!Array.isArray(saved)||saved.length!==1||!saved[0].dismissed_at)throw Error('حذف تأیید نشد؛ دوباره تلاش کنید.');
   if(state.profile?.id!==actor)return;
   if(isNote)alerts=alerts.filter(x=>String(x.id)!==id);else rows=rows.filter(x=>String(x.message_id)!==id);
   button.closest('.message-card')?.remove();updateBadge();syncClearAll();
   if(!q('#messageList .message-card'))q('#messageList').innerHTML='<div class="empty">پیامی برای شما ثبت نشده است.</div>';
   document.dispatchEvent(new CustomEvent('bamco-inbox-updated'));
 }catch(err){toast(err.message,true)}finally{pendingDismissals.delete(key);if(button.isConnected)button.disabled=false;if(!pendingDismissals.size&&state.profile?.id===actor)void load()}
 }
 async function dismissAll(){const actor=state.profile?.id,button=q('#clearAllMessages');if(!actor||clearingAll||!(alerts.length||rows.length))return;if(!await window.bamcoConfirm('همه اعلان‌ها و پیام‌های این بخش پاک شوند؟'))return;clearingAll=true;button.disabled=true;const run=++epoch;try{const result=await rpc('dismiss_my_inbox',{});if(state.profile?.id!==actor||run!==epoch)return;alerts=[];rows=[];lastAlertSignature='';q('#messageList').innerHTML='<div class="empty">پیامی برای شما ثبت نشده است.</div>';updateBadge();syncClearAll();document.dispatchEvent(new CustomEvent('bamco-inbox-updated'));toast(`${fa(Number(result?.notifications||0)+Number(result?.messages||0))} مورد پاک شد.`)}catch(err){toast(err.message,true)}finally{clearingAll=false;syncClearAll();if(state.profile?.id===actor)void load()}}
 document.addEventListener('DOMContentLoaded',()=>{
 q('#nav [data-view="messages"]').onclick=()=>load();q('#refreshMessages').onclick=load;q('#clearAllMessages').onclick=dismissAll;
 q('#messageList').onclick=async e=>{const remove=e.target.closest('[data-dismiss-notification],[data-dismiss-message]');if(remove){e.preventDefault();e.stopPropagation();await dismiss(remove);return}const notice=e.target.closest('[data-notification]');if(notice){const n=alerts.find(x=>String(x.id)===notice.dataset.notification);if(!n)return;try{if(!n.read_at)await update('notifications',`id=eq.${n.id}&user_id=eq.${state.profile.id}`,{read_at:new Date().toISOString()});if(n.entity_type==='chat_thread')await window.bamcoConversations.open(n.entity_id);else if(n.entity_type==='profile'&&isManager())await window.bamcoPeople.open(n.entity_id);else if(n.entity_type==='profile')window.bamcoAccount.open();else showView(n.entity_type==='task'?'kanban':'messages');await load()}catch(err){toast(err.message,true)}return}const card=e.target.closest('[data-mid]');if(!card||e.target.closest('textarea'))return;const row=rows.find(x=>String(x.message_id)===card.dataset.mid),button=e.target.closest('button');if(!row||button?.disabled)return;
 const body={read_at:new Date().toISOString()};if(button?.matches('.reply-message')){card.querySelector('.message-reply-box').classList.toggle('hidden');card.querySelector('textarea').focus();if(row.read_at)return}
 else if(button?.matches('.save-reply')){body.reply_text=card.querySelector('textarea').value.trim();if(!body.reply_text)return toast('متن پاسخ را وارد کنید.',true);body.replied_at=new Date().toISOString()}
 else if(button?.matches('.ack-message'))body.acknowledged_at=new Date().toISOString();else if(row.read_at)return;
 if(button)button.disabled=true;try{await update('portal_message_recipients',`message_id=eq.${card.dataset.mid}&recipient_id=eq.${state.profile.id}`,body);Object.assign(row,body);card.classList.remove('unread');q('#messageBadge').textContent=fa(rows.filter(x=>!x.read_at).length+alerts.filter(x=>!x.read_at).length).replace(/^۰$/,'');if(body.replied_at||body.acknowledged_at){await load();if(body.replied_at)toast('پاسخ شما در سابقه همین پیام ثبت شد.')}}catch(err){toast(err.message,true)}finally{if(button?.isConnected)button.disabled=false}
 };q('#messageList').onkeydown=e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-notification]')){e.preventDefault();e.target.click()}};setTimeout(load,1200);setInterval(()=>{if(state.token&&!document.hidden&&!q('#messageList').contains(document.activeElement))load()},8000);document.addEventListener('bamco-messages-changed',()=>{if(state.token)load()});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.token)load()});
 });
 document.addEventListener('bamco-system-thread-cleared',()=>{epoch++;loading=null;rows=[];alerts=[];lastAlertSignature='';q('#messageList').replaceChildren();void load()});
 window.bamcoInbox={load,dismissAll};
})();

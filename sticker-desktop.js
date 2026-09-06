(()=>{
  const STATE_META={state1:'وضعیت مطلوب',state2:'یادآوری',state3:'نیازمند توجه',state4:'پیگیری جدی',state5:'اقدام فوری'};
  const STATES=['state1','state2','state3','state4','state5'];
  const GENDERS=['female','male'];
  const GENDER_FA={female:'خانم',male:'آقا'};
  const ENGINEERING_SET='واحد مهندسی محصول';
  let sets=[];
  let currentRows=[];
  let previewObjectUrl='';
  let pendingFiles=new Map();

  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installView(){
    const view=q('#stickersView');
    if(!view||view.dataset.desktopStickerUi==='1')return;
    view.dataset.desktopStickerUi='1';
    view.innerHTML=`
      <div class="desktop-sticker-page">
        <fieldset class="desktop-sticker-box desktop-sticker-preview-controls">
          <legend>پیش‌نمایش و انتخاب نسخه</legend>
          <div class="desktop-sticker-control-row">
            <label class="desktop-sticker-inline-label"><span>وضعیت</span>
              <select id="desktopStickerState">
                ${STATES.map(k=>`<option value="${k}">${STATE_META[k]}</option>`).join('')}
              </select>
            </label>
            <span class="desktop-sticker-version-label">نسخه</span>
            <label class="desktop-sticker-radio"><input type="radio" name="desktopStickerGender" value="female" checked> خانم</label>
            <label class="desktop-sticker-radio"><input type="radio" name="desktopStickerGender" value="male"> آقا</label>
            <button id="editCurrentStickerBtn" class="desktop-sticker-secondary" type="button">تغییر تصویر همین مورد</button>
            <input id="editCurrentStickerFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
          </div>
        </fieldset>

        <fieldset class="desktop-sticker-box desktop-sticker-sets-box">
          <legend>مدیریت نسخه‌ها</legend>
          <div class="desktop-sticker-set-row">
            <select id="desktopStickerSet" aria-label="نسخه استیکر"></select>
            <button id="activateDesktopStickerSet" class="desktop-sticker-green" type="button">فعال‌سازی نسخه</button>
            <button id="addDesktopStickerSet" class="desktop-sticker-green" type="button">افزودن نسخه جدید</button>
            <button id="restoreEngineeringStickerSet" class="desktop-sticker-green" type="button">بازگردانی واحد مهندسی محصول</button>
          </div>
        </fieldset>

        <div class="desktop-sticker-active-note" id="desktopStickerActiveNote"></div>
        <div class="desktop-sticker-preview-stage">
          <div id="desktopStickerLoading" class="desktop-sticker-loading hidden">در حال بارگذاری تصویر…</div>
          <img id="desktopStickerPreview" alt="پیش‌نمایش استیکر">
        </div>

        <div id="stickerGrid" class="sticker-grid" hidden></div>
      </div>

      <dialog id="desktopStickerPackDialog" class="desktop-sticker-dialog">
        <form id="desktopStickerPackForm">
          <div class="desktop-sticker-dialog-title">
            <strong>افزودن نسخه جدید استیکر</strong>
            <button type="button" id="closeDesktopStickerDialog" aria-label="بستن">×</button>
          </div>
          <div class="desktop-sticker-dialog-body">
            <label class="desktop-sticker-name-row"><span>نام نسخه</span><input id="desktopStickerPackName" required></label>
            <div class="desktop-sticker-upload-matrix">
              <div class="matrix-head matrix-version">نسخه</div>
              ${STATES.map(k=>`<div class="matrix-head">${STATE_META[k]}</div>`).join('')}
              ${['female','male'].map(g=>`
                <div class="matrix-row-label">نسخه ${GENDER_FA[g]}</div>
                ${STATES.map(k=>`<button type="button" class="matrix-upload" data-pack-key="${k}_${g}">بارگذاری</button>`).join('')}
              `).join('')}
            </div>
            <input id="desktopPackFileInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>
            <div class="desktop-sticker-dialog-actions">
              <button type="button" id="cancelDesktopStickerPack" class="desktop-sticker-cancel">انصراف</button>
              <button type="submit" id="saveDesktopStickerPack" class="desktop-sticker-green">ذخیره و فعال‌سازی</button>
            </div>
          </div>
        </form>
      </dialog>`;
    bindEvents();
  }

  function bindEvents(){
    q('#desktopStickerState')?.addEventListener('change',refreshPreview);
    qa('input[name="desktopStickerGender"]').forEach(x=>x.addEventListener('change',refreshPreview));
    q('#desktopStickerSet')?.addEventListener('change',async()=>{await loadRowsForSelectedSet();await refreshPreview()});
    q('#activateDesktopStickerSet')?.addEventListener('click',()=>activateSelectedSet().catch(showError));
    q('#addDesktopStickerSet')?.addEventListener('click',openNewPackDialog);
    q('#restoreEngineeringStickerSet')?.addEventListener('click',()=>restoreEngineeringDefaults().catch(showError));
    q('#editCurrentStickerBtn')?.addEventListener('click',()=>q('#editCurrentStickerFile')?.click());
    q('#editCurrentStickerFile')?.addEventListener('change',e=>editCurrentSticker(e).catch(showError));
    q('#closeDesktopStickerDialog')?.addEventListener('click',()=>q('#desktopStickerPackDialog')?.close());
    q('#cancelDesktopStickerPack')?.addEventListener('click',()=>q('#desktopStickerPackDialog')?.close());
    qa('.matrix-upload').forEach(b=>b.addEventListener('click',()=>choosePackFile(b.dataset.packKey)));
    q('#desktopPackFileInput')?.addEventListener('change',rememberPackFile);
    q('#desktopStickerPackForm')?.addEventListener('submit',e=>{e.preventDefault();saveNewPack().catch(showError)});
  }

  function selectedGender(){return q('input[name="desktopStickerGender"]:checked')?.value||'female'}
  function selectedState(){return q('#desktopStickerState')?.value||'state1'}
  function selectedSetId(){return Number(q('#desktopStickerSet')?.value||0)}
  function selectedSet(){const id=selectedSetId();return sets.find(s=>Number(s.id)===id)||null}
  const DEFAULT_ASSET_KEY={state1:'01_happy',state2:'02_reminder',state3:'03_concerned',state4:'04_serious',state5:'05_urgent'};
  function defaultImage(stateKey,gender){return window.BAMCO_DESKTOP_ASSETS?.[`${DEFAULT_ASSET_KEY[stateKey]}_${gender}`]||''}

  async function loadDesktopStickerManager(){
    installView();
    if(!q('#desktopStickerSet'))return;
    try{
      sets=await select('sticker_sets','select=*&order=created_at.asc');
      if(!sets.length){
        q('#desktopStickerSet').innerHTML='<option>نسخه‌ای ثبت نشده است</option>';
        q('#desktopStickerActiveNote').textContent='نسخه پایه هنوز در پایگاه داده ایجاد نشده است.';
        return;
      }
      const combo=q('#desktopStickerSet');
      const previous=Number(combo.value||0);
      const active=sets.find(s=>s.active)||sets.find(s=>s.name===ENGINEERING_SET)||sets[0];
      combo.innerHTML=sets.map(s=>`<option value="${s.id}">${esc(s.name)}${s.active?' — فعال':''}</option>`).join('');
      combo.value=String(sets.some(s=>Number(s.id)===previous)?previous:active.id);
      await loadRowsForSelectedSet();
      await refreshPreview();
      renderActiveNote();
    }catch(err){showError(err)}
  }

  function renderActiveNote(){
    const active=sets.find(s=>s.active);
    const note=q('#desktopStickerActiveNote');
    if(note)note.textContent=active?`نسخه فعال: ${active.name}`:'هیچ نسخه‌ای فعال نیست.';
  }

  async function loadRowsForSelectedSet(){
    const id=selectedSetId();
    currentRows=id?await select('stickers',`select=*&set_id=eq.${id}&order=state_key,gender`):[];
  }

  async function authenticatedStickerUrl(path){
    const encoded=String(path).split('/').map(encodeURIComponent).join('/');
    const r=await fetch(`${SB_URL}/storage/v1/object/authenticated/stickers/${encoded}?v=${Date.now()}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`}});
    if(!r.ok)throw new Error('تصویر ذخیره‌شده قابل دریافت نیست.');
    const blob=await r.blob();
    if(previewObjectUrl)URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl=URL.createObjectURL(blob);
    return previewObjectUrl;
  }

  async function refreshPreview(){
    const img=q('#desktopStickerPreview'),loading=q('#desktopStickerLoading');
    if(!img)return;
    loading?.classList.remove('hidden');
    const key=selectedState(),gender=selectedGender();
    const row=currentRows.find(r=>r.state_key===key&&r.gender===gender);
    try{
      img.src=row?.storage_path?await authenticatedStickerUrl(row.storage_path):defaultImage(key,gender);
      img.alt=`${STATE_META[key]} - ${GENDER_FA[gender]}`;
    }catch(err){
      img.src=defaultImage(key,gender);
      toast?.('نسخه بارگذاری‌شده در دسترس نبود؛ تصویر پایه نمایش داده شد.',true);
    }finally{loading?.classList.add('hidden')}
  }

  function validateImage(file){
    if(!file)throw new Error('فایلی انتخاب نشده است.');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('فرمت تصویر باید PNG، JPG یا WebP باشد.');
    if(file.size>5*1024*1024)throw new Error('حجم هر تصویر باید کمتر از ۵ مگابایت باشد.');
  }

  function extFor(file){return file.type==='image/jpeg'?'jpg':file.type==='image/webp'?'webp':'png'}

  async function uploadStickerForSet(setId,stateKey,gender,file){
    validateImage(file);
    const storagePath=`sets/${setId}/${stateKey}_${gender}.${extFor(file)}`;
    const encoded=storagePath.split('/').map(encodeURIComponent).join('/');
    const r=await fetch(`${SB_URL}/storage/v1/object/stickers/${encoded}`,{
      method:'POST',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`,'x-upsert':'true','Content-Type':file.type,'cache-control':'3600'},
      body:file
    });
    if(!r.ok){const t=await r.text();throw new Error(t||'بارگذاری تصویر انجام نشد.')}
    const existing=(await select('stickers',`select=id&set_id=eq.${setId}&state_key=eq.${stateKey}&gender=eq.${gender}`))[0];
    const payload={set_id:setId,state_key:stateKey,gender,storage_path:storagePath,mime_type:file.type,size_bytes:file.size,sha256:null};
    if(existing)await update('stickers',`id=eq.${existing.id}`,payload);else await insert('stickers',payload);
  }

  async function editCurrentSticker(e){
    const file=e.target.files?.[0];
    e.target.value='';
    if(!file)return;
    const set=selectedSet();
    if(!set)throw new Error('ابتدا یک نسخه را انتخاب کنید.');
    q('#editCurrentStickerBtn').disabled=true;
    try{
      await uploadStickerForSet(set.id,selectedState(),selectedGender(),file);
      await loadRowsForSelectedSet();
      await refreshPreview();
      toast(`تصویر «${STATE_META[selectedState()]} ـ ${GENDER_FA[selectedGender()]}» در نسخه «${set.name}» تغییر کرد.`);
    }finally{q('#editCurrentStickerBtn').disabled=false}
  }

  async function activateSelectedSet(){
    const set=selectedSet();if(!set)throw new Error('نسخه‌ای انتخاب نشده است.');
    if(!set.system_set){
      const rows=await select('stickers',`select=id&set_id=eq.${set.id}`);
      if(rows.length<10)throw new Error('این نسخه کامل نیست؛ هر ده تصویر خانم و آقا باید ثبت شده باشند.');
    }
    await update('sticker_sets','active=eq.true',{active:false});
    await update('sticker_sets',`id=eq.${set.id}`,{active:true});
    toast(`نسخه «${set.name}» فعال شد.`);
    await loadDesktopStickerManager();
  }

  function openNewPackDialog(){
    pendingFiles=new Map();
    q('#desktopStickerPackName').value='';
    qa('.matrix-upload').forEach(b=>{b.textContent='بارگذاری';b.classList.remove('selected')});
    q('#desktopStickerPackDialog').showModal();
    setTimeout(()=>q('#desktopStickerPackName')?.focus(),20);
  }

  let choosingPackKey='';
  function choosePackFile(key){choosingPackKey=key;q('#desktopPackFileInput').value='';q('#desktopPackFileInput').click()}
  function rememberPackFile(e){
    const file=e.target.files?.[0];if(!file||!choosingPackKey)return;
    try{validateImage(file)}catch(err){showError(err);return}
    pendingFiles.set(choosingPackKey,file);
    const btn=q(`.matrix-upload[data-pack-key="${choosingPackKey}"]`);
    if(btn){btn.textContent='✓ انتخاب شد';btn.classList.add('selected');btn.title=file.name}
  }

  async function saveNewPack(){
    const name=q('#desktopStickerPackName').value.trim();
    if(!name)throw new Error('برای نسخه جدید یک نام وارد کنید.');
    const required=[];for(const g of GENDERS)for(const k of STATES)required.push(`${k}_${g}`);
    if(required.some(k=>!pendingFiles.has(k)))throw new Error('هر ده تصویر نسخه خانم و آقا باید بارگذاری شوند.');
    const button=q('#saveDesktopStickerPack');button.disabled=true;button.textContent='در حال ذخیره…';
    let created=null;
    try{
      const rows=await insert('sticker_sets',{name,active:false,system_set:false,created_by:state.profile.id});
      created=rows?.[0];if(!created)throw new Error('ایجاد نسخه جدید انجام نشد.');
      for(const g of GENDERS)for(const k of STATES)await uploadStickerForSet(created.id,k,g,pendingFiles.get(`${k}_${g}`));
      await update('sticker_sets','active=eq.true',{active:false});
      await update('sticker_sets',`id=eq.${created.id}`,{active:true});
      q('#desktopStickerPackDialog').close();
      toast(`نسخه «${name}» ذخیره و فعال شد.`);
      await loadDesktopStickerManager();
    }catch(err){
      if(created?.id){try{await api(`/rest/v1/sticker_sets?id=eq.${created.id}`,{method:'DELETE',prefer:'return=representation'})}catch{} }
      throw err;
    }finally{button.disabled=false;button.textContent='ذخیره و فعال‌سازی'}
  }

  async function restoreEngineeringDefaults(){
    const set=sets.find(s=>s.name===ENGINEERING_SET);
    if(!set)throw new Error('نسخه «واحد مهندسی محصول» پیدا نشد.');
    if(!confirm('همه تغییرات تصاویر نسخه «واحد مهندسی محصول» به تصاویر اصلی دسکتاپ بازگردد و همین نسخه فعال شود؟'))return;
    await api(`/rest/v1/stickers?set_id=eq.${set.id}`,{method:'DELETE',prefer:'return=representation'});
    await update('sticker_sets','active=eq.true',{active:false});
    await update('sticker_sets',`id=eq.${set.id}`,{active:true});
    q('#desktopStickerSet').value=String(set.id);
    await loadDesktopStickerManager();
    toast('نسخه «واحد مهندسی محصول» به تصاویر اصلی بازگردانی و فعال شد.');
  }

  function showError(err){console.error(err);if(typeof toast==='function')toast(err?.message||String(err),true)}

  document.addEventListener('DOMContentLoaded',()=>{
    installView();
    const nav=q('#nav button[data-view="stickers"]');
    nav?.addEventListener('click',()=>setTimeout(loadDesktopStickerManager,20));
  });
})();

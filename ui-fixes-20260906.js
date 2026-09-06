(()=>{
  const q=s=>document.querySelector(s);

  // 1) Keep password changes optional. Database defaults are also false.
  const keepPasswordOptional=()=>{const cancel=q('#cancelPasswordBtn');if(cancel)cancel.classList.remove('hidden')};
  keepPasswordOptional();

  // 2) Column filters: visually first/rightmost column is selection, while data filters keep their original mapping.
  function normalizeFilterRow(tr,count){
    if(tr.children.length!==count){
      tr.innerHTML=Array.from({length:count},(_,i)=>`<th><select ${i===0?'disabled':''}><option value="">${i===0?'—':'همه'}</option></select></th>`).join('');
    }else{
      const disabled=[...tr.children].find(th=>th.querySelector('select')?.disabled);
      if(disabled&&tr.firstElementChild!==disabled)tr.prepend(disabled);
    }
    tr.dataset.visualOrder='selection-first';
  }
  try{
    updateColumnFilters=function(scope,rows,archived){
      const tr=q(`#${scope}View .column-filters`);if(!tr)return;
      const filters=tableFilters[scope],count=archived?16:14;normalizeFilterRow(tr,count);
      [...tr.children].forEach((th,visualIndex)=>{
        const selectEl=th.querySelector('select');
        if(visualIndex===0){selectEl.disabled=true;selectEl.innerHTML='<option value="">—</option>';return}
        selectEl.disabled=false;
        const logicalIndex=visualIndex-1,current=filters[logicalIndex]||'';
        const values=[...new Set(rows.map(t=>String(taskColumnValues(t,archived)[logicalIndex]??'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));
        selectEl.innerHTML='<option value="">همه</option>'+values.map(v=>`<option value="${safe(v)}" ${v===current?'selected':''}>${safe(v)}</option>`).join('');
        selectEl.className='fa-text';
      });
    };
  }catch(e){console.warn('Filter patch was not applied',e)}

  function moveSelectionToRight(){
    for(const scope of ['kanban','archive']){
      const view=q(`#${scope}View`);if(!view)continue;
      const header=[...view.querySelectorAll('thead>tr:first-child>th')].find(th=>th.textContent.trim()==='انتخاب');
      if(header&&header.parentElement.firstElementChild!==header)header.parentElement.prepend(header);
      const filterRow=view.querySelector('.column-filters');if(filterRow&&filterRow.children.length)normalizeFilterRow(filterRow,scope==='archive'?16:14);
      view.querySelectorAll('tbody tr[data-task-id]').forEach(row=>{const pick=row.querySelector('.task-pick')?.closest('td');if(pick&&row.firstElementChild!==pick)row.prepend(pick)});
    }
  }
  const tableObserver=new MutationObserver(moveSelectionToRight);
  ['#kanbanBody','#archiveBody'].forEach(s=>{const el=q(s);if(el)tableObserver.observe(el,{childList:true,subtree:true})});
  moveSelectionToRight();

  // Capture filter changes before the original listener, because the visual index is shifted by the rightmost selection column.
  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('.column-filters select');if(!sel)return;
    e.stopImmediatePropagation();
    const tr=sel.closest('.column-filters'),scope=tr.closest('.view').id.startsWith('archive')?'archive':'kanban',visualIndex=sel.closest('th').cellIndex;
    if(visualIndex===0)return;tableFilters[scope][visualIndex-1]=sel.value;renderTasks(scope==='archive');
  },true);

  // 3) Excel export: keep the current formatting, but emit Persian digits for Reminder.
  function exportRowsFaReminder(archived){
    if(typeof XLSX==='undefined')return toast('کتابخانه Excel بارگذاری نشده است؛ صفحه را تازه‌سازی کنید.',true);
    const rows=state.tasks.filter(t=>!!t.archived===archived),headers=['شناسه','عنوان فعالیت','توضیحات','متولی','وضعیت','اولویت','تاریخ شروع','تاریخ انجام','تاریخ پایان','یادآور','آخرین به‌روزرسانی','وضعیت دیرکرد','توضیحات مدیر',...(archived?['تأخیر','تعجیل']:[])];
    const data=rows.map(t=>[displayId(t),t.title,t.description||'',ownerName(t),t.status,t.priority,jalaliText(t.start_date),jalaliText(t.done_date),jalaliText(t.due_date),fa(t.reminder_days),jalaliDateTime(t.last_updated_at),t.due_state||'عادی',t.manager_notes||'',...(archived?[fa(t.delay_days||0),fa(t.advance_days||0)]:[])]);
    const ws=XLSX.utils.aoa_to_sheet([headers,...data]),range=XLSX.utils.decode_range(ws['!ref']);
    const border={top:{style:'thin',color:{rgb:'7F8C87'}},bottom:{style:'thin',color:{rgb:'7F8C87'}},left:{style:'thin',color:{rgb:'7F8C87'}},right:{style:'thin',color:{rgb:'7F8C87'}}};
    for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){
      const address=XLSX.utils.encode_cell({r,c}),cell=ws[address]||(ws[address]={t:'s',v:''}),persian=/[\u0600-\u06ff]/.test(String(cell.v??''));
      cell.s=r===0?{font:{name:'B Nazanin',sz:14,bold:true,color:{rgb:'FFFFFF'}},fill:{patternType:'solid',fgColor:{rgb:'176B4D'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2,wrapText:false},border}:{font:{name:persian?'B Nazanin':'Times New Roman',sz:12},alignment:{horizontal:persian?'right':'left',vertical:'center',readingOrder:persian?2:1,wrapText:true},border};
    }
    ws['!views']=[{rightToLeft:true}];ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:range.e.r,c:range.e.c}})};ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
    ws['!rows']=[{hpt:28},...rows.map(()=>({hpt:24}))];ws['!cols']=headers.map((h,i)=>({wch:[10,28,42,24,18,12,15,15,15,10,22,18,30,10,10][i]||14}));
    const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,archived?'Archive':'KANBAN');XLSX.writeFile(wb,`BAMCO_${archived?'Archive':'KANBAN'}_${new Date().toISOString().slice(0,10)}.xlsx`,{compression:true});toast('فایل Excel راست‌چین و قالب‌بندی‌شده آماده شد.');
  }
  document.addEventListener('click',e=>{const btn=e.target.closest?.('#kanbanExportBtn,#archiveExportBtn');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();exportRowsFaReminder(btn.id==='archiveExportBtn')},true);

  // 4) Profile image preview + crop/position dialog.
  let sourceImg=null,sourceUrl='',previewUrl='',avatarUrl='',zoom=1,offsetX=0,offsetY=0,drag=null;
  const cropMarkup=`<dialog id="avatarCropDialog" class="modal avatar-crop-dialog"><div class="modal-head"><div><h3>برش و تنظیم تصویر پروفایل</h3><p>تصویر را بکشید تا بخش دلخواه داخل کادر قرار بگیرد.</p></div><button type="button" id="avatarCropClose">×</button></div><div class="avatar-crop-stage" id="avatarCropStage"><img id="avatarCropImage" alt="پیش‌نمایش تصویر"><span class="avatar-crop-frame"></span></div><label class="avatar-zoom-label">بزرگ‌نمایی<input id="avatarZoom" type="range" min="1" max="3" step="0.01" value="1"></label><div class="modal-actions"><button type="button" class="ghost" id="avatarCropCancel">انصراف</button><button type="button" class="primary" id="avatarCropApply">اعمال برش</button></div></dialog>`;
  if(!q('#avatarCropDialog'))document.body.insertAdjacentHTML('beforeend',cropMarkup);
  const cropDialog=q('#avatarCropDialog'),stage=q('#avatarCropStage'),cropImg=q('#avatarCropImage'),zoomInput=q('#avatarZoom');
  function cropMetrics(){if(!sourceImg)return null;const size=stage.clientWidth||320,base=Math.max(size/sourceImg.naturalWidth,size/sourceImg.naturalHeight),scale=base*zoom,w=sourceImg.naturalWidth*scale,h=sourceImg.naturalHeight*scale,maxX=Math.max(0,(w-size)/2),maxY=Math.max(0,(h-size)/2);offsetX=Math.max(-maxX,Math.min(maxX,offsetX));offsetY=Math.max(-maxY,Math.min(maxY,offsetY));return{size,scale,w,h}}
  function paintCrop(){const m=cropMetrics();if(!m)return;cropImg.style.width=`${m.w}px`;cropImg.style.height=`${m.h}px`;cropImg.style.left=`${(m.size-m.w)/2+offsetX}px`;cropImg.style.top=`${(m.size-m.h)/2+offsetY}px`}
  function closeCrop(clear=true){if(cropDialog.open)cropDialog.close();if(clear){const input=q('#profileAvatar');if(input)input.value=''}if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl=''}}
  function openCrop(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('فرمت تصویر باید PNG، JPG یا WebP باشد.',true);if(file.size>8*1024*1024)return toast('حجم فایل انتخابی برای پردازش بیش از حد است.',true);if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);sourceImg=new Image();sourceImg.onload=()=>{zoom=1;offsetX=0;offsetY=0;zoomInput.value='1';cropImg.src=sourceUrl;cropDialog.showModal();requestAnimationFrame(paintCrop)};sourceImg.onerror=()=>toast('خواندن تصویر انتخاب‌شده ممکن نشد.',true);sourceImg.src=sourceUrl}
  q('#profileAvatar')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)openCrop(f)});
  zoomInput?.addEventListener('input',()=>{zoom=Number(zoomInput.value)||1;paintCrop()});
  stage?.addEventListener('pointerdown',e=>{if(!sourceImg)return;drag={x:e.clientX,y:e.clientY,ox:offsetX,oy:offsetY};stage.setPointerCapture?.(e.pointerId);stage.classList.add('dragging')});
  stage?.addEventListener('pointermove',e=>{if(!drag)return;offsetX=drag.ox+(e.clientX-drag.x);offsetY=drag.oy+(e.clientY-drag.y);paintCrop()});
  const stopDrag=()=>{drag=null;stage?.classList.remove('dragging')};stage?.addEventListener('pointerup',stopDrag);stage?.addEventListener('pointercancel',stopDrag);
  q('#avatarCropCancel')?.addEventListener('click',()=>closeCrop(true));q('#avatarCropClose')?.addEventListener('click',()=>closeCrop(true));
  q('#avatarCropApply')?.addEventListener('click',()=>{const m=cropMetrics();if(!m||!sourceImg)return;const sourceSize=m.size/m.scale,cx=sourceImg.naturalWidth/2-offsetX/m.scale,cy=sourceImg.naturalHeight/2-offsetY/m.scale,sx=Math.max(0,Math.min(sourceImg.naturalWidth-sourceSize,cx-sourceSize/2)),sy=Math.max(0,Math.min(sourceImg.naturalHeight-sourceSize,cy-sourceSize/2)),canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;canvas.getContext('2d').drawImage(sourceImg,sx,sy,sourceSize,sourceSize,0,0,512,512);canvas.toBlob(blob=>{if(!blob)return toast('آماده‌سازی تصویر انجام نشد.',true);const input=q('#profileAvatar'),dt=new DataTransfer(),file=new File([blob],'avatar.jpg',{type:'image/jpeg',lastModified:Date.now()});dt.items.add(file);input.files=dt.files;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);showProfilePreview(previewUrl,'تصویر برش‌خورده آماده ذخیره است.');closeCrop(false)},'image/jpeg',0.9)});

  function ensurePreview(){const input=q('#profileAvatar');if(!input)return null;let box=q('#profileAvatarPreviewBox');if(!box){box=document.createElement('div');box.id='profileAvatarPreviewBox';box.className='profile-avatar-preview';box.innerHTML='<img id="profileAvatarPreview" alt="تصویر پروفایل"><small id="profileAvatarHint">تصویری انتخاب نشده است.</small>';input.parentElement.insertBefore(box,input)}return box}
  function showProfilePreview(url,hint='تصویر فعلی پروفایل'){const box=ensurePreview();if(!box)return;const img=q('#profileAvatarPreview');img.src=url;img.hidden=false;q('#profileAvatarHint').textContent=hint}
  window.refreshProfileAvatar=async function(){const el=q('#avatar');if(!el||!state.profile)return;el.classList.remove('has-image');el.style.backgroundImage='';el.innerHTML='';el.textContent=(state.profile.display_name||state.profile.full_name||'ب').trim()[0];ensurePreview();if(!state.profile.avatar_path){const p=q('#profileAvatarPreview');if(p)p.hidden=true;return}try{const path=state.profile.avatar_path.split('/').map(encodeURIComponent).join('/'),r=await fetch(`${SB_URL}/storage/v1/object/authenticated/avatars/${path}?v=${Date.now()}`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const blob=await r.blob();if(!blob.type.startsWith('image/'))throw new Error('Invalid image response');if(avatarUrl)URL.revokeObjectURL(avatarUrl);avatarUrl=URL.createObjectURL(blob);el.textContent='';const img=document.createElement('img');img.src=avatarUrl;img.alt='';el.appendChild(img);el.classList.add('has-image');showProfilePreview(avatarUrl,'تصویر فعلی پروفایل')}catch(err){console.warn('Avatar display failed',err);toast('تصویر پروفایل ذخیره شده اما نمایش آن ممکن نشد.',true)}};

  // Make optional wording explicit in Settings for both manager and owner.
  const pwBtn=q('#changePasswordBtn');if(pwBtn){pwBtn.title='تغییر رمز عبور اختیاری است.';const panel=pwBtn.closest('.panel'),small=panel?.querySelector('.panel-head small');if(small&&!small.textContent.includes('اختیاری'))small.textContent='نام نمایشی، تصویر پروفایل و تغییر اختیاری رمز عبور'}
  setTimeout(()=>{keepPasswordOptional();if(typeof state!=='undefined'&&state.profile)window.refreshProfileAvatar?.()},500);
})();
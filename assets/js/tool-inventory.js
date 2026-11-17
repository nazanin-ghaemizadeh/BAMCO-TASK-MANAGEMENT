(() => {
  'use strict';
  const view = document.getElementById('toolsView');
  if (!view) return;
  const {esc,fa,date,fetchRows,insert,update,rpc,openJalaliPicker,notify} = window.bamcoEnterprise;
  const can = action => window.BamcoAccess?.can('tools',action) === true;
  const normalize = value => String(value ?? '').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/ي/g,'ی').replace(/ك/g,'ک').trim().toLowerCase();
  const timeFormat = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const home = '<button type="button" class="ghost" data-home-action>بازگشت به خانه</button>';
  const assetOrder = new Intl.Collator('fa',{numeric:true,sensitivity:'base'});
  const compareAssets = (a,b) => assetOrder.compare(a.asset_code,b.asset_code) || assetOrder.compare(a.name,b.name) || String(a.id).localeCompare(String(b.id));
  const statusNames = {stock:'موجود در انبار',outside:'خارج از انبار',repair:'در تعمیر',container:'محفظه / جعبه',inactive:'غیرفعال'};
  const movementHeaders = ['تاریخ خروج','ساعت خروج','تحویل‌گیرنده','تحویل‌دهنده','نوع خروج','علت خروج','تاریخ عودت','ساعت عودت','تحویل‌گیرنده هنگام عودت','تحویل‌دهنده هنگام عودت'];
  let assets=[],components=[],selected=null,query='',version=0,owner=null,loaded=false,editor=null,historyComponent=null,historyRows=[];
  const selectedIds = new Set();
  const identity = () => [window.Bamco?.state?.user?.id,window.BamcoWorkspace?.key?.()].join('/');
  const openMovement = component => component?.openMovement || null;
  const componentStatus = component => !component.active ? 'inactive' : component.is_container ? 'container' : openMovement(component)?.kind || 'stock';
  const partDate = stamp => stamp ? date(stamp.slice(0,10)) : '—';
  const partTime = stamp => stamp ? fa(stamp.slice(11,16)) : '—';
  const recordFilter = row => 'id=eq.'+encodeURIComponent(row.id)+'&revision=eq.'+encodeURIComponent(row.revision);
  const staleMessage = 'این اطلاعات تغییر کرده است. صفحه را دوباره باز کنید.';

  function summarize(tool) {
    const active = (tool.components||[]).filter(item=>item.active && !item.is_container);
    const counts = {stock:0,outside:0,repair:0};
    for (const item of active) counts[componentStatus(item)]++;
    const state = !active.length ? 'partial' : counts.repair ? 'repair' : counts.outside===active.length ? 'outside' : counts.outside || counts.repair ? 'partial' : 'stock';
    return {active,counts,state};
  }
  function card(tool) {
    const summary=summarize(tool);
    const current=summary.active.filter(item=>openMovement(item)).length;
    const fields=[
      ['کد اموال',tool.asset_code],
      ['تعداد قطعات قابل ردیابی',fa(summary.active.length)],
      ['موجود در انبار',fa(summary.counts.stock)],
      ['خارج از انبار / تعمیر',fa(current)]
    ];
    return '<button type="button" class="tool-card" data-state="'+summary.state+'" data-tool="'+esc(tool.id)+'"><span class="tool-card-head"><strong dir="auto">'+esc(tool.name)+'</strong><span class="tool-status">'+(summary.active.length?fa(summary.active.length)+' قطعه':'نیازمند تعریف قطعات')+'</span></span>'+fields.map(([label,value])=>'<span class="tool-card-line"><span>'+label+'</span><bdi>'+esc(value||'—')+'</bdi></span>').join('')+'</button>';
  }
  function showCards() {
    const grid=view.querySelector('.tool-grid'); if(!grid)return;
    const key=normalize(query);
    const visible=assets.filter(tool=>normalize(tool.name).includes(key)||normalize(tool.asset_code).includes(key)||tool.components?.some(c=>normalize(c.component_name).includes(key)||normalize(c.component_code).includes(key))).sort(compareAssets);
    grid.innerHTML=visible.length?visible.map(card).join(''):'<p class="tool-empty">'+(key?'ابزاری با این نام یا کد پیدا نشد.':'هنوز ابزاری ثبت نشده است.')+'</p>';
  }
  function mount(tool=null) {
    const heading=tool?'محتویات و گردش قطعات · '+esc(tool.name)+' · '+esc(tool.asset_code):'مدیریت ابزار';
    const toolbar=tool
      ? '<button type="button" class="ghost" data-action="list">بازگشت به کارت‌ها</button><button type="button" class="primary" data-action="componentAdd" hidden>افزودن قطعه</button><button type="button" class="ghost" data-action="componentEdit" hidden disabled>ویرایش قطعه</button><button type="button" class="danger" data-action="componentDeactivate" hidden disabled>غیرفعال‌سازی قطعه</button><button type="button" class="primary" data-action="exit" hidden>تحویل قطعات انتخاب‌شده</button><button type="button" class="primary" data-action="return" hidden>عودت قطعات انتخاب‌شده</button><button type="button" class="ghost" data-action="history" hidden disabled>تاریخچه قطعه</button><button type="button" class="ghost" data-action="edit" hidden>ویرایش کارت</button><button type="button" class="danger" data-action="deleteAsset" hidden>حذف کارت</button>'
      : home+'<button type="button" class="primary" data-action="asset" hidden>افزودن ابزار</button><input type="search" class="search vehicle-search" data-tool-search aria-label="جست‌وجوی ابزار یا قطعه" placeholder="جست‌وجوی نام ابزار، قطعه یا کد اموال" value="'+esc(query)+'">';
    const content=tool
      ? '<div class="tool-component-summary" data-component-summary></div><div class="vehicle-table-wrap"><table class="vehicle-data-table tool-components-table" aria-label="فهرست قطعات ابزار"><thead><tr><th>انتخاب</th><th>نام قطعه</th><th>شناسه قطعه</th><th>شماره سریال</th><th>وضعیت</th><th>تحویل‌گیرنده فعلی</th></tr></thead><tbody><tr><td class="empty" colspan="6">در حال دریافت قطعات…</td></tr></tbody></table></div><section class="tool-history-panel" hidden><div class="panel-head"><h4 data-history-title>تاریخچه قطعه</h4><button type="button" class="ghost" data-action="closeHistory">بستن تاریخچه</button></div><div class="vehicle-table-wrap"><table class="vehicle-data-table tool-history-table"><thead><tr>'+movementHeaders.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody></tbody></table></div></section>'
      : '<div class="tool-grid"><p class="tool-empty" role="status">در حال دریافت ابزارها…</p></div>';
    view.classList.add('vehicle-view','tool-register');
    view.innerHTML='<div class="panel vehicle-panel"><div class="panel-head vehicle-panel-head"><div><h3>'+heading+'</h3><small>'+(tool?'هر قطعه شناسه، وضعیت و گردش مستقل دارد.':'موجودی بر اساس قطعات مستقل هر کارت محاسبه می‌شود.')+'</small></div></div><div class="vehicle-toolbar" '+(tool?'data-home-return-suppressed="true"':'')+'>'+toolbar+'</div><div class="tool-load-error" role="alert" hidden><span></span> <button type="button" class="ghost" data-action="retry">تلاش دوباره</button></div>'+content+'</div>';
  }
  function renderComponents() {
    if(!selected)return;
    const body=view.querySelector('.tool-components-table tbody'); if(!body)return;
    const summary=summarize(selected);
    view.querySelector('[data-component-summary]').innerHTML=[
      ['کل قطعات',summary.active.length,'neutral'],
      ['موجود در انبار',summary.counts.stock,'success'],
      ['خارج از انبار',summary.counts.outside,'warning'],
      ['در تعمیر',summary.counts.repair,'warning']
    ].map(([label,value,color])=>'<div class="tool-summary-item"><span>'+label+'</span><strong data-tone="'+color+'">'+fa(value)+'</strong></div>').join('');
    const visible=(selected.components||[]).slice().sort((a,b)=>Number(a.component_no)-Number(b.component_no));
    body.innerHTML=visible.length?visible.map(component=>{
      const state=componentStatus(component),movement=openMovement(component);
      const disabled=!component.active;
      return '<tr data-component="'+esc(component.id)+'" data-revision="'+esc(component.revision)+'"><td><input type="checkbox" data-component-select value="'+esc(component.id)+'" '+(selectedIds.has(component.id)?'checked ':'')+(disabled?'disabled':'')+' aria-label="انتخاب '+esc(component.component_name)+'"></td><td><strong>'+esc(component.component_name)+'</strong>'+(component.description?'<small class="tool-component-description">'+esc(component.description)+'</small>':'')+'</td><td><bdi>'+esc(component.component_code)+'</bdi></td><td><bdi>'+esc(component.serial_number||'—')+'</bdi></td><td><span class="tool-component-status" data-state="'+state+'">'+statusNames[state]+'</span></td><td>'+esc(movement?.exit_receiver||'—')+'</td></tr>';
    }).join(''):'<tr><td class="empty" colspan="6">برای این کارت هنوز قطعه‌ای تعریف نشده است.</td></tr>';
    syncActions();
  }
  function syncActions() {
    const selectedRows=(selected?.components||[]).filter(c=>selectedIds.has(c.id)&&c.active);
    const trackable=selectedRows.filter(c=>!c.is_container);
    const stock=trackable.filter(c=>componentStatus(c)==='stock');
    const outside=trackable.filter(c=>!!openMovement(c));
    const one=selectedRows.length===1;
    const available={
      asset:can('create'),componentAdd:can('create'),
      componentEdit:one&&can('edit'),componentDeactivate:selectedRows.length>0&&can('edit'),
      exit:stock.length>0&&can('create'),return:outside.length>0&&can('edit'),
      history:one&&!selectedRows[0]?.is_container&&can('view'),edit:can('edit'),deleteAsset:can('delete')
    };
    for(const button of view.querySelectorAll('.vehicle-toolbar [data-action]')){
      const action=button.dataset.action;
      if(!Object.hasOwn(available,action))continue;
      button.hidden=!available[action];
      if(['componentEdit','componentDeactivate','history'].includes(action))button.disabled=!available[action];
    }
  }
  async function load(tool=null) {
    if(!can('view')){reset();return}
    const ticket=++version,actor=identity();
    owner=actor;selected=tool?assets.find(item=>item.id===tool.id)||tool:null;
    selectedIds.clear();historyComponent=null;historyRows=[];
    mount(selected);
    const warning=view.querySelector('.tool-load-error');warning.hidden=true;
    const current=()=>ticket===version&&actor===identity()&&can('view');
    try{
      if(!tool){
        const [assetRows,componentRows,openRows]=await Promise.all([
          fetchRows('tool_assets','select=*&order=asset_code.asc,id.asc'),
          fetchRows('tool_components','select=*&order=tool_id.asc,component_no.asc'),
          fetchRows('tool_movements','select=id,tool_id,component_id,kind,exited_at,exit_receiver,revision&entered_at=is.null&order=exited_at.desc')
        ]);
        if(!current())return;
        const openById=new Map(openRows.map(row=>[String(row.component_id),row]));
        const byTool=new Map();
        for(const component of componentRows){component.openMovement=openById.get(String(component.id))||null;const rows=byTool.get(component.tool_id)||[];rows.push(component);byTool.set(component.tool_id,rows)}
        assets=assetRows.map(asset=>({...asset,components:byTool.get(asset.id)||[]})).sort(compareAssets);
        loaded=true;showCards();
      }else{
        const [componentRows,openRows]=await Promise.all([
          fetchRows('tool_components','select=*&tool_id=eq.'+encodeURIComponent(tool.id)+'&order=component_no.asc'),
          fetchRows('tool_movements','select=id,tool_id,component_id,kind,exited_at,exit_receiver,revision&tool_id=eq.'+encodeURIComponent(tool.id)+'&entered_at=is.null&order=exited_at.desc')
        ]);
        if(!current())return;
        const openById=new Map(openRows.map(row=>[String(row.component_id),row]));
        selected.components=componentRows.map(component=>({...component,openMovement:openById.get(String(component.id))||null}));
        const index=assets.findIndex(item=>item.id===selected.id);if(index>=0)assets[index]=selected;
        loaded=true;renderComponents();
      }
    }catch(error){
      if(!current())return;
      warning.querySelector('span').textContent=error.message;warning.hidden=false;
    }
  }
  const textField=(name,label,value='',required=false)=>'<label>'+label+'<input name="'+name+'" type="text" value="'+esc(value||'')+'" '+(required?'required':'')+'></label>';
  function dateField(label,iso='',required=true) {
    return '<label>'+label+'<span class="tool-date"><input name="dateText" autocomplete="off" dir="ltr" placeholder="۱۴۰۵/۰۸/۲۳" value="'+(iso?esc(date(iso)):'')+'" '+(required?'required':'')+'><button type="button" class="ghost" data-calendar aria-label="تقویم '+label+'">▦</button></span><input type="hidden" name="isoDate" value="'+esc(iso||'')+'"></label>';
  }
  function readDate(form,required=true) {
    const value=normalize(form.elements.dateText.value),stored=form.elements.isoDate.value;
    if(!value&&!required)return null;
    if(!value)throw Error('تاریخ را وارد کنید.');
    if(stored&&value===normalize(date(stored)))return stored;
    const match=/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
    const iso=match&&jalaliToISO(...match.slice(1));
    if(!iso)throw Error('تاریخ شمسی را به صورت سال/ماه/روز وارد کنید.');
    return iso;
  }
  function readTime(value) {
    const match=/^(\d{1,2}):(\d{2})$/.exec(normalize(value));
    if(!match||Number(match[1])>23||Number(match[2])>59)throw Error('ساعت را در قالب ۲۴ ساعته وارد کنید، مانند ۰۸:۳۰.');
    return match[1].padStart(2,'0')+':'+match[2];
  }
  function openDialog({title,fields,permission,onSave}) {
    if(editor||!can(permission))return;
    const actor=identity(),dialog=document.createElement('dialog');
    editor=dialog;dialog.id='toolInventoryEditor';dialog.className='modal tool-editor bamco-dialog';
    dialog.innerHTML='<form><div class="modal-head"><h3>'+title+'</h3><button type="button" data-cancel aria-label="بستن">×</button></div><div class="tool-fields">'+fields+'</div><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="ghost" data-cancel>انصراف</button><button class="primary" type="submit">ثبت</button></div></form>';
    document.body.append(dialog);
    const form=dialog.querySelector('form');let saving=false;
    dialog.addEventListener('close',()=>{dialog.remove();if(editor===dialog)editor=null},{once:true});
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
    dialog.addEventListener('click',event=>{
      if(event.target.closest('[data-cancel]')&&!saving)dialog.close();
      const calendar=event.target.closest('[data-calendar]');
      if(calendar){const hidden=form.elements.isoDate;try{hidden.value=readDate(form)||''}catch{hidden.value=''}openJalaliPicker({visible:form.elements.dateText,hidden,label:calendar.getAttribute('aria-label')})}
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(saving||actor!==identity()||!can(permission))return;
      saving=true;const button=form.querySelector('[type=submit]'),feedback=form.querySelector('[role=alert]');
      button.disabled=true;button.textContent='در حال ثبت…';feedback.textContent='';
      try{await onSave(form);if(editor!==dialog||actor!==identity())return;dialog.close();notify('اطلاعات ثبت شد.')}
      catch(error){feedback.textContent=error.code==='23505'?'کد اموال یا شناسه قطعه تکراری است.':error.message}
      finally{saving=false;button.disabled=false;button.textContent='ثبت'}
    });
    dialog.showModal();
  }
  function openAssetForm(mode) {
    const tool=mode==='edit'?selected:null;
    const fields=textField('name','نام ابزار',tool?.name,true)+textField('asset_code','کد اموال',tool?.asset_code,true)+dateField('تاریخ خرید',tool?.purchased_on||'',false)+textField('purchase_receiver','تحویل‌گیرنده هنگام خرید',tool?.purchase_receiver||'');
    openDialog({title:mode==='edit'?'ویرایش کارت ابزار':'افزودن ابزار',fields,permission:mode==='edit'?'edit':'create',onSave:async form=>{
      const body={name:form.elements.name.value.trim(),asset_code:form.elements.asset_code.value.trim(),purchased_on:form.elements.dateText.value.trim()?readDate(form):null,purchase_receiver:form.elements.purchase_receiver.value.trim()||null};
      if(!body.name||!body.asset_code)throw Error('نام ابزار و کد اموال را وارد کنید.');
      if(mode==='edit'){const result=await update('tool_assets',recordFilter(tool),body);if(!result?.length)throw Error(staleMessage)}
      else {const result=await insert('tool_assets',body);if(!result?.length)throw Error(staleMessage)}
      await load(tool||null);
    }});
  }
  function openComponentForm(mode) {
    const component=mode==='edit'?selected.components.find(item=>selectedIds.has(item.id)):null;
    const fields=textField('component_name','نام قطعه',component?.component_name||'',true)
      +textField('serial_number','شماره سریال',component?.serial_number||'')
      +'<label class="tool-full-field">توضیحات<textarea name="description" rows="2">'+esc(component?.description||'')+'</textarea></label>'
      +'<label class="tool-check-field"><input type="checkbox" name="is_container" '+(component?.is_container?'checked':'')+'> این ردیف فقط جعبه یا محفظه است و خودش تحویل داده نمی‌شود.</label>';
    openDialog({title:component?'ویرایش قطعه':'افزودن قطعه مستقل',fields,permission:component?'edit':'create',onSave:async form=>{
      const body={component_name:form.elements.component_name.value.trim(),serial_number:form.elements.serial_number.value.trim()||null,description:form.elements.description.value.trim()||null,is_container:form.elements.is_container.checked};
      if(!body.component_name)throw Error('نام قطعه را وارد کنید.');
      if(component){const result=await update('tool_components',recordFilter(component),body);if(!result?.length)throw Error(staleMessage)}
      else {const result=await insert('tool_components',{tool_id:selected.id,...body});if(!result?.length)throw Error(staleMessage)}
      await load(selected);
    }});
  }
  function openCustodyForm(mode) {
    const exiting=mode==='exit';
    const ids=(selected.components||[]).filter(c=>selectedIds.has(c.id)&&c.active&&!c.is_container&&(exiting?componentStatus(c)==='stock':!!openMovement(c))).map(c=>c.id);
    if(!ids.length)return;
    const [today,now]=timeFormat.format(new Date()).split(' ');
    const fields=dateField(exiting?'تاریخ خروج':'تاریخ عودت',today)
      +'<label>ساعت '+(exiting?'خروج':'عودت')+'<input name="time" class="tool-time" dir="ltr" maxlength="5" placeholder="۰۸:۳۰" value="'+esc(fa(now))+'" required></label>'
      +textField('receiver',exiting?'تحویل‌گیرنده':'تحویل‌گیرنده هنگام عودت','',true)
      +textField('deliverer',exiting?'تحویل‌دهنده':'تحویل‌دهنده هنگام عودت','',true)
      +(exiting?'<label>نوع خروج<select name="kind"><option value="outside">خروج از انبار</option><option value="repair">ارسال برای تعمیر</option></select></label><label class="tool-full-field">علت خروج<textarea name="reason" rows="2" required></textarea></label>':'<label class="tool-full-field">توضیحات عودت<textarea name="reason" rows="2"></textarea></label>');
    openDialog({title:(exiting?'تحویل ':'عودت ')+fa(ids.length)+' قطعه',fields,permission:exiting?'create':'edit',onSave:async form=>{
      const occurred=readDate(form)+'T'+readTime(form.elements.time.value)+':00';
      const receiver=form.elements.receiver.value.trim(),deliverer=form.elements.deliverer.value.trim();
      if(!receiver||!deliverer)throw Error('نام تحویل‌گیرنده و تحویل‌دهنده را وارد کنید.');
      const args={p_tool_id:selected.id,p_component_ids:ids,p_occurred_at:occurred,p_receiver:receiver,p_deliverer:deliverer,p_reason:form.elements.reason.value.trim()||null};
      if(exiting){args.p_kind=form.elements.kind.value;const result=await rpc('checkout_tool_components',args);if(!Array.isArray(result)||result.length!==ids.length)throw Error('ثبت گروهی خروج کامل نشد؛ وضعیت قطعات را دوباره بررسی کنید.')}
      else {const result=await rpc('return_tool_components',args);if(!Array.isArray(result)||result.length!==ids.length)throw Error('ثبت گروهی عودت کامل نشد؛ وضعیت قطعات را دوباره بررسی کنید.')}
      await load(selected);
    }});
  }
  async function showHistory() {
    const rows=(selected.components||[]).filter(c=>selectedIds.has(c.id)&&!c.is_container);
    if(rows.length!==1)return;
    const component=rows[0],ticket=version,actor=identity();
    try{
      const history=await fetchRows('tool_movements','select=*&component_id=eq.'+encodeURIComponent(component.id)+'&order=exited_at.desc,registered_at.desc,id.desc');
      if(ticket!==version||actor!==identity())return;
      historyComponent=component;historyRows=history;
      const panel=view.querySelector('.tool-history-panel');panel.hidden=false;
      view.querySelector('[data-history-title]').textContent='تاریخچه · '+component.component_name+' · '+component.component_code;
      const body=panel.querySelector('tbody');
      body.innerHTML=history.length?history.map(row=>'<tr><td>'+partDate(row.exited_at)+'</td><td>'+partTime(row.exited_at)+'</td><td>'+esc(row.exit_receiver)+'</td><td>'+esc(row.exit_deliverer)+'</td><td>'+ (row.kind==='repair'?'تعمیر':'خروج')+'</td><td>'+esc(row.reason)+'</td><td>'+partDate(row.entered_at)+'</td><td>'+partTime(row.entered_at)+'</td><td>'+esc(row.entry_receiver||'—')+'</td><td>'+esc(row.entry_deliverer||'—')+'</td></tr>').join(''):'<tr><td class="empty" colspan="10">هنوز گردش ثبت نشده است.</td></tr>';
    }catch(error){notify(error.message,true)}
  }
  async function deactivateSelected() {
    const rows=(selected.components||[]).filter(c=>selectedIds.has(c.id)&&c.active);
    if(!rows.length||!can('edit'))return;
    if(!await window.bamcoConfirm('قطعات انتخاب‌شده غیرفعال شوند؟ سوابق گردش آن‌ها حفظ خواهد شد.'))return;
    for(const component of rows){const result=await update('tool_components',recordFilter(component),{active:false});if(!result?.length){notify(staleMessage,true);break}}
    await load(selected);
  }
  async function deleteAsset() {
    if(!selected||!can('delete'))return;
    if(!await window.bamcoConfirm('کارت «'+selected.name+'» و تمام قطعات و سوابق گردش وابسته به آن حذف شوند؟'))return;
    const result=await window.BamcoData.remove('tool_assets',recordFilter(selected));
    if(!result?.length){notify(staleMessage,true);return}
    notify('کارت ابزار حذف شد.');await load();
  }
  view.addEventListener('input',event=>{if(event.target.matches('[data-tool-search]')){query=event.target.value;showCards()}});
  view.addEventListener('change',event=>{
    if(!event.target.matches('[data-component-select]'))return;
    const id=event.target.value;
    if(event.target.checked)selectedIds.add(id);else selectedIds.delete(id);
    syncActions();
  });
  view.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.tool){const tool=assets.find(item=>item.id===button.dataset.tool);if(tool)void load(tool);return}
    const action=button.dataset.action;
    if(action==='list')void load();
    else if(action==='retry')void load(selected);
    else if(action==='asset')openAssetForm('asset');
    else if(action==='edit')openAssetForm('edit');
    else if(action==='componentAdd')openComponentForm('add');
    else if(action==='componentEdit')openComponentForm('edit');
    else if(action==='componentDeactivate')void deactivateSelected();
    else if(action==='exit'||action==='return')openCustodyForm(action);
    else if(action==='history')void showHistory();
    else if(action==='closeHistory'){view.querySelector('.tool-history-panel').hidden=true;historyComponent=null;historyRows=[]}
    else if(action==='deleteAsset')void deleteAsset();
  });
  function reset(){++version;editor?.close();editor=null;selected=null;selectedIds.clear();historyComponent=null;historyRows=[];assets=[];components=[];query='';owner=null;loaded=false;view.classList.remove('vehicle-view','tool-register');view.replaceChildren()}
  window.BamcoNavigation.registerView('tools',{activate:()=>load(),dispose:reset});
  document.addEventListener('bamco:department-selected',event=>{if(owner!==null&&(owner!==identity()||event.detail?.resolved===false))reset()});
  window.addEventListener('bamco:feature-access-changed',()=>{
    if(!can('view')){if(owner!==null)reset();return}
    if(window.Bamco.state.view!=='tools'||view.classList.contains('hidden'))return;
    if(owner!==identity()){reset();void load();return}
    syncActions();
  });
})();
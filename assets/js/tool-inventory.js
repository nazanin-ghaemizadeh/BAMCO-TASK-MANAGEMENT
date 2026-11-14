(() => {
  'use strict';
  const view = document.getElementById('toolsView');
  if (!view) return;
  const {esc, fa, date, fetchRows, insert, update, openJalaliPicker, notify} = window.bamcoEnterprise;
  const can = action => window.BamcoAccess?.can('tools', action) === true;
  const statusNames = {stock: 'در انبار', repair: 'در دست تعمیر', outside: 'خارج از انبار'};
  const headers = ['ردیف', 'تاریخ خروج', 'ساعت خروج', 'تحویل‌گیرنده حین خروج', 'تحویل‌دهنده حین خروج', 'علت خروج', 'تاریخ ورود', 'ساعت ورود', 'تحویل‌گیرنده حین ورود', 'تحویل‌دهنده حین ورود'];
  const normalize = value => String(value ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/ي/g,'ی').replace(/ك/g,'ک').trim().toLowerCase();
  const timeFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tehran', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const order = 'exited_at.desc,registered_at.desc,id.desc';
  const home = '<button type="button" class="ghost" data-home-action>بازگشت به خانه</button>';
  let assets = [], movements = [], selected = null, query = '', version = 0, editor = null;
  let owner = null, loaded = false, deleting = false, pendingHistory = null;
  const assetOrder = new Intl.Collator('fa');
  const pickedIds = new Set();
  const openMovement = () => loaded ? movements.find(row => !row.entered_at) : selected?.latest?.find(row => !row.entered_at);
  const recordFilter = record => `id=eq.${encodeURIComponent(record.id)}&revision=eq.${encodeURIComponent(record.revision)}`;
  const staleMessage = 'این مورد تغییر کرده یا حذف شده است. اطلاعات را دوباره باز کنید.';
  const latest = tool => tool.latest?.[0];
  const status = row => row && !row.entered_at ? row.kind : 'stock';
  const partDate = stamp => stamp ? date(stamp.slice(0,10)) : '—';
  const partTime = stamp => stamp ? fa(stamp.slice(11,16)) : '—';
  const identity = () => [window.Bamco?.state?.user?.id, window.BamcoWorkspace?.key?.()].join('/');

  function card(tool) {
    const row = latest(tool), state = status(row);
    const fields = [['کد اموال',tool.asset_code],['تاریخ خرید',date(tool.purchased_on)],['تحویل‌گیرنده هنگام خرید',tool.purchase_receiver],['اکنون در اختیار',state === 'stock' ? '—' : row.exit_receiver]];
    return `<button type="button" class="tool-card" data-state="${state}" data-tool="${esc(tool.id)}"><span class="tool-card-head"><strong dir="auto">${esc(tool.name)}</strong><span class="tool-status" aria-label="وضعیت: ${statusNames[state]}">${statusNames[state]}</span></span>${fields.map(([label,value])=>`<span class="tool-card-line"><span>${label}</span><bdi>${esc(value || '—')}</bdi></span>`).join('')}</button>`;
  }
  function showCards() {
    const grid = view.querySelector('.tool-grid');
    if (!grid) return;
    const key = normalize(query);
    const visible = assets.filter(tool => normalize(tool.name).includes(key) || normalize(tool.asset_code).includes(key));
    grid.innerHTML = visible.length ? visible.map(card).join('') : `<p class="tool-empty">${key ? 'ابزاری با این نام یا کد اموال پیدا نشد.' : 'هنوز ابزاری ثبت نشده است.'}</p>`;
  }
  function mount(tool) {
    const heading = tool ? `گردش ابزار · ${esc(tool.name)} · ${esc(tool.asset_code)}` : 'مدیریت ابزار';
    const toolbar = tool
      ? `<button type="button" class="ghost" data-action="list">بازگشت به کارت‌ها</button><button type="button" class="primary" data-action="exit" hidden>ثبت خروج</button><button type="button" class="primary" data-action="return" hidden>ثبت ورود</button><button type="button" class="ghost" data-action="edit" hidden>ویرایش کارت</button><button type="button" class="danger" data-action="deleteAsset" hidden>حذف کارت</button><button type="button" class="ghost" data-action="editRow" hidden disabled>ویرایش ردیف</button><button type="button" class="danger" data-action="deleteRow" hidden disabled>حذف ردیف</button>`
      : `${home}<button type="button" class="primary" data-action="asset" hidden>افزودن ابزار</button><input type="search" class="search vehicle-search" data-tool-search aria-label="جست‌وجوی ابزار" placeholder="جست‌وجوی نام ابزار یا کد اموال" value="${esc(query)}">`;
    const content = tool
      ? `<div class="vehicle-table-wrap"><table class="vehicle-data-table" data-table-key="toolMovements" data-local-selection="true" data-table-suite="off" data-no-pagination="true" aria-label="سوابق گردش ابزار"><thead><tr>${headers.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody><tr><td class="empty" colspan="${headers.length}">در حال دریافت سوابق…</td></tr></tbody></table></div>`
      : '<div class="tool-grid"><p class="tool-empty" role="status">در حال دریافت ابزارها…</p></div>';
    view.classList.add('vehicle-view','tool-register');
    view.innerHTML = `<div class="panel vehicle-panel"><div class="panel-head vehicle-panel-head"><div><h3>${heading}</h3></div></div><div class="vehicle-toolbar" ${tool ? 'data-home-return-suppressed="true"' : ''}>${toolbar}</div><div class="tool-load-error" role="alert" hidden><span></span> <button type="button" class="ghost" data-action="retry">تلاش دوباره</button></div>${content}</div>`;
  }
  function syncActions() {
    const outside = Boolean(openMovement());
    const available = {asset:can('create'), edit:can('edit'), deleteAsset:can('delete'), editRow:can('edit'), deleteRow:can('delete'), exit:!outside && can('create'), return:outside && can('edit')};
    for (const button of view.querySelectorAll('.vehicle-toolbar [data-action]')) {
      const action = button.dataset.action;
      if (!Object.hasOwn(available,action)) continue;
      if (button.hidden === available[action]) button.hidden = !available[action];
      if (action === 'editRow' || action === 'deleteRow') {
        const disabled = action === 'editRow' ? pickedIds.size !== 1 : pickedIds.size === 0;
        if (button.disabled !== disabled) button.disabled = disabled;
      }
    }
  }
  function paintSelection(tr) {
    const active = pickedIds.has(tr.dataset.movement);
    tr.classList.toggle('task-selected',active);
    tr.setAttribute('aria-selected',String(active));
  }
  function toggleRow(tr) {
    const id = tr.dataset.movement;
    if (pickedIds.has(id)) pickedIds.delete(id);
    else pickedIds.add(id);
    paintSelection(tr);
    syncActions();
  }
  function renderHistory() {
    const table = view.querySelector('table');
    const body = table.tBodies[0], current = new Map([...body.rows].map(tr=>[tr.dataset.movement,tr]));
    if (!movements.length) {
      body.innerHTML = `<tr><td class="empty" colspan="${headers.length}">هنوز گردشی برای این ابزار ثبت نشده است.</td></tr>`;
    } else {
      let next = body.firstElementChild;
      for (const [index,row] of movements.entries()) {
        const number = fa(movements.length-index);
        let tr = current.get(row.id);
        if (!tr || tr.dataset.revision !== String(row.revision)) {
          const cells = [number,partDate(row.exited_at),partTime(row.exited_at),row.exit_receiver,row.exit_deliverer,row.reason,partDate(row.entered_at),partTime(row.entered_at),row.entry_receiver,row.entry_deliverer];
          const replacement = document.createElement('tr');
          replacement.dataset.movement = row.id;
          replacement.dataset.revision = row.revision;
          replacement.tabIndex = 0;
          paintSelection(replacement);
          replacement.innerHTML = cells.map(value=>`<td><span class="vehicle-persian-value">${esc(value || '—')}</span></td>`).join('');
          if (tr) { if (next === tr) next = replacement; tr.replaceWith(replacement); }
          tr = replacement;
        } else {
          const indexCell = tr.cells[0].firstElementChild;
          if (indexCell.textContent !== number) indexCell.textContent = number;
        }
        current.delete(row.id);
        if (tr !== next) body.insertBefore(tr,next);
        next = tr.nextElementSibling;
      }
    }
    for (const [id,obsolete] of current) { pickedIds.delete(id); obsolete.remove(); }
    window.bamcoReferenceTable?.refresh(table,{filters:true});
    table.querySelector('.reference-filters')?.classList.add('vehicle-filters');
  }
  async function load(tool = null) {
    if (!can('view')) { reset(); return; }
    const ticket = ++version, actor = identity();
    const samePage = actor === owner && selected?.id === tool?.id && view.querySelector('.vehicle-panel');
    if (actor !== owner) { assets = []; query = ''; }
    pendingHistory = tool ? new Map() : null;
    owner = actor;
    selected = tool;
    if (!samePage) { loaded = false; pickedIds.clear(); movements = []; mount(tool); }
    else if (tool) view.querySelector('h3').textContent = `گردش ابزار · ${tool.name} · ${tool.asset_code}`;
    if (!samePage && !tool && assets.length) showCards();
    const warning = view.querySelector('.tool-load-error');
    warning.hidden = true;
    syncActions();
    const current = () => ticket === version && actor === identity() && can('view');
    try {
      if (tool) {
        const rows = await fetchRows('tool_movements',`select=*&tool_id=eq.${encodeURIComponent(tool.id)}&order=${order}`);
        if (!current()) return;
        movements = rows;
        for (const [id,record] of pendingHistory) {
          const fromServer = rows.find(item=>item.id === id);
          if (!record || !fromServer || Number(record.revision) > Number(fromServer.revision)) mergeMovement(id,record);
        }
        pendingHistory = null;
        loaded = true;
        const open = openMovement();
        tool.latest = open ? [open] : [];
        renderHistory();
      } else {
        const rows = await fetchRows('tool_assets','select=*,latest:tool_movements(id,revision,kind,exited_at,exit_receiver,entered_at)&latest.entered_at=is.null&latest.order='+order+'&latest.limit=1&order=name.asc,asset_code.asc,id.asc');
        if (!current()) return;
        const gridReady = view.querySelector('.tool-card,.tool-empty:not([role=status])');
        const sameCards = gridReady && rows.length === assets.length && rows.every((row,index)=>{
          const cached = assets[index], last = latest(row), previous = latest(cached);
          return row.id === cached.id && row.revision === cached.revision && last?.id === previous?.id && last?.revision === previous?.revision;
        });
        assets = rows;
        if (!sameCards) showCards();
      }
      loaded = true;
      syncActions();
    } catch (error) {
      if (!current()) return;
      if (!loaded && !(tool ? movements.length : assets.length)) view.querySelector('.tool-grid,tbody')?.replaceChildren();
      warning.querySelector('span').textContent = error.message;
      warning.hidden = false;
    }
  }

  // The write response contains the committed row and revision. A history read
  // already in flight may predate that write, so replay it onto that snapshot.
  function mergeMovement(id,record) {
    movements = movements.filter(row=>row.id !== id);
    if (!record) return;
    movements.push(record);
    movements.sort((a,b)=>b.exited_at.localeCompare(a.exited_at)
      || String(b.registered_at || '').localeCompare(String(a.registered_at || '')) || String(b.id).localeCompare(String(a.id)));
  }
  function applyMovement(tool,id,record) {
    pendingHistory?.set(id,record);
    mergeMovement(id,record);
    if (record && !record.entered_at) tool.latest = [record];
    else if (tool.latest?.[0]?.id === id) tool.latest = [];
    renderHistory();
    syncActions();
  }
  const textField = (name,label,value='',required=true,people=false) => `<label>${label}<input name="${name}" type="text" value="${esc(value || '')}" ${required ? 'required' : ''} ${people ? 'list="toolPeople"' : ''}></label>`;
  function dateField(label,iso='',required=true,prefix='') {
    return `<label>${label}<span class="tool-date"><input name="${prefix}dateText" autocomplete="off" dir="ltr" placeholder="۱۴۰۵/۰۸/۲۳" value="${iso ? esc(date(iso)) : ''}" ${required ? 'required' : ''}><button type="button" class="ghost" data-calendar="${prefix}" aria-label="تقویم ${label}">▦</button></span><input type="hidden" name="${prefix}isoDate" value="${esc(iso || '')}"></label>`;
  }
  function readDate(form,prefix='') {
    const value = normalize(form.elements.namedItem(prefix+'dateText').value);
    if (!value) return null;
    const stored = form.elements.namedItem(prefix+'isoDate').value;
    if (stored && value === normalize(date(stored))) return stored;
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
    const iso = match && jalaliToISO(...match.slice(1));
    if (!iso) throw Error('تاریخ شمسی را به صورت سال/ماه/روز وارد کنید.');
    return iso;
  }
  function readTime(value) {
    const match = /^(\d{1,2}):?(\d{2})$/.exec(normalize(value));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw Error('ساعت را در قالب ۲۴ ساعته وارد کنید، مانند ۰۸:۳۰.');
    return `${match[1].padStart(2,'0')}:${match[2]}`;
  }
  function custodyFields(entering,day,time,receiver,deliverer,prefix='') {
    const action = entering ? 'ورود' : 'خروج';
    return dateField(`تاریخ ${action}`,day,true,prefix)
      + `<label>ساعت ${action}<input type="text" class="tool-time" name="${prefix}time" dir="ltr" autocomplete="off" placeholder="۰۸:۳۰" maxlength="5" value="${esc(fa(time))}" required></label>`
      + textField(prefix+'receiver',`تحویل‌گیرنده حین ${action}`,receiver,true,true)
      + textField(prefix+'deliverer',`تحویل‌دهنده حین ${action}`,deliverer,true,true);
  }
  function readCustody(form,entering,prefix='') {
    const value = key => form.elements.namedItem(prefix+key).value.trim();
    const iso = readDate(form,prefix), time = readTime(value('time'));
    const receiver = value('receiver'), deliverer = value('deliverer');
    if (!iso || !receiver || !deliverer) throw Error('تاریخ و نام هر دو طرف را وارد کنید.');
    const stamp = `${iso}T${time}:00`;
    return entering ? {entered_at:stamp,entry_receiver:receiver,entry_deliverer:deliverer} : {exited_at:stamp,exit_receiver:receiver,exit_deliverer:deliverer};
  }
  function openForm(mode,tool=selected) {
    const isAsset = mode === 'asset' || mode === 'edit', editingRow = mode === 'editRow';
    const permission = ['edit','return','editRow'].includes(mode) ? 'edit' : 'create';
    if (editor || !can(permission)) return;
    const actor = identity();
    const row = editingRow && pickedIds.size === 1 ? movements.find(item=>pickedIds.has(item.id)) : mode === 'return' ? openMovement() : null;
    if ((editingRow || mode === 'return') && !row) return;
    const [today,now] = timeFormat.format(new Date()).split(' ');
    const title = {asset:'افزودن ابزار',edit:'ویرایش کارت',editRow:'ویرایش ردیف گردش',exit:'ثبت خروج',return:'ثبت ورود'}[mode];
    let fields;
    if (isAsset) {
      const values = mode === 'edit' ? tool : {};
      fields = textField('name','نام ابزار',values.name)+textField('asset_code','کد اموال',values.asset_code)+dateField('تاریخ خرید',values.purchased_on,false)+textField('purchase_receiver','تحویل‌گیرنده هنگام خرید',values.purchase_receiver,false,true);
    } else if (mode === 'return') {
      fields = custodyFields(true,today,now,'',row.exit_receiver);
    } else {
      const exit = row?.exited_at;
      fields = custodyFields(false,exit?.slice(0,10) || today,exit?.slice(11,16) || now,row?.exit_receiver,row?.exit_deliverer)
        + `<label class="tool-exit-field">نوع خروج<select name="kind"><option value="outside">خروج از انبار</option><option value="repair" ${row?.kind === 'repair' ? 'selected' : ''}>ارسال برای تعمیر</option></select></label><label class="tool-exit-field">علت خروج<textarea name="reason" required rows="1">${esc(row?.reason || '')}</textarea></label>`;
      if (row?.entered_at) fields += custodyFields(true,row.entered_at.slice(0,10),row.entered_at.slice(11,16),row.entry_receiver,row.entry_deliverer,'entry_');
    }
    const dialog = document.createElement('dialog');
    editor = dialog;
    dialog.id = 'toolInventoryEditor';
    dialog.className = 'modal tool-editor bamco-dialog';
    dialog.setAttribute('aria-labelledby','toolEditorTitle');
    const names = [...new Set((window.Bamco?.state?.profiles || []).map(person=>person.display_name || person.full_name).filter(Boolean))];
    dialog.innerHTML = `<form><div class="modal-head"><h3 id="toolEditorTitle">${title}${tool ? ' · '+esc(tool.name) : ''}</h3><button type="button" data-cancel aria-label="بستن">×</button></div><div class="tool-fields">${fields}</div><datalist id="toolPeople">${names.map(name=>`<option value="${esc(name)}"></option>`).join('')}</datalist><p class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="ghost" data-cancel>انصراف</button><button class="primary" type="submit">ثبت</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), elements = form.elements;
    let saving = false;
    dialog.addEventListener('close',()=>{dialog.remove(); if(editor===dialog) editor=null;},{once:true});
    dialog.addEventListener('cancel',event=>{if(saving) event.preventDefault();});
    dialog.addEventListener('click',event=>{
      if (event.target.closest('[data-cancel]') && !saving) dialog.close();
      const calendar = event.target.closest('[data-calendar]');
      if (calendar) {
        const prefix = calendar.dataset.calendar;
        const hidden = elements.namedItem(prefix+'isoDate');
        try { hidden.value = readDate(form,prefix) || ''; } catch { hidden.value = ''; }
        openJalaliPicker({visible:elements.namedItem(prefix+'dateText'),hidden,label:calendar.getAttribute('aria-label')});
      }
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if (saving || actor !== identity() || !can(permission)) return;
      const button = form.querySelector('[type=submit]'), feedback = form.querySelector('[role=alert]');
      saving = true; button.disabled = true; button.textContent = 'در حال ثبت…'; feedback.textContent = '';
      const val = key => elements.namedItem(key).value.trim();
      let persisted = null;
      try {
        if (isAsset) {
          const body = {name:val('name'),asset_code:val('asset_code'),purchased_on:readDate(form),purchase_receiver:val('purchase_receiver') || null};
          if (!body.name || !body.asset_code) throw Error('نام ابزار و کد اموال را وارد کنید.');
          const result = mode === 'asset' ? await insert('tool_assets',body) : await update('tool_assets',recordFilter(tool),body);
          if (!result?.length) throw Error(staleMessage);
          persisted = result[0];
        } else {
          const entering = mode === 'return';
          const body = readCustody(form,entering);
          if (!entering) {
            body.kind = val('kind'); body.reason = val('reason');
            if (!body.reason) throw Error('علت خروج را وارد کنید.');
          }
          if (editingRow && row.entered_at) Object.assign(body,readCustody(form,true,'entry_'));
          if (body.entered_at && body.entered_at < (body.exited_at || row.exited_at).slice(0,19)) throw Error('زمان ورود نمی‌تواند پیش از خروج باشد.');
          const result = mode === 'exit' ? await insert('tool_movements',{tool_id:tool.id,...body})
            : await update('tool_movements',recordFilter(row) + (entering ? '&entered_at=is.null' : ''),body);
          if (!result?.length) throw Error(staleMessage);
          persisted = result[0];
        }
        if (editor !== dialog || actor !== identity()) return;
        dialog.close(); notify('اطلاعات ثبت شد.');
        if (!isAsset) {
          if (editingRow) pickedIds.delete(persisted.id);
          applyMovement(tool,persisted.id,persisted);
        }
        else if (mode === 'edit') {
          Object.assign(tool,persisted);
          view.querySelector('h3').textContent = `گردش ابزار · ${tool.name} · ${tool.asset_code}`;
        } else if (loaded) {
          assets.push({...persisted,latest:[]});
          assets.sort((a,b)=>assetOrder.compare(a.name,b.name) || assetOrder.compare(a.asset_code,b.asset_code) || String(a.id).localeCompare(String(b.id)));
          showCards();
        } else { await load(); }
      } catch (error) {
        feedback.textContent = error.code === '23505' ? (isAsset ? 'این کد اموال قبلاً ثبت شده است.' : 'این ابزار یک خروج باز دارد.') : error.message;
      } finally { saving = false; button.disabled = false; button.textContent = 'ثبت'; }
    });
    dialog.showModal();
  }
  async function deleteRecords(tool,rows = null) {
    if (deleting || !tool || !can('delete') || rows?.length === 0) return;
    const actor = identity(), page = selected?.id;
    const current = () => actor === identity() && owner === actor && page === selected?.id;
    let description = `کارت «${tool.name}» با کد اموال ${tool.asset_code} و تمام سوابق گردش آن برای همیشه حذف شود؟`;
    if (rows?.length === 1) description = `ردیف خروج «${tool.name}» در تاریخ ${partDate(rows[0].exited_at)} ساعت ${partTime(rows[0].exited_at)} حذف شود؟`;
    else if (rows) description = `${fa(rows.length)} ردیف انتخاب‌شده از گردش «${tool.name}» برای همیشه حذف شوند؟`;
    deleting = true;
    try {
      if (!await window.bamcoConfirm(description) || !current() || !can('delete')) return;
      if (!rows) {
        const result = await window.BamcoData.remove('tool_assets',recordFilter(tool));
        if (!current()) return;
        if (result?.length) assets = assets.filter(asset=>asset.id !== tool.id);
        notify(result?.length ? 'کارت ابزار حذف شد.' : staleMessage,!result?.length);
        await load();
        return;
      }
      // Match each ID against the revision the user confirmed. Keep URLs
      // bounded even when selecting across many pages of the register.
      let deleted = 0;
      for (let start=0; start<rows.length; start+=40) {
        if (!current() || !can('delete')) return;
        const batch = rows.slice(start,start+40);
        const filter = batch.length === 1 ? recordFilter(batch[0])
          : 'or=('+batch.map(row=>`and(id.eq.${encodeURIComponent(row.id)},revision.eq.${encodeURIComponent(row.revision)})`).join(',')+')';
        const result = await window.BamcoData.remove('tool_movements',`tool_id=eq.${encodeURIComponent(tool.id)}&${filter}`);
        if (!current()) return;
        for (const row of result) {
          pendingHistory?.set(row.id,null);
          pickedIds.delete(row.id);
          if (tool.latest?.[0]?.id === row.id) tool.latest = [];
        }
        const removed = new Set(result.map(row=>row.id));
        movements = movements.filter(row=>!removed.has(row.id));
        deleted += result.length;
      }
      if (deleted !== rows.length) {
        notify(`${fa(deleted)} ردیف حذف شد. سایر ردیف‌ها تغییر کرده‌اند یا قبلاً حذف شده‌اند.`,true);
        await load(tool);
      } else {
        renderHistory(); syncActions();
        notify(rows.length === 1 ? 'ردیف گردش حذف شد.' : `${fa(deleted)} ردیف گردش حذف شد.`);
      }
    } catch (error) {
      if (current()) { notify(error.message,true); await load(rows ? tool : null); }
    } finally { deleting = false; }
  }
  view.addEventListener('input',event=>{if(event.target.matches('[data-tool-search]')){query=event.target.value;showCards();}});
  view.addEventListener('click',event=>{
    const tr = event.target.closest('tr[data-movement]');
    if (tr) { toggleRow(tr); return; }
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tool) { const tool = assets.find(item=>item.id===button.dataset.tool); if(tool) void load(tool); return; }
    const action = button.dataset.action;
    const tool = selected;
    if (action==='list') void load();
    else if (action==='retry') void load(selected);
    else if (action==='deleteAsset') void deleteRecords(tool);
    else if (action==='deleteRow') void deleteRecords(tool,movements.filter(row=>pickedIds.has(row.id)));
    else if (['asset','edit','exit','return','editRow'].includes(action)) openForm(action,tool);
  });
  function reset() {
    ++version; editor?.close(); editor = null;
    selected = null; pickedIds.clear(); pendingHistory = null; assets = []; movements = []; query = ''; owner = null; loaded = false;
    view.classList.remove('vehicle-view','tool-register'); view.replaceChildren();
  }
  window.BamcoNavigation.registerView('tools',{activate:()=>load(),dispose:reset});
  document.addEventListener('bamco:department-selected',event=>{
    if (owner !== null && (owner !== identity() || event.detail?.resolved === false)) reset();
  });
  window.addEventListener('bamco:feature-access-changed',()=>{
    if (!can('view')) { if (owner !== null) reset(); return; }
    if (window.Bamco.state.view !== 'tools' || view.classList.contains('hidden')) return;
    if (owner !== identity()) { reset(); void load(); return; }
    syncActions();
  });
})();

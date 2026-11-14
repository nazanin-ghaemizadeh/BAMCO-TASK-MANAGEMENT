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
  const latest = tool => tool.latest?.[0];
  const status = row => row && !row.entered_at ? row.kind : 'stock';
  const holder = (row, tool) => row ? (row.entered_at ? row.entry_receiver : row.exit_receiver) : (tool.purchase_receiver || 'انبار');
  const partDate = stamp => stamp ? date(stamp.slice(0,10)) : '—';
  const partTime = stamp => stamp ? fa(stamp.slice(11,16)) : '—';
  const identity = () => [window.Bamco?.state?.user?.id, window.BamcoWorkspace?.key?.()].join('/');

  function card(tool) {
    const row = latest(tool), state = status(row);
    const fields = [['کد اموال',tool.asset_code],['تاریخ خرید',date(tool.purchased_on)],['تحویل‌گیرنده هنگام خرید',tool.purchase_receiver],['اکنون در اختیار',holder(row,tool)]];
    return `<button type="button" class="tool-card" data-state="${state}" data-tool="${esc(tool.id)}"><span class="tool-card-head"><strong dir="auto">${esc(tool.name)}</strong><span class="tool-status" aria-label="وضعیت: ${statusNames[state]}">${statusNames[state]}</span></span>${fields.map(([label,value])=>`<span class="tool-card-line"><span>${label}</span><bdi>${esc(value || '—')}</bdi></span>`).join('')}</button>`;
  }
  function showCards() {
    const grid = view.querySelector('.tool-grid');
    if (!grid) return;
    const key = normalize(query);
    const visible = assets.filter(tool => normalize(tool.name).includes(key) || normalize(tool.asset_code).includes(key));
    grid.innerHTML = visible.length ? visible.map(card).join('') : `<p class="tool-empty">${key ? 'ابزاری با این نام یا کد اموال پیدا نشد.' : 'هنوز ابزاری ثبت نشده است.'}</p>`;
  }
  function renderList() {
    view.classList.remove('vehicle-view');
    view.innerHTML = `<div class="enterprise-feature-root tool-panel"><div class="feature-toolbar enterprise-toolbar"><div><h3>مدیریت ابزار</h3></div><div class="feature-toolbar-actions tool-list-actions">${home}${can('create') ? '<button class="primary" data-action="asset">افزودن ابزار</button>' : ''}<input type="search" class="search" data-tool-search aria-label="جست‌وجوی ابزار" placeholder="جست‌وجوی نام ابزار یا کد اموال" value="${esc(query)}"></div></div><div class="tool-grid"></div></div>`;
    showCards();
  }
  function renderHistory() {
    const first = movements[0], open = status(first) !== 'stock';
    const action = open ? (can('edit') ? '<button class="primary" data-action="return">ثبت ورود</button>' : '') : (can('create') ? '<button class="primary" data-action="exit">ثبت خروج</button>' : '');
    view.classList.add('vehicle-view');
    const rows = movements.map((row,index) => [fa(movements.length-index),partDate(row.exited_at),partTime(row.exited_at),row.exit_receiver,row.exit_deliverer,row.reason,partDate(row.entered_at),partTime(row.entered_at),row.entry_receiver,row.entry_deliverer]);
    view.innerHTML = `<div class="panel vehicle-panel"><div class="panel-head vehicle-panel-head"><h3>گردش ابزار · ${esc(selected.name)} · ${esc(selected.asset_code)}</h3></div><div class="vehicle-toolbar">${home}<button class="ghost" data-action="list">بازگشت به ابزارها</button>${action}${can('edit') ? '<button class="ghost" data-action="edit">ویرایش ابزار</button>' : ''}</div><div class="vehicle-table-wrap"><table class="vehicle-data-table" data-table-key="toolMovements" data-local-selection="true" data-table-suite="off" data-no-pagination="true" aria-label="سوابق گردش ابزار"><thead><tr>${headers.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(cells=>`<tr>${cells.map(value=>`<td><span class="vehicle-persian-value">${esc(value || '—')}</span></td>`).join('')}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">هنوز گردشی برای این ابزار ثبت نشده است.</td></tr>`}</tbody></table></div></div>`;
    const table = view.querySelector('table');
    window.bamcoReferenceTable?.refresh(table,{filters:true});
    table.querySelector('.reference-filters')?.classList.add('vehicle-filters');
  }
  async function load(tool = null) {
    const ticket = ++version, actor = identity();
    selected = tool;
    const current = () => ticket === version && actor === identity() && can('view');
    if (!can('view')) { view.replaceChildren(); return; }
    view.classList.remove('vehicle-view');
    view.innerHTML = `<div class="enterprise-feature-root tool-panel"><div class="feature-toolbar enterprise-toolbar"><h3>مدیریت ابزار</h3><div class="feature-toolbar-actions">${home}</div></div><p class="tool-empty" role="status">در حال دریافت اطلاعات…</p></div>`;
    try {
      if (tool) {
        const rows = await fetchRows('tool_movements',`select=*&tool_id=eq.${encodeURIComponent(tool.id)}&order=${order}`);
        if (!current()) return;
        movements = rows;
        renderHistory();
      } else {
        const rows = await fetchRows('tool_assets','select=*,latest:tool_movements(kind,exit_receiver,entry_receiver,entered_at)&latest.order='+order+'&latest.limit=1&order=name.asc,asset_code.asc,id.asc');
        if (!current()) return;
        assets = rows;
        renderList();
      }
    } catch (error) {
      if (!current()) return;
      view.innerHTML = `<div class="panel tool-panel"><p class="tool-empty" role="alert">${esc(error.message)}</p><div class="tool-list-actions">${home}<button class="ghost" data-action="retry">تلاش دوباره</button>${tool ? '<button class="ghost" data-action="list">بازگشت به ابزارها</button>' : ''}</div></div>`;
    }
  }

  const textField = (name,label,value='',required=true,people=false) => `<label>${label}<input name="${name}" type="text" value="${esc(value || '')}" ${required ? 'required' : ''} ${people ? 'list="toolPeople"' : ''}></label>`;
  function dateField(label,iso='',required=true) {
    return `<label>${label}<span class="tool-date"><input name="dateText" autocomplete="off" inputmode="text" dir="ltr" placeholder="۱۴۰۵/۰۸/۲۳" value="${iso ? esc(date(iso)) : ''}" ${required ? 'required' : ''}><button type="button" class="ghost" data-calendar aria-label="تقویم ${label}">▦</button></span><input type="hidden" name="isoDate" value="${esc(iso || '')}"></label>`;
  }
  function readDate(form) {
    const value = normalize(form.elements.dateText.value);
    if (!value) return null;
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
    const iso = match && jalaliToISO(...match.slice(1));
    if (!iso) throw Error('تاریخ شمسی را به صورت سال/ماه/روز وارد کنید.');
    return iso;
  }
  function openForm(mode) {
    const isAsset = mode === 'asset' || mode === 'edit';
    if (editor || !can(mode === 'return' || mode === 'edit' ? 'edit' : 'create')) return;
    const tool = selected, row = movements[0], actor = identity();
    const [today,now] = timeFormat.format(new Date()).split(' ');
    const title = {asset:'افزودن ابزار',edit:'ویرایش ابزار',exit:'ثبت خروج',return:'ثبت ورود'}[mode];
    let fields;
    if (isAsset) {
      const values = mode === 'edit' ? tool : {};
      fields = textField('name','نام ابزار',values.name)+textField('asset_code','کد اموال',values.asset_code)+dateField('تاریخ خرید',values.purchased_on,false)+textField('purchase_receiver','تحویل‌گیرنده هنگام خرید',values.purchase_receiver,false,true);
    } else {
      const entering = mode === 'return', action = entering ? 'ورود' : 'خروج';
      fields = dateField(`تاریخ ${action}`,today)+`<label>ساعت ${action}<input type="time" name="time" value="${now}" required></label>`+textField('receiver',`تحویل‌گیرنده حین ${action}`,'',true,true)+textField('deliverer',`تحویل‌دهنده حین ${action}`,entering ? row.exit_receiver : '',true,true);
      if (!entering) fields += '<label>نوع خروج<select name="kind"><option value="outside">خروج از انبار</option><option value="repair">ارسال برای تعمیر</option></select></label><label>علت خروج<textarea name="reason" required rows="2"></textarea></label>';
    }
    const dialog = document.createElement('dialog');
    editor = dialog;
    dialog.className = 'modal tool-editor';
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
      if (event.target.closest('[data-calendar]')) {
        try { elements.isoDate.value = readDate(form) || ''; } catch { elements.isoDate.value = ''; }
        openJalaliPicker({visible:elements.dateText,hidden:elements.isoDate,label:isAsset ? 'تاریخ خرید' : title});
      }
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if (saving || actor !== identity() || !can(mode==='edit' || mode==='return' ? 'edit' : 'create')) return;
      const button = form.querySelector('[type=submit]'), feedback = form.querySelector('[role=alert]');
      saving = true; button.disabled = true; feedback.textContent = '';
      const val = key => elements.namedItem(key).value.trim();
      let persisted = null;
      try {
        const iso = readDate(form);
        if (isAsset) {
          const body = {name:val('name'),asset_code:val('asset_code'),purchased_on:iso,purchase_receiver:val('purchase_receiver') || null};
          if (!body.name || !body.asset_code) throw Error('نام ابزار و کد اموال را وارد کنید.');
          const result = mode === 'asset' ? await insert('tool_assets',body) : await update('tool_assets',`id=eq.${tool.id}`,body);
          if (!result?.length) throw Error('ثبت مشخصات ابزار انجام نشد.');
          persisted = result[0];
        } else {
          const stamp = `${iso}T${val('time')}:00`, receiver = val('receiver'), deliverer = val('deliverer');
          if (!iso || !receiver || !deliverer) throw Error('تاریخ و نام هر دو طرف را وارد کنید.');
          if (mode === 'return') {
            if (stamp < row.exited_at.slice(0,19)) throw Error('زمان ورود نمی‌تواند پیش از خروج باشد.');
            const result = await update('tool_movements',`id=eq.${row.id}&entered_at=is.null`,{entered_at:stamp,entry_receiver:receiver,entry_deliverer:deliverer});
            if (!result?.length) throw Error('این گردش قبلاً بسته شده است. سوابق را دوباره باز کنید.');
          } else {
            if (!val('reason')) throw Error('علت خروج را وارد کنید.');
            await insert('tool_movements',{tool_id:tool.id,kind:val('kind'),exited_at:stamp,exit_receiver:receiver,exit_deliverer:deliverer,reason:val('reason')});
          }
        }
        if (editor !== dialog || actor !== identity()) return;
        dialog.close(); notify('اطلاعات ثبت شد.');
        await load(mode === 'edit' ? persisted : tool);
      } catch (error) {
        feedback.textContent = error.code === '23505' ? (isAsset ? 'این کد اموال قبلاً ثبت شده است.' : 'این ابزار یک خروج باز دارد.') : error.message;
      } finally { saving = false; button.disabled = false; }
    });
    dialog.showModal();
  }
  view.addEventListener('input',event=>{if(event.target.matches('[data-tool-search]')){query=event.target.value;showCards();}});
  view.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.tool) { const tool = assets.find(item=>item.id===button.dataset.tool); if(tool) void load(tool); return; }
    const action = button.dataset.action;
    if (action==='list') void load();
    else if (action==='retry') void load(selected);
    else if (['asset','edit','exit','return'].includes(action)) openForm(action);
  });
  function reset() {
    ++version; editor?.close(); editor = null;
    selected = null; assets = []; movements = []; query = '';
    view.classList.remove('vehicle-view'); view.replaceChildren();
  }
  window.BamcoNavigation.registerView('tools',{activate:()=>load(),dispose:reset});
  document.addEventListener('bamco:department-selected',reset);
  window.addEventListener('bamco:feature-access-changed',()=>{
    if (!can('view')) reset();
    else if (window.Bamco.state.view==='tools' && !view.classList.contains('hidden') && !editor) void load(selected);
  });
})();

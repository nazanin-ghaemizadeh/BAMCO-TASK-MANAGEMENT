/* Operational part handover register. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, esc, date, fetchRows, insert, update, removeRows, setBusy, notify } = E;
  const headers = [
    'نام قطعه', 'شماره فنی', 'تحویل‌دهنده در زمان دریافت', 'تحویل‌گیرنده در زمان دریافت',
    'تحویل‌دهنده در زمان عودت', 'تحویل‌گیرنده در زمان عودت', 'نوع تحویل (دائم یا موقت)',
    'اگر موقت: تاریخ عودت', 'علت تحویل', 'تاریخ ثبت', 'توضیحات'
  ];
  const model = { rows: [], selected: new Set(), search: '' };
  let loadVersion = 0;
  const root = () => q('#partFeatureRoot');
  const selectedRow = () => model.rows.find(row => model.selected.has(String(row.id))) || null;
  const visibleRows = () => {
    const term = model.search.trim().toLocaleLowerCase('fa');
    if (!term) return model.rows;
    return model.rows.filter(row => Object.values(row).some(value => String(value || '').toLocaleLowerCase('fa').includes(term)));
  };
  const value = item => esc(item || '—');
  const delivery = type => type === 'temporary' ? 'موقت' : 'دائم';
  const rowCells = row => [
    value(row.part_name), value(row.technical_number), value(row.received_from), value(row.received_by),
    value(row.returned_from), value(row.returned_by), delivery(row.delivery_type), date(row.return_due_date),
    value(row.reason), date(row.registered_at), value(row.notes)
  ].map(cell => `<td>${cell}</td>`).join('');
  function render() {
    const host = root(); if (!host) return;
    const rows = visibleRows();
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>مدیریت قطعات</h3></div><div class="feature-toolbar-actions"><input id="partSearch" type="search" value="${esc(model.search)}" placeholder="جست‌وجو"><button type="button" class="ghost" data-home-action>بازگشت به خانه</button><button type="button" class="primary" data-part-action="new">ثبت تحویل قطعه</button><button type="button" class="ghost" data-part-action="edit">ویرایش</button><button type="button" class="ghost" data-part-action="delete">حذف</button><button type="button" class="ghost" data-part-action="export">خروجی اکسل</button><button type="button" class="ghost" data-part-action="refresh">تازه‌سازی</button></div></div><div class="panel table-panel part-handover-panel"><div class="table-wrap"><table class="workspace-table part-handover-table" aria-label="ثبت تحویل قطعات"><thead><tr>${headers.map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr data-part-handover-id="${esc(row.id)}" aria-selected="${model.selected.has(String(row.id)) ? 'true' : 'false'}" class="${model.selected.has(String(row.id)) ? 'task-selected' : ''}">${rowCells(row)}</tr>`).join('') : `<tr><td class="empty" colspan="${headers.length}">رکوردی ثبت نشده است.</td></tr>`}</tbody></table></div></div><dialog id="partDialog" class="modal enterprise-modal"><form id="partForm"><div class="modal-head"><h3 data-part-form-title>ثبت تحویل قطعه</h3><button type="button" data-part-close aria-label="بستن">×</button></div><div class="form-grid"><label>نام قطعه<input name="part_name" required></label><label>شماره فنی<input name="technical_number" required></label><label>تحویل‌دهنده در زمان دریافت<input name="received_from"></label><label>تحویل‌گیرنده در زمان دریافت<input name="received_by"></label><label>تحویل‌دهنده در زمان عودت<input name="returned_from"></label><label>تحویل‌گیرنده در زمان عودت<input name="returned_by"></label><label>نوع تحویل<select name="delivery_type"><option value="permanent">دائم</option><option value="temporary">موقت</option></select></label><label data-return-due>تاریخ عودت<input name="return_due_date" type="date"></label><label class="span-2">علت تحویل<input name="reason"></label><label class="span-2">توضیحات<textarea name="notes" rows="3"></textarea></label></div><div class="modal-actions"><button type="button" class="ghost" data-part-close>انصراف</button><button type="submit" class="primary">ذخیره</button></div></form></dialog>`;
    bind();
  }
  function optional(form, name) { return form.elements[name].value.trim() || null; }
  function syncReturnDate(form) {
    const temporary = form.elements.delivery_type.value === 'temporary';
    form.querySelector('[data-return-due]').hidden = !temporary;
    form.elements.return_due_date.required = temporary;
    if (!temporary) form.elements.return_due_date.value = '';
  }
  function openForm(row = null) {
    const form = q('#partForm'); if (!form) return;
    form.reset(); form.dataset.id = row?.id || '';
    q('[data-part-form-title]', form).textContent = row ? 'ویرایش تحویل قطعه' : 'ثبت تحویل قطعه';
    for (const name of ['part_name', 'technical_number', 'received_from', 'received_by', 'returned_from', 'returned_by', 'delivery_type', 'return_due_date', 'reason', 'notes']) {
      if (row && form.elements[name]) form.elements[name].value = row[name] || '';
    }
    syncReturnDate(form); q('#partDialog')?.showModal();
  }
  async function save(event) {
    event.preventDefault();
    const form = event.target, button = q('[type="submit"]', form), id = form.dataset.id;
    const deliveryType = form.elements.delivery_type.value;
    const payload = {
      part_name: form.elements.part_name.value.trim(), technical_number: form.elements.technical_number.value.trim(),
      received_from: optional(form, 'received_from'), received_by: optional(form, 'received_by'),
      returned_from: optional(form, 'returned_from'), returned_by: optional(form, 'returned_by'),
      delivery_type: deliveryType, return_due_date: deliveryType === 'temporary' ? form.elements.return_due_date.value : null,
      reason: optional(form, 'reason'), notes: optional(form, 'notes')
    };
    setBusy(button, true);
    try {
      if (id) await update('part_handovers', `id=eq.${encodeURIComponent(id)}`, payload);
      else await insert('part_handovers', payload);
      q('#partDialog')?.close(); await load(); notify('ثبت تحویل قطعه ذخیره شد.');
    } catch (error) { notify(error?.message || 'ذخیره انجام نشد.', true); }
    finally { setBusy(button, false); }
  }
  async function removeSelected() {
    const ids = [...model.selected].map(Number).filter(Number.isSafeInteger);
    if (!ids.length) return notify('ابتدا یک ردیف را انتخاب کنید.', true);
    if (window.bamcoConfirm && !await window.bamcoConfirm('رکوردهای انتخاب‌شده حذف شوند؟')) return;
    try { await removeRows('part_handovers', `id=in.(${ids.join(',')})`); model.selected.clear(); await load(); notify('رکورد انتخاب‌شده حذف شد.'); }
    catch (error) { notify(error?.message || 'حذف انجام نشد.', true); }
  }
  async function exportRows(button) {
    setBusy(button, true, 'در حال آماده‌سازی…');
    try {
      const XLSX = await window.ensureBamcoXLSX();
      const records = visibleRows().map(row => [row.part_name, row.technical_number, row.received_from, row.received_by, row.returned_from, row.returned_by, delivery(row.delivery_type), row.return_due_date || '', row.reason, row.registered_at || '', row.notes]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...records]), wb = XLSX.utils.book_new();
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: records.length, c: headers.length - 1 } }) };
      wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, 'تحویل قطعات');
      XLSX.writeFile(wb, 'ثبت-تحویل-قطعات.xlsx', { compression: true }); notify('فایل اکسل آماده شد.');
    } catch (error) { notify(error?.message || 'تهیه خروجی انجام نشد.', true); }
    finally { setBusy(button, false); }
  }
  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return; host.dataset.bound = '1';
    host.addEventListener('input', event => {
      if (event.target.id !== 'partSearch') return;
      model.search = event.target.value; render(); q('#partSearch')?.focus();
    });
    host.addEventListener('change', event => { if (event.target.name === 'delivery_type') syncReturnDate(event.target.form); });
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-part-action]')?.dataset.partAction;
      if (action === 'new') openForm();
      if (action === 'edit') { const row = selectedRow(); if (row) openForm(row); else notify('ابتدا یک ردیف را انتخاب کنید.', true); }
      if (action === 'delete') void removeSelected();
      if (action === 'export') void exportRows(event.target.closest('button'));
      if (action === 'refresh') void load();
      const selected = event.target.closest('[data-part-handover-id]');
      if (selected) { const id = selected.dataset.partHandoverId; if (!event.ctrlKey && !event.metaKey) model.selected.clear(); model.selected.has(id) ? model.selected.delete(id) : model.selected.add(id); render(); }
      if (event.target.closest('[data-part-close]')) event.target.closest('dialog')?.close();
    });
    host.addEventListener('submit', event => { if (event.target.id === 'partForm') void save(event); });
  }
  async function load() {
    if (!root() || !state.profile) return;
    const request = ++loadVersion;
    try {
      const rows = await fetchRows('part_handovers', 'select=*&order=registered_at.desc,id.desc');
      if (request !== loadVersion) return;
      model.rows = rows; model.selected = new Set([...model.selected].filter(id => rows.some(row => String(row.id) === id))); render();
    } catch (error) { if (request === loadVersion && root()) root().innerHTML = `<div class="panel enterprise-error">${esc(error?.message || 'دریافت اطلاعات انجام نشد.')}</div>`; }
  }
  function boot() { if (!root()) return; render(); window.BamcoNavigation?.registerView?.('parts', { activate: load }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoParts = { load, model };
})();

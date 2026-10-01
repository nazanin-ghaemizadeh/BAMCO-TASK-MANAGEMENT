const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('petty cash binds its own home-return button', async t => {
  const f = await fixture(); t.after(() => f.dispose());
  let returns = 0; f.w.bamcoShowHome = () => { returns++; };
  assert.equal(typeof f.d.querySelector('#pettyCashView .content-back').onclick, 'function');
  f.d.querySelector('#pettyCashView .content-back').click();
  assert.equal(returns, 1);
});

test('vehicle exported headers round-trip handover fields and numeric zero', async t => {
  const original = { id: 1, plate_number: 'TEST', handover_from: 'Unit A', handover_to: 'Person B', documents_status: 'Complete', return_receiver: 'Unit C', return_deliverer: 'Person D', remote_count: 0, last_mileage: 0 };
  const f = await fixture({ tables: { vehicle_permanent_records: [original], vehicle_temporary_records: [] } }); t.after(() => f.dispose());
  await f.open('vehiclePermanent'); await until(() => f.d.querySelector('#vehiclePermanentView tbody tr[data-id]'));
  let workbook;
  const XLSX = { utils: { aoa_to_sheet: matrix => ({ matrix }), book_new: () => ({ Sheets: {} }), book_append_sheet: (book, sheet, name) => { book.Sheets[name] = sheet; }, sheet_to_json: sheet => sheet.matrix }, writeFile: book => { workbook = book; }, read: () => workbook };
  f.w.XLSX = XLSX; f.w.ensureBamcoXLSX = async () => XLSX; f.w.bamcoConfirm = async () => true;
  await f.w.bamcoExportVehicle('vehiclePermanentView');
  const input = f.d.querySelector('#vehicleExcelInput');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ arrayBuffer: async () => new ArrayBuffer(0) }] });
  await input.onchange({ target: input });
  assert.equal(f.tables.vehicle_permanent_records.length, 2);
  const imported = f.tables.vehicle_permanent_records[1];
  for (const key of ['handover_from', 'handover_to', 'documents_status', 'return_receiver', 'return_deliverer', 'remote_count', 'last_mileage']) assert.equal(imported[key], original[key], key);
  const sheet = Object.values(workbook.Sheets)[0];
  sheet.matrix[0] = sheet.matrix[0].map(label => ({ 'نام واحد/شخص تحویل‌دهنده هنگام واگذاری به واحد': 'نام واحد/ شخص تحویل دهنده در زمان واگذاری به واحد', 'وضعیت مدارک': 'وضعیت مدارک(شامل بیمه بدنه، شخص ثالث، کارت خودرو و کارت سوخت)' }[label] || label));
  await input.onchange({ target: input });
  assert.equal(f.tables.vehicle_permanent_records[2].handover_from, original.handover_from);
  assert.equal(f.tables.vehicle_permanent_records[2].documents_status, original.documents_status);
});

test('vehicle register survives malformed saved column widths', async t => {
  const f = await fixture({ storage: { 'bamco-vehicle-widths-vehiclePermanent-v3': '{broken' }, tables: { vehicle_permanent_records: [{ id: 1, plate_number: 'TEST' }] } }); t.after(() => f.dispose());
  f.w.localStorage.setItem('bamco-vehicle-widths-vehiclePermanent-v3', '{broken');
  await f.open('vehiclePermanent');
  await until(() => f.d.querySelector('#vehiclePermanentView tbody tr[data-id]'));
  assert(f.d.querySelector('#vehiclePermanentView colgroup col').style.width);
  assert.deepEqual(f.errors, []);
});

test('petty cash rejects oversized attachments before creating a financial entry', async t => {
  const f = await fixture({ tables: { petty_cash_entries: [], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); f.d.querySelector('#addCashEntry').click();
  const form = f.d.querySelector('#pettyCashDialog form');
  await until(() => form.elements.event_date_text);
  form.elements.amount.value = '500'; form.elements.category.value = 'Office'; form.elements.description.value = 'Expense';
  Object.defineProperty(form.elements.files, 'files', { configurable: true, value: [{ name: 'large.pdf', size: 26 * 1024 * 1024 }] });
  await form.onsubmit({ preventDefault() {} });
  assert.equal(f.tables.petty_cash_entries.length, 0);
  assert.match(form.querySelector('.form-error').textContent, /۲۵/);
});

test('petty cash void reports an optimistic-lock conflict rather than success', async t => {
  const record = { id: 'cash-one', version: 1, entry_no: 1, event_date: '2026-10-01', entry_type: 'expense', amount: 500, status: 'active', description: 'Expense' };
  const f = await fixture({ tables: { petty_cash_entries: [record], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); await until(() => f.d.querySelector('[data-detail="cash-one"]'));
  f.d.querySelector('[data-detail="cash-one"]').click(); record.version = 2;
  const notifications = []; f.w.toast = (message, error) => notifications.push({ message, error }); f.w.prompt = () => 'Correction';
  f.d.querySelector('#pettyCashDetail [data-void]').click();
  await until(() => notifications.length > 0);
  assert.equal(record.status, 'active');
  assert.equal(notifications[0].error, true);
  assert.match(notifications[0].message, /هم‌زمان/);
  assert.equal(f.d.querySelector('#pettyCashDetail').open, true);
});

test('letter download and deletion failures remain visible and preserve the selected row', async t => {
  const row = { id: 'letter-one', direction: 'incoming', letter_number: '1', letter_date: '1405/07/09', recipient: 'Office', subject: 'Test', storage_path: 'letter.pdf', version: 1 };
  const f = await fixture({ tables: { letters: [row] } }); t.after(() => f.dispose());
  await f.open('lettersIncoming'); await until(() => f.d.querySelector('[data-letter-row="letter-one"]'));
  const view = f.d.querySelector('#lettersIncomingView');
  f.w.bamcoSelection.set(view.querySelector('table'), ['letter-one']);
  view.dispatchEvent(new f.w.Event('bamco-selection-change'));
  f.failures.add('letters-library'); f.w.bamcoConfirm = async () => true;
  for (const action of ['download', 'delete']) {
    await view.querySelector(`[data-letter-action="${action}"]`).onclick();
    assert(view.querySelector('[data-letter-error]').textContent);
    assert(view.querySelector('[data-letter-row="letter-one"]'));
  }
});

test('project search preserves the caret when editing inside the query', async t => {
  const f = await fixture({ tables: { projects: [], project_items: [], project_dependencies: [] } }); t.after(() => f.dispose());
  await f.open('projects'); await f.w.bamcoProjects.load();
  const search = f.d.querySelector('#projectSearch');
  search.value = 'project'; search.setSelectionRange(2, 2);
  search.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(f.d.querySelector('#projectSearch').selectionStart, 2);
  assert.equal(f.d.querySelector('#projectSearch').selectionEnd, 2);
});

test('petty cash attachment retry reuses the committed entry and skips successful uploads', async t => {
  const f = await fixture({ tables: { petty_cash_entries: [], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); f.d.querySelector('#addCashEntry').click();
  const form = f.d.querySelector('#pettyCashDialog form');
  await until(() => form.elements.event_date_text);
  form.elements.amount.value = '500'; form.elements.category.value = 'Office'; form.elements.description.value = 'Expense';
  const files = [{ name: 'first.pdf', size: 10, type: 'application/pdf' }, { name: 'second.pdf', size: 10, type: 'application/pdf' }];
  Object.defineProperty(form.elements.files, 'files', { configurable: true, value: files });
  const fetch = f.w.fetch, uploads = []; let failSecond = true;
  f.w.fetch = async (url, options) => {
    if (String(url).includes('/storage/v1/object/petty-cash-private/') && options?.method === 'POST') {
      uploads.push(options.body.name);
      if (options.body.name === 'second.pdf' && failSecond) { failSecond = false; return new Response('{}', { status: 503 }); }
      return new Response('{}');
    }
    return fetch(url, options);
  };
  await form.onsubmit({ preventDefault() {} });
  assert.equal(f.tables.petty_cash_entries.length, 1);
  assert.equal(Object.hasOwn(f.tables.petty_cash_entries[0], 'event_date_text'), false, 'display-only Jalali field must not be sent as a database column');
  assert.equal(f.tables.petty_cash_attachments.length, 1);
  assert.match(form.querySelector('.form-error').textContent, /ذخیره شده است/);
  assert.equal(f.d.querySelector('#pettyCashDialog').open, true);
  await form.onsubmit({ preventDefault() {} });
  assert.equal(f.tables.petty_cash_entries.length, 1);
  assert.equal(f.tables.petty_cash_attachments.length, 2);
  assert.deepEqual(uploads, ['first.pdf', 'second.pdf', 'second.pdf']);
  assert.equal(f.d.querySelector('#pettyCashDialog').open, false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); } throw Error('condition timed out'); }
function fixture(options = {}) {
  const dom = new JSDOM('<section id="invoicesView"><div id="invoiceFeatureRoot"></div></section>', { url: 'https://example.test', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, routes = new Map(), calls = [], notices = [], uploads = [], storageWrites = [];
  let next = 50;
  const rows = { invoices: options.invoices || [], payments: options.payments || [], files: options.files || [] };
  const requests = new Map(), uploaded = new Set();
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.state = { user: { id: 'alice' }, profile: { id: 'alice' }, token: 'fixture-token' };
  w.SB_URL = 'https://fixture.test'; w.SB_KEY = 'fixture-anon';
  w.BamcoAccess = { can: (_feature, action) => (options.allowed || ['view', 'create', 'edit', 'delete']).includes(action), isSystemManager: () => false };
  w.BamcoNavigation = { registerView: (name, handlers) => routes.set(name, handlers) };
  const clone = value => JSON.parse(JSON.stringify(value));
  const rpc = async (name, args) => {
    calls.push({ name, args: clone(args) });
    if (options.beforeRpc) await options.beforeRpc(name, args);
    let result;
    if (name === 'list_invoice_workspace') result = clone(rows);
    else if (name === 'save_invoice' || name === 'save_invoice_payment') {
      if (requests.has(args.p_request_id)) result = requests.get(args.p_request_id);
      else {
        const table = name === 'save_invoice' ? rows.invoices : rows.payments;
        const id = args.p_invoice_id || args.p_payment_id;
        const existing = table.find(row => row.id === id);
        result = { ...existing, id: id || options.nextId || String(next++), created_by: 'alice', follow_up_owner_id: 'alice', ...clone(args.p_payload) };
        if (existing) Object.assign(existing, result); else table.push(result);
        requests.set(args.p_request_id, result);
      }
    } else if (name === 'reserve_invoice_file') {
      result = rows.files.find(row => row.client_request_id === args.p_request_id);
      if (!result) {
        result = { id: String(next++), client_request_id: args.p_request_id, bucket_id: 'invoices-private', invoice_id: args.p_invoice_id, payment_id: args.p_payment_id, file_type: args.p_file_type, file_name: args.p_file_name, content_type: args.p_content_type, sha256: args.p_sha256, size_bytes: String(args.p_size_bytes), uploaded_by: 'alice', upload_state: 'pending', storage_path: `${args.p_invoice_id}/${args.p_payment_id || 'invoice'}/${args.p_file_type}/${args.p_request_id}.pdf` };
        rows.files.push(result);
      }
      result.uploaded_object_matches = uploaded.has(result.storage_path);
    } else if (name === 'finalize_invoice_file') { result = rows.files.find(row => row.id === args.p_file_id); if (!uploaded.has(result.storage_path)) throw Error('uploaded object missing'); result.upload_state = 'ready'; }
    else throw Error(name);
    if (options.afterRpc) await options.afterRpc(name, args, result);
    return clone(result);
  };
  w.fetch = async (url, init) => {
    uploads.push({ url, init });
    assert.equal(new URL(url).pathname, '/functions/v1/invoice-file-upload');
    const row = rows.files.find(item => item.id === init.body.get('file_id'));
    assert(row); assert.equal(init.body.get('file').name, row.file_name);
    if (!uploaded.has(row.storage_path)) {
      const storageUrl = `https://fixture.test/storage/v1/object/invoices-private/${row.storage_path}`;
      const storageInit = { method: 'POST', headers: { 'x-upsert': 'false' } };
      storageWrites.push({ url: storageUrl, init: storageInit });
      const response = options.storage ? await options.storage(storageUrl, storageInit, storageWrites.length, uploaded) : { ok: true };
      if (response.ok) uploaded.add(row.storage_path);
      if (!response.ok && !uploaded.has(row.storage_path)) return response;
    }
    try { const ready = await rpc('finalize_invoice_file', { p_file_id: row.id }); return { ok: true, json: async () => ({ file: ready }) }; }
    catch (error) { return { ok: false, json: async () => ({ error: error.message }) }; }
  };
  w.bamcoEnterprise = {
    q: (selector, root = d) => root.querySelector(selector), esc: v => String(v ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    fa: String, money: value => w.BamcoMoney.format(value), date: value => value || '—', progress: () => '', statusText: String,
    rpc, setBusy: (button, busy) => { if (button) button.disabled = busy; }, notify: (text, error) => notices.push({ text, error }), removeRows: async () => {}
  };
  w.eval(fs.readFileSync('assets/js/money-input.js', 'utf8'));
  w.eval(fs.readFileSync('assets/js/financial-obligations.js', 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d, calls, notices, rows, uploads, storageWrites, load: () => routes.get('invoices').activate(), close: () => dom.window.close() };
}
const baseInvoice = (extra = {}) => ({ id: '17', invoice_number: 'INV-17', title: 'آزمون', company_name: 'شرکت', total_amount: '100.00', currency: 'IRR', created_by: 'alice', follow_up_owner_id: 'alice', status: 'planned', ...extra });
const submit = (f, form) => form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
function newInvoice(f, amount = '۱٬۲۳۴٫۵۰') { f.d.querySelector('[data-invoice-action="new"]').click(); const form = f.d.querySelector('#invoiceForm'); Object.entries({ invoice_number: 'INV-NEW', title: 'جدید', company_name: 'شرکت', total_amount: amount }).forEach(([name, value]) => form.elements[name].value = value); return form; }
function pick(f, input, name = 'receipt.pdf', text = '%PDF-1.7') { const file = new f.w.File([text], name, { type: name.trim().toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/html' }); Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.required = false; return file; }
function select(f, id = '17') { f.d.querySelector(`[data-invoice-select="${id}"]`).click(); }

test('invoice creation preserves exact monetary strings, currency, and authoritative large IDs', async t => {
  const f = fixture({ nextId: '9007199254740999' }); t.after(f.close); await f.load();
  const form = newInvoice(f, '۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٫۹۹'); form.elements.currency.value = 'USD'; submit(f, form);
  await until(() => f.rows.invoices.length === 1 && !form.isConnected);
  const call = f.calls.find(call => call.name === 'save_invoice');
  assert.equal(call.args.p_payload.total_amount, '9999999999999999.99'); assert.equal(call.args.p_payload.currency, 'USD');
  assert.equal(f.w.bamcoInvoices.model.selected, '9007199254740999');
  assert.equal(f.d.querySelector('[data-invoice-action="edit"]') != null, true);
});

test('double submit is one invoice request, including before the first RPC resolves', async t => {
  let release; const pending = new Promise(resolve => release = resolve);
  const f = fixture({ beforeRpc: name => name === 'save_invoice' ? pending : undefined }); t.after(f.close); await f.load();
  const form = newInvoice(f); submit(f, form); submit(f, form); await tick();
  assert.equal(f.calls.filter(call => call.name === 'save_invoice').length, 1);
  release(); await until(() => f.rows.invoices.length === 1 && !form.isConnected);
});

test('an unknown committed invoice result retries the same request without duplicating it', async t => {
  let fail = true;
  const f = fixture({ afterRpc: name => { if (name === 'save_invoice' && fail) { fail = false; throw Error('lost response'); } } }); t.after(f.close); await f.load();
  const form = newInvoice(f); submit(f, form); await until(() => form.dataset.busy === '0');
  assert.equal(f.rows.invoices.length, 1); assert(form.elements.total_amount.disabled);
  submit(f, form); await until(() => !form.isConnected);
  const calls = f.calls.filter(call => call.name === 'save_invoice'); assert.equal(calls.length, 2); assert.equal(calls[0].args.p_request_id, calls[1].args.p_request_id); assert.equal(f.rows.invoices.length, 1);
});

test('optional proforma upload failure preserves the invoice ID and retries only its attachment', async t => {
  const f = fixture({ allowed: ['view', 'create'], storage: (_url, _init, attempt) => ({ ok: attempt > 1, json: async () => ({ message: 'upload offline' }) }) }); t.after(f.close); await f.load();
  const form = newInvoice(f); pick(f, form.elements.proforma_file); submit(f, form);
  await until(() => form.dataset.busy === '0'); assert.equal(f.rows.invoices.length, 1); assert.equal(f.rows.files.length, 1); assert.equal(f.rows.files[0].upload_state, 'pending');
  assert.equal(f.rows.files[0].invoice_id, f.rows.invoices[0].id); assert.equal(f.rows.files[0].payment_id, null);
  submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.calls.filter(call => call.name === 'save_invoice').length, 1); assert.equal(f.rows.files.length, 1); assert.equal(f.rows.files[0].upload_state, 'ready');
  assert.equal(f.uploads[0].url, f.uploads[1].url); assert.equal(f.storageWrites[0].init.headers['x-upsert'], 'false');
  assert.equal(f.uploads[0].init.body.get('file_id'), f.rows.files[0].id);
  assert.equal(new URL(f.uploads[0].url).pathname, '/functions/v1/invoice-file-upload');
});

test('receipt upload targets each returned payment ID and its invoice, never a stage lookup', async t => {
  const f = fixture({ invoices: [baseInvoice()] }); t.after(f.close); await f.load(); select(f);
  for (const sequence of [1, 2]) {
    f.d.querySelector('[data-invoice-action="payment"]').click(); const form = f.d.querySelector('#invoicePaymentForm');
    form.elements.amount.value = '۵۰'; form.elements.status.value = 'paid'; pick(f, form.elements.receipt_file, 'receipt.pdf', `receipt-${sequence}`); submit(f, form);
    await until(() => f.rows.payments.length === sequence && !form.isConnected);
  }
  assert.deepEqual(f.rows.files.map(row => row.payment_id), f.rows.payments.map(row => row.id));
  assert(f.rows.files.every(row => row.invoice_id === '17' && row.file_type === 'receipt'));
  assert.equal(f.d.querySelectorAll('.payment-stage-receipts [data-invoice-file-download]').length, 2);
  assert(f.d.querySelector('[data-invoice-file-kind="final"]'));
});

test('lost finalize response recovers through ready reservation without a second storage upload', async t => {
  let fail = true;
  const f = fixture({ invoices: [baseInvoice()], afterRpc: name => { if (name === 'finalize_invoice_file' && fail) { fail = false; throw Error('lost finalization response'); } } }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form.elements.file); submit(f, form);
  await until(() => form.dataset.busy === '0'); assert.equal(f.rows.files[0].upload_state, 'ready'); submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.storageWrites.length, 1); assert.equal(f.rows.files.length, 1);
});

test('unsupported files and overprecision fail before financial persistence', async t => {
  const f = fixture(); t.after(f.close); await f.load(); const form = newInvoice(f, '1.234'); submit(f, form); await tick();
  assert.equal(f.calls.filter(call => call.name === 'save_invoice').length, 0);
  form.elements.total_amount.value = '100'; pick(f, form.elements.proforma_file, 'bad.html'); submit(f, form); await tick();
  assert.equal(f.calls.filter(call => call.name === 'save_invoice').length, 0);
  assert(f.notices.some(row => row.error));
});

test('planned stages block final upload even if paid amounts cover the total; stale finals remain labelled', async t => {
  const f = fixture({ invoices: [baseInvoice()], payments: [{ id: '31', invoice_id: '17', sequence_no: 1, amount: '100', status: 'paid' }, { id: '32', invoice_id: '17', sequence_no: 2, amount: '20', status: 'planned' }], files: [{ id: '8', invoice_id: '17', payment_id: null, file_type: 'final', file_name: 'old.pdf', bucket_id: 'invoices-private', client_request_id: 'fixture-request', upload_state: 'ready', final_is_current: false }] }); t.after(f.close); await f.load(); select(f);
  assert.equal(f.d.querySelector('[data-invoice-file-kind="final"]'), null);
  assert.match(f.d.querySelector('.invoice-file-warning').textContent, /سابقه/);
  assert(f.d.querySelector('[data-invoice-file-download="8"]'));
});

test('feature denial fails closed and view-only owners retain existing payment/file scope without invoice edits', async t => {
  const denied = fixture({ allowed: [] }); t.after(denied.close); await denied.load();
  assert.equal(denied.calls.length, 0); assert.equal(denied.d.querySelector('[data-invoice-action="new"]'), null);
  const f = fixture({ invoices: [baseInvoice()], allowed: ['view'] }); t.after(f.close); await f.load(); select(f);
  assert.equal(f.d.querySelector('[data-invoice-action="edit"]'), null); assert.equal(f.d.querySelector('[data-invoice-action="delete"]'), null);
  assert(f.d.querySelector('[data-invoice-action="payment"]')); assert(f.d.querySelector('[data-invoice-file-kind="proforma"]'));
});

test('navigation while save is pending does not reopen stale detail or steal cards-only entry', async t => {
  let release; const pending = new Promise(resolve => release = resolve);
  const f = fixture({ beforeRpc: name => name === 'save_invoice' ? pending : undefined }); t.after(f.close); await f.load(); const form = newInvoice(f); submit(f, form);
  await f.load(); release(); await until(() => f.rows.invoices.length === 1); await tick();
  assert.equal(f.w.bamcoInvoices.model.selected, null); assert.equal(f.d.querySelector('.invoice-grid').classList.contains('detail-open'), false);
});

test('a switched account never keeps old invoices when its refresh fails', async t => {
  let fail = false;
  const f = fixture({ invoices: [baseInvoice()], beforeRpc: name => { if (name === 'list_invoice_workspace' && fail) throw Error('offline'); } }); t.after(f.close); await f.load(); select(f);
  f.w.state.user = { id: 'bob' }; f.w.state.profile = { id: 'bob' }; fail = true; await f.load();
  assert.equal(f.w.bamcoInvoices.model.invoices.length, 0); assert.equal(f.d.querySelector('[data-invoice-select]'), null); assert.doesNotMatch(f.d.body.textContent, /INV-17/);
});

test('late workspace responses cannot restore prior-session data after logout clear', async t => {
  let release; const pending = new Promise(resolve => release = resolve);
  const f = fixture({ invoices: [baseInvoice()], beforeRpc: name => name === 'list_invoice_workspace' ? pending : undefined }); t.after(f.close);
  const loading = f.load(); f.w.state.token = ''; f.w.state.user = null; f.w.state.profile = null; f.w.bamcoInvoices.clear(); release(); await loading;
  assert.equal(f.w.bamcoInvoices.model.invoices.length, 0); assert.equal(f.d.querySelector('[data-invoice-select]'), null);
});

test('access revocation clears cached rows and upload retry freezes the captured file picker', async t => {
  const allowed = ['view', 'create', 'edit']; const f = fixture({ allowed, invoices: [baseInvoice()], storage: async () => ({ ok: false, json: async () => ({ message: 'offline' }) }) }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form.elements.file); submit(f, form); await until(() => form.dataset.busy === '0');
  assert(form.elements.file.disabled, 'retry cannot silently pick up a changed file');
  allowed.splice(0); f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));
  assert.equal(f.w.bamcoInvoices.model.invoices.length, 0); assert.equal(f.w.bamcoInvoices.model.files.length, 0); assert.equal(f.d.querySelector('[data-invoice-select]'), null);
});

test('close and Escape cannot dismiss an active mutation, but cancel after failure retains its pending attachment', async t => {
  let release; const pending = new Promise(resolve => release = resolve);
  const f = fixture({ invoices: [baseInvoice()], storage: async () => { await pending; return { ok: false, json: async () => ({ message: 'offline' }) }; } }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'), dialog = form.closest('dialog'); pick(f, form.elements.file); submit(f, form);
  await until(() => f.uploads.length === 1);
  assert(form.querySelector('[data-invoice-file-close]').disabled); const cancel = new f.w.Event('cancel', { cancelable: true }); dialog.dispatchEvent(cancel); assert(cancel.defaultPrevented);
  release(); await until(() => form.dataset.busy === '0'); form.querySelector('[data-invoice-file-close]').click(); await until(() => !form.isConnected);
  assert.equal(f.rows.files.length, 1); assert(f.d.querySelector('[data-invoice-file-resume]'));
});

test('a definitive rejected save leaves fields editable for correction', async t => {
  const f = fixture({ beforeRpc: name => { if (name === 'save_invoice') { const error = Error('duplicate number'); error.status = 409; throw error; } } }); t.after(f.close); await f.load(); const form = newInvoice(f); submit(f, form); await until(() => form.dataset.busy === '0');
  assert.equal(f.rows.invoices.length, 0); assert.equal(form.elements.invoice_number.disabled, false); assert.equal(form._invoiceAttempt, undefined);
});

test('refresh completing after a new editor opens cannot dismiss or erase that editor', async t => {
  let hold = false, release; const pending = new Promise(resolve => release = resolve);
  const f = fixture({ beforeRpc: name => hold && name === 'list_invoice_workspace' ? pending : undefined }); t.after(f.close); await f.load(); hold = true;
  f.d.querySelector('[data-invoice-action="refresh"]').click(); const form = newInvoice(f); form.elements.title.value = 'new unsaved'; release(); await tick(); await tick();
  assert(form.isConnected); assert(form.closest('dialog').open); assert.equal(form.elements.title.value, 'new unsaved');
});

test('editing a stage number preserves authoritative payment association for its new receipt', async t => {
  const f = fixture({ invoices: [baseInvoice()], payments: [{ id: '31', invoice_id: '17', sequence_no: 1, amount: '50', status: 'planned' }] }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-payment-edit="31"]').click(); const form = f.d.querySelector('#invoicePaymentForm');
  assert.equal(form.elements.sequence_no.readOnly, false); form.elements.sequence_no.value = '3'; pick(f, form.elements.receipt_file); submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.rows.payments.length, 1); assert.equal(f.rows.payments[0].sequence_no, 3); assert.equal(f.rows.files[0].payment_id, '31');
});

test('routine access refresh on refocus preserves an open unsaved editor', async t => {
  const f = fixture(); t.after(f.close); await f.load(); const form = newInvoice(f); form.elements.title.value = 'unsaved focused editor';
  f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));
  assert(form.isConnected); assert.equal(form.elements.title.value, 'unsaved focused editor'); assert(form.closest('dialog').open);
});

test('legacy attachment metadata never implies a storage bucket or offers a broken download', async t => {
  const f = fixture({ invoices: [baseInvoice()], files: [{ id: '8', invoice_id: '17', payment_id: null, file_type: 'proforma', file_name: 'legacy.pdf', storage_path: 'unknown/legacy.pdf', upload_state: null, bucket_id: null, client_request_id: null }] }); t.after(f.close); await f.load(); select(f);
  assert.match(f.d.body.textContent, /محل ذخیرهٔ آن هنوز تأیید نشده/); assert.equal(f.d.querySelector('[data-invoice-file-download="8"]'), null); assert.equal(f.d.querySelector('[data-invoice-file-resume="8"]'), null); assert.equal(f.uploads.length, 0);
});

test('a pending reservation with verified stored bytes retries finalization without uploading again', async t => {
  let fail = true;
  const f = fixture({ invoices: [baseInvoice()], beforeRpc: name => { if (name === 'finalize_invoice_file' && fail) { fail = false; throw Error('finalize unavailable'); } } }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form.elements.file); submit(f, form); await until(() => form.dataset.busy === '0');
  assert.equal(f.rows.files[0].upload_state, 'pending'); assert.equal(f.uploads.length, 1);
  submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.rows.files[0].upload_state, 'ready'); assert.equal(f.storageWrites.length, 1);
});

test('an uncertain committed upload recovers by strict finalization and never overwrites the object', async t => {
  const f = fixture({ invoices: [baseInvoice()], storage: async (url, _init, _attempt, uploaded) => {
    uploaded.add(decodeURIComponent(new URL(url).pathname.split('/invoices-private/')[1]));
    return { ok: false, json: async () => ({ message: 'lost upload acknowledgement' }) };
  } }); t.after(f.close); await f.load(); select(f);
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form.elements.file); submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.rows.files[0].upload_state, 'ready'); assert.equal(f.storageWrites.length, 1); assert.equal(f.storageWrites[0].init.headers['x-upsert'], 'false');
});

for (const currency of ['GBP', 'AED']) test(`editing a legacy ${currency} invoice retains its exact currency`, async t => {
  const f = fixture({ invoices: [baseInvoice({ currency })] }); t.after(f.close); await f.load(); select(f); f.d.querySelector('[data-invoice-action="edit"]').click();
  const form = f.d.querySelector('#invoiceForm'); assert.equal(form.elements.currency.value, currency); form.elements.title.value = 'edited title'; submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.rows.invoices[0].currency, currency); assert.equal(f.calls.find(call => call.name === 'save_invoice').args.p_payload.currency, currency);
});

test('an upload response body arriving after an account switch cannot repopulate prior files', async t => {
  const f = fixture({ invoices: [baseInvoice()] }); t.after(f.close); await f.load(); select(f);
  let release, reading = false; const pending = new Promise(resolve => release = resolve), original = f.w.fetch;
  f.w.fetch = async (...args) => { const response = await original(...args); if (response.ok) return { ...response, json: async () => { reading = true; await pending; return response.json(); } }; return response; };
  f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form.elements.file); submit(f, form); await until(() => reading);
  f.w.state.user = { id: 'bob' }; f.w.state.profile = { id: 'bob' }; f.w.bamcoInvoices.clear(); release(); await tick(); await tick();
  assert.equal(f.w.bamcoInvoices.model.files.length, 0); assert.equal(f.w.bamcoInvoices.model.invoices.length, 0); assert.equal(f.w.bamcoInvoices.model.selected, null);
});

test('invoice upload preserves a valid filename with surrounding spaces from reserve through Edge', async t => {
  const f = fixture(); t.after(f.close); await f.load(); const form = newInvoice(f); pick(f, form.elements.proforma_file, ' invoice.pdf '); submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.rows.files[0].file_name, ' invoice.pdf '); assert.equal(f.uploads[0].init.body.get('file').name, ' invoice.pdf '); assert.equal(f.rows.files[0].upload_state, 'ready');
});

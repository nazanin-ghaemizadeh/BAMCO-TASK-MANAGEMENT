const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('node:crypto');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const clone = value => JSON.parse(JSON.stringify(value));
const gate = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function until(predicate) { for (let i = 0; i < 150; i++) { if (predicate()) return; await tick(); } throw Error('Synthetic condition timed out'); }
const fullGrants = ['view', 'create', 'edit', 'delete'];
const relationships = {
  creator: { created_by: 'fixture-user', follow_up_owner_id: 'other-fixture-user' },
  follower: { created_by: 'other-fixture-user', follow_up_owner_id: 'fixture-user' },
  unrelated: { created_by: 'other-fixture-user', follow_up_owner_id: 'third-fixture-user' },
  manager: { created_by: 'other-fixture-user', follow_up_owner_id: 'third-fixture-user' }
};
const attachment = (id, kind, extra = {}) => ({ id, invoice_id: '17', payment_id: kind === 'receipt' ? '31' : null, file_type: kind,
  file_name: `synthetic-${kind}-${id}.pdf`, bucket_id: 'invoices-private', client_request_id: `request-${id}`,
  storage_path: `synthetic/17/${kind}/${id}.pdf`, upload_state: 'ready', uploaded_by: 'other-fixture-user', ...extra });

function fixture(t, options = {}) {
  const dom = new JSDOM('<section id="invoicesView"><div id="invoiceFeatureRoot"></div></section>', { url: 'https://example.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, calls = [], fetches = [], links = [], notices = [], confirmations = [], removals = [];
  const allowed = new Set(options.allowed || fullGrants); let generation = 1, next = 80;
  const rows = {
    invoices: [{ id: '17', invoice_number: 'TEST-17', title: 'Synthetic invoice', company_name: 'Test company', total_amount: '100.00', currency: 'IRR', status: 'planned', ...relationships[options.relationship || 'unrelated'] }],
    payments: [{ id: '31', invoice_id: '17', sequence_no: 1, amount: '100.00', status: 'paid', receipt_path: 'synthetic/17/receipt/72.pdf' }],
    files: [attachment('71', 'proforma'), attachment('72', 'receipt'), attachment('73', 'final'), attachment('74', 'receipt'), ...(options.files || [])]
  };
  w.state = { user: { id: 'fixture-user' }, profile: { id: 'fixture-user', active: true }, token: 'synthetic-token', view: 'invoices' };
  w.bamcoAuth = { snapshot: () => ({ generation }) };
  w.BamcoAccess = { can: (_feature, action) => allowed.has(action), isSystemManager: () => options.relationship === 'manager' };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(w, 'crypto', { value: { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: (...args) => options.hash ? options.hash(...args) : webcrypto.subtle.digest(...args) } } });
  w.SB_URL = 'https://fixture.test'; w.SB_KEY = 'synthetic-public-key';
  w.URL.createObjectURL = () => 'blob:synthetic'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { links.push(this.download); };
  w.bamcoConfirm = async message => { confirmations.push(message); return options.confirm ? options.confirm() : true; };
  const rpc = async (name, args) => {
    calls.push({ name, args: clone(args) });
    if (options.beforeRpc) await options.beforeRpc(name, args);
    let result;
    if (name === 'list_invoice_workspace') result = rows;
    else if (name === 'save_invoice' || name === 'save_invoice_payment') {
      const payment = name === 'save_invoice_payment', table = payment ? rows.payments : rows.invoices;
      const id = payment ? args.p_payment_id : args.p_invoice_id;
      result = table.find(row => row.id === id);
      if (result) Object.assign(result, clone(args.p_payload));
      else { result = { id: String(next++), created_by: w.state.user.id, follow_up_owner_id: w.state.user.id, ...clone(args.p_payload) }; table.push(result); }
    } else if (name === 'reserve_invoice_file') {
      result = rows.files.find(row => row.client_request_id === args.p_request_id);
      if (!result) {
        result = attachment(String(next++), args.p_file_type, { invoice_id: args.p_invoice_id, payment_id: args.p_payment_id,
          file_name: args.p_file_name, uploaded_by: w.state.user.id, client_request_id: args.p_request_id, upload_state: 'pending',
          content_type: args.p_content_type, size_bytes: String(args.p_size_bytes), sha256: args.p_sha256 });
        rows.files.push(result);
      }
    } else if (name === 'delete_invoice_file') {
      const index = rows.files.findIndex(row => row.id === args.p_file_id), row = rows.files[index];
      if (row) rows.files.splice(index, 1);
      result = { id: args.p_file_id, invoice_id: args.p_invoice_id, payment_id: args.p_payment_id, file_type: args.p_file_type, deleted: !!row };
    } else throw Error(`Unexpected synthetic RPC ${name}`);
    const response = clone(result);
    if (options.afterRpc) await options.afterRpc(name, args, response);
    return response;
  };
  w.fetch = async (url, init) => {
    fetches.push({ url, init });
    if (url.includes('/storage/v1/object/authenticated/')) return { ok: true, blob: async () => new w.Blob(['synthetic']) };
    assert.equal(new URL(url).pathname, '/functions/v1/invoice-file-upload');
    const file = rows.files.find(row => row.id === init.body.get('file_id'));
    assert(file);
    if (options.uploadResponse) { const response = await options.uploadResponse(file, fetches.length); if (response) return response; }
    file.upload_state = 'ready';
    return { ok: true, json: async () => ({ file: clone(file) }) };
  };
  w.bamcoEnterprise = {
    q: (selector, root = d) => root.querySelector(selector), esc: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
    fa: String, date: value => value || '', money: value => w.BamcoMoney.format(value), progress: () => '', statusText: String,
    rpc, notify: text => notices.push(text), setBusy: (button, busy) => { if (button) button.disabled = busy; },
    removeRows: async (table, filter) => { removals.push({ table, filter }); rows.invoices.splice(0); }
  };
  for (const name of ['money-input', 'file-picker', 'financial-obligations']) w.eval(fs.readFileSync(`assets/js/${name}.js`, 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d, rows, calls, allowed, fetches, links, notices, confirmations, removals,
    load: () => w.bamcoInvoices.load(), select: () => d.querySelector('[data-invoice-select="17"]').click(),
    click: selector => { const button = d.querySelector(selector); assert(button, selector); button.click(); },
    newSession: () => { generation++; }, accessChanged: () => w.dispatchEvent(new w.Event('bamco:feature-access-changed')) };
}
function pick(f, form) {
  const input = form.querySelector('input[type=file]'), file = new f.w.File(['%PDF-1.7 synthetic'], 'synthetic-upload.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.required = false;
}
const submit = (f, form) => form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
function controlState(f, selector) { const node = f.d.querySelector(selector); return node ? node.disabled ? 'disabled' : 'enabled' : 'absent'; }
function expectControls(f, grants) {
  const edit = grants.includes('edit'), remove = grants.includes('delete');
  for (const selector of ['[data-invoice-action="payment"]', '[data-invoice-payment-edit="31"]', '[data-invoice-file-kind="receipt"]', '[data-invoice-file-delete="72"]'])
    assert.equal(controlState(f, selector), edit ? 'enabled' : 'disabled', selector);
  for (const selector of ['[data-invoice-file-kind="proforma"]', '[data-invoice-file-kind="final"]', '[data-invoice-file-delete="71"]', '[data-invoice-file-delete="73"]', '[data-invoice-file-delete="74"]', '[data-invoice-file-download="71"]', '[data-invoice-file-download="72"]', '[data-invoice-file-download="73"]'])
    assert.equal(controlState(f, selector), 'enabled', selector);
  assert.equal(controlState(f, '[data-invoice-action="edit"]'), edit ? 'enabled' : 'absent');
  assert.equal(controlState(f, '[data-invoice-action="delete"]'), remove ? 'enabled' : 'absent');
}

for (const relationship of Object.keys(relationships)) {
  for (const grants of [['view'], ['view', 'edit'], ['view', 'delete'], ['view', 'create'], fullGrants]) test(`${relationship}: equal ${grants.join('+')} grants expose identical invoice actions`, async t => {
    const f = fixture(t, { relationship, allowed: grants }); await f.load();
    assert.equal(controlState(f, '[data-invoice-action="new"]'), grants.includes('create') ? 'enabled' : 'absent');
    f.select(); expectControls(f, grants);
  });
  for (const operation of ['payment-new', 'payment-edit', 'invoice-edit', 'invoice-delete', 'upload-proforma', 'upload-receipt', 'upload-final', 'delete-proforma', 'delete-receipt', 'delete-final', 'download-all']) test(`${relationship}: full grants execute ${operation} on the same invoice`, async t => {
    const f = fixture(t, { relationship }); await f.load(); f.select();
    if (operation.startsWith('payment-')) {
      f.click(operation === 'payment-new' ? '[data-invoice-action="payment"]' : '[data-invoice-payment-edit="31"]');
      const form = f.d.querySelector('#invoicePaymentForm'); form.elements.amount.value = '10'; submit(f, form); await until(() => !form.isConnected);
      const call = f.calls.find(call => call.name === 'save_invoice_payment'); assert(call); assert.equal(call.args.p_payload.invoice_id, '17');
      assert.equal(call.args.p_payment_id, operation === 'payment-new' ? null : '31');
    } else if (operation === 'invoice-edit') {
      const ownership = clone(relationships[relationship]); f.click('[data-invoice-action="edit"]');
      const form = f.d.querySelector('#invoiceForm'); form.elements.title.value = 'Updated synthetic title'; submit(f, form); await until(() => !form.isConnected);
      assert.equal(f.rows.invoices[0].title, 'Updated synthetic title');
      assert.deepEqual({ created_by: f.rows.invoices[0].created_by, follow_up_owner_id: f.rows.invoices[0].follow_up_owner_id }, ownership);
    } else if (operation === 'invoice-delete') {
      f.click('[data-invoice-action="delete"]'); await until(() => f.removals.length === 1);
      assert.deepEqual(f.removals, [{ table: 'invoices', filter: 'id=eq.17' }]);
    } else if (operation.startsWith('upload-')) {
      const kind = operation.slice(7); f.click(`[data-invoice-file-kind="${kind}"]`);
      const form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form); await until(() => !form.isConnected);
      const call = f.calls.find(call => call.name === 'reserve_invoice_file'); assert(call); assert.equal(call.args.p_invoice_id, '17');
      assert.equal(call.args.p_file_type, kind); assert.equal(call.args.p_payment_id, kind === 'receipt' ? '31' : null);
      assert.equal(f.fetches.length, 1); assert.equal(f.rows.files.at(-1).upload_state, 'ready');
    } else if (operation.startsWith('delete-')) {
      const kind = operation.slice(7), id = { proforma: '71', receipt: '72', final: '73' }[kind];
      f.click(`[data-invoice-file-delete="${id}"]`); await until(() => !f.d.querySelector(`[data-invoice-file-row="${id}"]`));
      const call = f.calls.find(call => call.name === 'delete_invoice_file'); assert(call); assert.equal(call.args.p_file_id, id);
      assert.equal(call.args.p_invoice_id, '17'); assert.equal(call.args.p_file_type, kind); assert.equal(f.rows.files.length, 3);
    } else {
      for (const id of ['71', '72', '73']) f.click(`[data-invoice-file-download="${id}"]`);
      await until(() => f.links.length === 3); assert.equal(f.fetches.length, 3);
    }
  });
}

for (const change of ['view', 'inactive', 'signed-out', 'missing-profile', 'profile-mismatch', 'account', 'new-session']) test(`stale foreign-row controls fail closed after ${change}`, async t => {
  const f = fixture(t); await f.load(); f.select();
  if (change === 'view') f.allowed.delete('view');
  if (change === 'inactive') f.w.state.profile.active = false;
  if (change === 'signed-out') f.w.state.token = '';
  if (change === 'missing-profile') f.w.state.profile = null;
  if (change === 'profile-mismatch') f.w.state.profile.id = 'different-user';
  if (change === 'account') { f.w.state.user = { id: 'different-user' }; f.w.state.profile = { id: 'different-user', active: true }; }
  if (change === 'new-session') f.newSession();
  for (const selector of ['[data-invoice-action="edit"]', '[data-invoice-action="payment"]', '[data-invoice-payment-edit="31"]', '[data-invoice-action="delete"]', '[data-invoice-file-kind="proforma"]', '[data-invoice-file-kind="receipt"]', '[data-invoice-file-kind="final"]', '[data-invoice-file-delete="71"]', '[data-invoice-file-download="71"]']) f.click(selector);
  await tick(); assert.equal(f.calls.length, 1); assert.equal(f.fetches.length, 0); assert.equal(f.removals.length, 0); assert.equal(f.confirmations.length, 0);
  assert.equal(f.d.querySelector('dialog[open]'), null);
});

for (const grants of [[], ['edit'], ['delete'], ['create', 'edit', 'delete']]) test(`missing view never loads invoice rows with grants ${grants.join('+') || 'none'}`, async t => {
  const f = fixture(t, { allowed: grants }); await f.load(); assert.equal(f.calls.length, 0); assert.equal(f.d.querySelector('[data-invoice-select]'), null);
});

for (const relationship of Object.keys(relationships)) test(`${relationship}: foreign pending uploads stay hidden and cannot be resumed or deleted`, async t => {
  const pending = attachment('75', 'proforma', { upload_state: 'pending', file_name: 'private-pending.pdf' });
  const ownPending = attachment('76', 'proforma', { upload_state: 'pending', uploaded_by: 'fixture-user' });
  const f = fixture(t, { relationship, files: [pending, ownPending] }); await f.load(); f.select();
  assert.equal(f.w.bamcoInvoices.model.files.some(row => row.id === '75'), false); assert.doesNotMatch(f.d.body.textContent, /private-pending/);
  assert.equal(f.d.querySelector('[data-invoice-file-row="75"]'), null); assert(f.d.querySelector('[data-invoice-file-resume="76"]'));
  assert.equal(controlState(f, '[data-invoice-file-download="76"]'), 'disabled');
  // A stale injected row/button cannot transform another uploader's reservation into ours.
  f.w.bamcoInvoices.model.files.push(clone(pending));
  for (const action of ['resume', 'delete', 'download']) {
    const button = f.d.createElement('button'); button.setAttribute(`data-invoice-file-${action}`, '75'); f.d.querySelector('#invoiceFeatureRoot').append(button); button.click();
  }
  await tick(); assert.equal(f.calls.length, 1); assert.equal(f.fetches.length, 0); assert.equal(f.confirmations.length, 0); assert.equal(f.d.querySelector('dialog[open]'), null);
});

for (const grant of ['edit', 'delete']) test(`removing ${grant} from a nonowner blocks only its action-specific controls`, async t => {
  const f = fixture(t); await f.load(); f.select(); f.allowed.delete(grant); f.accessChanged();
  expectControls(f, fullGrants.filter(value => value !== grant));
});

for (const action of ['file', 'invoice', 'receipt']) test(`${action} deletion rechecks a foreign invoice grant after async confirmation`, async t => {
  const answer = gate(), f = fixture(t, { confirm: () => answer.promise }); await f.load(); f.select();
  f.click(action === 'invoice' ? '[data-invoice-action="delete"]' : `[data-invoice-file-delete="${action === 'receipt' ? '72' : '71'}"]`);
  f.allowed.delete(action === 'invoice' ? 'delete' : action === 'receipt' ? 'edit' : 'view'); answer.resolve(true); await tick(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.removals.length, 0); assert.equal(f.rows.files.length, 4);
});

for (const change of ['edit', 'view', 'inactive', 'new-session']) test(`receipt hashing rechecks ${change} before reserving foreign-invoice bytes`, async t => {
  const digest = gate(); let hashing = false;
  const f = fixture(t, { hash: () => { hashing = true; return digest.promise; } }); await f.load(); f.select(); f.click('[data-invoice-file-kind="receipt"]');
  const form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form); await until(() => hashing);
  if (change === 'edit' || change === 'view') f.allowed.delete(change);
  if (change === 'inactive') f.w.state.profile.active = false;
  if (change === 'new-session') f.newSession();
  digest.resolve(new ArrayBuffer(32)); await until(() => form.dataset.busy === '0');
  assert.equal(f.calls.filter(call => call.name === 'reserve_invoice_file').length, 0); assert.equal(f.fetches.length, 0);
});

for (const invalid of ['uploaded_by', 'client_request_id', 'file_name', 'invoice_id', 'payment_id', 'file_type']) test(`reservation ${invalid} must match the uploader's captured request`, async t => {
  const f = fixture(t, { afterRpc: (name, args, result) => { if (name === 'reserve_invoice_file') result[invalid] = invalid === 'invoice_id' || invalid === 'payment_id' ? '999' : 'unrelated-value'; } });
  await f.load(); f.select(); f.click('[data-invoice-file-kind="proforma"]'); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form);
  await until(() => form.dataset.busy === '0'); assert.equal(f.fetches.length, 0); assert.equal(f.w.bamcoInvoices.model.files.length, 4); assert(f.notices.length);
});

for (const change of ['edit', 'view', 'inactive', 'new-session']) test(`receipt reservation rechecks ${change} before starting the upload`, async t => {
  const response = gate(); let reserving = false;
  const f = fixture(t, { beforeRpc: async name => { if (name === 'reserve_invoice_file') { reserving = true; await response.promise; } } });
  await f.load(); f.select(); f.click('[data-invoice-file-kind="receipt"]'); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form);
  await until(() => reserving);
  if (change === 'edit' || change === 'view') f.allowed.delete(change);
  if (change === 'inactive') f.w.state.profile.active = false;
  if (change === 'new-session') f.newSession();
  response.resolve(); await until(() => form.dataset.busy === '0');
  assert.equal(f.fetches.length, 0); assert.equal(f.w.bamcoInvoices.model.files.length, 4);
});

test('an own pending upload on a foreign invoice can resume and retry the same immutable request', async t => {
  const f = fixture(t, { uploadResponse: (_file, attempt) => attempt < 3 ? { ok: false, json: async () => ({ message: 'Synthetic interrupted upload' }) } : null });
  await f.load(); f.select(); f.click('[data-invoice-file-kind="proforma"]'); let form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form);
  await until(() => form.dataset.busy === '0'); assert.equal(f.fetches.length, 1);
  f.click('[data-invoice-file-close]'); await until(() => !form.isConnected);
  const pending = f.rows.files.at(-1); assert.equal(pending.upload_state, 'pending'); assert.equal(pending.uploaded_by, 'fixture-user');
  f.click(`[data-invoice-file-resume="${pending.id}"]`); form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form);
  await until(() => form.dataset.busy === '0'); assert.equal(f.fetches.length, 2);
  submit(f, form); await until(() => !form.isConnected);
  assert.equal(f.fetches.length, 3); assert.equal(f.rows.files.length, 5); assert.equal(f.rows.files.at(-1).upload_state, 'ready');
  const requests = f.calls.filter(call => call.name === 'reserve_invoice_file').map(call => call.args.p_request_id);
  assert.equal(requests.length, 3); assert.equal(new Set(requests).size, 1);
});

for (const invalid of ['uploaded_by', 'client_request_id', 'storage_path', 'id']) test(`finalized ${invalid} cannot replace the upload's captured identity`, async t => {
  const f = fixture(t); await f.load(); f.select();
  const original = f.w.fetch;
  f.w.fetch = async (...args) => {
    const response = await original(...args);
    return { ...response, json: async () => { const result = await response.json(); result.file[invalid] = invalid === 'id' ? '999' : 'unrelated-value'; return result; } };
  };
  f.click('[data-invoice-file-kind="proforma"]'); const form = f.d.querySelector('#invoiceFileForm'); pick(f, form); submit(f, form);
  await until(() => form.dataset.busy === '0');
  assert.equal(f.fetches.length, 1); assert.equal(f.w.bamcoInvoices.model.files.at(-1).upload_state, 'pending');
  assert.equal(f.d.querySelector('#invoiceFileDialog').open, true); assert(f.notices.length);
});

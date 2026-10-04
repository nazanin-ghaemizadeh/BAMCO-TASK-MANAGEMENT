const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { webcrypto } = require('node:crypto');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) { for (let index = 0; index < 100; index++) { if (predicate()) return; await tick(); } throw Error('Synthetic condition timed out'); }
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const invoice = (title = 'Synthetic invoice') => ({ id: '17', invoice_number: 'TEST-17', title, company_name: 'Test company', total_amount: '100.00', currency: 'IRR', created_by: 'fixture-user', follow_up_owner_id: 'fixture-user', status: 'planned' });
const workspace = rows => ({ invoices: rows, payments: [], files: [] });

function fixture(t, options = {}) {
  const dom = new JSDOM('<section id="invoicesView"><div id="invoiceFeatureRoot"></div></section>', { url: 'https://example.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, calls = [], routes = new Map(), downloads = [], links = [], notices = [];
  const allowed = new Set(options.allowed || ['view', 'create', 'edit']);
  let generation = 1, reader = options.read || (async () => workspace([invoice()]));
  w.state = { user: { id: 'fixture-user' }, profile: { id: 'fixture-user', active: true }, token: 'synthetic-token', view: options.route || 'invoices' };
  Object.defineProperty(w, 'crypto', { value: { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: (...args) => options.hash ? options.hash(...args) : webcrypto.subtle.digest(...args) } } });
  w.bamcoConfirm = options.confirm || (async () => true);
  w.bamcoAuth = { snapshot: () => ({ generation }) };
  w.BamcoAccess = { can: (_feature, action) => allowed.has(action), isSystemManager: () => false };
  w.BamcoNavigation = { registerView: (name, handlers) => routes.set(name, handlers) };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.SB_URL = 'https://fixture.test'; w.SB_KEY = 'synthetic-public-key';
  w.toast = message => notices.push(message);
  w.URL.createObjectURL = () => 'blob:synthetic-download'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { links.push({ name: this.download, href: this.href }); };
  w.fetch = async (url, init) => { downloads.push({ url, init }); return options.download ? options.download(url, init) : { ok: true, blob: async () => new w.Blob(['synthetic file']) }; };
  w.BamcoData = { rpc: async (name, body) => { calls.push({ name, body }); return reader(name, body); } };
  for (const name of ['money-input', 'file-picker', 'enterprise-core', 'financial-obligations']) w.eval(fs.readFileSync(`assets/js/${name}.js`, 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const accessChanged = () => w.dispatchEvent(new w.Event('bamco:feature-access-changed'));
  return {
    w, d, calls, allowed, accessChanged, downloads, links, notices,
    load: options => w.bamcoInvoices.load(options), activate: () => routes.get('invoices').activate(),
    setReader: fn => { reader = fn; }, newSession: () => { generation++; },
    cards: () => [...d.querySelectorAll('[data-invoice-select]')],
    search: value => { const input = d.querySelector('#invoiceSearch'); input.value = value; input.dispatchEvent(new w.Event('input', { bubbles: true })); },
    openEditor: () => { d.querySelector('[data-invoice-action="new"]').click(); return d.querySelector('#invoiceForm'); }
  };
}

test('matching search while first read is pending keeps the response and loading state', async t => {
  const pending = gate(), f = fixture(t, { read: () => pending.promise });
  const loading = f.load(); f.search('TEST');
  assert(f.d.querySelector('[data-invoice-load-status]'));
  assert.doesNotMatch(f.d.querySelector('.enterprise-card-list').textContent, /صورتحسابی برای نمایش در دسترس نیست/);
  pending.resolve(workspace([invoice()])); await loading;
  assert.equal(f.calls.length, 1); assert.equal(f.cards().length, 1);
  assert.equal(f.w.bamcoInvoices.model.search, 'TEST'); assert.equal(f.d.querySelector('#invoiceSearch').value, 'TEST');
  assert.equal(f.d.querySelector('[data-invoice-load-status]'), null);
});

test('nonmatching search keeps loaded rows and Escape shows them without another read', async t => {
  const pending = gate(), f = fixture(t, { read: () => pending.promise });
  const loading = f.load(); f.search('absent'); pending.resolve(workspace([invoice()])); await loading;
  assert.equal(f.cards().length, 0); assert.equal(f.w.bamcoInvoices.model.invoices.length, 1);
  assert.match(f.d.querySelector('.enterprise-card-list').textContent, /مطابق جست‌وجو/);
  f.d.querySelector('#invoiceSearch').dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(f.cards().length, 1); assert.equal(f.calls.length, 1);
});

test('a nonowned row returned by the authorized workspace remains visible', async t => {
  const row = { ...invoice(), created_by: 'other-fixture-user', follow_up_owner_id: 'other-fixture-user' };
  const f = fixture(t, { allowed: ['view'], read: async () => workspace([row]) }); await f.load();
  assert.equal(f.cards().length, 1); f.cards()[0].click();
  assert.equal(f.d.querySelector('[data-invoice-action="edit"]'), null);
});

test('a granted view reloads the active visible route once and joins its activation read', async t => {
  const pending = gate(), f = fixture(t, { allowed: [], read: () => pending.promise });
  await f.load(); assert.equal(f.calls.length, 0);
  f.allowed.add('view'); f.accessChanged(); const activation = f.activate();
  f.accessChanged(); f.accessChanged(); assert.equal(f.calls.length, 1);
  pending.resolve(workspace([invoice()])); await activation;
  assert.equal(f.cards().length, 1); f.accessChanged(); await tick(); assert.equal(f.calls.length, 1);
});

for (const visibility of ['different-route', 'hidden-class', 'hidden-attribute']) test(`granted access defers reading when invoice view is ${visibility}`, async t => {
  const f = fixture(t, { allowed: [] }); await f.load();
  if (visibility === 'different-route') f.w.state.view = 'settings';
  if (visibility === 'hidden-class') f.d.querySelector('#invoicesView').classList.add('hidden');
  if (visibility === 'hidden-attribute') f.d.querySelector('#invoicesView').hidden = true;
  f.allowed.add('view'); f.accessChanged(); await tick(); assert.equal(f.calls.length, 0);
  f.w.state.view = 'invoices'; f.d.querySelector('#invoicesView').classList.remove('hidden'); f.d.querySelector('#invoicesView').hidden = false;
  await f.activate(); assert.equal(f.calls.length, 1); assert.equal(f.cards().length, 1);
});

for (const state of ['denied', 'inactive', 'signed-out', 'missing-profile', 'mismatched-profile']) test(`${state} cannot read even when the route is visible`, async t => {
  const f = fixture(t);
  if (state === 'denied') f.allowed.delete('view');
  if (state === 'inactive') f.w.state.profile.active = false;
  if (state === 'signed-out') f.w.state.token = '';
  if (state === 'missing-profile') f.w.state.profile = null;
  if (state === 'mismatched-profile') f.w.state.profile.id = 'different-fixture-user';
  f.accessChanged(); await f.load(); assert.equal(f.calls.length, 0); assert.equal(f.cards().length, 0);
});

test('routine access events retain unsaved forms and never refresh successful data', async t => {
  const f = fixture(t); await f.load(); const form = f.openEditor(); form.elements.title.value = 'Unsaved text';
  f.accessChanged(); f.accessChanged(); await tick();
  assert.equal(f.calls.length, 1); assert(form.isConnected); assert(form.closest('dialog').open); assert.equal(form.elements.title.value, 'Unsaved text');
});

test('a restored grant defers its read while a dialog is open, then close loads once', async t => {
  const f = fixture(t, { allowed: ['create'] }); await f.load(); const form = f.openEditor(); form.elements.title.value = 'Unsaved text';
  f.allowed.add('view'); f.accessChanged(); await tick();
  assert.equal(f.calls.length, 0); assert(form.isConnected); assert.equal(form.elements.title.value, 'Unsaved text');
  form.querySelector('[data-invoice-close]').click(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.cards().length, 1);
});

test('restored access never starts a workspace read during a pending save', async t => {
  const saving = gate(), f = fixture(t); await f.load();
  f.setReader((name, body) => name === 'save_invoice' ? saving.promise : Promise.resolve(workspace([invoice()])));
  const form = f.openEditor();
  Object.entries({ invoice_number: 'TEST-NEW', title: 'Synthetic new invoice', company_name: 'Test company', total_amount: '10' }).forEach(([key, value]) => { form.elements[key].value = value; });
  form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(f.calls.filter(call => call.name === 'save_invoice').length, 1);
  f.allowed.delete('view'); f.accessChanged(); f.allowed.add('view'); f.accessChanged(); await tick();
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 1);
  saving.resolve(invoice()); await tick(); await tick();
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 2);
});

test('read errors survive routine access events and searching until an explicit successful retry', async t => {
  const f = fixture(t, { read: async () => { throw Error('Synthetic read failure'); } }); await f.load();
  f.accessChanged(); f.search('TEST'); f.accessChanged();
  assert.match(f.d.querySelector('[role="alert"]').textContent, /Synthetic read failure/);
  assert.doesNotMatch(f.d.querySelector('.enterprise-card-list').textContent, /صورتحسابی برای نمایش در دسترس نیست/);
  assert.equal(f.calls.length, 1);
  f.setReader(async () => workspace([invoice()])); await f.load();
  assert.equal(f.cards().length, 1); assert.equal(f.d.querySelector('[role="alert"]'), null);
});

test('only a successful empty workspace displays the neutral empty message', async t => {
  const f = fixture(t, { read: async () => workspace([]) });
  assert.doesNotMatch(f.d.querySelector('.enterprise-card-list').textContent, /صورتحسابی برای نمایش در دسترس نیست/);
  await f.load(); assert.match(f.d.querySelector('.enterprise-card-list').textContent, /صورتحسابی برای نمایش در دسترس نیست/);
});

test('malformed workspace errors persist and cannot replace existing valid rows', async t => {
  const f = fixture(t); await f.load(); f.setReader(async () => ({ invoices: [], payments: [] })); await f.load(); f.accessChanged();
  assert.equal(f.cards().length, 1); assert(f.d.querySelector('[role="alert"]'));
});

test('a new account clears rows immediately and late prior-account success or error cannot leak', async t => {
  for (const outcome of ['success', 'error']) {
    const f = fixture(t); await f.load(); const old = gate(), fresh = gate(); f.setReader(() => old.promise); const oldLoad = f.load();
    f.w.state.user = { id: 'next-fixture-user' }; f.w.state.profile = { id: 'next-fixture-user', active: true }; f.newSession(); f.setReader(() => fresh.promise); f.accessChanged();
    assert.equal(f.cards().length, 0); assert.equal(f.w.bamcoInvoices.model.invoices.length, 0);
    if (outcome === 'success') old.resolve(workspace([invoice('OLD ACCOUNT')])); else old.reject(Error('OLD ACCOUNT ERROR'));
    await oldLoad; assert.doesNotMatch(f.d.body.textContent, /OLD ACCOUNT/); assert.equal(f.cards().length, 0);
    fresh.resolve(workspace([invoice('NEW ACCOUNT')])); await tick();
    assert.equal(f.cards().length, 1); assert.match(f.d.body.textContent, /NEW ACCOUNT/); assert.doesNotMatch(f.d.body.textContent, /OLD ACCOUNT/);
  }
});

test('revocation discards a late read and restoration starts a new authorized request', async t => {
  const old = gate(), fresh = gate(), f = fixture(t, { read: () => old.promise }); const loading = f.load();
  f.allowed.delete('view'); f.accessChanged(); old.resolve(workspace([invoice()])); await loading;
  assert.equal(f.cards().length, 0); assert.equal(f.w.bamcoInvoices.model.invoices.length, 0);
  f.setReader(() => fresh.promise); f.allowed.add('view'); f.accessChanged(); assert.equal(f.calls.length, 2);
  fresh.resolve(workspace([invoice()])); await tick(); assert.equal(f.cards().length, 1);
});

test('normal token renewal preserves an in-flight read within the same auth generation', async t => {
  const pending = gate(), f = fixture(t, { read: () => pending.promise }); const loading = f.load();
  f.w.state.token = 'renewed-synthetic-token'; f.accessChanged(); pending.resolve(workspace([invoice()])); await loading;
  assert.equal(f.calls.length, 1); assert.equal(f.cards().length, 1);
});


test('cross-owner invoice editing does not grant payments, files, or invoice deletion', async t => {
  const row = { ...invoice(), created_by: 'other-fixture-user', follow_up_owner_id: 'other-fixture-user' };
  const foreign = workspace([row]);
  foreign.payments = [{ id: '31', invoice_id: row.id, sequence_no: 1, amount: '10.00', status: 'planned' }];
  foreign.files = [{ id: '41', invoice_id: row.id, payment_id: '31', file_type: 'receipt', file_name: 'fixture.pdf', bucket_id: 'invoices-private', client_request_id: 'synthetic-request', storage_path: 'synthetic/path.pdf', upload_state: 'ready' }];
  const f = fixture(t, { allowed: ['view', 'edit', 'delete'], read: async () => foreign }); await f.load(); f.cards()[0].click();
  assert(f.d.querySelector('[data-invoice-action="edit"]'));
  for (const selector of ['[data-invoice-action="payment"]', '[data-invoice-payment-edit]', '[data-invoice-file-kind]', '[data-invoice-file-delete]', '[data-invoice-action="delete"]']) assert.equal(f.d.querySelector(selector), null, selector);
  assert.equal(f.d.querySelector('[data-invoice-file-download]').disabled, false);
  f.d.querySelector('[data-invoice-action="edit"]').click();
  assert(f.d.querySelector('#invoiceDialog').open); assert.equal(f.d.querySelector('#invoiceForm').elements.title.value, row.title);
  assert.equal(f.d.querySelector('#invoiceForm').elements.proforma_file, undefined);
});

test('cross-owner invoice save submits ordinary invoice fields without ownership or attachment mutations', async t => {
  const row = { ...invoice(), created_by: 'other-fixture-user', follow_up_owner_id: 'other-fixture-user' };
  const f = fixture(t, { allowed: ['view', 'edit'], read: async (name, body) => {
    if (name === 'save_invoice') { Object.assign(row, body.p_payload); return row; }
    assert.equal(name, 'list_invoice_workspace'); return workspace([row]);
  } });
  await f.load(); f.cards()[0].click(); f.d.querySelector('[data-invoice-action="edit"]').click();
  const form = f.d.querySelector('#invoiceForm'); form.elements.title.value = 'Edited synthetic invoice';
  form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  const save = f.calls.find(call => call.name === 'save_invoice'); assert(save); assert.equal(save.body.p_invoice_id, row.id);
  assert.equal(save.body.p_payload.title, 'Edited synthetic invoice');
  for (const key of ['created_by', 'follow_up_owner_id', 'paid_amount', 'remaining_amount', 'status']) assert.equal(key in save.body.p_payload, false, key);
  assert.equal(f.calls.some(call => /payment|file/.test(call.name)), false);
  assert.equal(row.created_by, 'other-fixture-user'); assert.equal(row.follow_up_owner_id, 'other-fixture-user');
  assert.equal(form.isConnected, false); assert.match(f.d.body.textContent, /Edited synthetic invoice/);
});


const foreignFileWorkspace = (state = 'ready') => {
  const row = { ...invoice(), created_by: 'other-fixture-user', follow_up_owner_id: 'other-fixture-user' };
  return { ...workspace([row]), files: [{ id: '41', invoice_id: row.id, payment_id: null, file_type: 'proforma', file_name: 'fixture.pdf', bucket_id: 'invoices-private', client_request_id: 'synthetic-request', storage_path: 'synthetic/file name.pdf', upload_state: state }] };
};

test('a view-only nonowner can download a ready attachment without gaining mutation controls', async t => {
  const f = fixture(t, { allowed: ['view'], read: async () => foreignFileWorkspace() }); await f.load(); f.cards()[0].click();
  const button = f.d.querySelector('[data-invoice-file-download]'); assert.equal(button.disabled, false); button.click(); await tick();
  assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0].url, 'https://fixture.test/storage/v1/object/authenticated/invoices-private/synthetic/file%20name.pdf');
  assert.equal(f.downloads[0].init.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(f.links.length, 1); assert.equal(f.links[0].name, 'fixture.pdf');
  for (const selector of ['[data-invoice-action="edit"]', '[data-invoice-action="payment"]', '[data-invoice-file-kind]', '[data-invoice-file-delete]']) assert.equal(f.d.querySelector(selector), null, selector);
});

for (const reason of ['denied', 'inactive', 'signed-out', 'pending']) test(`a nonowner attachment cannot start downloading when ${reason}`, async t => {
  const f = fixture(t, { allowed: ['view'], read: async () => foreignFileWorkspace(reason === 'pending' ? 'pending' : 'ready') }); await f.load(); f.cards()[0].click();
  const button = f.d.querySelector('[data-invoice-file-download]');
  if (reason === 'denied') f.allowed.delete('view');
  if (reason === 'inactive') f.w.state.profile.active = false;
  if (reason === 'signed-out') f.w.state.token = '';
  // Dispatch deliberately also exercises the runtime guard, not just disabled UI.
  button.dispatchEvent(new f.w.MouseEvent('click', { bubbles: true })); await tick();
  assert.equal(f.downloads.length, 0); assert.equal(f.links.length, 0);
});

for (const change of ['revoked', 'inactive', 'account-switch', 'same-user-new-session']) test(`a pending nonowner download cannot open after ${change}`, async t => {
  const body = gate(), f = fixture(t, { allowed: ['view'], read: async () => foreignFileWorkspace(), download: async () => ({ ok: true, blob: () => body.promise }) });
  await f.load(); f.cards()[0].click(); f.d.querySelector('[data-invoice-file-download]').click(); await tick(); assert.equal(f.downloads.length, 1);
  if (change === 'revoked') f.allowed.delete('view');
  if (change === 'inactive') f.w.state.profile.active = false;
  if (change === 'account-switch') { f.w.state.user = { id: 'next-fixture-user' }; f.w.state.profile = { id: 'next-fixture-user', active: true }; }
  if (change === 'same-user-new-session') f.newSession();
  body.resolve(new f.w.Blob(['synthetic file'])); await tick(); assert.equal(f.links.length, 0);
});

test('server-denied nonowner file reads report the error without opening a download', async t => {
  const f = fixture(t, { allowed: ['view'], read: async () => foreignFileWorkspace(), download: async () => ({ ok: false, json: async () => ({ message: 'Synthetic access denied' }) }) });
  await f.load(); f.cards()[0].click(); f.d.querySelector('[data-invoice-file-download]').click(); await tick();
  assert.equal(f.downloads.length, 1); assert.equal(f.links.length, 0); assert(f.notices.some(message => message.includes('Synthetic access denied')));
});


function fillNewInvoice(f) {
  const form = f.openEditor();
  Object.entries({ invoice_number: 'TEST-NEW', title: 'Synthetic pending invoice', company_name: 'Test company', total_amount: '10' }).forEach(([key, value]) => { form.elements[key].value = value; });
  return form;
}
const submitForm = (f, form) => form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
const switchAccount = f => { f.w.state.user = { id: 'next-fixture-user' }; f.w.state.profile = { id: 'next-fixture-user', active: true }; f.newSession(); f.accessChanged(); };

for (const dismissal of ['native-close', 'escape']) test(`deferred access restoration drains on ${dismissal} without a button click`, async t => {
  const f = fixture(t, { allowed: ['create'] }); await f.load(); const form = f.openEditor(); form.elements.title.value = 'Unsaved text';
  f.allowed.add('view'); f.accessChanged(); await tick(); assert.equal(f.calls.length, 0); assert.equal(form.elements.title.value, 'Unsaved text');
  const dialog = form.closest('dialog');
  if (dismissal === 'escape') { const cancel = new f.w.Event('cancel', { cancelable: true }); dialog.dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, false); }
  dialog.close(); dialog.dispatchEvent(new f.w.Event('close')); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.cards().length, 1); f.accessChanged(); await tick(); assert.equal(f.calls.length, 1);
});

for (const state of ['revoked', 'inactive', 'hidden']) test(`deferred native close never reads after the view becomes ${state}`, async t => {
  const f = fixture(t, { allowed: ['create'] }); await f.load(); const form = f.openEditor(); f.allowed.add('view'); f.accessChanged();
  if (state === 'revoked') f.allowed.delete('view');
  if (state === 'inactive') f.w.state.profile.active = false;
  if (state === 'hidden') f.d.querySelector('#invoicesView').classList.add('hidden');
  const dialog = form.closest('dialog'); dialog.close(); dialog.dispatchEvent(new f.w.Event('close')); await tick();
  assert.equal(f.calls.length, 0);
});

for (const outcome of ['success', 'failure']) test(`new-account loading resumes after the old account's pending save ${outcome}`, async t => {
  const pending = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'save_invoice' ? pending.promise : Promise.resolve(workspace([invoice('NEW ACCOUNT')])));
  const form = fillNewInvoice(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'save_invoice'));
  switchAccount(f); assert.equal(f.cards().length, 0); assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 1);
  if (outcome === 'success') pending.resolve(invoice('OLD ACCOUNT')); else pending.reject(Error('OLD ACCOUNT ERROR'));
  await until(() => f.cards().length === 1);
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 2);
  assert.match(f.d.body.textContent, /NEW ACCOUNT/); assert.doesNotMatch(f.d.body.textContent, /OLD ACCOUNT/);
  assert.equal(f.notices.some(message => message.includes('OLD ACCOUNT')), false);
});

test('same-account revoked then restored access resumes after a failed pending save', async t => {
  const pending = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'save_invoice' ? pending.promise : Promise.resolve(workspace([invoice()])));
  const form = fillNewInvoice(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'save_invoice'));
  f.allowed.delete('view'); f.accessChanged(); f.allowed.add('view'); f.accessChanged();
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 1);
  pending.reject(Error('Synthetic save failure')); await until(() => f.cards().length === 1);
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 2);
});

test('same-user new-session loading resumes after the old generation finishes its save', async t => {
  const pending = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'save_invoice' ? pending.promise : Promise.resolve(workspace([invoice('NEW SESSION')])));
  const form = fillNewInvoice(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'save_invoice'));
  f.newSession(); f.accessChanged(); pending.resolve(invoice('OLD SESSION')); await until(() => f.cards().length === 1);
  assert.match(f.d.body.textContent, /NEW SESSION/); assert.doesNotMatch(f.d.body.textContent, /OLD SESSION/);
});

test('a blocked deferred reload preserves another unsaved form until native close', async t => {
  const f = fixture(t, { allowed: ['create'] }); await f.load(); const form = f.openEditor(); form.elements.title.value = 'Preserve this';
  f.allowed.add('view'); f.accessChanged(); f.accessChanged(); f.accessChanged(); await tick();
  assert.equal(f.calls.length, 0); assert(form.isConnected); assert.equal(form.elements.title.value, 'Preserve this');
  const dialog = form.closest('dialog'); dialog.close(); dialog.dispatchEvent(new f.w.Event('close')); await tick(); assert.equal(f.calls.length, 1);
});

function chooseProforma(f) {
  f.cards()[0].click(); f.d.querySelector('[data-invoice-file-kind="proforma"]').click(); const form = f.d.querySelector('#invoiceFileForm');
  const file = new f.w.File(['%PDF-1.7 synthetic'], 'old-account-fixture.pdf', { type: 'application/pdf' });
  Object.defineProperty(form.elements.file, 'files', { configurable: true, value: [file] }); form.elements.file.required = false;
  return form;
}

test('account change during file hashing prevents any old-account reservation request', async t => {
  const hash = gate(); let hashing = false;
  const f = fixture(t, { hash: () => { hashing = true; return hash.promise; } }); await f.load(); const form = chooseProforma(f); submitForm(f, form);
  await until(() => hashing); switchAccount(f); hash.resolve(new ArrayBuffer(32)); await until(() => form.dataset.busy === '0'); await tick();
  assert.equal(f.calls.filter(call => call.name === 'reserve_invoice_file').length, 0); assert.equal(f.downloads.length, 0);
  assert.equal(f.w.bamcoInvoices.model.files.length, 0); assert.doesNotMatch(f.d.body.textContent, /old-account-fixture/);
  assert.equal(f.cards().length, 1, 'new-account deferred read resumes when the old upload stops');
});

test('late old-account reservation cannot repopulate pending-file metadata after new-account read', async t => {
  const reserve = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'reserve_invoice_file' ? reserve.promise : Promise.resolve(workspace([invoice()])));
  const form = chooseProforma(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'reserve_invoice_file'));
  const request = f.calls.find(call => call.name === 'reserve_invoice_file').body;
  switchAccount(f); await f.load(); assert.equal(f.w.bamcoInvoices.model.files.length, 0);
  reserve.resolve({ id: '41', invoice_id: request.p_invoice_id, payment_id: null, file_type: 'proforma', file_name: 'old-account-fixture.pdf', client_request_id: request.p_request_id, bucket_id: 'invoices-private', upload_state: 'pending', storage_path: 'synthetic/private.pdf' });
  await until(() => form.dataset.busy === '0'); f.accessChanged(); f.cards()[0].click();
  assert.equal(f.w.bamcoInvoices.model.files.length, 0); assert.equal(f.downloads.length, 0); assert.doesNotMatch(f.d.body.textContent, /old-account-fixture/);
});


for (const readFinished of [false, true]) test(`native close reloads a first read retired by opening an editor, completed=${readFinished}`, async t => {
  const pending = gate(), f = fixture(t, { read: () => pending.promise }); const loading = f.load(); const form = f.openEditor();
  if (readFinished) { pending.resolve(workspace([invoice()])); await loading; }
  const dialog = form.closest('dialog'); dialog.close(); dialog.dispatchEvent(new f.w.Event('close'));
  pending.resolve(workspace([invoice()])); await loading; await tick();
  assert.equal(f.calls.length, 2); assert.equal(f.cards().length, 1); assert.equal(f.d.querySelector('[data-invoice-load-status]'), null);
});

test('a rejected old-account file reservation cannot reveal its error or pending filename', async t => {
  const reserve = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'reserve_invoice_file' ? reserve.promise : Promise.resolve(workspace([invoice('NEW ACCOUNT')])));
  const form = chooseProforma(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'reserve_invoice_file'));
  switchAccount(f); reserve.reject(Error('OLD ACCOUNT PRIVATE FILENAME')); await until(() => form.dataset.busy === '0'); await tick();
  assert.equal(f.w.bamcoInvoices.model.files.length, 0); assert.equal(f.downloads.length, 0);
  assert.equal(f.notices.some(message => message.includes('OLD ACCOUNT')), false); assert.doesNotMatch(f.d.body.textContent, /OLD ACCOUNT|old-account-fixture/);
  assert.equal(f.cards().length, 1);
});

test('old-account mutation cleanup never drains a now-inactive new-account read', async t => {
  const pending = gate(), f = fixture(t); await f.load();
  f.setReader(name => name === 'save_invoice' ? pending.promise : Promise.resolve(workspace([invoice('NEW ACCOUNT')])));
  const form = fillNewInvoice(f); submitForm(f, form); await until(() => f.calls.some(call => call.name === 'save_invoice'));
  switchAccount(f); f.w.state.profile.active = false;
  pending.reject(Error('OLD ACCOUNT ERROR')); await until(() => form.dataset.busy === '0'); await tick();
  assert.equal(f.calls.filter(call => call.name === 'list_invoice_workspace').length, 1); assert.equal(f.cards().length, 0);
  assert.equal(f.notices.some(message => message.includes('OLD ACCOUNT')), false);
});

test('an old-account download failure cannot disclose server text to the new account', async t => {
  const response = gate(), f = fixture(t, { allowed: ['view'], read: async () => foreignFileWorkspace(), download: () => response.promise });
  await f.load(); f.cards()[0].click(); f.d.querySelector('[data-invoice-file-download]').click(); await tick();
  switchAccount(f); response.resolve({ ok: false, json: async () => ({ message: 'OLD ACCOUNT PRIVATE FILENAME' }) }); await tick(); await tick();
  assert.equal(f.links.length, 0); assert.equal(f.notices.some(message => message.includes('OLD ACCOUNT')), false);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/test-reports.js'), 'utf8');
const { DOMAINS, TYPES, normalizeYear, currentJalaliYear, updatedDate, scopedFiles, validateFile } = require('../assets/js/test-reports.js');
const wait = () => new Promise(resolve => setTimeout(resolve, 5));
const YEAR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const FILE = '33333333-3333-4333-8333-333333333333';
const stamp = '2026-10-01T12:00:00Z';
const year = (id = YEAR, domain = 'environment', report_type = 'research') => ({ id, domain, report_type, jalali_year: 1405, updated_at: stamp, created_by: 'user-a' });
const file = (id = FILE, year_id = YEAR, title = 'آزمایش نمونه') => ({ id, year_id, title, description: '', original_file_name: 'test.pdf', mime_type: 'application/pdf', file_size: 100, status: 'ready', updated_at: stamp, created_by: 'user-a', storage_path: `years/${year_id}/${id}.pdf` });
async function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><div id="appView"><section id="testReportsView" class="view"><div id="testReportsRoot" class="enterprise-feature-root"></div></section></div>', { url: 'https://bamco.test', runScripts: 'outside-only' });
  const w = dom.window, d = w.document, calls = [], confirmations = [], notices = [], lifecycle = {}, tables = { test_report_years: options.years || [], test_report_files: options.files || [] };
  const grants = new Set(options.grants || ['view','create','edit','delete','export']); let generation = 1;
  w.state = { token: 'token-a', user: { id: 'user-a' } }; w.Bamco = { state: w.state }; w.SB_URL = 'https://fake.supabase.test'; w.SB_KEY = 'publishable';
  w.BamcoAccess = { can: (feature, action) => feature === 'documents' && grants.has(action), denied: (feature, action) => notices.push('denied:' + action) };
  w.bamcoAuth = { snapshot: () => ({ generation, userId: w.state.user.id }), isCurrent: snapshot => snapshot.generation === generation && snapshot.userId === w.state.user.id };
  w.BamcoNavigation = { registerView: (id, handlers) => lifecycle[id] = handlers };
  w.bamcoToast = (...args) => notices.push(args); w.bamcoConfirm = async message => { confirmations.push(message); return options.confirm !== false; };
  w.selectAll = async (table, query) => { calls.push({ table, query }); return options.selectAll ? options.selectAll(table, query) : structuredClone(tables[table]); };
  w.fetch = async (url, init = {}) => { const action = init.body?.get?.('action'); calls.push({ url, action, body: init.body }); return options.fetch ? options.fetch(url, init, tables) : { ok: true, json: async () => ({ ok: true }) }; };
  w.bamcoTableSuite = { refresh: table => table.dataset.sharedSuite = 'true' }; w.bamcoShowHome = () => lifecycle.testReports.dispose();
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  let urlIndex = 0; w.URL.createObjectURL = () => `blob:test-${++urlIndex}`; w.URL.revokeObjectURL = () => {};
  w.eval(fs.readFileSync(path.join(__dirname, '../assets/js/reference-tables.js'), 'utf8'));
  w.eval(source); await wait(); await lifecycle.testReports.activate();
  const click = selector => { const el = d.querySelector(selector); assert.ok(el, `Missing ${selector}`); el.click(); };
  const branch = (domain = 'environment', type = 'research') => { click(`[data-report-domain="${domain}"]`); click(`[data-report-type="${type}"]`); };
  const submit = selector => d.querySelector(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  return { w, d, dom, calls, tables, notices, confirmations, grants, lifecycle, click, branch, submit, changeSession() { generation++; w.state.user.id = 'user-b'; }, dispose() { dom.window.close(); } };
}

test('fixed domains and exactly three report types; Jalali year accepts Persian and Arabic digits', () => {
  assert.deepEqual(DOMAINS.map(x => x.title), ['محیط زیست', 'استاندارد']);
  assert.deepEqual(TYPES.map(x => x.title), ['تحقیقاتی', 'انطباق تولید', 'تأیید نوع و تغییرات مهندسی']);
  assert.equal(normalizeYear('۱۴۰۵'), 1405); assert.equal(normalizeYear('١٤٠٥'), 1405);
  for (const invalid of ['1405x','۱۴۰۵/۰۱','1199','1601','1405.0','']) assert.equal(normalizeYear(invalid), null);
  assert.equal(currentJalaliYear(new Date('2026-03-20T12:00:00Z')), 1404);
  assert.equal(currentJalaliYear(new Date('2026-03-21T12:00:00Z')), 1405);
  assert.match(updatedDate(stamp), /۱۴۰۵/); assert.equal(updatedDate('invalid'), '—');
});

test('scoped file lookup cannot cross domain, report type or year', () => {
  const years = [year(), year(OTHER, 'standard'), year('third', 'environment', 'production')];
  const files = [file(), file('b', OTHER), file('c', 'third')];
  assert.deepEqual(scopedFiles(files, years, { domain: 'environment', type: 'research' }).map(x => x.id), [FILE]);
  assert.deepEqual(scopedFiles(files, years, { year: OTHER }).map(x => x.id), ['b']);
  assert.throws(() => validateFile({ name: 'test.html', size: 10 }));
  assert.throws(() => validateFile({ name: 'test.pdf', size: 25 * 1024 * 1024 + 1 }));
});

test('navigation renders two immutable roots, three categories, folders, breadcrumbs and shared file table', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose());
  assert.equal(f.d.querySelectorAll('[data-report-domain]').length, 2);
  assert.equal(f.d.querySelectorAll('[data-report-delete-year]').length, 0);
  f.click('[data-report-domain="environment"]'); assert.equal(f.d.querySelectorAll('[data-report-type]').length, 3);
  f.click('[data-report-type="research"]'); assert.match(f.d.querySelector('.test-report-card').textContent, /آخرین به‌روزرسانی:.*۱۴۰۵/);
  f.click(`[data-report-year="${YEAR}"]`); assert.equal(f.d.querySelector('#testReportsTable').dataset.sharedSuite, 'true');
  assert.equal(f.d.querySelectorAll('[data-report-ancestor]').length, 3);
  assert.equal(f.d.querySelector('time').dateTime, stamp);
  f.click('[data-report-ancestor="domain"]'); assert.equal(f.d.querySelectorAll('[data-report-type]').length, 3);
  f.click('[data-report-action="back"]'); assert.equal(f.d.querySelectorAll('[data-report-domain]').length, 2);
});

test('search remains in active branch and exposes matching file path navigation', async t => {
  const f = await fixture({ years: [year(), year(OTHER, 'standard')], files: [file(), file('other', OTHER, 'آزمایش دیگر')] }); t.after(() => f.dispose()); f.branch();
  const input = f.d.querySelector('#testReportsSearch'); input.value = 'آزمایش'; input.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(f.d.querySelectorAll('#testReportsTable tbody tr').length, 1); assert.equal(f.d.querySelector('[data-report-action="export"]').hidden, false);
  f.click(`[data-report-go-file="${FILE}"]`); assert.equal(f.w.bamcoTestReports.model.year, YEAR); assert.equal(f.d.querySelector('#testReportsSearch').value, '');
});

test('new year defaults to current Persian year and duplicate guard never reaches backend', async t => {
  const f = await fixture({ years: [year()] }); t.after(() => f.dispose()); f.branch(); f.click('[data-report-action="new-year"]');
  const form = f.d.querySelector('#testReportYearForm'); assert.equal(normalizeYear(form.elements.jalali_year.value), currentJalaliYear());
  form.elements.jalali_year.value = '۱۴۰۵'; f.submit('#testReportYearForm'); await wait();
  assert.match(form.querySelector('[data-report-error]').textContent, /وجود دارد/); assert.equal(f.calls.filter(call => call.action).length, 0);
});

test('year mutation reloads server timestamp; no hardcoded current-year folder insertion', async t => {
  const f = await fixture({ fetch: async (url, init, tables) => { const form = init.body; tables.test_report_years.push({ ...year(form.get('id')), jalali_year: Number(form.get('jalali_year')) }); return { ok: true, json: async () => ({ ok: true, year: tables.test_report_years[0] }) }; } }); t.after(() => f.dispose()); f.branch();
  assert.equal(f.w.bamcoTestReports.model.years.length, 0); f.click('[data-report-action="new-year"]'); f.d.querySelector('#testReportYearForm').elements.jalali_year.value = '۱۴۰۴';
  f.submit('#testReportYearForm'); await wait(); await wait(); assert.equal(f.calls.find(call => call.action).action, 'create_year');
  assert.equal(f.w.bamcoTestReports.model.years[0].updated_at, stamp); assert.equal(f.d.querySelector('#testReportYearDialog').open, false);
});

test('nonempty year deletion is blocked with exact count; empty deletion requires confirmation', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose()); f.branch();
  f.click(`[data-report-delete-year="${YEAR}"]`); await wait(); assert.equal(f.confirmations.length, 0); assert.equal(f.calls.some(call => call.action), false); assert.match(f.notices[0][0], /۱ فایل/);
  f.tables.test_report_files = []; await f.w.bamcoTestReports.load(); f.click(`[data-report-delete-year="${YEAR}"]`); await wait(); assert.equal(f.confirmations.length, 1); assert.equal(f.calls.filter(call => call.action)[0].action, 'delete_year');
});

test('cancelled file deletion makes no mutation request and retains file', async t => {
  const f = await fixture({ years: [year()], files: [file()], confirm: false }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`); f.click(`[data-report-delete-file="${FILE}"]`); await wait();
  assert.equal(f.confirmations.length, 1); assert.equal(f.calls.some(call => call.action), false); assert.equal(f.w.bamcoTestReports.model.files.length, 1);
});

test('read-only documents permissions hide all report write controls, including direct handler checks', async t => {
  const f = await fixture({ years: [year()], files: [file()], grants: ['view'] }); t.after(() => f.dispose()); f.branch();
  assert.equal(f.d.querySelector('[data-report-action="new-year"]'), null); assert.equal(f.d.querySelector('[data-report-edit-year]'), null);
  f.click(`[data-report-year="${YEAR}"]`); assert.equal(f.d.querySelector('[data-report-edit-file]'), null); assert.equal(f.d.querySelector('[data-report-delete-file]'), null);
  f.d.querySelector('#testReportsBody').insertAdjacentHTML('beforeend', `<button data-report-delete-file="${FILE}">injected action</button>`); f.click('[data-report-delete-file]'); await wait(); assert.equal(f.calls.some(call => call.action), false);
});

test('failed upload keeps stable idempotency UUID and file selection for retry; repeated submit is single-flight', async t => {
  let resolve; const actions = [];
  const f = await fixture({ years: [year()], fetch: async (url, init) => { actions.push(init.body.get('id')); return new Promise(done => resolve = done); } }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`); f.click('[data-report-action="upload"]');
  const form = f.d.querySelector('#testReportFileForm'); form.elements.title.value = 'گزارش جدید'; Object.defineProperty(form.elements.file, 'files', { configurable: true, value: [new f.w.File(['sample'], 'sample.pdf', { type: 'application/pdf' })] });
  f.submit('#testReportFileForm'); f.submit('#testReportFileForm'); await wait(); assert.equal(actions.length, 1);
  resolve({ ok: false, json: async () => ({ ok: false, error: 'خطای آزمایشی' }) }); await wait(); const id = form.elements.id.value;
  assert.equal(f.d.querySelector('#testReportFileDialog').open, true); f.submit('#testReportFileForm'); await wait(); assert.deepEqual(actions, [id, id]); resolve({ ok: true, json: async () => ({ ok: true }) }); await wait();
});

test('pending files offer upload continuation; deleting files only offer retry deletion', async t => {
  const pending = { ...file(), status: 'pending' }, deleting = { ...file('delete-me'), status: 'deleting' };
  const f = await fixture({ years: [year()], files: [pending, deleting] }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`);
  assert.equal(f.d.querySelectorAll('[data-report-download]').length, 0); f.click(`[data-report-retry-file="${FILE}"]`);
  const form = f.d.querySelector('#testReportFileForm'); assert.equal(form.elements.id.value, FILE); assert.equal(form.elements.title.readOnly, true); assert.equal(form.elements.mode.value, 'upload');
});

test('out-of-order preview cannot replace newer preview; Close and navigation invalidate pending loads', async t => {
  const queue = [];
  const f = await fixture({ years: [year()], files: [file(), file('second', YEAR, 'گزارش دوم')], fetch: async () => new Promise(resolve => queue.push(resolve)) }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`);
  f.click(`[data-report-preview="${FILE}"]`); f.click('[data-report-preview="second"]'); queue[1]({ ok: true, blob: async () => new Blob(['second']) }); await wait(); assert.equal(f.d.querySelector('#testReportPreview h3').textContent, 'گزارش دوم');
  queue[0]({ ok: true, blob: async () => new Blob(['first']) }); await wait(); assert.equal(f.d.querySelector('#testReportPreview h3').textContent, 'گزارش دوم');
  f.click(`[data-report-preview="${FILE}"]`); f.click('#testReportPreview [data-report-close]'); queue[2]({ ok: true, blob: async () => new Blob(['first']) }); await wait(); assert.equal(f.d.querySelector('#testReportPreview').open, false);
  f.click(`[data-report-preview="${FILE}"]`); f.click('[data-report-action="back"]'); queue[3]({ ok: true, blob: async () => new Blob(['first']) }); await wait(); assert.equal(f.d.querySelector('#testReportPreview').open, false);
});

test('session change clears old cached report rows; disposal removes listeners and ignores late data', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose());
  f.lifecycle.testReports.dispose(); f.click('[data-report-domain="environment"]'); assert.equal(f.w.bamcoTestReports.model.domain, '');
  f.changeSession(); f.tables.test_report_years = []; f.tables.test_report_files = []; await f.lifecycle.testReports.activate(); assert.equal(f.w.bamcoTestReports.model.files.length, 0);
  f.branch(); assert.equal(f.w.bamcoTestReports.model.type, 'research');
  f.grants.delete('view'); f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed')); assert.equal(f.w.bamcoTestReports.model.years.length, 0); assert.match(f.d.querySelector('#testReportsBody').textContent, /دسترسی/);
});

test('catalog aliases reports to documents and integrates resources navigation without new permissions', () => {
  const catalog = fs.readFileSync(path.join(__dirname, '../assets/js/navigation-registry.js'), 'utf8');
  assert.match(catalog, /routes: \['documents', 'testReports', 'sitesAccess', 'userGuide'\]/);
  assert.match(catalog, /\['testReports', 'documents', 'گزارش آزمایش‌ها'\]/);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8'); assert.match(html, /id="testReportsRoot" class="enterprise-feature-root"/);
  assert.doesNotMatch(source, /(?:insert|update)\('document_categories'/);
  assert.match(fs.readFileSync(path.join(__dirname, '../assets/js/visual-system.js'), 'utf8'), /testReports:'testReports'/);
});


test('shared reference table paginates beyond 25 files and column filters reset the page', async t => {
  const files = Array.from({ length: 32 }, (_, index) => file(`file-${index}`, YEAR, `گزارش ${index}`));
  const f = await fixture({ years: [year()], files }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`);
  assert.equal(f.d.querySelectorAll('.reference-page-hidden').length, 7);
  assert.equal(f.d.querySelectorAll('.reference-filters select').length, 6);
  f.click('.reference-pagination [data-page="next"]'); assert.equal(f.d.querySelectorAll('.reference-page-hidden').length, 25);
  const filter = f.d.querySelector('.reference-filters select'); filter.value = 'گزارش 0'; filter.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  assert.equal(f.d.querySelectorAll('.reference-filtered-out').length, 31);
  assert.equal(f.d.querySelectorAll('tbody tr:not(.reference-filtered-out):not(.reference-page-hidden)').length, 1);
  assert.equal(f.d.querySelector('.reference-pagination [data-page="next"]').disabled, true);
});


test('server nonempty guard reports authoritative count when local folder contents are stale', async t => {
  const f = await fixture({ years: [year()], fetch: async () => ({ ok: false, json: async () => ({ ok: false, code: 'folder_not_empty', count: 3, error: 'nonempty' }) }) }); t.after(() => f.dispose());
  f.branch(); f.click(`[data-report-delete-year="${YEAR}"]`); await wait();
  assert.match(f.notices[0][0], /۳ فایل/); assert.equal(f.w.bamcoTestReports.model.years.length, 1);
});

test('load errors are visible and retry restores data without changing the selected route', async t => {
  let failed = true;
  const f = await fixture({ selectAll: async table => { if (failed) throw Error('خطای شبکه آزمایشی'); return table === 'test_report_years' ? [year()] : []; } }); t.after(() => f.dispose());
  assert.match(f.d.querySelector('#testReportsStatus').textContent, /خطای شبکه/); f.branch(); failed = false;
  f.click('#testReportsStatus [data-report-action="refresh"]'); await wait();
  assert.equal(f.d.querySelector('#testReportsStatus').textContent, ''); assert.equal(f.w.bamcoTestReports.model.type, 'research'); assert.ok(f.d.querySelector(`[data-report-year="${YEAR}"]`));
});


test('uncertain upload pins exact file and metadata even if controls are changed before retry', async t => {
  const attempts = []; let resolve;
  const f = await fixture({ years: [year()], fetch: async (url, init) => { attempts.push(init.body); return new Promise(done => resolve = done); } }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`); f.click('[data-report-action="upload"]');
  const form = f.d.querySelector('#testReportFileForm'), original = new f.w.File(['original'], 'original.pdf', { type: 'application/pdf' });
  form.elements.title.value = 'عنوان اصلی'; form.elements.description.value = 'شرح اصلی'; Object.defineProperty(form.elements.file, 'files', { configurable: true, value: [original] });
  f.submit('#testReportFileForm'); await wait(); assert.equal(form.elements.file.disabled, true); assert.equal(form.elements.title.disabled, true);
  form.elements.title.value = 'عنوان تغییر یافته'; form.elements.description.value = 'شرح تغییر یافته'; Object.defineProperty(form.elements.file, 'files', { configurable: true, value: [new f.w.File(['changed'], 'changed.pdf', { type: 'application/pdf' })] });
  resolve({ ok: false, status: 503, json: async () => ({ ok: false, code: 'operation_unconfirmed', error: 'پاسخ دریافت نشد' }) }); await wait();
  assert.equal(form.elements.title.disabled, true); assert.equal(form.elements.file.disabled, true); f.submit('#testReportFileForm'); await wait();
  assert.equal(attempts[0], attempts[1]); assert.equal(attempts[1].get('title'), 'عنوان اصلی'); assert.equal(attempts[1].get('description'), 'شرح اصلی'); assert.equal(attempts[1].get('file').name, 'original.pdf');
  resolve({ ok: false, status: 403, json: async () => ({ ok: false, code: 'forbidden', error: 'اجازه ندارید' }) }); await wait();
  assert.equal(form.elements.file.disabled, true, 'later definitive denial cannot erase uncertainty about the earlier mutation');
});

test('definitive pre-upload rejection allows correction; reopening starts an explicit new operation', async t => {
  const attempts = [];
  const f = await fixture({ years: [year()], fetch: async (url, init) => { attempts.push(init.body); return { ok: false, status: 400, json: async () => ({ ok: false, code: 'invalid_file_type', error: 'فرمت مجاز نیست' }) }; } }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`); f.click('[data-report-action="upload"]');
  const form = f.d.querySelector('#testReportFileForm'); form.elements.title.value = 'عنوان'; Object.defineProperty(form.elements.file, 'files', { configurable: true, value: [new f.w.File(['x'], 'valid.pdf', { type: 'application/pdf' })] });
  const originalId = form.elements.id.value; f.submit('#testReportFileForm'); await wait();
  assert.equal(form.elements.file.disabled, false); assert.equal(form.elements.title.disabled, false); form.elements.title.value = 'عنوان اصلاح شده'; f.submit('#testReportFileForm'); await wait();
  assert.notEqual(attempts[0], attempts[1]); assert.equal(attempts[1].get('title'), 'عنوان اصلاح شده');
  f.click('#testReportFileDialog [data-report-close]'); f.click('[data-report-action="upload"]'); assert.notEqual(form.elements.id.value, originalId); assert.equal(form.elements.file.disabled, false);
});


test('canonical home control and view hiding dispose report listeners and pending previews', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose());
  assert.ok(f.d.querySelector('[data-home-action][data-report-action="home"]'));
  f.d.querySelector('#testReportsView').classList.add('hidden'); await wait();
  assert.equal(f.w.bamcoTestReports.model.active, false); f.click('[data-report-domain="environment"]'); assert.equal(f.w.bamcoTestReports.model.domain, '');
});


test('named id input shadowing the form.id property never blocks year or file submission', async t => {
  const f = await fixture({ years: [year()], fetch: async (url, init, tables) => {
    const body = init.body;
    if (body.get('action') === 'create_year') tables.test_report_years.push({ ...year(body.get('id')), jalali_year: Number(body.get('jalali_year')) });
    return { ok: true, json: async () => ({ ok: true }) };
  } }); t.after(() => f.dispose()); f.branch(); f.click('[data-report-action="new-year"]');
  const yearForm = f.d.querySelector('#testReportYearForm');
  Object.defineProperty(yearForm, 'id', { configurable: true, value: yearForm.elements.id });
  assert.equal(typeof yearForm.id, 'object'); yearForm.elements.jalali_year.value = '۱۴۰۴'; f.submit('#testReportYearForm'); await wait();
  assert.equal(f.calls.filter(call => call.action)[0].action, 'create_year'); assert.equal(f.d.querySelector('#testReportYearDialog').open, false);
  assert.equal(f.notices.at(-1)[0], 'پوشه سال ذخیره شد.');
  f.click(`[data-report-year="${YEAR}"]`); f.click('[data-report-action="upload"]');
  const fileForm = f.d.querySelector('#testReportFileForm');
  Object.defineProperty(fileForm, 'id', { configurable: true, value: fileForm.elements.id });
  fileForm.elements.title.value = 'گزارش'; Object.defineProperty(fileForm.elements.file, 'files', { configurable: true, value: [new f.w.File(['x'], 'sample.pdf', { type: 'application/pdf' })] });
  f.submit('#testReportFileForm'); await wait(); assert.equal(f.calls.filter(call => call.action)[1].action, 'upload'); assert.equal(f.d.querySelector('#testReportFileDialog').open, false);
  assert.equal(f.notices.at(-1)[0], 'گزارش ذخیره شد.');
});


test('export exists only for a rendered file table and search typing preserves the input node', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose());
  assert.equal(f.d.querySelector('[data-report-action="export"]'), null);
  f.click('[data-report-domain="environment"]'); assert.equal(f.d.querySelector('[data-report-action="export"]'), null);
  f.click('[data-report-type="research"]'); assert.equal(f.d.querySelector('[data-report-action="export"]'), null);
  const search = f.d.querySelector('#testReportsSearch'); search.value = 'آزمایش'; search.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.ok(f.d.querySelector('[data-report-action="export"]')); assert.equal(f.d.querySelector('#testReportsSearch'), search);
  search.value = ''; search.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(f.d.querySelector('[data-report-action="export"]'), null); assert.equal(f.d.querySelector('#testReportsSearch'), search);
  f.click(`[data-report-year="${YEAR}"]`); assert.ok(f.d.querySelector('[data-report-action="export"]'));
  const yearSearch = f.d.querySelector('#testReportsSearch'); yearSearch.value = 'does not match'; yearSearch.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(f.d.querySelector('[data-report-action="export"]'), null); assert.equal(f.d.querySelector('#testReportsSearch'), yearSearch);
});


test('metadata edit removes the irrelevant file picker and a new upload restores it', async t => {
  const f = await fixture({ years: [year()], files: [file()] }); t.after(() => f.dispose()); f.branch(); f.click(`[data-report-year="${YEAR}"]`); f.click(`[data-report-edit-file="${FILE}"]`);
  assert.equal(f.d.querySelector('#testReportFileForm [data-report-file-field]'), null); assert.equal(f.d.querySelector('#testReportFileForm [name="file"]'), null);
  f.click('#testReportFileDialog [data-report-close]'); f.click('[data-report-action="upload"]');
  assert.ok(f.d.querySelector('#testReportFileForm [data-report-file-field]')); assert.equal(f.d.querySelector('#testReportFileForm [name="file"]').required, true);
});


test('report heading follows shared enterprise header structure and content uses canonical insets', async t => {
  const f = await fixture(); t.after(() => f.dispose());
  assert.equal(f.d.querySelector('#testReportsRoot > .enterprise-toolbar > div:first-child h3').textContent, 'گزارش آزمایش‌ها');
  const css = fs.readFileSync(path.join(__dirname, '../assets/css/test-reports.css'), 'utf8');
  assert.match(css, /#testReportsBody, #testReportsBreadcrumbs, #testReportsStatus \{[^}]*padding-inline: 16px/);
});

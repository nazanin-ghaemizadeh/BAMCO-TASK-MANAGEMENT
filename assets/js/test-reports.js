/* Test-report library: fixed domains/types, user-owned Jalali year folders.
   Task reports and the general document classification tree remain separate. */
(() => {
  'use strict';
  const DOMAINS = Object.freeze([{ key: 'environment', title: 'محیط زیست', icon: '♧' }, { key: 'standard', title: 'استاندارد', icon: '▧' }]);
  const TYPES = Object.freeze([{ key: 'research', title: 'تحقیقاتی' }, { key: 'production', title: 'انطباق تولید' }, { key: 'type_engineering', title: 'تأیید نوع و تغییرات مهندسی' }]);
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const EXTENSIONS = Object.freeze({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', txt: 'text/plain', csv: 'text/csv', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const latin = value => String(value ?? '').replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const fa = value => String(value ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  function normalizeYear(value) { const text = latin(value).trim(); return /^\d{4}$/.test(text) && Number(text) >= 1200 && Number(text) <= 1600 ? Number(text) : null; }
  function currentJalaliYear(now = new Date()) { return Number(new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', timeZone: 'Asia/Tehran' }).formatToParts(now).find(part => part.type === 'year').value); }
  function updatedDate(value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(value)) : '—'; }
  function matchesFile(file, query) { const needle = latin(query).trim().toLocaleLowerCase('fa'); return !needle || [file.title, file.description, file.original_file_name].some(value => latin(value).toLocaleLowerCase('fa').includes(needle)); }
  function scopedFiles(files, years, path) { const ids = new Set(years.filter(year => (!path.domain || year.domain === path.domain) && (!path.type || year.report_type === path.type) && (!path.year || String(year.id) === String(path.year))).map(year => String(year.id))); return files.filter(file => ids.has(String(file.year_id))); }
  function validateFile(file) { if (!file || file.size <= 0 || file.size > MAX_FILE_SIZE) throw Error('یک فایل با حجم حداکثر ۲۵ مگابایت انتخاب کنید.'); const ext = String(file.name || '').split('.').pop().toLowerCase(); if (!EXTENSIONS[ext]) throw Error('فرمت مجاز: PDF، تصویر، متن، CSV، Excel یا Word.'); return EXTENSIONS[ext]; }
  if (typeof module !== 'undefined' && module.exports) module.exports = { DOMAINS, TYPES, normalizeYear, currentJalaliYear, updatedDate, matchesFile, scopedFiles, validateFile };
  if (typeof document === 'undefined') return;

  const q = (selector, root = document) => root?.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const appState = () => window.Bamco?.state || (typeof state !== 'undefined' ? state : {});
  const can = (action = 'view') => window.BamcoAccess?.can?.('documents', action) === true;
  const requireAccess = action => { if (can(action)) return true; window.BamcoAccess?.denied?.('documents', action); return false; };
  const notice = (message, error = false) => (window.bamcoToast || window.toast)?.(message, error);
  const model = { years: [], files: [], domain: '', type: '', year: '', query: '', loading: false, loaded: false, error: '', identity: '', active: false };
  const root = () => q('#testReportsRoot');
  const yearById = id => model.years.find(year => String(year.id) === String(id));
  const fileById = id => model.files.find(file => String(file.id) === String(id));
  const identity = () => `${appState().user?.id || ''}:${window.bamcoAuth?.snapshot?.().generation ?? ''}`;
  const session = () => ({ identity: identity(), snapshot: window.bamcoAuth?.snapshot?.() });
  const current = value => !!appState().token && value.identity === identity() && (!value.snapshot || window.bamcoAuth?.isCurrent?.(value.snapshot) !== false) && can('view');
  let loadVersion = 0, binding = null, previewUrl = '', previewVersion = 0, dialogBusy = false;
  const bytes = size => `${fa((Number(size || 0) / 1024).toFixed(1))} کیلوبایت`;
  const statusText = file => file.status === 'ready' ? 'آماده' : file.status === 'deleting' ? 'حذف ناتمام؛ تلاش دوباره' : 'بارگذاری ناتمام؛ ادامه بارگذاری';
  const newest = rows => rows.map(row => row.updated_at).filter(value => value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const pathLabel = year => year ? `${DOMAINS.find(item => item.key === year.domain)?.title || ''} / ${TYPES.find(item => item.key === year.report_type)?.title || ''} / ${fa(year.jalali_year)}` : '';

  function shell() {
    if (!root() || q('#testReportsBody', root())) return;
    root().innerHTML = `<header class="feature-toolbar enterprise-toolbar test-reports-heading"><h3>گزارش آزمایش‌ها</h3></header><div class="bamco-command-bar test-reports-command" id="testReportsCommands"></div><nav class="test-reports-breadcrumbs" aria-label="مسیر گزارش آزمایش‌ها" id="testReportsBreadcrumbs"></nav><div id="testReportsStatus" role="status" aria-live="polite"></div><div id="testReportsBody"></div>
    <dialog class="modal small" id="testReportYearDialog"><form id="testReportYearForm"><div class="modal-head"><h3>پوشه سال شمسی</h3><button type="button" data-report-close aria-label="بستن">×</button></div><input name="id" type="hidden"><input name="domain" type="hidden"><input name="report_type" type="hidden"><label>سال شمسی<input name="jalali_year" type="text" inputmode="numeric" maxlength="4" required aria-describedby="testReportYearHint"></label><small id="testReportYearHint">سال چهاررقمی را وارد کنید؛ هر سال در این مسیر فقط یک پوشه دارد.</small><p class="feature-form-error" data-report-error role="alert"></p><div class="modal-actions"><button type="button" class="ghost" data-report-close>انصراف</button><button type="submit" class="primary">ذخیره پوشه</button></div></form></dialog>
    <dialog class="modal" id="testReportFileDialog"><form id="testReportFileForm"><div class="modal-head"><div><h3>بارگذاری گزارش</h3><p data-report-file-path></p></div><button type="button" data-report-close aria-label="بستن">×</button></div><input name="id" type="hidden"><input name="year_id" type="hidden"><input name="mode" type="hidden"><div class="form-grid"><label class="span-2">عنوان گزارش<input name="title" maxlength="220" required></label><label class="span-2">توضیحات<textarea name="description" rows="3" maxlength="4000"></textarea></label><label class="span-2" data-report-file-field>فایل گزارش<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.xls,.xlsx,.docx"><small>حداکثر ۲۵ مگابایت؛ در ادامه بارگذاری، همان فایل قبلی را انتخاب کنید.</small></label></div><p class="feature-form-error" data-report-error role="alert"></p><p data-report-progress role="status" aria-live="polite"></p><div class="modal-actions"><button type="button" class="ghost" data-report-close>انصراف</button><button type="submit" class="primary">ذخیره گزارش</button></div></form></dialog>
    <dialog class="modal feature-preview-modal" id="testReportPreview"><div class="modal-head"><h3>نمایش گزارش</h3><button type="button" data-report-close aria-label="بستن">×</button></div><div class="test-report-preview-body"></div></dialog>`;
    q('#testReportPreview').addEventListener('close', clearPreview);
    for (const dialog of root().querySelectorAll('dialog')) dialog.addEventListener('cancel', event => { if (dialogBusy && dialog.id !== 'testReportPreview') event.preventDefault(); });
  }
  function commands() {
    const hasParent = !!model.domain;
    q('#testReportsCommands').innerHTML = `<button type="button" class="ghost" data-report-action="home">بازگشت به خانه</button>${hasParent ? '<button type="button" class="ghost" data-report-action="back">بازگشت</button>' : ''}${model.type && !model.year && can('create') ? `<button type="button" class="primary" data-report-action="new-year" ${model.loaded ? '' : 'disabled'}>پوشه سال جدید</button>` : ''}${model.year && can('create') ? `<button type="button" class="primary" data-report-action="upload" ${model.loaded ? '' : 'disabled'}>بارگذاری گزارش</button>` : ''}<button type="button" class="ghost" data-report-action="refresh" ${model.loading ? 'disabled' : ''}>تازه‌سازی</button>${can('export') ? `<button type="button" class="ghost" data-report-action="export" ${model.year || model.query ? '' : 'hidden'}>خروجی اکسل</button>` : ''}<input id="testReportsSearch" type="search" value="${esc(model.query)}" placeholder="جست‌وجوی فایل در این مسیر…" aria-label="جست‌وجوی فایل در مسیر فعلی">`;
  }
  function breadcrumbs() {
    const links = [{ label: 'گزارش آزمایش‌ها', level: 'root' }];
    if (model.domain) links.push({ label: DOMAINS.find(item => item.key === model.domain).title, level: 'domain' });
    if (model.type) links.push({ label: TYPES.find(item => item.key === model.type).title, level: 'type' });
    if (model.year) links.push({ label: `سال ${fa(yearById(model.year)?.jalali_year || '')}`, level: 'year' });
    q('#testReportsBreadcrumbs').innerHTML = links.map((link, index) => `${index ? '<span aria-hidden="true">‹</span>' : ''}${index === links.length - 1 ? `<span aria-current="page">${esc(link.label)}</span>` : `<button type="button" class="ghost" data-report-ancestor="${link.level}">${esc(link.label)}</button>`}`).join('');
  }
  function card({ id, title, icon = '▱', kind, rows = [], actions = '' }) {
    const ids = new Set(rows.map(row => String(row.id))), count = model.files.filter(file => ids.has(String(file.year_id))).length;
    return `<article class="test-report-card"><button type="button" class="test-report-card-open" data-report-${kind}="${esc(id)}"><span class="test-report-card-icon" aria-hidden="true">${icon}</span><span><strong>${esc(title)}</strong><small>${fa(count)} فایل${kind !== 'year' ? ` · ${fa(rows.length)} پوشه سال` : ''}</small><small>آخرین به‌روزرسانی: <time datetime="${esc(newest(rows) || '')}">${esc(updatedDate(newest(rows)))}</time></small></span><span class="test-report-card-arrow" aria-hidden="true">‹</span></button>${actions ? `<div class="test-report-card-actions">${actions}</div>` : ''}</article>`;
  }
  function fileTable(files) {
    const showPath = !model.year;
    return `<section class="panel test-reports-files"><div class="panel-head"><h4>${model.query ? 'نتیجه جست‌وجوی فایل‌ها در این مسیر' : 'فایل‌های گزارش'}</h4><span>${fa(files.length)} فایل</span></div><div class="table-wrap"><table id="testReportsTable" class="workspace-table" data-table-key="test-reports-files"><thead><tr><th>عنوان گزارش</th><th>نام فایل</th>${showPath ? '<th>مسیر پوشه</th>' : ''}<th>حجم</th><th>آخرین به‌روزرسانی شمسی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${files.map(file => `<tr data-id="${esc(file.id)}"><td><b>${esc(file.title)}</b>${file.description ? `<small class="test-report-description">${esc(file.description)}</small>` : ''}</td><td>${esc(file.original_file_name)}</td>${showPath ? `<td><button type="button" class="ghost" data-report-go-file="${esc(file.id)}">${esc(pathLabel(yearById(file.year_id)))}</button></td>` : ''}<td>${bytes(file.file_size)}</td><td><time datetime="${esc(file.updated_at)}">${esc(updatedDate(file.updated_at))}</time></td><td>${esc(statusText(file))}</td><td><div class="feature-row-actions">${file.status === 'ready' ? `<button type="button" class="ghost" data-report-preview="${esc(file.id)}">نمایش</button><button type="button" class="ghost" data-report-download="${esc(file.id)}">دانلود</button>${can('edit') ? `<button type="button" class="ghost" data-report-edit-file="${esc(file.id)}">ویرایش</button>` : ''}` : file.status === 'pending' && can('create') && file.created_by === appState().user?.id ? `<button type="button" class="ghost" data-report-retry-file="${esc(file.id)}">ادامه بارگذاری</button>` : ''}${can('delete') ? `<button type="button" class="danger" data-report-delete-file="${esc(file.id)}">${file.status === 'deleting' ? 'تلاش دوباره حذف' : 'حذف'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function content() {
    const host = q('#testReportsBody'); if (!host) return;
    if (!can('view')) { host.innerHTML = '<div class="feature-empty">دسترسی مشاهده گزارش‌ها فعال نیست.</div>'; return; }
    const files = scopedFiles(model.files, model.years, model).filter(file => matchesFile(file, model.query));
    if (model.query || model.year) host.innerHTML = files.length ? fileTable(files) : `<div class="feature-empty">${model.loading && !model.loaded ? 'در حال دریافت فایل‌ها…' : model.query ? 'فایلی مطابق جست‌وجو در این مسیر پیدا نشد.' : 'هنوز گزارشی در این پوشه بارگذاری نشده است.'}</div>`;
    else if (!model.domain) host.innerHTML = `<div class="test-report-grid">${DOMAINS.map(domain => card({ id: domain.key, title: domain.title, icon: domain.icon, kind: 'domain', rows: model.years.filter(year => year.domain === domain.key) })).join('')}</div>`;
    else if (!model.type) host.innerHTML = `<div class="test-report-grid">${TYPES.map(type => card({ id: type.key, title: type.title, kind: 'type', rows: model.years.filter(year => year.domain === model.domain && year.report_type === type.key) })).join('')}</div>`;
    else {
      const years = model.years.filter(year => year.domain === model.domain && year.report_type === model.type).sort((a, b) => b.jalali_year - a.jalali_year);
      host.innerHTML = years.length ? `<div class="test-report-grid">${years.map(year => card({ id: year.id, title: `سال ${fa(year.jalali_year)}`, kind: 'year', rows: [year], actions: `${can('edit') ? `<button type="button" class="ghost" data-report-edit-year="${esc(year.id)}">ویرایش سال</button>` : ''}${can('delete') ? `<button type="button" class="danger" data-report-delete-year="${esc(year.id)}">حذف پوشه</button>` : ''}` })).join('')}</div>` : `<div class="feature-empty">${model.loading && !model.loaded ? 'در حال دریافت پوشه‌ها…' : 'هنوز پوشه سالی ایجاد نشده است. برای شروع «پوشه سال جدید» را بزنید.'}</div>`;
    }
    const table = q('#testReportsTable'); if (table) window.bamcoReferenceTable?.refresh?.(table, { filters: true });
  }
  function render() {
    shell(); if (!root()) return;
    if (model.year && !yearById(model.year) && model.loaded) model.year = '';
    commands(); breadcrumbs();
    q('#testReportsStatus').innerHTML = model.error ? `<div class="test-reports-error" role="alert">${esc(model.error)} <button type="button" class="ghost" data-report-action="refresh">تلاش دوباره</button></div>` : model.loading ? '<span class="workspace-loading">در حال دریافت گزارش‌ها…</span>' : '';
    q('#testReportsBody').setAttribute('aria-busy', String(model.loading)); content();
  }
  function move(level, value = '') {
    closeDialogs();
    if (level === 'root') Object.assign(model, { domain: '', type: '', year: '' });
    else if (level === 'domain') Object.assign(model, { domain: value || model.domain, type: '', year: '' });
    else if (level === 'type') Object.assign(model, { type: value || model.type, year: '' });
    else if (level === 'year' && yearById(value)) { const year = yearById(value); Object.assign(model, { domain: year.domain, type: year.report_type, year: String(year.id) }); }
    model.query = ''; render();
  }
  async function load() {
    if (!root() || !appState().token) return;
    if (!can()) { reset(); render(); return; }
    if (model.identity !== identity()) reset();
    model.identity = identity(); const started = session(), version = ++loadVersion;
    model.loading = true; model.error = ''; render();
    try {
      const [years, files] = await Promise.all([selectAll('test_report_years', 'select=*&order=jalali_year.desc'), selectAll('test_report_files', 'select=*&order=updated_at.desc')]);
      if (version !== loadVersion || !current(started)) return;
      Object.assign(model, { years, files, loaded: true });
    } catch (error) {
      if (version !== loadVersion || !current(started)) return;
      model.error = /test_report_|schema cache|404|does not exist/i.test(error.message) ? 'بخش گزارش آزمایش‌ها هنوز در سرور آماده نیست. مدیر سامانه باید تغییرات پایگاه داده و سرویس گزارش‌ها را نصب کند.' : error.message || 'دریافت گزارش‌ها انجام نشد.';
    } finally { if (version === loadVersion && current(started)) { model.loading = false; render(); } }
  }
  function clearPreview() { previewVersion++; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; q('#testReportPreview .test-report-preview-body')?.replaceChildren(); }
  function closeDialogs() { for (const dialog of root()?.querySelectorAll('dialog') || []) { if (dialog.open) dialog.close(); } clearPreview(); }
  function reset() { loadVersion++; closeDialogs(); Object.assign(model, { years: [], files: [], domain: '', type: '', year: '', query: '', loading: false, loaded: false, error: '', identity: '' }); }
  function openYear(id = '') {
    if (!requireAccess(id ? 'edit' : 'create') || !model.type) return;
    const year = id ? yearById(id) : null, form = q('#testReportYearForm'); form.reset();
    form.elements.id.value = year?.id || crypto.randomUUID(); form.dataset.editing = year ? 'true' : 'false';
    form.elements.domain.value = year?.domain || model.domain; form.elements.report_type.value = year?.report_type || model.type;
    form.elements.jalali_year.value = fa(year?.jalali_year || currentJalaliYear()); q('[data-report-error]', form).textContent = '';
    q('#testReportYearDialog h3').textContent = year ? 'ویرایش سال پوشه' : 'پوشه سال جدید'; q('#testReportYearDialog').showModal(); form.elements.jalali_year.focus();
  }
  function openFile(id = '', retry = false) {
    if (!requireAccess(id && !retry ? 'edit' : 'create')) return;
    const file = id ? fileById(id) : null, year = yearById(file?.year_id || model.year); if (!year || (id && !file)) return;
    const form = q('#testReportFileForm'); form.reset(); form.elements.id.value = file?.id || crypto.randomUUID(); form.elements.year_id.value = year.id; form.elements.mode.value = file && !retry ? 'update' : 'upload';
    form.elements.title.value = file?.title || ''; form.elements.description.value = file?.description || ''; form.elements.title.readOnly = retry; form.elements.description.readOnly = retry;
    q('[data-report-file-field]', form).hidden = !!file && !retry; form.elements.file.required = !file || retry;
    q('[data-report-error]', form).textContent = ''; q('[data-report-progress]', form).textContent = ''; q('[data-report-file-path]', form).textContent = pathLabel(year);
    q('h3', form).textContent = retry ? 'ادامه بارگذاری ناتمام' : file ? 'ویرایش گزارش' : 'بارگذاری گزارش'; q('#testReportFileDialog').showModal();
  }
  async function edge(form) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 120000);
    try { const response = await fetch(`${SB_URL}/functions/v1/test-report-library`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${appState().token}` }, body: form, signal: controller.signal, cache: 'no-store' }); const result = await response.json(); if (!response.ok || result.ok !== true) { if (result.code === 'folder_not_empty' && Number(result.count) > 0) throw Error(`این پوشه ${fa(result.count)} فایل دارد. ابتدا فایل‌ها را جداگانه حذف کنید.`); if (result.code === 'operation_busy' && Number(result.retry_after) > 0) throw Error(`عملیات قبلی در حال بررسی است؛ ${fa(result.retry_after)} ثانیه دیگر همان عملیات را دوباره امتحان کنید.`); throw Error(result.error || 'ذخیره تغییرات تأیید نشد.'); } return result; }
    catch (error) { if (error.name === 'AbortError' || error.name === 'TypeError' || error.name === 'SyntaxError') throw Error('پاسخ سرور دریافت نشد؛ نتیجه ممکن است ثبت شده باشد. تازه‌سازی کنید یا همان عملیات را دوباره ادامه دهید.'); throw error; }
    finally { clearTimeout(timeout); }
  }
  const requestForm = (action, fields = {}) => { const form = new FormData(); form.set('action', action); for (const [key, value] of Object.entries(fields)) form.set(key, value ?? ''); return form; };
  async function submit(event) {
    event.preventDefault(); const form = event.target; if (dialogBusy || !['testReportYearForm', 'testReportFileForm'].includes(form.id)) return;
    const started = session(); let body;
    try {
      if (form.id === 'testReportYearForm') {
        const editing = form.dataset.editing === 'true', year = normalizeYear(form.elements.jalali_year.value);
        if (!requireAccess(editing ? 'edit' : 'create')) return;
        if (!year) throw Error('سال شمسی معتبر و چهاررقمی بین ۱۲۰۰ تا ۱۶۰۰ وارد کنید.');
        if (model.years.some(row => row.domain === form.elements.domain.value && row.report_type === form.elements.report_type.value && row.jalali_year === year && String(row.id) !== form.elements.id.value)) throw Error('پوشه این سال در همین حوزه و نوع گزارش وجود دارد.');
        body = requestForm(editing ? 'update_year' : 'create_year', { [editing ? 'year_id' : 'id']: form.elements.id.value, domain: form.elements.domain.value, report_type: form.elements.report_type.value, jalali_year: year });
      } else {
        const mode = form.elements.mode.value; if (!requireAccess(mode === 'update' ? 'edit' : 'create')) return;
        const title = form.elements.title.value.trim(); if (!title) throw Error('عنوان گزارش را وارد کنید.');
        body = requestForm(mode, { [mode === 'update' ? 'file_id' : 'id']: form.elements.id.value, year_id: form.elements.year_id.value, title, description: form.elements.description.value.trim() });
        if (mode === 'upload') { const file = form.elements.file.files[0]; validateFile(file); body.set('file', file); }
      }
      dialogBusy = true; form.querySelectorAll('button').forEach(button => button.disabled = true); q('[data-report-error]', form).textContent = '';
      const progress = q('[data-report-progress]', form); if (progress) progress.textContent = 'در حال ذخیره؛ لطفاً تا دریافت نتیجه صبر کنید…';
      await edge(body); if (!current(started)) return;
      form.closest('dialog').close(); await load(); notice(form.id === 'testReportYearForm' ? 'پوشه سال ذخیره شد.' : 'گزارش ذخیره شد.');
    } catch (error) { if (current(started)) q('[data-report-error]', form).textContent = error.message; }
    finally { dialogBusy = false; form.querySelectorAll('button').forEach(button => button.disabled = false); const progress = q('[data-report-progress]', form); if (progress) progress.textContent = ''; }
  }
  const deleting = new Set();
  async function remove(kind, id) {
    if (!requireAccess('delete') || deleting.has(id)) return;
    const item = kind === 'year' ? yearById(id) : fileById(id); if (!item) return;
    if (kind === 'year') { const count = model.files.filter(file => String(file.year_id) === String(id)).length; if (count) { notice(`این پوشه ${fa(count)} فایل دارد. ابتدا فایل‌ها را جداگانه حذف کنید؛ پوشه خالی قابل حذف است.`, true); return; } }
    const message = kind === 'year' ? `پوشه خالی سال ${fa(item.jalali_year)} حذف شود؟` : `گزارش «${item.title}» و فایل آن حذف شوند؟`;
    const confirmed = window.bamcoConfirm ? await window.bamcoConfirm(message) : window.confirm(message); if (!confirmed || !requireAccess('delete')) return;
    const started = session(); deleting.add(id);
    try { await edge(requestForm(kind === 'year' ? 'delete_year' : 'delete', { [kind === 'year' ? 'year_id' : 'file_id']: id })); if (current(started)) { await load(); notice('حذف انجام شد.'); } }
    catch (error) { if (current(started)) { notice(error.message, true); await load(); } }
    finally { deleting.delete(id); }
  }
  async function readFile(id, preview) {
    const file = fileById(id); if (!file || file.status !== 'ready' || !requireAccess('view')) return;
    const started = session(), requestVersion = preview ? ++previewVersion : null, path = file.storage_path.split('/').map(encodeURIComponent).join('/');
    try {
      const response = await fetch(`${SB_URL}/storage/v1/object/authenticated/test-reports-private/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${appState().token}` }, cache: 'no-store' });
      if (!response.ok) throw Error(response.status === 404 ? 'فایل در فضای ذخیره‌سازی پیدا نشد.' : 'دریافت فایل انجام نشد.');
      const blob = await response.blob(); if (!current(started) || !model.active || (preview && requestVersion !== previewVersion)) return;
      if (!preview) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = file.original_file_name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); return; }
      if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; const dialog = q('#testReportPreview'), host = q('.test-report-preview-body', dialog); host.replaceChildren(); q('h3', dialog).textContent = file.title;
      if (file.mime_type.startsWith('image/')) { previewUrl = URL.createObjectURL(blob); const image = document.createElement('img'); image.src = previewUrl; image.alt = file.title; host.append(image); }
      else if (file.mime_type === 'application/pdf') { previewUrl = URL.createObjectURL(blob); const iframe = document.createElement('iframe'); iframe.src = previewUrl; iframe.title = file.title; host.append(iframe); }
      else if (file.mime_type === 'text/plain' || file.mime_type === 'text/csv') { const pre = document.createElement('pre'); pre.textContent = await blob.text(); if (!current(started) || !model.active || requestVersion !== previewVersion) return; host.append(pre); }
      else { host.innerHTML = `<div class="feature-empty">پیش‌نمایش این فرمت در مرورگر موجود نیست. فایل را دانلود کنید.</div><button type="button" class="primary" data-report-download="${esc(id)}">دانلود فایل</button>`; }
      if (!dialog.open) dialog.showModal();
    } catch (error) { if (current(started)) notice(error.message, true); }
  }
  function bind() {
    if (binding || !root()) return; binding = []; const listen = (type, handler) => { root().addEventListener(type, handler); binding.push([type, handler]); };
    listen('submit', event => void submit(event));
    listen('input', event => { if (event.target.id === 'testReportsSearch') { model.query = event.target.value; const exportButton = q('[data-report-action=export]', root()); if (exportButton) exportButton.hidden = !model.year && !model.query; content(); } });
    listen('change', event => { if (event.target.matches('#testReportFileForm [name=file]')) { const form = event.target.form; if (!form.elements.title.value) form.elements.title.value = event.target.files[0]?.name.replace(/\.[^.]+$/, '') || ''; } });
    listen('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.matches('[data-report-close]')) { if (!dialogBusy) button.closest('dialog').close(); return; }
      const action = button.dataset.reportAction;
      if (action === 'home') { dispose(); window.bamcoShowHome?.(); return; }
      if (action === 'back') return move(model.year ? 'type' : model.type ? 'domain' : 'root');
      if (action === 'refresh') return void load();
      if (action === 'new-year') return openYear();
      if (action === 'upload') return openFile();
      if (action === 'export' && requireAccess('export')) { const table = q('#testReportsTable'); if (table) void window.bamcoExportTable?.(table); return; }
      if (button.dataset.reportAncestor) return move(button.dataset.reportAncestor);
      if (button.dataset.reportDomain) return move('domain', button.dataset.reportDomain);
      if (button.dataset.reportType) return move('type', button.dataset.reportType);
      if (button.dataset.reportYear) return move('year', button.dataset.reportYear);
      if (button.dataset.reportEditYear) return openYear(button.dataset.reportEditYear);
      if (button.dataset.reportDeleteYear) return void remove('year', button.dataset.reportDeleteYear);
      if (button.dataset.reportEditFile) return openFile(button.dataset.reportEditFile);
      if (button.dataset.reportRetryFile) return openFile(button.dataset.reportRetryFile, true);
      if (button.dataset.reportDeleteFile) return void remove('file', button.dataset.reportDeleteFile);
      if (button.dataset.reportDownload) return void readFile(button.dataset.reportDownload, false);
      if (button.dataset.reportPreview) return void readFile(button.dataset.reportPreview, true);
      if (button.dataset.reportGoFile) return move('year', fileById(button.dataset.reportGoFile)?.year_id);
    });
  }
  function dispose() { model.active = false; loadVersion++; model.loading = false; for (const [type, handler] of binding || []) root()?.removeEventListener(type, handler); binding = null; closeDialogs(); }
  function activate() { if (model.identity !== identity()) reset(); model.active = true; shell(); bind(); return load(); }
  function boot() {
    if (!root()) return; shell(); render();
    window.BamcoNavigation?.registerView?.('testReports', { activate, dispose });
    window.addEventListener('bamco:feature-access-changed', () => { if (!can('view')) { reset(); if (root()) render(); } else if (model.active) void load(); });
    const app = q('#appView'); if (app) new MutationObserver(() => { if (app.classList.contains('hidden')) { dispose(); reset(); render(); } }).observe(app, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('bamco-table-suite-ready', () => { const table = q('#testReportsTable'); if (table) window.bamcoReferenceTable?.refresh?.(table, { filters: true }); });
  }
  window.bamcoTestReports = { model, load, activate, dispose, reset };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();

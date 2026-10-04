/* Financial domain: exact amounts, staged payments and invoice-scoped private files. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, esc, fa, date, rpc, removeRows, setBusy, notify, statusText } = E;
  const BUCKET = 'invoices-private', MAX_FILE_BYTES = 6 * 1024 * 1024;
  const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
  const model = { invoices: [], payments: [], files: [], selected: null, search: '', invoiceEditor: null, paymentEditor: null, paymentFormOpen: false, fileEditor: null };
  let loadVersion = 0, activeMutation = false, modelIdentity = '', pendingFileDelete = null;
  const sessionIdentity = () => state.token && state.user?.id ? `${state.user.id}:${window.bamcoAuth?.snapshot?.()?.generation ?? 0}` : '';
  function clear() {
    ++loadVersion; modelIdentity = sessionIdentity();
    Object.assign(model, { invoices: [], payments: [], files: [], selected: null, search: '', invoiceEditor: null, paymentEditor: null, paymentFormOpen: false, fileEditor: null });
    root()?.replaceChildren();
  }
  function resetChangedIdentity() { if (modelIdentity !== sessionIdentity()) clear(); }
  const root = () => q('#invoiceFeatureRoot');
  const scrollInvoiceStart = () => root()?.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: 'auto' });
  const M = () => window.BamcoMoney;
  const compactAmount = value => M().format(value, { hideZeroFraction: true });
  const money = (value, currency) => E.money(compactAmount(value ?? '0'), currency);
  const invoice = id => model.invoices.find(item => String(item.id) === String(id));
  const payments = id => model.payments.filter(item => String(item.invoice_id) === String(id));
  const payment = id => model.payments.find(item => String(item.id) === String(id));
  const files = (id, kind, paymentId = null) => model.files.filter(item => String(item.invoice_id) === String(id) && item.file_type === kind && (paymentId == null ? item.payment_id == null : String(item.payment_id) === String(paymentId)));
  const paid = id => M().sum(payments(id).filter(item => item.status === 'paid').map(item => item.amount));
  const balance = item => M().compare(item.total_amount, paid(item.id)) > 0 ? M().subtract(item.total_amount, paid(item.id)) : '0';
  const percent = item => M().compare(item.total_amount, '0') > 0 ? Math.min(100, Number(M().percent(paid(item.id), item.total_amount, { scale: 3 }))) : 0;
  const settled = item => !['cancelled', 'returned'].includes(item.status) && M().compare(item.total_amount, '0') > 0 && M().compare(paid(item.id), item.total_amount) >= 0 && payments(item.id).length > 0 && payments(item.id).every(row => row.status === 'paid');
  const canFeature = action => window.BamcoAccess?.can?.('invoices', action) === true;
  const manager = () => window.BamcoAccess?.isSystemManager?.() === true;
  const owns = item => !!item && !!state.user?.id && (String(item.created_by) === String(state.user?.id) || String(item.follow_up_owner_id) === String(state.user?.id) || manager());
  const canEdit = item => canFeature('edit') && owns(item);
  const canDelete = item => canFeature('delete') && !!item && (String(item.created_by) === String(state.user?.id) || manager());
  // Existing payment and file policies authorize scoped invoice viewers. Keep
  // that boundary rather than widening access or silently changing role rules.
  const canFiles = item => canFeature('view') && owns(item);
  // Payment writes and receipt finalization also run the existing parent
  // FOR UPDATE validation, so their effective scope requires invoice editing.
  const canPayments = item => canFiles(item) && canEdit(item);
  const paymentAccessHint = 'برای ثبت یا ویرایش مرحله و بارگذاری رسید، مجوز ویرایش صورتحساب لازم است.';
  const paymentAccessAttributes = item => canPayments(item) ? '' : `disabled title="${paymentAccessHint}" aria-describedby="invoicePaymentAccessHint"`;
  const canDeleteFile = (item, file) => canFiles(item) && (file.file_type !== 'receipt' || payment(file.payment_id)?.receipt_path !== file.storage_path || canPayments(item));
  const isLate = row => row.status === 'paid' && !!row.planned_date && !!row.paid_date && String(row.paid_date) > String(row.planned_date);
  const dateField = (name, label, value = '') => `<label>${label}<span class="enterprise-date-field"><input name="${name}_jalali" class="jalali-input" readonly value="${esc(value ? date(value) : '')}" placeholder="۱۴۰۵/۰۱/۰۱"><button type="button" class="ghost bamco-icon-button" data-invoice-date="${name}" aria-label="${label}">▦</button><input name="${name}" type="hidden" value="${esc(value || '')}"></span></label>`;
  const formValue = (value, fallback = '') => esc(value ?? fallback);
  const currencyOptions = item => {
    const options = [['IRR','ریال'],['IRT','تومان'],['USD','دلار آمریکا'],['EUR','یورو']];
    if (item?.currency && !options.some(([key]) => key === item.currency)) options.push([item.currency, item.currency]);
    return options.map(([key,label]) => `<option value="${esc(key)}" ${(item?.currency || 'IRR') === key ? 'selected' : ''}>${esc(label)}</option>`).join('');
  };
  const currencyText = item => ({ IRR: 'ریال', IRT: 'تومان', USD: 'دلار آمریکا', EUR: 'یورو' })[item.currency] || item.currency;
  const moneyInput = (name, value, minimum) => `<input name="${name}" type="text" inputmode="decimal" data-money-input data-money-digits="fa" data-money-scale="2" data-money-integer-digits="16" data-money-min="${minimum}" value="${formValue(compactAmount(value))}" required>`;
  const filePicker = (name, label, required = false) => `<div class="span-2 invoice-file-picker">${window.BamcoFilePicker.render({ name, label, accept: '.pdf,.png,.jpg,.jpeg,.webp', maxSizeText: 'PDF یا تصویر · حداکثر ۶ مگابایت', required, wrapperAttribute: 'data-invoice-file-picker' })}</div>`;
  const managedFile = file => file?.bucket_id === BUCKET && !!file.client_request_id;
  const fileIcon = kind => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${kind === 'download' ? '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>' : '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>'}</svg>`;
  const fileAction = (file, action, disabled = false) => {
    const restriction = disabled && action === 'delete' ? '؛ حذف رسید فعال به مجوز ویرایش صورتحساب نیاز دارد' : disabled && file.upload_state === 'pending' ? '؛ بارگذاری هنوز کامل نشده است' : '';
    const label = `${action === 'download' ? 'دریافت' : 'حذف'} فایل ${file.file_name}${restriction}`;
    return `<button type="button" class="ghost bamco-icon-button invoice-file-action${action === 'delete' ? ' invoice-file-delete' : ''}" data-invoice-file-${action}="${esc(file.id)}" title="${esc(label)}" aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}>${fileIcon(action)}</button>`;
  };
  const formStatus = () => '<p class="invoice-save-status" data-invoice-save-status role="status" aria-live="polite" hidden></p>';
  function deny() { notify('مجوز انجام این عملیات را ندارید.', true); }

  function render() {
    resetChangedIdentity();
    const host = root(); if (!host) return;
    const visible = model.invoices.filter(item => !model.search || [item.invoice_number, item.title, item.account_party, item.company_name, item.status].some(value => String(value || '').toLowerCase().includes(model.search.toLowerCase())));
    const current = invoice(model.selected);
    const search = `<input id="invoiceSearch" class="invoice-search" type="search" value="${esc(model.search)}" placeholder="شماره، عنوان یا شرکت/پیمانکار…" aria-label="جست‌وجوی صورتحساب">`;
    const commandBar = current
      ? `<div class="invoice-top-command-row bamco-command-bar"><span data-feature-access-suppressed="true" data-home-return-suppressed="true" hidden></span><button type="button" class="ghost" data-invoice-action="back">بازگشت به کارت‌ها</button>${canFiles(current) ? `<button type="button" class="primary" data-invoice-action="payment" ${paymentAccessAttributes(current)}>ثبت مرحله پرداخت</button>` : ''}${canEdit(current) ? '<button type="button" class="ghost" data-invoice-action="edit">ویرایش</button>' : ''}${canDelete(current) ? '<button type="button" class="danger" data-invoice-action="delete">حذف</button>' : ''}</div>`
      : `<div class="invoice-top-command-row bamco-command-bar"><button type="button" class="ghost" data-home-action>بازگشت به خانه</button>${canFeature('create') ? '<button type="button" class="primary" data-invoice-action="new">صورتحساب جدید</button>' : ''}<button type="button" class="ghost" data-invoice-action="refresh">تازه‌سازی</button>${search}</div>`;
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>صورتحساب‌ها و تعهدات مالی</h3></div></div>${commandBar}<div class="enterprise-grid invoice-grid ${current ? 'detail-open' : ''}"><section class="panel"><div class="panel-head"><h3>کارت‌های صورتحساب</h3><span class="enterprise-count">${fa(visible.length)} مورد</span></div><div class="enterprise-card-list">${visible.length ? visible.map(item => `<button type="button" class="enterprise-list-card invoice-list-card ${String(model.selected) === String(item.id) ? 'active' : ''}" data-invoice-select="${esc(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.invoice_number)} · ${esc(item.company_name || item.account_party)}</small></span><span><b>${money(paid(item.id), currencyText(item))}</b><small>مانده: ${money(balance(item), currencyText(item))}</small><small>${fa(Math.round(percent(item)))}٪ پرداخت · ${esc(statusText(item.status))}</small></span></button>`).join('') : '<div class="empty">صورتحسابی ثبت نشده است.</div>'}</div></section><section class="panel invoice-detail">${current ? detailMarkup(current) : '<div class="enterprise-empty"><b>صورتحسابی انتخاب نشده است.</b><span>برای شروع یک تعهد مالی ثبت کنید.</span></div>'}</section></div>${invoiceDialogMarkup()}${current ? paymentDialogMarkup(current) : ''}${current ? fileDialogMarkup(current) : ''}`;
    M()?.bind(host); window.BamcoFilePicker.bind(host); bind();
  }
  function invoiceDialogMarkup() {
    const editing = invoice(model.invoiceEditor);
    return `<dialog id="invoiceDialog" class="modal enterprise-modal"><form id="invoiceForm" method="dialog"><input type="hidden" name="invoice_id" value="${formValue(editing?.id)}"><div class="modal-head"><div><h3>${editing ? 'ویرایش صورتحساب' : 'ثبت صورتحساب'}</h3></div><button type="button" data-invoice-close aria-label="بستن">×</button></div><div class="form-grid"><label>شماره صورتحساب<input name="invoice_number" dir="rtl" value="${formValue(editing?.invoice_number)}" required></label><label>عنوان<input name="title" value="${formValue(editing?.title)}" required></label><label>شرکت/پیمانکار<input name="company_name" value="${formValue(editing?.company_name || editing?.account_party)}" required></label><label>ارز<select name="currency">${currencyOptions(editing)}</select></label><label>مبلغ کل${moneyInput('total_amount', editing?.total_amount, '0')}</label>${dateField('due_date', 'تاریخ سررسید', editing?.due_date)}<label class="span-2">توضیحات<textarea name="description" rows="3">${formValue(editing?.description)}</textarea></label>${!editing ? filePicker('proforma_file', 'پیش‌فاکتور (اختیاری)') : ''}</div>${formStatus()}<div class="modal-actions"><button type="button" class="ghost" data-invoice-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات' : 'ثبت صورتحساب'}</button></div></form></dialog>`;
  }
  function fileRowsMarkup(item, kind, paymentId = null) {
    const rows = files(item.id, kind, paymentId);
    return rows.length ? `<ul class="invoice-file-list">${rows.map(file => {
      const managed = managedFile(file), permitted = canFiles(item);
      const warning = !managed ? '<span class="invoice-file-warning">فایل قدیمی؛ محل ذخیرهٔ آن هنوز تأیید نشده است.</span>' : file.upload_state === 'pending' ? `<span class="invoice-file-warning">بارگذاری ناتمام</span>${String(file.uploaded_by) === String(state.user?.id) && permitted ? `<button type="button" class="ghost" data-invoice-file-resume="${esc(file.id)}">ادامه بارگذاری</button>` : ''}` : '';
      return `<li data-invoice-file-row="${esc(file.id)}"><span><b>${esc(file.file_name)}</b>${kind === 'final' && file.final_is_current === false ? '<small class="invoice-file-warning">وضعیت مالی پس از بارگذاری تغییر کرده؛ این فایل سابقه است.</small>' : ''}</span>${warning}${managed ? `<div class="invoice-file-actions">${fileAction(file, 'download', file.upload_state !== 'ready' || !permitted)}${permitted ? fileAction(file, 'delete', !canDeleteFile(item, file)) : ''}</div>` : ''}</li>`;
    }).join('')}</ul>` : '<small class="invoice-file-empty">فایلی ثبت نشده است.</small>';
  }
  function detailMarkup(item) {
    const rows = payments(item.id);
    return `<div class="project-detail-head"><div><span class="enterprise-eyebrow">${esc(item.invoice_number)}</span><h3>${esc(item.title)}</h3><p>${esc(item.company_name || item.account_party)}</p></div><span class="status-badge">${esc(statusText(item.status))}</span></div><div class="invoice-total"><div><b>${money(item.total_amount, currencyText(item))}</b><span>مبلغ کل</span></div><div><b>${money(paid(item.id), currencyText(item))}</b><span>پرداخت‌شده</span></div><div><b>${money(balance(item), currencyText(item))}</b><span>باقی‌مانده</span></div><div><b>${fa(Math.round(percent(item)))}٪</b><span>درصد پرداخت</span></div></div>${E.progress(percent(item))}<div class="invoice-meta"><span>سررسید: ${date(item.due_date)}</span></div><section class="invoice-attachments"><div class="panel-head"><h4>پیش‌فاکتور</h4>${canFiles(item) ? '<button type="button" class="ghost" data-invoice-file-kind="proforma">بارگذاری پیش‌فاکتور</button>' : ''}</div>${fileRowsMarkup(item, 'proforma')}</section><section class="invoice-payments"><div class="panel-head"><h4>پرداخت‌های مرحله‌ای</h4><small>${fa(rows.length)} مرحله</small></div>${canFiles(item) && !canPayments(item) ? `<p id="invoicePaymentAccessHint" class="invoice-file-hint">${paymentAccessHint}</p>` : ''}${rows.length ? rows.map(row => `<article class="payment-row"><div class="payment-stage-title"><b>مرحله ${fa(row.sequence_no)}</b><small>${esc(statusText(row.status))}${isLate(row) ? '<i class="payment-late-icon" role="img" aria-label="پرداخت با دیرکرد" title="پرداخت با دیرکرد">⌛</i>' : ''}</small></div><div class="payment-stage-value"><b>${money(row.amount, currencyText(item))}</b><small>${row.percent_of_total != null ? `${fa(Math.round(Number(row.percent_of_total)))}٪ از کل` : '—'}</small></div><div class="payment-stage-dates"><span>برنامه‌ای: ${date(row.planned_date)}</span><span>واقعی: ${date(row.paid_date)}</span></div>${canFiles(item) ? `<button type="button" class="ghost" data-invoice-payment-edit="${esc(row.id)}" ${paymentAccessAttributes(item)}>ویرایش مرحله</button>` : ''}<div class="payment-stage-receipts"><div class="panel-head"><h5>رسید مرحله ${fa(row.sequence_no)}</h5>${canFiles(item) ? `<button type="button" class="ghost" data-invoice-file-kind="receipt" data-payment-id="${esc(row.id)}" ${paymentAccessAttributes(item)}>بارگذاری رسید</button>` : ''}</div>${fileRowsMarkup(item, 'receipt', row.id)}</div></article>`).join('') : '<div class="empty">مرحله پرداختی ثبت نشده است.</div>'}</section><section class="invoice-attachments"><div class="panel-head"><h4>فاکتور نهایی</h4>${canFiles(item) && settled(item) ? '<button type="button" class="primary" data-invoice-file-kind="final">بارگذاری فاکتور نهایی</button>' : ''}</div>${!settled(item) ? '<p class="invoice-file-hint">پس از تکمیل همه مراحل پرداخت و تسویه مبلغ صورتحساب، فاکتور نهایی قابل بارگذاری است.</p>' : ''}${fileRowsMarkup(item, 'final')}</section>`;
  }
  function paymentDialogMarkup(item) {
    if (!model.paymentFormOpen) return '';
    const rows = payments(item.id), editing = payment(model.paymentEditor);
    const nextSequence = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no || 0)), 0) + 1;
    return `<dialog id="invoicePaymentDialog" class="modal enterprise-modal invoice-payment-dialog"><form id="invoicePaymentForm" method="dialog"><div class="modal-head"><div><h3>${editing ? 'ویرایش مرحله پرداخت' : 'ثبت مرحله پرداخت'}</h3><p>${esc(item.title)} · ${esc(item.invoice_number)}</p></div><button type="button" data-invoice-payment-close aria-label="بستن">×</button></div><div class="form-grid invoice-payment-form"><input type="hidden" name="invoice_id" value="${esc(item.id)}"><input type="hidden" name="payment_id" value="${formValue(editing?.id)}"><label>شماره مرحله<input name="sequence_no" type="number" min="1" max="2147483647" step="1" value="${formValue(editing?.sequence_no, nextSequence)}" required></label><label>مبلغ${moneyInput('amount', editing?.amount, '0.01')}</label>${dateField('planned_date', 'تاریخ برنامه‌ای', editing?.planned_date)}<label>وضعیت<select name="status"><option value="planned" ${editing?.status !== 'paid' ? 'selected' : ''}>برنامه‌ریزی‌شده</option><option value="paid" ${editing?.status === 'paid' ? 'selected' : ''}>پرداخت‌شده</option></select></label>${dateField('paid_date', 'تاریخ واقعی', editing?.paid_date)}<label>شماره پیگیری<input name="tracking_no" value="${formValue(editing?.tracking_no)}"></label><label class="span-2 payment-notes">توضیحات مرحله<textarea name="notes" rows="3">${formValue(editing?.notes)}</textarea></label>${filePicker('receipt_file', 'رسید همین مرحله (اختیاری)')}</div>${formStatus()}<div class="modal-actions"><button type="button" class="ghost" data-invoice-payment-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات مرحله' : 'ثبت مرحله پرداخت'}</button></div></form></dialog>`;
  }
  function fileDialogMarkup(item) {
    const editor = model.fileEditor; if (!editor) return '';
    const labels = { proforma: 'پیش‌فاکتور', receipt: 'رسید پرداخت', final: 'فاکتور نهایی' };
    return `<dialog id="invoiceFileDialog" class="modal enterprise-modal"><form id="invoiceFileForm" method="dialog"><div class="modal-head"><div><h3>بارگذاری ${labels[editor.kind]}</h3><p>${esc(item.invoice_number)}${editor.paymentId ? ` · مرحله ${fa(payment(editor.paymentId)?.sequence_no)}` : ''}</p></div><button type="button" data-invoice-file-close aria-label="بستن">×</button></div>${editor.existing ? `<p class="invoice-file-hint">برای ادامه، همان فایل «${esc(editor.existing.file_name)}» را انتخاب کنید.</p>` : ''}${filePicker('file', labels[editor.kind], true)}${formStatus()}<div class="modal-actions"><button type="button" class="ghost" data-invoice-file-close>انصراف</button><button type="submit" class="primary">بارگذاری فایل</button></div></form></dialog>`;
  }
  function showPaymentDialog(id = null) { if (!canPayments(invoice(model.selected))) return deny(); ++loadVersion; model.paymentEditor = id; model.paymentFormOpen = true; render(); q('#invoicePaymentDialog', root())?.showModal(); }
  function showInvoiceDialog(id = null) { if (!(id ? canEdit(invoice(id)) : canFeature('create'))) return deny(); ++loadVersion; model.invoiceEditor = id; render(); q('#invoiceDialog', root())?.showModal(); }
  function showFileDialog(kind, paymentId = null, existing = null) {
    const current = invoice(model.selected);
    if (!canFiles(current)) return deny();
    if (kind === 'final' && !settled(current)) return notify('ابتدا همه مراحل پرداخت را تکمیل کنید.', true);
    if (kind === 'receipt' && (!canPayments(current) || String(payment(paymentId)?.invoice_id) !== String(current.id))) return deny();
    ++loadVersion; model.fileEditor = { kind, paymentId, existing }; render(); q('#invoiceFileDialog', root())?.showModal();
  }
  function saveStatus(form, message, error = false) { const node = q('[data-invoice-save-status]', form); if (node) { node.hidden = false; node.textContent = message; node.classList.toggle('error', error); } }
  function lockForm(form, busy, committed = false) {
    for (const control of form.elements) control.disabled = busy || (committed && !control.matches('button'));
    setBusy(q('[type=submit]', form), busy);
  }
  const freshId = () => window.crypto.randomUUID();
  function sameSession(userId) { if (sessionIdentity() !== userId || !state.token || !canFeature('view')) throw Error('حساب ورود تغییر کرده است؛ صفحه را دوباره باز کنید.'); }
  function assertRow(row, invoiceId) {
    if (!row || !/^\d+$/.test(String(row.id)) || (invoiceId != null && String(row.invoice_id) !== String(invoiceId))) throw Error('پاسخ معتبر ذخیره‌سازی دریافت نشد؛ دوباره تلاش کنید.');
    return row;
  }
  function remember(table, row) { const index = model[table].findIndex(value => String(value.id) === String(row.id)); if (index < 0) model[table].push(row); else model[table][index] = row; }
  function validateFile(file) {
    if (!file) return null;
    const type = MIME[file.name.split('.').pop().trim().toLowerCase()];
    if (!type || (file.type && file.type !== type)) throw Error('فقط PDF و تصویر PNG، JPEG یا WebP مجاز است.');
    if (!file.size || file.size > MAX_FILE_BYTES) throw Error('حجم فایل باید بیشتر از صفر و حداکثر ۶ مگابایت باشد.');
    return { file, type };
  }
  async function hashFile(file) {
    const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('خواندن فایل انجام نشد.')); reader.readAsArrayBuffer(file); });
    const hash = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  }
  async function fileRequest(path, init = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${state.token}`, ...init.headers }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) { let body; try { body = await response.json(); } catch {} throw Error(body?.message || body?.error || 'دریافت یا بارگذاری فایل انجام نشد؛ دوباره تلاش کنید.'); }
      return response;
    } finally { clearTimeout(timer); }
  }
  async function attachFile(context, invoiceId, paymentId, kind, userId, form) {
    if (!context) return;
    sameSession(userId);
    if (!context.sha256) context.sha256 = await hashFile(context.file);
    const reserved = assertRow(await rpc('reserve_invoice_file', { p_request_id: context.requestId, p_invoice_id: String(invoiceId), p_payment_id: paymentId == null ? null : String(paymentId), p_file_type: kind, p_file_name: context.file.name, p_content_type: context.type, p_size_bytes: context.file.size, p_sha256: context.sha256 }), invoiceId);
    if (String(reserved.payment_id ?? '') !== String(paymentId ?? '') || reserved.file_type !== kind) throw Error('ارتباط فایل با صورتحساب یا مرحله معتبر نیست.');
    context.reserved = reserved; remember('files', reserved);
    sameSession(userId); saveStatus(form, 'اطلاعات ثبت شده است؛ در حال بارگذاری و تأیید فایل…');
    const body = new FormData(); body.append('file_id', String(reserved.id));
    body.append('file', new Blob([context.file], { type: context.type }), context.file.name);
    // The server validates this caller's reservation and the actual file bytes,
    // then uses an enforced non-upsert upload. Browsers cannot write the bucket.
    const response = await fileRequest('/functions/v1/invoice-file-upload', { method: 'POST', body });
    sameSession(userId);
    const result = await response.json(); sameSession(userId);
    const ready = assertRow(result?.file, invoiceId);
    if (String(ready.id) !== String(reserved.id) || String(ready.payment_id ?? '') !== String(paymentId ?? '') || ready.file_type !== kind) throw Error('ارتباط فایل تأییدشده معتبر نیست.');
    if (ready.upload_state !== 'ready') throw Error('تأیید فایل کامل نشد؛ دوباره تلاش کنید.');
    remember('files', ready); return ready;
  }
  async function saveEntity(event, isPayment) {
    event.preventDefault(); const form = event.target; if (activeMutation || form.dataset.busy === '1') return;
    const invoiceId = isPayment ? form.elements.invoice_id.value : null;
    const id = form._invoiceAttempt?.id ?? (form.elements[isPayment ? 'payment_id' : 'invoice_id'].value || null);
    const allowed = form._invoiceAttempt?.row ? (isPayment ? canPayments(invoice(invoiceId)) : canFiles(invoice(form._invoiceAttempt.row.id))) : (isPayment ? canPayments(invoice(invoiceId)) : id ? canEdit(invoice(id)) : canFeature('create'));
    if (!allowed) return deny();
    let attempt;
    try {
      if (form._invoiceAttempt) attempt = form._invoiceAttempt;
      else {
        M()?.bind(form); if (!form.reportValidity()) return;
        const file = validateFile(form.elements[isPayment ? 'receipt_file' : 'proforma_file']?.files?.[0]);
        const company = isPayment ? '' : form.elements.company_name.value.trim();
        const payload = isPayment ? {
          invoice_id: String(invoiceId), sequence_no: Number(form.elements.sequence_no.value), amount: M().raw(form.elements.amount),
          planned_date: form.elements.planned_date.value || null, paid_date: form.elements.status.value === 'paid' ? (form.elements.paid_date.value || new Date().toISOString().slice(0, 10)) : null,
          status: form.elements.status.value, tracking_no: form.elements.tracking_no.value.trim() || null, notes: form.elements.notes.value.trim() || null
        } : { invoice_number: form.elements.invoice_number.value.trim(), title: form.elements.title.value.trim(), account_party: company, company_name: company, currency: form.elements.currency.value, total_amount: M().raw(form.elements.total_amount), due_date: form.elements.due_date.value || null, description: form.elements.description.value.trim() || null };
        attempt = { requestId: freshId(), payload, id, userId: sessionIdentity(), file: file ? { ...file, requestId: freshId() } : null, row: null };
        form._invoiceAttempt = attempt;
      }
      activeMutation = true; form.dataset.busy = '1'; lockForm(form, true); saveStatus(form, 'در حال ثبت اطلاعات…');
      sameSession(attempt.userId);
      if (!attempt.row) attempt.row = assertRow(await rpc(isPayment ? 'save_invoice_payment' : 'save_invoice', { p_request_id: attempt.requestId, [isPayment ? 'p_payment_id' : 'p_invoice_id']: attempt.id, p_payload: attempt.payload }), isPayment ? invoiceId : null);
      sameSession(attempt.userId);
      remember(isPayment ? 'payments' : 'invoices', attempt.row);
      // IDs returned by the server are authoritative; never match a human label.
      form.elements[isPayment ? 'payment_id' : 'invoice_id'].value = String(attempt.row.id);
      await attachFile(attempt.file, isPayment ? attempt.row.invoice_id : attempt.row.id, isPayment ? attempt.row.id : null, isPayment ? 'receipt' : 'proforma', attempt.userId, form);
      if (form.isConnected) { model.selected = String(isPayment ? attempt.row.invoice_id : attempt.row.id); form.closest('dialog')?.close(); model.invoiceEditor = null; model.paymentEditor = null; model.paymentFormOpen = false; }
      notify(isPayment ? (attempt.file ? 'مرحله پرداخت و رسید آن ثبت شدند.' : 'مرحله پرداخت ثبت شد.') : (attempt.file ? 'صورتحساب و پیش‌فاکتور ثبت شدند.' : 'صورتحساب ثبت شد.'));
      await load();
    } catch (error) {
      if (attempt && !attempt.row && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) { delete form._invoiceAttempt; attempt = null; }
      const partial = attempt?.row ? 'اطلاعات ثبت شده است، اما بارگذاری کامل نشده. با «تلاش دوباره» فقط ادامه همین عملیات انجام می‌شود. ' : 'ثبت تأیید نشد. «تلاش دوباره» همین درخواست را بدون ثبت تکراری بررسی می‌کند. ';
      saveStatus(form, attempt ? partial + error.message : error.message, true); notify(error.message, true);
      if (attempt) { const button = q('[type=submit]', form); if (button) button.dataset.previousLabel = 'تلاش دوباره'; }
    } finally { activeMutation = false; form.dataset.busy = '0'; lockForm(form, false, !!form._invoiceAttempt); }
  }
  async function saveFile(event) {
    event.preventDefault(); const form = event.target; if (activeMutation) return;
    const editor = model.fileEditor, current = invoice(model.selected); if (!editor || !canFiles(current)) return deny();
    if (editor.kind === 'final' && !settled(current)) return notify('ابتدا همه مراحل پرداخت را تکمیل کنید.', true);
    if (editor.kind === 'receipt' && (!canPayments(current) || String(payment(editor.paymentId)?.invoice_id) !== String(current.id))) return deny();
    try {
      if (!form._fileAttempt) {
        M()?.bind(form); if (!form.reportValidity()) return;
        const candidate = validateFile(form.elements.file.files?.[0]); if (!candidate) return;
        form._fileAttempt = { ...candidate, requestId: editor.existing?.client_request_id || freshId(), userId: sessionIdentity(), invoiceId: String(current.id), paymentId: editor.paymentId, kind: editor.kind };
      }
      const attempt = form._fileAttempt;
      activeMutation = true; form.dataset.busy = '1'; lockForm(form, true);
      await attachFile(attempt, attempt.invoiceId, attempt.paymentId, attempt.kind, attempt.userId, form);
      if (form.isConnected) { form.closest('dialog')?.close(); model.fileEditor = null; }
      notify('فایل بارگذاری و به مورد درست متصل شد.'); await load();
    } catch (error) { if (!form._fileAttempt?.reserved && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) delete form._fileAttempt; saveStatus(form, `بارگذاری کامل نشد؛ با تلاش دوباره همین فایل ادامه پیدا می‌کند. ${error.message}`, true); notify(error.message, true); }
    finally { activeMutation = false; form.dataset.busy = '0'; lockForm(form, false, !!form._fileAttempt); }
  }
  async function downloadFile(id) {
    const file = model.files.find(row => String(row.id) === String(id)); if (!file || !managedFile(file) || file.upload_state !== 'ready' || !file.storage_path || !canFiles(invoice(file.invoice_id))) return deny();
    try {
      const userId = sessionIdentity();
      const response = await fileRequest(`/storage/v1/object/authenticated/${BUCKET}/${file.storage_path.split('/').map(encodeURIComponent).join('/')}`), blob = await response.blob();
      sameSession(userId);
      if (!canFiles(invoice(file.invoice_id))) return deny();
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = file.file_name; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notify(error.message, true); }
  }
  async function deleteFile(id) {
    if (activeMutation || pendingFileDelete) return;
    const file = model.files.find(row => String(row.id) === String(id)), current = invoice(file?.invoice_id);
    if (!file || !managedFile(file) || !canDeleteFile(current, file)) return deny();
    const context = { file, userId: sessionIdentity(), invoiceId: String(current.id) };
    pendingFileDelete = context;
    const location = file.file_type === 'receipt' ? `رسید مرحله ${fa(payment(file.payment_id)?.sequence_no)}` : file.file_type === 'final' ? 'فاکتور نهایی' : 'پیش‌فاکتور';
    const message = `فایل «${file.file_name}» از ${location} صورتحساب «${current.invoice_number}» حذف شود؟ پس از تأیید، فایل از فهرست و دسترسی برنامه حذف می‌شود و برای بارگذاری دوباره باید نسخهٔ آن را داشته باشید. نسخهٔ ذخیره‌شده فعلاً در فضای خصوصی باقی می‌ماند.`;
    let started = false, buttons = [];
    try {
      const approved = window.bamcoConfirm ? await window.bamcoConfirm(message) : window.confirm(message);
      if (!approved || activeMutation) return;
      sameSession(context.userId);
      // Recheck the exact row and selection after the asynchronous confirmation.
      if (String(model.selected) !== context.invoiceId || model.files.find(row => String(row.id) === String(id)) !== file || !canDeleteFile(invoice(file.invoice_id), file)) return deny();
      activeMutation = true; started = true; ++loadVersion;
      const row = Array.from(root()?.querySelectorAll('[data-invoice-file-row]') || []).find(node => node.dataset.invoiceFileRow === String(file.id));
      buttons = Array.from(row?.querySelectorAll('button') || []).map(button => ({ button, disabled: button.disabled }));
      buttons.forEach(({ button }) => { button.disabled = true; });
      const result = await rpc('delete_invoice_file', { p_file_id: String(file.id), p_invoice_id: context.invoiceId, p_payment_id: file.payment_id == null ? null : String(file.payment_id), p_file_type: file.file_type, p_file_request_id: file.client_request_id });
      sameSession(context.userId);
      if (!result || String(result.id) !== String(file.id) || String(result.invoice_id) !== context.invoiceId || String(result.payment_id ?? '') !== String(file.payment_id ?? '') || result.file_type !== file.file_type || typeof result.deleted !== 'boolean') throw Error('پاسخ معتبر حذف فایل دریافت نشد؛ دوباره تلاش کنید.');
      // Only this exact attachment is removed; payment and invoice amounts stay intact.
      model.files = model.files.filter(row => String(row.id) !== String(file.id));
      render();
      notify(result.deleted ? 'فایل از فهرست و دسترسی برنامه حذف شد.' : 'این فایل دیگر در فهرست قابل دسترسی موجود نیست.');
      await load();
    } catch (error) { notify(`حذف فایل تأیید نشد؛ می‌توانید دوباره تلاش کنید. ${error.message}`, true); }
    finally {
      if (started) { activeMutation = false; buttons.forEach(({ button, disabled }) => { if (button.isConnected) button.disabled = disabled; }); }
      if (pendingFileDelete === context) pendingFileDelete = null;
    }
  }
  async function deleteInvoice() {
    const current = invoice(model.selected); if (!canDelete(current)) return deny(); if (activeMutation) return;
    const ask = window.bamcoConfirm ? await window.bamcoConfirm(`صورتحساب «${current.title}» و همه مراحل پرداخت آن حذف شوند؟`) : window.confirm(`صورتحساب «${current.title}» حذف شود؟`);
    if (!ask || activeMutation) return; activeMutation = true;
    try { await removeRows('invoices', `id=eq.${encodeURIComponent(current.id)}`); model.selected = null; model.paymentEditor = null; model.paymentFormOpen = false; await load(); notify('صورتحساب و مراحل پرداخت وابسته حذف شدند.'); }
    catch (error) { notify(error.message, true); } finally { activeMutation = false; }
  }
  function openInvoiceDate(button) { const form = button.closest('form'), name = button.dataset.invoiceDate; E.openJalaliPicker?.({ visible: form?.elements[`${name}_jalali`], hidden: form?.elements[name], label: button.getAttribute('aria-label') || 'انتخاب تاریخ' }); }
  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return; host.dataset.bound = '1';
    host.addEventListener('input', event => {
      if (event.target.id !== 'invoiceSearch' || activeMutation) return;
      const cursor = event.target.selectionStart; ++loadVersion; model.search = event.target.value; render();
      const input = q('#invoiceSearch'); input?.focus({ preventScroll: true }); if (cursor != null) input?.setSelectionRange(cursor, cursor);
    });
    host.addEventListener('cancel', event => { if (activeMutation) event.preventDefault(); }, true);
    host.addEventListener('keydown', event => { if (event.target.id === 'invoiceSearch' && event.key === 'Escape' && !activeMutation) { model.search = ''; render(); } });
    host.addEventListener('click', event => {
      if (activeMutation) return;
      const action = event.target.closest('[data-invoice-action]')?.dataset.invoiceAction;
      if (action === 'new') return showInvoiceDialog(null);
      if (action === 'edit') return showInvoiceDialog(model.selected);
      if (action === 'delete') return void deleteInvoice();
      if (action === 'refresh') return void load();
      if (action === 'back') { ++loadVersion; model.selected = null; model.paymentEditor = null; model.paymentFormOpen = false; model.fileEditor = null; render(); return scrollInvoiceStart(); }
      if (action === 'payment') return showPaymentDialog(null);
      if (event.target.closest('[data-invoice-close],[data-invoice-payment-close],[data-invoice-file-close]')) { model.invoiceEditor = null; model.paymentEditor = null; model.paymentFormOpen = false; model.fileEditor = null; event.target.closest('dialog')?.close(); return void load(); }
      const dateButton = event.target.closest('[data-invoice-date]'); if (dateButton) return openInvoiceDate(dateButton);
      const stageEdit = event.target.closest('[data-invoice-payment-edit]'); if (stageEdit) return showPaymentDialog(stageEdit.dataset.invoicePaymentEdit);
      const upload = event.target.closest('[data-invoice-file-kind]'); if (upload) return showFileDialog(upload.dataset.invoiceFileKind, upload.dataset.paymentId || null);
      const resume = event.target.closest('[data-invoice-file-resume]'); if (resume) { const row = model.files.find(file => String(file.id) === resume.dataset.invoiceFileResume); if (row) return showFileDialog(row.file_type, row.payment_id, row); }
      const download = event.target.closest('[data-invoice-file-download]'); if (download) return void downloadFile(download.dataset.invoiceFileDownload);
      const fileDelete = event.target.closest('[data-invoice-file-delete]'); if (fileDelete) return void deleteFile(fileDelete.dataset.invoiceFileDelete);
      const select = event.target.closest('[data-invoice-select]'); if (select) { ++loadVersion; model.selected = select.dataset.invoiceSelect; model.paymentEditor = null; model.paymentFormOpen = false; model.fileEditor = null; render(); scrollInvoiceStart(); }
    });
    host.addEventListener('submit', event => { if (event.target.id === 'invoiceForm') void saveEntity(event, false); if (event.target.id === 'invoicePaymentForm') void saveEntity(event, true); if (event.target.id === 'invoiceFileForm') void saveFile(event); });
  }
  async function load({ cardsOnly = false } = {}) {
    resetChangedIdentity();
    if (!root()) return;
    if (!state.profile || !sessionIdentity()) { clear(); return; }
    if (cardsOnly) { model.selected = null; model.search = ''; model.paymentEditor = null; model.paymentFormOpen = false; model.fileEditor = null; }
    const request = ++loadVersion, identity = sessionIdentity();
    try {
      if (!canFeature('view')) { clear(); render(); return; }
      const workspace = await rpc('list_invoice_workspace', {});
      if (request !== loadVersion || identity !== sessionIdentity() || !canFeature('view')) return;
      if (!workspace || !Array.isArray(workspace.invoices) || !Array.isArray(workspace.payments) || !Array.isArray(workspace.files)) throw Error('سرویس صورتحساب آماده نیست؛ راه‌اندازی بخش فایل‌های مالی باید تکمیل شود.');
      Object.assign(model, workspace);
      if (model.selected && !invoice(model.selected)) model.selected = null;
      render();
    } catch (error) { if (request === loadVersion && identity === sessionIdentity() && canFeature('view') && root()) { render(); root().insertAdjacentHTML('beforeend', `<div class="panel enterprise-error" role="alert">${esc(error.message)}</div>`); } }
  }
  function boot() { if (!root()) return; render(); window.BamcoNavigation?.registerView?.('invoices', { activate: () => load({ cardsOnly: true }) }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.addEventListener('bamco:feature-access-changed', () => {
    const changed = modelIdentity !== sessionIdentity(); resetChangedIdentity();
    if (!canFeature('view')) { clear(); render(); }
    else if (changed || (!activeMutation && !root()?.querySelector('dialog[open]'))) render();
  });
  window.bamcoInvoices = { load, clear, model };
})();

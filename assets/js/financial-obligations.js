/* Financial domain: invoices, staged payments, balances and immutable audit. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, esc, fa, money, date, fetchRows, insert, insertMinimal, update, removeRows, setBusy, notify, statusText } = E;
  const model = { invoices: [], payments: [], selected: null, search: '', invoiceEditor: null, paymentEditor: null, paymentFormOpen: false };
  let loadVersion = 0;
  const root = () => q('#invoiceFeatureRoot');
  const invoice = id => model.invoices.find(item => String(item.id) === String(id));
  const payments = id => model.payments.filter(item => String(item.invoice_id) === String(id));
  const payment = id => model.payments.find(item => String(item.id) === String(id));
  const paid = id => payments(id).filter(item => item.status === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = item => Math.max(0, Number(item.total_amount || 0) - paid(item.id));
  const percent = item => item.total_amount ? Math.min(100, paid(item.id) / Number(item.total_amount) * 100) : 0;
  const isLate = row => row.status === 'paid' && !!row.planned_date && !!row.paid_date && String(row.paid_date) > String(row.planned_date);
  const dateField = (name, label, value = '') => `<label>${label}<span class="enterprise-date-field"><input name="${name}_jalali" class="jalali-input" readonly value="${esc(value ? date(value) : '')}" placeholder="۱۴۰۵/۰۱/۰۱"><button type="button" class="ghost bamco-icon-button" data-invoice-date="${name}" aria-label="${label}">▦</button><input name="${name}" type="hidden" value="${esc(value || '')}"></span></label>`;
  const formValue = (value, fallback = '') => esc(value ?? fallback);
  const currencyText = item => item.currency === 'IRR' ? 'ریال' : item.currency;

  function render() {
    const host = root(); if (!host) return;
    const visible = model.invoices.filter(item => !model.search || [item.invoice_number, item.title, item.account_party, item.company_name, item.status].some(value => String(value || '').toLowerCase().includes(model.search.toLowerCase())));
    const current = invoice(model.selected);
    const search = `<input id="invoiceSearch" type="search" value="${esc(model.search)}" placeholder="شماره، عنوان یا شرکت/پیمانکار…">`;
    const commandBar = current
      ? '<div class="invoice-top-command-row bamco-command-bar"><span data-feature-access-suppressed="true" data-home-return-suppressed="true" hidden></span><button type="button" class="ghost" data-invoice-action="back">بازگشت به کارت‌ها</button></div>'
      : `<div class="invoice-top-command-row bamco-command-bar"><button type="button" class="ghost" data-home-action>بازگشت به خانه</button><button type="button" class="primary" data-invoice-action="new">صورتحساب جدید</button><button type="button" class="ghost" data-invoice-action="refresh">تازه‌سازی</button><button type="button" class="ghost hidden" data-feature-access-control="local" data-invoice-action="access">مدیریت دسترسی</button>${search}</div>`;
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>صورتحساب‌ها و تعهدات مالی</h3></div></div>${commandBar}<div class="enterprise-grid invoice-grid ${current ? 'detail-open' : ''}"><section class="panel"><div class="panel-head"><h3>کارت‌های صورتحساب</h3><span class="enterprise-count">${fa(visible.length)} مورد</span></div><div class="enterprise-card-list">${visible.length ? visible.map(item => `<button type="button" class="enterprise-list-card invoice-list-card ${String(model.selected) === String(item.id) ? 'active' : ''}" data-invoice-select="${item.id}"><span><strong>${esc(item.title)}</strong><small>${esc(item.invoice_number)} · ${esc(item.company_name || item.account_party)}</small></span><span><b>${money(paid(item.id), currencyText(item))}</b><small>مانده: ${money(balance(item), currencyText(item))}</small><small>${fa(Math.round(percent(item)))}٪ پرداخت · ${esc(statusText(item.status))}</small></span></button>`).join('') : '<div class="empty">صورتحسابی ثبت نشده است.</div>'}</div></section><section class="panel invoice-detail">${current ? detailMarkup(current) : '<div class="enterprise-empty"><b>صورتحسابی انتخاب نشده است.</b><span>برای شروع یک تعهد مالی ثبت کنید.</span></div>'}</section></div>${invoiceDialogMarkup()}${current ? paymentDialogMarkup(current) : ''}`;
    bind();
  }
  function invoiceDialogMarkup() {
    const editing = invoice(model.invoiceEditor);
    return `<dialog id="invoiceDialog" class="modal enterprise-modal"><form id="invoiceForm" method="dialog"><input type="hidden" name="invoice_id" value="${editing?.id || ''}"><div class="modal-head"><div><h3>${editing ? 'ویرایش صورتحساب' : 'ثبت صورتحساب'}</h3></div><button type="button" data-invoice-close>×</button></div><div class="form-grid"><label>شماره صورتحساب<input name="invoice_number" dir="rtl" value="${formValue(editing?.invoice_number)}" required></label><label>عنوان<input name="title" value="${formValue(editing?.title)}" required></label><label>شرکت/پیمانکار<input name="company_name" value="${formValue(editing?.company_name || editing?.account_party)}" required></label><label>ارز<select name="currency"><option value="IRR" ${editing?.currency === 'IRR' || !editing ? 'selected' : ''}>ریال</option><option value="IRT" ${editing?.currency === 'IRT' ? 'selected' : ''}>تومان</option><option value="USD" ${editing?.currency === 'USD' ? 'selected' : ''}>دلار آمریکا</option><option value="EUR" ${editing?.currency === 'EUR' ? 'selected' : ''}>یورو</option></select></label><label>مبلغ کل<input name="total_amount" type="number" min="0" step="0.01" value="${formValue(editing?.total_amount)}" required></label>${dateField('due_date', 'تاریخ سررسید', editing?.due_date)}<label class="span-2">توضیحات<textarea name="description" rows="3">${formValue(editing?.description)}</textarea></label></div><div class="modal-actions"><button type="button" class="ghost" data-invoice-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات' : 'ثبت صورتحساب'}</button></div></form></dialog>`;
  }
  function detailMarkup(item) {
    const rows = payments(item.id), activeEditor = payment(model.paymentEditor);
    return `<div class="project-detail-head"><div><span class="enterprise-eyebrow">${esc(item.invoice_number)}</span><h3>${esc(item.title)}</h3><p>${esc(item.company_name || item.account_party)}</p></div><span class="status-badge">${esc(statusText(item.status))}</span></div><div class="invoice-detail-actions" aria-label="عملیات صورتحساب"><button type="button" class="primary" data-invoice-action="payment">ثبت مرحله پرداخت</button><button type="button" class="ghost" data-invoice-action="edit">ویرایش</button><button type="button" class="danger" data-invoice-action="delete">حذف</button></div><div class="invoice-total"><div><b>${money(item.total_amount, currencyText(item))}</b><span>مبلغ کل</span></div><div><b>${money(paid(item.id), currencyText(item))}</b><span>پرداخت‌شده</span></div><div><b>${money(balance(item), currencyText(item))}</b><span>باقی‌مانده</span></div><div><b>${fa(Math.round(percent(item)))}٪</b><span>درصد پرداخت</span></div></div>${E.progress(percent(item))}<div class="invoice-meta"><span>سررسید: ${date(item.due_date)}</span></div><section class="invoice-payments"><div class="panel-head"><h4>پرداخت‌های مرحله‌ای</h4><small>${fa(rows.length)} مرحله</small></div>${rows.length ? rows.map(row => `<article class="payment-row"><div class="payment-stage-title"><b>مرحله ${fa(row.sequence_no)}</b><small>${esc(statusText(row.status))}${isLate(row) ? '<i class="payment-late-icon" role="img" aria-label="پرداخت با دیرکرد" title="پرداخت با دیرکرد">⌛</i>' : ''}</small></div><div class="payment-stage-value"><b>${money(row.amount, currencyText(item))}</b><small>${row.percent_of_total != null ? `${fa(Math.round(Number(row.percent_of_total)))}٪ از کل` : '—'}</small></div><div class="payment-stage-dates"><span>برنامه‌ای: ${date(row.planned_date)}</span><span>واقعی: ${date(row.paid_date)}</span></div><button type="button" class="ghost" data-invoice-payment-edit="${row.id}">ویرایش مرحله</button></article>`).join('') : '<div class="empty">مرحله پرداختی ثبت نشده است.</div>'}</section>`;
  }
  function paymentDialogMarkup(item) {
    if (!model.paymentFormOpen) return '';
    const rows = payments(item.id), editing = payment(model.paymentEditor);
    return `<dialog id="invoicePaymentDialog" class="modal enterprise-modal invoice-payment-dialog"><form id="invoicePaymentForm" method="dialog"><div class="modal-head"><div><h3>${editing ? 'ویرایش مرحله پرداخت' : 'ثبت مرحله پرداخت'}</h3><p>${esc(item.title)} · ${esc(item.invoice_number)}</p></div><button type="button" data-invoice-payment-close aria-label="بستن">×</button></div>${paymentFormMarkup(item, rows, editing)}</form></dialog>`;
  }
  function paymentFormMarkup(item, rows, editing) {
    const nextSequence = rows.reduce((max, row) => Math.max(max, Number(row.sequence_no || 0)), 0) + 1;
    return `<div class="form-grid invoice-payment-form"><input type="hidden" name="invoice_id" value="${item.id}"><input type="hidden" name="payment_id" value="${editing?.id || ''}"><label>شماره مرحله<input name="sequence_no" type="number" min="1" value="${formValue(editing?.sequence_no, nextSequence)}" required></label><label>مبلغ<input name="amount" type="number" min="0.01" step="0.01" value="${formValue(editing?.amount)}" required></label>${dateField('planned_date', 'تاریخ برنامه‌ای', editing?.planned_date)}<label>وضعیت<select name="status"><option value="planned" ${editing?.status !== 'paid' ? 'selected' : ''}>برنامه‌ریزی‌شده</option><option value="paid" ${editing?.status === 'paid' ? 'selected' : ''}>پرداخت‌شده</option></select></label>${dateField('paid_date', 'تاریخ واقعی', editing?.paid_date)}<label>شماره پیگیری<input name="tracking_no" value="${formValue(editing?.tracking_no)}"></label><label class="span-2 payment-notes">توضیحات مرحله<textarea name="notes" rows="3">${formValue(editing?.notes)}</textarea></label></div><div class="modal-actions"><button type="button" class="ghost" data-invoice-payment-close>انصراف</button><button type="submit" class="primary">${editing ? 'ذخیره تغییرات مرحله' : 'ثبت مرحله پرداخت'}</button></div>`;
  }
  function showPaymentDialog(paymentId = null) { model.paymentEditor = paymentId; model.paymentFormOpen = true; render(); const dialog = q('#invoicePaymentDialog', root()); if (dialog && !dialog.open) dialog.showModal(); }
  function showInvoiceDialog(id = null) { model.invoiceEditor = id; render(); const dialog = q('#invoiceDialog', root()); if (dialog && !dialog.open) dialog.showModal(); }
  async function saveInvoice(event) {
    event.preventDefault(); const form = event.target, button = q('[type=submit]', form), company = form.elements.company_name.value.trim(), invoiceNumber = form.elements.invoice_number.value.trim(), id = form.elements.invoice_id.value;
    const payload = { invoice_number: invoiceNumber, title: form.elements.title.value.trim(), account_party: company, company_name: company, currency: form.elements.currency.value, total_amount: Number(form.elements.total_amount.value || 0), due_date: form.elements.due_date.value || null, description: form.elements.description.value.trim() || null };
    setBusy(button, true);
    try {
      if (id) { await update('invoices', `id=eq.${encodeURIComponent(id)}`, payload); model.selected = id; notify('صورتحساب ویرایش شد.'); }
      else { await (insertMinimal || insert)('invoices', { ...payload, created_by: state.user.id, follow_up_owner_id: state.user.id }); notify('صورتحساب ثبت شد.'); }
      model.invoiceEditor = null; q('#invoiceDialog', root())?.close(); await load();
      if (!id) model.selected = model.invoices.find(item => item.invoice_number === invoiceNumber)?.id || null;
      render();
    } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }
  async function savePayment(event) {
    event.preventDefault(); const form = event.target, button = q('[type=submit]', form), invoiceId = Number(form.elements.invoice_id.value), paymentId = form.elements.payment_id.value, status = form.elements.status.value, amount = Number(form.elements.amount.value || 0), total = Number(invoice(invoiceId)?.total_amount || 0);
    const payload = { invoice_id: invoiceId, sequence_no: Number(form.elements.sequence_no.value), amount, percent_of_total: total ? amount / total * 100 : null, planned_date: form.elements.planned_date.value || null, paid_date: status === 'paid' ? (form.elements.paid_date.value || new Date().toISOString().slice(0, 10)) : null, status, tracking_no: form.elements.tracking_no.value.trim() || null, notes: form.elements.notes.value.trim() || null, payer_id: status === 'paid' ? (payment(paymentId)?.payer_id || state.user.id) : null };
    setBusy(button, true);
    try {
      if (paymentId) await update('invoice_payments', `id=eq.${encodeURIComponent(paymentId)}`, payload);
      else await insert('invoice_payments', payload);
      q('#invoicePaymentDialog', root())?.close(); model.paymentEditor = null; model.paymentFormOpen = false; await load(); render(); notify(paymentId ? 'مرحله پرداخت ویرایش شد؛ مانده و درصد پرداخت به‌روزرسانی شدند.' : 'مرحله پرداخت ثبت شد؛ مانده و درصد پرداخت به‌روزرسانی شدند.');
    } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }
  async function deleteInvoice() {
    const current = invoice(model.selected); if (!current) return;
    const ask = window.bamcoConfirm ? await window.bamcoConfirm(`صورتحساب «${current.title}» و همه مراحل پرداخت آن حذف شوند؟`) : window.confirm(`صورتحساب «${current.title}» حذف شود؟`);
    if (!ask) return;
    try { await removeRows('invoices', `id=eq.${encodeURIComponent(current.id)}`); model.selected = null; model.paymentEditor = null; model.paymentFormOpen = false; await load(); notify('صورتحساب و مراحل پرداخت وابسته حذف شدند.'); }
    catch (error) { notify(error.message, true); }
  }
  function openInvoiceDate(button) { const form = button.closest('form'), name = button.dataset.invoiceDate, visible = form?.elements[`${name}_jalali`], hidden = form?.elements[name]; E.openJalaliPicker?.({ visible, hidden, label: button.getAttribute('aria-label') || 'انتخاب تاریخ' }); }
  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return; host.dataset.bound = '1';
    host.addEventListener('input', event => { if (event.target.id === 'invoiceSearch') { model.search = event.target.value; render(); q('#invoiceSearch')?.focus(); } });
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-invoice-action]')?.dataset.invoiceAction;
      if (action === 'new') return showInvoiceDialog(null);
      if (action === 'edit') return showInvoiceDialog(model.selected);
      if (action === 'delete') return void deleteInvoice();
      if (action === 'refresh') return void load();
      if (action === 'access') return window.bamcoAccessEditor?.open?.({ featureKey: 'invoices', title: 'مدیریت دسترسی صورتحساب‌ها و تعهدات مالی' });
      if (action === 'back') { model.selected = null; model.paymentEditor = null; model.paymentFormOpen = false; return render(); }
      if (action === 'payment') return showPaymentDialog(null);
      if (event.target.closest('[data-invoice-close]')) { model.invoiceEditor = null; event.target.closest('dialog')?.close(); return; }
      if (event.target.closest('[data-invoice-payment-close]')) { model.paymentEditor = null; model.paymentFormOpen = false; event.target.closest('dialog')?.close(); return; }
      const dateButton = event.target.closest('[data-invoice-date]'); if (dateButton) return openInvoiceDate(dateButton);
      const stageEdit = event.target.closest('[data-invoice-payment-edit]'); if (stageEdit) return showPaymentDialog(stageEdit.dataset.invoicePaymentEdit);
      const select = event.target.closest('[data-invoice-select]'); if (select) { model.selected = select.dataset.invoiceSelect; model.paymentEditor = null; model.paymentFormOpen = false; render(); }
    });
    host.addEventListener('submit', event => { if (event.target.id === 'invoiceForm') void saveInvoice(event); if (event.target.id === 'invoicePaymentForm') void savePayment(event); });
  }
  async function load({ cardsOnly = false } = {}) {
    if (!root() || !state.profile) return; if (cardsOnly) { model.selected = null; model.paymentEditor = null; model.paymentFormOpen = false; }
    const request = ++loadVersion;
    try {
      const [invoices, paymentRows] = await Promise.all([fetchRows('invoices', 'select=*&order=updated_at.desc,id.desc'), fetchRows('invoice_payments', 'select=*&order=sequence_no.asc')]);
      if (request !== loadVersion) return;
      Object.assign(model, { invoices, payments: paymentRows });
      if (model.selected && !invoice(model.selected)) model.selected = null;
      render();
    } catch (error) { if (request === loadVersion && root()) root().innerHTML = `<div class="panel enterprise-error">${esc(error.message)}</div>`; }
  }
  function boot() { if (!root()) return; render(); window.BamcoNavigation?.registerView?.('invoices', { activate: () => load({ cardsOnly: true }) }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoInvoices = { load, model };
})();

/* Shared platform primitives. Domain modules own their server collections and
   use this namespace for rendering, formatting and common interaction rules. */
(() => {
  'use strict';
  const root = globalThis;
  if (root.bamcoEnterprise) return;
  const q = (selector, scope = document) => scope?.querySelector?.(selector);
  const qa = (selector, scope = document) => [...(scope?.querySelectorAll?.(selector) || [])];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fa = value => String(value ?? '').replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[digit]);
  const money = (value, currency = 'ریال') => `${fa(Number(value || 0).toLocaleString('en-US'))} ${esc(currency)}`;
  const date = value => value ? (typeof jalaliText === 'function' ? jalaliText(value) : String(value).slice(0, 10)) : '—';
  const dateTime = value => value ? (typeof jalaliDateTime === 'function' ? jalaliDateTime(value) : String(value)) : '—';
  const progress = value => `<div class="enterprise-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, Math.min(100, Number(value || 0)))}"><span style="width:${Math.max(0, Math.min(100, Number(value || 0)))}%"></span></div>`;
  const status = {
    draft: 'پیش‌نویس', planned: 'برنامه‌ریزی‌شده', active: 'فعال', in_progress: 'در حال اجرا', paused: 'متوقف', waiting: 'در انتظار', completed: 'تکمیل‌شده', closed: 'بسته‌شده', cancelled: 'لغوشده',
    initial: 'ثبت اولیه', pending_approval: 'در انتظار تأیید', approved: 'تأییدشده', awaiting_payment: 'در انتظار پرداخت', partially_paid: 'پرداخت جزئی', settled: 'تسویه‌شده', overdue: 'سررسید گذشته', returned: 'برگشت برای اصلاح'
  };
  const statusText = value => status[value] || value || '—';
  const person = id => (state.profiles || []).find(profile => String(profile.id) === String(id));
  const personName = id => person(id)?.display_name || person(id)?.full_name || person(id)?.email || '—';
  const setBusy = (button, busy, label) => { if (!button) return; button.disabled = !!busy; if (busy) { button.dataset.previousLabel = button.textContent; button.textContent = label || 'در حال ذخیره…'; } else if (button.dataset.previousLabel) { button.textContent = button.dataset.previousLabel; delete button.dataset.previousLabel; } };
  const fetchRows = (table, query) => selectAll(table, query || 'select=*');
  const removeRows = (table, filter) => api(`/rest/v1/${table}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' });
  const refresh = () => { if (typeof window.refresh === 'function') return window.refresh(); return Promise.resolve(); };
  const notify = (message, error = false) => typeof toast === 'function' ? toast(message, error) : undefined;
  const viewActive = view => !q(`#${view}View`)?.classList.contains('hidden');
  root.bamcoEnterprise = Object.freeze({ q, qa, esc, fa, money, date, dateTime, progress, statusText, personName, setBusy, fetchRows, removeRows, refresh, notify, viewActive });
})();

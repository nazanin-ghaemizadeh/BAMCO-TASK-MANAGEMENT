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
  const data = () => root.BamcoData;
  const requireOperation = name => (...args) => {
    const operation = data()?.[name];
    if (typeof operation !== 'function') return Promise.reject(new Error('سرویس دادهٔ سامانه آماده نیست؛ صفحه را دوباره باز کنید.'));
    return operation(...args);
  };
  const fetchRows = (table, query) => requireOperation('selectAll')(table, query || 'select=*');
  const insert = requireOperation('insert');
  // Some scoped tables cannot safely satisfy their SELECT policy until the new
  // row is committed. Creating them with a representation would therefore
  // turn a successful INSERT into a misleading RLS error. The feature reloads
  // from its canonical scoped query immediately after this operation.
  const insertMinimal = (table, body) => {
    if (typeof api !== 'function') return Promise.reject(new Error('سرویس دادهٔ سامانه آماده نیست؛ صفحه را دوباره باز کنید.'));
    return api(`/rest/v1/${table}`, { method: 'POST', body, prefer: 'return=minimal' });
  };
  const update = requireOperation('update');
  const rpc = requireOperation('rpc');
  const removeRows = (table, filter) => api(`/rest/v1/${table}?${filter}`, { method: 'DELETE', prefer: 'return=minimal' });
  const refresh = () => { if (typeof window.refresh === 'function') return window.refresh(); return Promise.resolve(); };
  const notify = (message, error = false) => typeof toast === 'function' ? toast(message, error) : undefined;
  const viewActive = view => !q(`#${view}View`)?.classList.contains('hidden');
  // One reusable bridge to the application's existing Jalali calendar. Domain
  // forms keep ISO dates in their data fields, while people always see and use
  // the same Persian calendar used by the task form.
  let jalaliTarget = null;
  const jalaliMonths = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const openJalaliPicker = ({ visible, hidden, label = 'انتخاب تاریخ' }) => {
    const dialog = q('#calendarDialog');
    if (!visible || !hidden || !dialog || typeof currentJalali !== 'function' || typeof persianParts !== 'function') return;
    const now = currentJalali();
    const selected = hidden.value ? persianParts(hidden.value) : now;
    jalaliTarget = { visible, hidden };
    q('#calendarLabel').textContent = label;
    q('#calYear').innerHTML = Array.from({ length: 16 }, (_, index) => now.y - 5 + index)
      .map(year => `<option value="${year}">${fa(year)}</option>`).join('');
    q('#calMonth').innerHTML = jalaliMonths.map((month, index) => `<option value="${index + 1}">${month}</option>`).join('');
    q('#calYear').value = String(selected.y);
    q('#calMonth').value = String(selected.m);
    if (typeof fillCalendarDays === 'function') fillCalendarDays();
    q('#calDay').value = String(selected.d);
    dialog.showModal();
  };
  document.addEventListener('click', event => {
    if (!jalaliTarget) return;
    const set = event.target.closest('#setDateBtn');
    const clear = event.target.closest('#clearDateBtn');
    if (!set && !clear) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = jalaliTarget;
    jalaliTarget = null;
    if (clear) {
      target.hidden.value = '';
      target.visible.value = '';
    } else {
      const iso = typeof jalaliToISO === 'function' && jalaliToISO(q('#calYear').value, q('#calMonth').value, q('#calDay').value);
      if (!iso) {
        notify('تاریخ انتخاب‌شده معتبر نیست.', true);
        return;
      }
      target.hidden.value = iso;
      target.visible.value = typeof jalaliText === 'function' ? jalaliText(iso) : iso;
    }
    q('#calendarDialog')?.close();
    target.visible.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
  q('#calendarDialog')?.addEventListener('close', () => { jalaliTarget = null; });
  root.bamcoEnterprise = Object.freeze({ q, qa, esc, fa, money, date, dateTime, progress, statusText, personName, setBusy, fetchRows, insert, insertMinimal, update, rpc, removeRows, refresh, notify, viewActive, openJalaliPicker });
})();

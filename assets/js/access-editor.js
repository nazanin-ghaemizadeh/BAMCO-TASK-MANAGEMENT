/* One generic feature-access editor. Feature modules only pass featureKey. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const ACTIONS = Object.freeze([
    ['can_view', 'مشاهده'], ['can_create', 'ثبت'], ['can_edit', 'ویرایش'],
    ['can_delete', 'حذف'], ['can_export', 'خروجی']
  ]);
  const state = () => window.Bamco?.state || window.state || {};
  const rpc = (name, body = {}) => {
    const call = window.BamcoData?.rpc || window.rpc;
    if (typeof call !== 'function') return Promise.reject(new Error('سرویس دادهٔ سامانه آماده نیست.'));
    return call(name, body);
  };
  const bool = value => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
  const label = user => user?.display_name || user?.full_name || user?.email || '—';
  const dialogIdFor = featureKey => ({ letters: 'letterAccessDialog', vehiclePermanent: 'vehicleAccessDialog', vehicleTemporary: 'vehicleAccessDialog' }[featureKey] || 'featureAccessDialog');
  const canManage = featureKey => {
    const access = window.BamcoAccess;
    return access?.can?.(featureKey, 'manage_access') === true || access?.can?.('settings', 'manage_access') === true || access?.isSystemManager?.() === true;
  };
  const current = token => state().token === token && state().profile?.active !== false;
  function snapshotParts(payload) {
    const source = Array.isArray(payload) ? payload[0] : payload;
    return {
      feature: source?.feature || {},
      users: Array.isArray(source?.users) ? source.users : [],
      // `grants` are the direct per-user overrides which this editor owns.
      // `effective_grants` includes role/baseline resolution and is therefore
      // the only correct value to render as the user's current access.
      grants: Array.isArray(source?.grants) ? source.grants : (Array.isArray(source?.direct_grants) ? source.direct_grants : []),
      effectiveGrants: Array.isArray(source?.effective_grants) ? source.effective_grants
        : (Array.isArray(source?.effectiveGrants) ? source.effectiveGrants : [])
    };
  }
  function permissionsOf(grant = {}) {
    return Object.fromEntries(ACTIONS.map(([key]) => [key, bool(grant[key]) ]));
  }
  function rowInitial(row) {
    try { return JSON.parse(row.dataset.initialPermissions || '{}'); } catch { return {}; }
  }
  function currentPermissions(row) {
    return Object.fromEntries(ACTIONS.map(([key]) => [key, !!row.querySelector(`[data-permission="${key}"]`)?.checked]));
  }
  function samePermissions(left, right) {
    return ACTIONS.every(([key]) => !!left?.[key] === !!right?.[key]);
  }
  function refreshTouched(row) {
    const touched = !samePermissions(currentPermissions(row), rowInitial(row));
    row.dataset.touched = touched ? 'true' : 'false';
  }
  function renderPeople(list, users, grants, effectiveGrants) {
    const direct = new Map(grants.map(grant => [String(grant.user_id), grant]));
    const effective = new Map(effectiveGrants.map(grant => [String(grant.user_id || grant.id), grant]));
    const rows = users
      .filter(user => user?.id && user.active !== false)
      .sort((a, b) => label(a).localeCompare(label(b), 'fa'))
      .map(user => {
        const directGrant = direct.get(String(user.id)) || {};
        // The manager snapshot may embed the effective grant on a user while
        // older deployments return it separately. Support both shapes, with a
        // direct grant as a conservative fallback while the RPC is upgraded.
        const effectiveGrant = effective.get(String(user.id)) || user.effective_access || user.effective_grant || directGrant;
        const permissions = permissionsOf(effectiveGrant);
        const ownSystemManager = String(user.id) === String(state().user?.id) && window.BamcoAccess?.isSystemManager?.() === true;
        const protectedGrant = bool(user.protected) || bool(directGrant.protected) || ownSystemManager;
        if (protectedGrant) ACTIONS.forEach(([key]) => { permissions[key] = true; });
        const enabled = permissions.can_view;
        const initial = esc(JSON.stringify(permissions));
        const actions = ACTIONS.slice(1).map(([key, title]) => {
          const checked = enabled && permissions[key];
          const disabled = protectedGrant || !enabled;
          return `<label class="permission-action"><input type="checkbox" data-permission="${key}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span>${title}</span></label>`;
        }).join('');
        return `<article class="permission-person" data-user-id="${esc(user.id)}" data-protected="${protectedGrant ? 'true' : 'false'}" data-touched="false" data-initial-permissions="${initial}">
          <label class="permission-person-identity"><input type="checkbox" value="${esc(user.id)}" data-permission="can_view" ${enabled ? 'checked' : ''} ${protectedGrant ? 'disabled' : ''}><span>${esc(label(user))}</span>${user.email ? `<small dir="ltr">${esc(user.email)}</small>` : ''}</label>
          <div class="permission-actions" aria-label="سطح دسترسی">${actions}</div>
        </article>`;
      });
    list.innerHTML = rows.join('') || '<p>کاربر فعالی برای مدیریت دسترسی وجود ندارد.</p>';
    list.querySelectorAll('[data-permission="can_view"]').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-user-id]');
        row?.querySelectorAll('.permission-actions input').forEach(control => {
          control.disabled = !input.checked || row.dataset.protected === 'true';
          if (!input.checked) control.checked = false;
        });
        if (row) refreshTouched(row);
      });
    });
    list.querySelectorAll('.permission-actions input').forEach(input => {
      input.addEventListener('change', () => {
        const row = input.closest('[data-user-id]');
        if (row) refreshTouched(row);
      });
    });
  }
  function grantPayload(list) {
    return [...list.querySelectorAll('[data-user-id]')]
      .filter(row => row.dataset.protected !== 'true' && row.dataset.touched === 'true')
      .map(row => {
      const read = selector => row.querySelector(selector);
      const view = !!read('[data-permission="can_view"]')?.checked;
      const out = { user_id: row.dataset.userId, effect: view ? 'allow' : 'deny', can_view: true };
      for (const [key] of ACTIONS.slice(1)) out[key] = view && !!read(`[data-permission="${key}"]`)?.checked;
      // A deny is intentionally explicit. It overrides any inherited role or
      // baseline grant, so revocation is immediate and deterministic.
      if (!view) {
        out.can_create = false; out.can_edit = false; out.can_delete = false; out.can_export = false;
      }
      return out;
    });
  }
  async function open(options = {}) {
    const featureKey = String(options.featureKey || '');
    if (!featureKey) throw new Error('شناسهٔ بخش برای مدیریت دسترسی مشخص نشده است.');
    const access = window.BamcoAccess;
    if (!access?.isReady?.() && state().token) await access?.refresh?.();
    if (!canManage(featureKey)) {
      access?.denied?.(featureKey, 'manage_access');
      return false;
    }
    const token = state().token;
    const id = options.id || dialogIdFor(featureKey);
    let dialog = document.getElementById(id);
    if (dialog?.open) return false;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = id;
      dialog.className = 'permission-dialog';
      document.body.append(dialog);
    }
    const title = options.title || `مدیریت دسترسی ${access?.featureTitle?.(featureKey) || featureKey}`;
    dialog.innerHTML = `<form method="dialog">
      <header><h3>${esc(title)}</h3><button type="button" class="ghost" data-close aria-label="بستن">×</button></header>
      <p>دسترسی این بخش برای هر شخص از همین سامانهٔ واحد تعیین می‌شود. برداشتن مشاهده، یک منع صریح ایجاد می‌کند و دسترسی‌های موروثی را نیز متوقف می‌سازد.</p>
      <input type="search" data-search placeholder="جست‌وجوی نام یا ایمیل…" aria-label="جست‌وجوی افراد">
      <div class="permission-list" role="group" aria-label="افراد و سطح دسترسی"><p role="status">در حال دریافت دسترسی‌ها…</p></div>
      <p class="permission-error" role="alert"></p>
      <footer><button class="primary" type="submit" disabled>ذخیره دسترسی‌ها</button><button class="ghost" type="button" data-close>انصراف</button></footer>
    </form>`;
    const form = dialog.querySelector('form');
    const list = dialog.querySelector('.permission-list');
    const error = dialog.querySelector('.permission-error');
    const submit = form.querySelector('[type="submit"]');
    let saving = false;
    const close = () => { if (!saving) dialog.close(); };
    dialog.querySelectorAll('[data-close]').forEach(button => { button.onclick = close; });
    dialog.oncancel = event => { if (saving) event.preventDefault(); };
    dialog.showModal();
    try {
      const payload = await rpc('feature_access_manage_snapshot', { p_feature_key: featureKey });
      if (!dialog.open || !current(token) || !canManage(featureKey)) { dialog.close(); return false; }
      const { users, grants, effectiveGrants } = snapshotParts(payload);
      renderPeople(list, users, grants, effectiveGrants);
      submit.disabled = false;
      const search = dialog.querySelector('[data-search]');
      search.oninput = event => {
        const query = String(event.target.value || '').trim().toLocaleLowerCase('fa');
        list.querySelectorAll('[data-user-id]').forEach(row => { row.hidden = !!query && !row.textContent.toLocaleLowerCase('fa').includes(query); });
      };
    } catch (errorValue) {
      error.textContent = errorValue?.message || 'دریافت دسترسی‌ها انجام نشد.';
      list.innerHTML = '';
      return false;
    }
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving || submit.disabled) return;
      if (!current(token) || !canManage(featureKey)) { dialog.close(); return; }
      const changes = grantPayload(list);
      if (!changes.length) { dialog.close(); return; }
      saving = true; submit.disabled = true; error.textContent = '';
      try {
        await rpc('set_feature_access', { p_feature_key: featureKey, p_grants: changes });
        await window.BamcoAccess?.refresh?.({ force: true });
        dialog.close();
        window.toast?.('دسترسی‌های این بخش ذخیره شدند.');
      } catch (errorValue) {
        error.textContent = errorValue?.message || 'ذخیره دسترسی‌ها انجام نشد.';
      } finally {
        saving = false; submit.disabled = false;
      }
    };
    return true;
  }
  window.bamcoAccessEditor = Object.freeze({ open });
})();

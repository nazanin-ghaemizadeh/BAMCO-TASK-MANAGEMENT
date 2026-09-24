/* One generic feature-access editor. Feature modules only pass featureKey. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  // Storage keeps individual capabilities, while the interface deliberately
  // grants or revokes the whole feature with one checkbox per person.
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
    const enabled = !!row.querySelector('[data-permission="can_view"]')?.checked;
    return Object.fromEntries(ACTIONS.map(([key]) => [key, enabled]));
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
        return `<article class="permission-person" data-user-id="${esc(user.id)}" data-protected="${protectedGrant ? 'true' : 'false'}" data-touched="false" data-initial-permissions="${initial}">
          <label class="permission-person-identity"><input type="checkbox" value="${esc(user.id)}" data-permission="can_view" ${enabled ? 'checked' : ''} ${protectedGrant ? 'disabled' : ''}><span>${esc(label(user))}</span></label>
        </article>`;
      });
    list.innerHTML = rows.join('') || '<p>کاربر فعالی برای مدیریت دسترسی وجود ندارد.</p>';
    list.querySelectorAll('[data-permission="can_view"]').forEach(input => {
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
      const out = { user_id: row.dataset.userId, effect: view ? 'allow' : 'deny', can_view: view };
      for (const [key] of ACTIONS.slice(1)) out[key] = view;
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

/* Organization-wide access matrix. It is a second interface over the same
   feature_access_manage_snapshot/set_feature_access contract used above. */
(() => {
  'use strict';
  const ROUTE = 'accessMatrix';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const bool = value => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
  const state = () => window.Bamco?.state || window.state || {};
  const canManage = () => window.BamcoAccess?.isSystemManager?.() === true || window.BamcoAccess?.can?.('settings', 'manage_access') === true;
  const rpc = (name, body = {}) => {
    const call = window.BamcoData?.rpc || window.rpc;
    return typeof call === 'function' ? call(name, body) : Promise.reject(new Error('سرویس دادهٔ سامانه آماده نیست.'));
  };
  const personName = user => user?.display_name || user?.full_name || user?.email || '—';
  const matrix = { loading: false, loaded: false, saving: false, search: '', users: [], values: new Map(), initial: new Map(), protected: new Set(), error: '' };
  const keyOf = (featureKey, userId) => `${featureKey}:${userId}`;
  const snapshotParts = payload => {
    const source = Array.isArray(payload) ? payload[0] : payload;
    return {
      users: Array.isArray(source?.users) ? source.users : [],
      direct: Array.isArray(source?.grants) ? source.grants : (Array.isArray(source?.direct_grants) ? source.direct_grants : []),
      effective: Array.isArray(source?.effective_grants) ? source.effective_grants : (Array.isArray(source?.effectiveGrants) ? source.effectiveGrants : [])
    };
  };
  const catalogRows = () => {
    const catalog = window.BamcoNavigationCatalog;
    if (!catalog) return [];
    return catalog.groups.map(group => ({
      group,
      routes: group.routes.filter(route => route !== ROUTE).map(route => catalog.routeFor(route)).filter(Boolean)
    }));
  };
  const featureKeys = () => [...new Set(catalogRows().flatMap(entry => entry.routes.map(route => route.featureKey)))];
  async function pool(values, limit, worker) {
    const pending = [...values];
    await Promise.all(Array.from({ length: Math.min(limit, pending.length) }, async () => {
      while (pending.length) await worker(pending.shift());
    }));
  }
  function ensureView() {
    let view = document.getElementById(`${ROUTE}View`);
    if (!view) {
      view = document.createElement('section');
      view.id = `${ROUTE}View`;
      view.className = 'view hidden';
      document.querySelector('.workspace')?.append(view);
    }
    view.dataset.featureKey = 'people';
    view.dataset.featureAction = 'view';
    if (!view.querySelector('.access-matrix-shell')) {
      view.innerHTML = `<section class="panel access-matrix-shell"><div class="panel-head"><div><h3>دسترسی‌ها</h3><small>مدیریت یکپارچهٔ دسترسی افراد به کارت‌ها و تب‌های سامانه</small></div></div><div class="manager-toolbar bamco-command-bar access-matrix-toolbar"><button type="button" class="ghost" data-home-action>بازگشت به خانه</button><button type="button" class="ghost" data-access-matrix-refresh>تازه‌سازی</button><button type="button" class="primary" data-access-matrix-save disabled>ذخیره تغییرات</button><input type="search" data-access-matrix-search placeholder="جست‌وجوی فرد…" aria-label="جست‌وجوی فرد"><span data-feature-access-suppressed="true" hidden></span></div><div class="access-matrix-content" aria-live="polite"><p class="access-matrix-status">برای دریافت دسترسی‌ها، تازه‌سازی کنید.</p></div></section>`;
    }
    bind(view);
    return view;
  }
  function syncRouteVisibility() {
    const button = document.querySelector(`#nav button[data-view="${ROUTE}"]`);
    if (!button) return;
    const allowed = canManage();
    button.hidden = !allowed;
    button.disabled = !allowed;
    button.classList.toggle('hidden', !allowed);
    button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  }
  function dirtyKeys() {
    return [...matrix.values.keys()].filter(key => matrix.values.get(key) !== matrix.initial.get(key) && !matrix.protected.has(key));
  }
  function renderTable() {
    const view = ensureView(), content = view.querySelector('.access-matrix-content'), save = view.querySelector('[data-access-matrix-save]');
    if (!content) return;
    if (matrix.loading) content.innerHTML = '<p class="access-matrix-status" role="status">در حال دریافت دسترسی‌ها…</p>';
    else if (matrix.error) content.innerHTML = `<p class="access-matrix-status error" role="alert">${esc(matrix.error)}</p>`;
    else if (!matrix.loaded) content.innerHTML = '<p class="access-matrix-status">برای دریافت دسترسی‌ها، تازه‌سازی کنید.</p>';
    else {
      const query = matrix.search.trim().toLocaleLowerCase('fa');
      const users = matrix.users.filter(user => !query || `${personName(user)} ${user.email || ''}`.toLocaleLowerCase('fa').includes(query));
      const heads = users.map(user => `<th scope="col"><span>${esc(personName(user))}</span><small>${esc(user.email || '')}</small></th>`).join('');
      const body = catalogRows().map(({ group, routes }) => {
        const groupRow = `<tr class="access-matrix-group"><th scope="row">${esc(group.title)}</th><td colspan="${Math.max(1, users.length)}"></td></tr>`;
        const routeRows = routes.map(route => `<tr class="access-matrix-route"><th scope="row"><span>${esc(route.title)}</span></th>${users.map(user => {
          const key = keyOf(route.featureKey, user.id), enabled = matrix.values.get(key) === true, locked = matrix.protected.has(key);
          return `<td><button type="button" class="access-matrix-toggle ${enabled ? 'allowed' : 'denied'}" data-access-feature="${esc(route.featureKey)}" data-access-user="${esc(user.id)}" aria-pressed="${enabled ? 'true' : 'false'}" aria-label="${enabled ? 'برداشتن' : 'دادن'} دسترسی ${esc(personName(user))} به ${esc(route.title)}" ${locked ? 'disabled title="دسترسی محافظت‌شده"' : ''}><span aria-hidden="true">${enabled ? '✓' : '×'}</span></button></td>`;
        }).join('')}</tr>`).join('');
        return groupRow + routeRows;
      }).join('');
      content.innerHTML = users.length ? `<div class="access-matrix-scroll"><table class="access-matrix-table"><thead><tr><th scope="col">کارت و تب</th>${heads}</tr></thead><tbody>${body}</tbody></table></div>` : '<p class="access-matrix-status">فردی با این عبارت پیدا نشد.</p>';
    }
    if (save) save.disabled = matrix.loading || matrix.saving || dirtyKeys().length === 0;
  }
  async function loadMatrix({ force = false } = {}) {
    if (matrix.loading || (matrix.loaded && !force)) { renderTable(); return; }
    if (!canManage()) { syncRouteVisibility(); window.BamcoAccess?.denied?.('settings', 'manage_access', { route: ROUTE }); return; }
    matrix.loading = true; matrix.error = ''; renderTable();
    const token = state().token, snapshots = new Map();
    try {
      await pool(featureKeys(), 5, async featureKey => snapshots.set(featureKey, snapshotParts(await rpc('feature_access_manage_snapshot', { p_feature_key: featureKey }))));
      if (state().token !== token) return;
      const users = new Map();
      snapshots.forEach(snapshot => snapshot.users.filter(user => user?.id && user.active !== false).forEach(user => users.set(String(user.id), user)));
      matrix.users = [...users.values()].sort((a, b) => personName(a).localeCompare(personName(b), 'fa'));
      matrix.values.clear(); matrix.initial.clear(); matrix.protected.clear();
      snapshots.forEach((snapshot, featureKey) => {
        const direct = new Map(snapshot.direct.map(row => [String(row.user_id || row.id), row]));
        const effective = new Map(snapshot.effective.map(row => [String(row.user_id || row.id), row]));
        matrix.users.forEach(user => {
          const id = String(user.id), directGrant = direct.get(id) || {}, grant = effective.get(id) || user.effective_access || user.effective_grant || directGrant;
          const key = keyOf(featureKey, id), protectedGrant = bool(user.protected) || bool(directGrant.protected) || (id === String(state().user?.id) && window.BamcoAccess?.isSystemManager?.() === true);
          const value = protectedGrant || bool(grant.can_view);
          matrix.values.set(key, value); matrix.initial.set(key, value); if (protectedGrant) matrix.protected.add(key);
        });
      });
      matrix.loaded = true;
    } catch (error) {
      matrix.error = error?.message || 'دریافت ماتریس دسترسی انجام نشد.';
    } finally {
      matrix.loading = false; renderTable();
    }
  }
  async function saveMatrix() {
    if (matrix.saving || !canManage()) return;
    const changes = dirtyKeys(), grouped = new Map();
    changes.forEach(key => {
      const separator = key.lastIndexOf(':'), featureKey = key.slice(0, separator), userId = key.slice(separator + 1), enabled = matrix.values.get(key) === true;
      grouped.set(featureKey, [...(grouped.get(featureKey) || []), { user_id: userId, effect: enabled ? 'allow' : 'deny', can_view: enabled, can_create: enabled, can_edit: enabled, can_delete: enabled, can_export: enabled }]);
    });
    if (!grouped.size) return;
    matrix.saving = true; renderTable();
    try {
      await pool([...grouped.entries()], 4, ([featureKey, grants]) => rpc('set_feature_access', { p_feature_key: featureKey, p_grants: grants }));
      await window.BamcoAccess?.refresh?.({ force: true });
      matrix.loaded = false; await loadMatrix({ force: true });
      window.toast?.('ماتریس دسترسی‌ها ذخیره شد.');
    } catch (error) {
      matrix.error = error?.message || 'ذخیره ماتریس دسترسی انجام نشد.';
    } finally {
      matrix.saving = false; renderTable();
    }
  }
  function bind(view) {
    if (view.dataset.accessMatrixBound === '1') return;
    view.dataset.accessMatrixBound = '1';
    view.addEventListener('input', event => {
      if (!event.target.matches('[data-access-matrix-search]')) return;
      matrix.search = event.target.value; renderTable();
      const input = view.querySelector('[data-access-matrix-search]'); if (input) { input.value = matrix.search; input.focus(); }
    });
    view.addEventListener('click', event => {
      if (event.target.closest('[data-access-matrix-refresh]')) return void loadMatrix({ force: true });
      if (event.target.closest('[data-access-matrix-save]')) return void saveMatrix();
      const toggle = event.target.closest('[data-access-feature][data-access-user]'); if (!toggle || toggle.disabled) return;
      const key = keyOf(toggle.dataset.accessFeature, toggle.dataset.accessUser); matrix.values.set(key, matrix.values.get(key) !== true); renderTable();
    });
  }
  function activate() {
    syncRouteVisibility();
    if (!canManage()) { window.BamcoAccess?.denied?.('settings', 'manage_access', { route: ROUTE }); window.bamcoShowHome?.(); return; }
    void loadMatrix();
  }
  function boot() {
    ensureView(); syncRouteVisibility();
    try { window.BamcoNavigation?.registerView?.(ROUTE, { activate }); } catch {}
    window.addEventListener('bamco:feature-access-changed', () => { queueMicrotask(syncRouteVisibility); if (!matrix.saving && state().view === ROUTE) { matrix.loaded = false; void loadMatrix({ force: true }); } });
    window.bamcoAccessMatrix = Object.freeze({ load: () => loadMatrix({ force: true }), state: matrix });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();

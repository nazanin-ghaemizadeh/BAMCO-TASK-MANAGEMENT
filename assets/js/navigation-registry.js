/*
 * Canonical navigation and feature-authorization registry.
 *
 * A route is never authorized by a CSS class or a page-specific manager check:
 * it resolves to exactly one feature key here, then BamcoAccess evaluates the
 * effective grants returned by the server. The database remains authoritative;
 * this service keeps navigation, route guards and action controls coherent.
 */
(() => {
  'use strict';
  if (window.BamcoNavigationCatalog) return;

  const groups = Object.freeze([
    { key: 'people', title: 'مدیریت افراد', icon: '♙', routes: ['people', 'accessMatrix', 'organization', 'activeSessions', 'loginActivity'] },
    { key: 'messages', title: 'مدیریت پیام', icon: '✉', routes: ['messages', 'messageCenter', 'sentMessages', 'responseTracking', 'templates', 'stickers'] },
    { key: 'reports', title: 'گزارش‌ها', icon: '▦', routes: ['dashboard', 'performanceReport', 'responseReport'] },
    { key: 'configuration', title: 'تنظیمات', icon: '⚙', routes: ['systemOptions', 'settings', 'alertSettings', 'emailSettings'] },
    { key: 'tasks', title: 'مدیریت وظایف', icon: '☑', routes: ['kanban', 'archive', 'taskTimeline', 'projects', 'approvals', 'requestHistory'] },
    { key: 'delivery', title: 'مدیریت مالی', icon: '▰', routes: ['pettyCash', 'invoices'] },
    { key: 'vehicle', title: 'مدیریت منابع', icon: '◇', routes: ['vehiclePermanent', 'vehicleTemporary', 'parts', 'tools'] },
    { key: 'conversations', title: 'گفتگوها', icon: '☵', routes: ['groupChat', 'directMessages', 'taskChats'] },
    { key: 'resources', title: 'منابع', icon: '▧', routes: ['documents', 'sitesAccess', 'lettersIncoming', 'lettersOutgoing', 'userGuide'] },
    { key: 'personal', title: 'همراه هوشمند', icon: '✦', routes: ['notes', 'voiceAssistant'] }
  ]);

  // The access matrix mirrors the grantable cards/tabs shown on the application
  // home screen. The access editor itself remains admin-only and is deliberately
  // not a grantable row; legacy/internal routes stay registered for direct-route
  // compatibility without leaking into the user-facing matrix.
  const accessMatrixRoutes = Object.freeze([
    'people', 'organization', 'activeSessions', 'loginActivity',
    'messages', 'messageCenter', 'sentMessages', 'responseTracking', 'stickers',
    'dashboard', 'performanceReport', 'responseReport',
    'systemOptions', 'settings',
    'kanban', 'archive', 'taskTimeline', 'projects', 'approvals', 'requestHistory',
    'pettyCash', 'invoices',
    'vehiclePermanent', 'vehicleTemporary', 'parts', 'tools',
    'groupChat', 'directMessages', 'taskChats',
    'documents', 'sitesAccess', 'lettersIncoming', 'lettersOutgoing', 'userGuide'
  ]);

  // A few legacy route names deliberately share a feature. Every visible
  // application view still has an explicit record, so direct navigation cannot
  // bypass the access service by using an alias.
  const routeDefinitions = Object.freeze([
    ['people', 'people', 'افراد و نقش‌ها'],
    ['accessMatrix', 'people', 'دسترسی‌ها'],
    ['organization', 'organization', 'ساختار سازمانی'],
    ['activeSessions', 'activeSessions', 'نشست‌های فعال'],
    ['loginActivity', 'loginActivity', 'ورود و خروج'],
    ['messages', 'messages', 'پیام‌ها'],
    ['messageCenter', 'messageCenter', 'ارسال پیام'],
    ['sentMessages', 'sentMessages', 'پیام‌های ارسال‌شده'],
    ['responseTracking', 'responseTracking', 'پیگیری پاسخ'],
    ['templates', 'templates', 'قالب‌ها'],
    ['stickers', 'stickers', 'مدیریت استیکرها'],
    ['dashboard', 'dashboard', 'داشبورد'],
    ['performanceReport', 'performanceReport', 'گزارش عملکرد'],
    ['responseReport', 'responseReport', 'گزارش پاسخ‌ها'],
    ['pettyCash', 'pettyCash', 'گزارش تنخواه'],
    ['invoices', 'invoices', 'صورتحساب‌ها و تعهدات مالی'],
    ['systemOptions', 'systemOptions', 'وضعیت‌ها و اولویت‌ها'],
    ['settings', 'settings', 'تنظیمات کاربری'],
    ['alertSettings', 'settings', 'تنظیمات هشدار'],
    ['emailSettings', 'settings', 'تنظیمات پست الکترونیک'],
    ['kanban', 'kanban', 'کانبان'],
    ['archive', 'archive', 'آرشیو'],
    ['taskTimeline', 'taskTimeline', 'تقویم و گانت'],
    ['approvals', 'approvals', 'تأیید درخواست‌ها'],
    ['requestHistory', 'requestHistory', 'سوابق درخواست‌ها'],
    ['projects', 'projects', 'پروژه‌ها'],
    ['vehiclePermanent', 'vehiclePermanent', 'تحویل دائم خودرو'],
    ['vehicleTemporary', 'vehicleTemporary', 'تحویل موقت خودرو'],
    ['parts', 'parts', 'مدیریت قطعات'],
    ['tools', 'tools', 'مدیریت ابزار'],
    ['groupChat', 'groupChat', 'گفت‌وگوی عمومی و گروه‌ها'],
    ['directMessages', 'directMessages', 'گفت‌وگوی خصوصی'],
    ['taskChats', 'taskChats', 'گفت‌وگوی مرتبط با وظیفه'],
    ['documents', 'documents', 'فرم‌ها و مستندات'],
    ['sitesAccess', 'sitesAccess', 'سایت‌ها و دسترسی‌ها'],
    ['lettersIncoming', 'letters', 'نامه‌های ورودی'],
    ['lettersOutgoing', 'letters', 'نامه‌های خروجی'],
    ['userGuide', 'userGuide', 'راهنمای استفاده سامانه'],
    ['notes', 'notes', 'یادداشت‌ها'],
    ['voiceAssistant', 'voiceAssistant', 'دستیار صوتی هوشمند']
  ].map(([route, featureKey, title]) => Object.freeze({ route, featureKey, title, groupKey: null })));

  const byKey = Object.freeze(Object.fromEntries(groups.map(group => [group.key, group])));
  const routeGroup = Object.freeze(Object.fromEntries(groups.flatMap(group => group.routes.map(route => [route, group.key]))));
  const byRoute = Object.freeze(Object.fromEntries(routeDefinitions.map(route => [route.route, Object.freeze({ ...route, groupKey: routeGroup[route.route] || null })])));
  const featureRoutes = Object.freeze(Object.keys(byRoute).reduce((map, route) => {
    const featureKey = byRoute[route].featureKey;
    (map[featureKey] || (map[featureKey] = [])).push(route);
    return map;
  }, {}));
  const standaloneLayoutRoutes = Object.freeze(new Set(['projects', 'parts', 'invoices', 'organization', 'tools', 'accessMatrix']));
  // Standalone layouts own their toolbar. The interior reconciler still
  // guarantees a native return control inside those toolbars.
  const noHomeReturnRoutes = new Set(['projects', 'invoices']);

  const catalog = Object.freeze({
    groups, byKey, routeGroup, byRoute, featureRoutes, accessMatrixRoutes, standaloneLayoutRoutes, noHomeReturnRoutes,
    routeFor: route => byRoute[String(route || '')] || null,
    featureForRoute: route => byRoute[String(route || '')]?.featureKey || null,
    routesForFeature: featureKey => [...(featureRoutes[String(featureKey || '')] || [])],
    featureTitle: featureKey => {
      const route = Object.values(byRoute).find(item => item.featureKey === String(featureKey || ''));
      return route?.title || String(featureKey || '');
    }
  });
  window.BamcoNavigationCatalog = catalog;

  const ACTION_FIELD = Object.freeze({
    view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete',
    export: 'can_export', manage: 'can_manage_access', manage_access: 'can_manage_access',
    bypass_approval: 'can_bypass_approval'
  });
  const SAFE_WHEN_UNAVAILABLE = new Set(['settings']);
  const PERSONAL_FEATURES = new Set(['notes', 'voiceAssistant']);
  let grants = new Map();
  let loaded = false;
  let loading = null;
  let unavailable = false;
  let lastError = null;
  let loadingIdentity = null;
  let deniedAt = '';

  const state = () => window.Bamco?.state || window.state || {};
  const actor = () => state().user?.id || state().profile?.id || null;
  const identity = () => `${actor() || ''}:${state().token || ''}`;
  const systemManager = () => {
    const profile = state().profile;
    return !!profile && profile.active !== false && (profile.system_access === true || profile.role === 'manager');
  };
  const asBoolean = value => value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
  const emptyGrant = () => ({ can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false, can_manage_access: false, can_bypass_approval: false });
  const normalizeGrant = row => {
    const grant = emptyGrant();
    for (const field of Object.values(ACTION_FIELD)) grant[field] = asBoolean(row?.[field]);
    // Some RPC clients expose bare action names in JSON objects. Supporting
    // them here keeps the UI tolerant while the database contract stays named.
    for (const [action, field] of Object.entries(ACTION_FIELD)) if (!grant[field] && asBoolean(row?.[action])) grant[field] = true;
    grant.feature_key = String(row?.feature_key || row?.featureKey || '');
    grant.effect = String(row?.effect || 'allow').toLowerCase();
    return grant;
  };
  const rpc = (name, body = {}) => {
    const call = window.BamcoData?.rpc || window.rpc;
    if (typeof call !== 'function') return Promise.reject(new Error('سرویس دسترسی هنوز آماده نیست.'));
    return call(name, body);
  };
  const dispatch = (name, detail = {}) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
    try { document.dispatchEvent(new CustomEvent(`bamco:${name}`, { detail })); } catch {}
  };
  const grantRowsFrom = payload => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { rows: [], structured: false };
    const rows = payload.grants;
    return {
      rows: Array.isArray(rows) ? rows : [],
      structured: payload.schema === 'bamco.feature-access.v1' && Array.isArray(rows)
    };
  };
  function storeRows(rows) {
    grants = new Map();
    for (const row of rows || []) {
      const grant = normalizeGrant(row);
      if (grant.feature_key) grants.set(grant.feature_key, grant);
    }
  }
  function actionField(action) { return ACTION_FIELD[String(action || 'view')] || ACTION_FIELD.view; }
  function can(featureKey, action = 'view') {
    const feature = String(featureKey || '');
    if (!feature) return false;
    if (systemManager()) return true;
    if (!state().token) return false;
    if (PERSONAL_FEATURES.has(feature)) return true;
    if (!loaded) return false;
    if (unavailable && SAFE_WHEN_UNAVAILABLE.has(feature) && action === 'view') return true;
    return grants.get(feature)?.[actionField(action)] === true;
  }
  const LOCAL_MANAGE_CONTROL_SELECTOR = '.vehicle-access-button,[data-feature-access-control="local"]';
  let manageControlQueued = false;

  function retireManageControl(button) {
    if (!button) return;
    button.classList.add('ghost', 'feature-access-control');
    button.classList.add('hidden');
    button.disabled = true;
    button.setAttribute('aria-hidden', 'true');
  }

  function syncManageControl() {
    if (!document?.querySelector) return;
    document.querySelectorAll(LOCAL_MANAGE_CONTROL_SELECTOR).forEach(retireManageControl);
    document.getElementById('featureAccessControl')?.remove();
  }
  function scheduleManageControl() {
    if (manageControlQueued) return;
    manageControlQueued = true;
    queueMicrotask(() => {
      manageControlQueued = false;
      syncManageControl();
    });
  }
  function applyNavigation() {
    if (!loaded || !document?.querySelectorAll) return;
    document.querySelectorAll('#nav button[data-view]').forEach(button => {
      const feature = catalog.featureForRoute(button.dataset.view);
      if (!feature) return;
      const allowed = can(feature, 'view');
      button.classList.toggle('hidden', !allowed);
      // Remove unavailable routes from layout instead of leaving blank cards.
      button.hidden = !allowed;
      button.disabled = !allowed;
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      button.setAttribute('aria-disabled', allowed ? 'false' : 'true');
      button.dataset.featureKey = feature;
      button.dataset.bamcoFeatureAllowed = allowed ? 'true' : 'false';
    });
    document.querySelectorAll('[data-feature-key][data-feature-action]').forEach(node => {
      const allowed = can(node.dataset.featureKey, node.dataset.featureAction || 'view');
      // Authorization and navigation are separate concerns. Never remove a
      // route/control's own `hidden` state merely because access is granted:
      // navigation and feature renderers remain the only owners of visibility.
      node.dataset.bamcoFeatureAllowed = allowed ? 'true' : 'false';
      if (allowed) node.removeAttribute('data-bamco-access-denied');
      else node.setAttribute('data-bamco-access-denied', 'true');
      if ('disabled' in node && !allowed) node.disabled = true;
      if (node.classList.contains('view')) {
        if (!allowed) node.setAttribute('aria-hidden', 'true');
        else node.removeAttribute('aria-hidden');
      } else {
        node.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      }
    });
    const current = state().view;
    const feature = catalog.featureForRoute(current);
    if (feature && !can(feature, 'view')) {
      // A background access refresh is not a user navigation attempt. Return
      // to the card home silently so focus/realtime refreshes cannot spam the
      // user with repeated "access is not active" notifications.
      document.getElementById(`${current}View`)?.classList.add('hidden');
      if (typeof window.bamcoShowHome === 'function') window.bamcoShowHome();
      else if (current !== 'settings' && can('settings', 'view')) window.BamcoNavigation?.navigate?.('settings');
    }
    syncManageControl();
  }
  function denied(featureKey, action = 'view', detail = {}) {
    const key = `${featureKey}:${action}`;
    if (deniedAt === key) return false;
    deniedAt = key;
    const title = catalog.featureTitle(featureKey);
    const text = action === 'view' ? `دسترسی شما به «${title}» فعال نیست.` : `اجازهٔ انجام این عملیات در «${title}» را ندارید.`;
    try { window.toast?.(text, true); } catch {}
    dispatch('bamco:feature-access-denied', { featureKey, action, ...detail });
    const current = state().view;
    if (detail.revoked || detail.route === current) {
      const view = document.getElementById(`${current}View`);
      view?.classList.add('hidden');
      if (typeof window.bamcoShowHome === 'function') window.bamcoShowHome();
      else if (current !== 'settings' && can('settings', 'view')) window.BamcoNavigation?.navigate?.('settings');
    }
    setTimeout(() => { if (deniedAt === key) deniedAt = ''; }, 400);
    return false;
  }
  async function refresh({ force = false } = {}) {
    const currentIdentity = identity();
    if (!currentIdentity || currentIdentity === ':') { clear(); return snapshot(); }
    if (loading && !force && loadingIdentity === currentIdentity) return loading;
    loadingIdentity = currentIdentity;
    const job = (async () => {
      let rows = [], source = 'server';
      try {
        const payload = await rpc('effective_feature_access', {});
        const result = grantRowsFrom(payload);
        if (!result.structured) throw new Error('پاسخ سرویس دسترسی معتبر نیست.');
        rows = result.rows;
        if (identity() !== currentIdentity) return snapshot();
        storeRows(rows); unavailable = false; lastError = null; loaded = true;
      } catch (error) {
        if (identity() !== currentIdentity) return snapshot();
        // There is no legacy per-feature fallback: a failed or malformed
        // canonical response is fail-closed. Settings remains available so a
        // signed-in user can recover their session or contact an administrator.
        storeRows([]); unavailable = true; lastError = error; loaded = true; source = 'unavailable';
      }
      applyNavigation();
      const detail = { ...snapshot(), source };
      dispatch('bamco:feature-access-changed', detail);
      // Existing integrations listen to this event. Keeping it as an alias
      // avoids a second authority path while clients transition to the named
      // feature event.
      try { window.dispatchEvent(new Event('bamco-access-changed')); } catch {}
      return detail;
    })();
    loading = job;
    try { return await job; }
    finally { if (loading === job) { loading = null; loadingIdentity = null; } }
  }
  function clear() {
    grants = new Map(); loaded = false; unavailable = false; lastError = null; loading = null; loadingIdentity = null;
  }
  function invalidate() { return refresh({ force: true }); }
  function snapshot() {
    return Object.freeze({
      loaded, unavailable, error: lastError?.message || null,
      grants: Object.freeze([...grants.values()].map(grant => Object.freeze({ ...grant })))
    });
  }

  window.BamcoAccess = Object.freeze({
    refresh, invalidate, clear, snapshot, can, denied, applyNavigation,
    isReady: () => loaded,
    isSystemManager: systemManager,
    featureTitle: catalog.featureTitle,
    routeFeature: catalog.featureForRoute
  });
  window.Bamco?.lifecycle?.on?.('navigation-after', scheduleManageControl);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleManageControl, { once: true });
  else scheduleManageControl();
  // A number of feature pages redraw their native toolbar after navigation.
  // Retire any local access shortcut introduced by those redraws; access is
  // managed exclusively from the administrator access matrix.
  if (document.body && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => scheduleManageControl())
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(records => {
      const route = state().view;
      const view = route && route !== 'home' ? document.getElementById(`${route}View`) : null;
      if (!view) return;
      const relevant = node => node?.nodeType === 1 && (
        node.id === 'featureAccessControl'
        || node.matches?.(LOCAL_MANAGE_CONTROL_SELECTOR)
        || node.querySelector?.('#featureAccessControl')
        || node.querySelector?.(LOCAL_MANAGE_CONTROL_SELECTOR)
      );
      if (records.some(record => view.contains(record.target)
        && ([...record.addedNodes, ...record.removedNodes].some(relevant)))) {
        scheduleManageControl();
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  // Realtime invalidation is the primary path. Focus is deliberately only a
  // lightweight recovery path for a suspended tab, never a timed poll.
  window.addEventListener('bamco:feature-access-invalidated', () => { if (state().token) void invalidate(); });
  // profile-runtime emits canonical realtime changes on `document`.  Access
  // grants are RLS-filtered to the affected recipient, so this is the point
  // where that recipient must refresh their effective feature list.  Without
  // this bridge a saved grant reaches the database but an already-open portal
  // keeps its old navigation until the next focus or login.
  document.addEventListener('bamco:domain-invalidated', event => {
    if (event.detail?.domain === 'access' && state().token) void invalidate();
  });
  window.addEventListener('focus', () => { if (state().token) void refresh(); });
})();

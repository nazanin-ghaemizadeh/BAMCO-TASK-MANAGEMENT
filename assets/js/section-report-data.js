/* Independent read-only report collections. Never populate the task/workflow stores. */
(() => {
  'use strict';
  const root = globalThis;
  const routes = Object.freeze({ taskTimeline: 'task_timeline_report_feed', performanceReport: 'performance_report_feed' });
  const entries = new Map();
  let generation = 0;
  const app = () => root.Bamco?.state || root.state || (typeof state !== 'undefined' ? state : {});
  const identity = () => { const s = app(); return `${s.user?.id || ''}:${s.token || ''}`; };
  const allowed = feature => { const s = app(); return !!s.user?.id && !!s.token && s.profile?.active !== false && root.BamcoAccess?.can?.(feature, 'view') === true; };
  function clear(feature) { if (feature) entries.delete(feature); else { ++generation; entries.clear(); } }
  function peek(feature) {
    const entry = entries.get(feature);
    if (!allowed(feature) || entry?.identity !== identity()) { entries.delete(feature); return null; }
    return entry?.data || null;
  }
  async function load(feature, { force = false } = {}) {
    if (!Object.hasOwn(routes, feature)) throw Error('گزارش نامعتبر است.');
    if (!root.BamcoAccess?.isReady?.()) await root.BamcoAccess?.refresh?.();
    if (!allowed(feature)) { clear(feature); throw Error('دسترسی شما به این گزارش فعال نیست.'); }
    const session = identity(), existing = entries.get(feature);
    if (!force && existing?.identity === session) { if (existing.pending) return existing.pending; if (existing.data) return existing.data; }
    const epoch = generation, entry = { identity: session, data: null, pending: null };
    entries.set(feature, entry);
    entry.pending = (async () => {
      const call = root.BamcoData?.rpc || root.rpc;
      if (typeof call !== 'function') throw Error('سرویس گزارش آماده نیست.');
      const data = await call(routes[feature], {});
      if (identity() !== session || epoch !== generation || entries.get(feature) !== entry || !allowed(feature)) throw Error('نشست یا دسترسی گزارش تغییر کرده است.');
      if (!data || data.schema !== 'bamco.section-report.v1' || data.feature !== feature || !Array.isArray(data.tasks) || !Array.isArray(data.definition_events) || !Array.isArray(data.profiles)) throw Error('پاسخ سرویس گزارش معتبر نیست.');
      entry.data = data;
      return data;
    })();
    try { return await entry.pending; } catch (error) { if (entries.get(feature) === entry) entries.delete(feature); throw error; }
    finally { entry.pending = null; }
  }
  root.BamcoSectionReports = Object.freeze({ load, peek, clear, allowed, identity });
  root.addEventListener('bamco:feature-access-changed', () => { clear(); root.dispatchEvent(new Event('bamco:report-feed-cleared')); });
  document.addEventListener('bamco:profiles-updated', () => { clear(); root.dispatchEvent(new Event('bamco:report-feed-cleared')); });
  document.addEventListener('bamco:domain-invalidated', event => {
    if (['tasks', 'workflow', 'profiles', 'access'].includes(String(event.detail?.domain || event.detail?.table || '').toLowerCase())) {
      clear(); root.dispatchEvent(new Event('bamco:report-feed-cleared'));
    }
  });
})();

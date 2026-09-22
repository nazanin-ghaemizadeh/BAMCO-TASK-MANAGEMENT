/* Central workbench presentation for the organization-based Approval Engine. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, fa, notify } = E;
  let filter = 'action', pending = null;
  const route = id => (state.requestRoutes || []).find(item => String(item.request_id) === String(id));
  const allRows = () => [...(state.requests || []), ...(state.requestHistory || [])]
    .filter((item, index, rows) => rows.findIndex(row => String(row.id) === String(item.id)) === index);

  function renderSummary() {
    const host = q('#workbenchSummary'); if (!host) return;
    const current = state.requests || [], history = state.requestHistory || [];
    const values = [
      ['اقدام من', current.filter(row => route(row.id)?.actionable === true).length],
      ['درخواست‌های من', allRows().filter(row => String(row.requested_by) === String(state.user?.id)).length],
      ['نیازمند اصلاح', current.filter(row => row.request_status === 'needs_revision' && String(row.requested_by) === String(state.user?.id)).length],
      ['تأییدشده', history.filter(row => row.request_status === 'approved').length]
    ];
    host.innerHTML = values.map(([title, value]) => `<div><b>${fa(value)}</b><span>${title}</span></div>`).join('');
  }
  function sync() {
    if (!q('#approvalsView')) return;
    renderSummary(); q('#approvalsView').classList.toggle('workbench-ready', true);
  }
  async function refreshWorkbench({quiet = false} = {}) {
    if (!state?.token || !state?.profile || pending) return pending;
    const actor = state.user?.id, token = state.token;
    pending = (async () => {
      const workflow = await window.bamcoLoadRequestWorkflow();
      if (actor !== state.user?.id || token !== state.token) return;
      state.requests = workflow.requests;
      state.requestHistory = workflow.history;
      state.requestRoutes = workflow.routes;
      state.definitionRequests = [...workflow.requests, ...workflow.history];
      window.renderRequests?.(); window.renderRequestHistory?.();
      if (state.view === 'dashboard') window.renderDashboard?.();
    })();
    try { await pending; }
    catch (error) { if (!quiet) notify(error.message, true); throw error; }
    finally { pending = null; }
  }
  function relevantInvalidation(detail = {}) {
    const values = Array.isArray(detail.domains) ? detail.domains : [detail.domain, detail.table, detail.entity_type, detail.entityType];
    return values.some(value => /^(workflow|change_requests|organization_workflows|organization_workflow_steps|workflow_steps|notifications)$/i.test(String(value || '')));
  }
  function boot() {
    document.addEventListener('click', event => {
      const tab = event.target.closest('[data-workbench-filter]');
      if (tab) {
        filter = tab.dataset.workbenchFilter;
        qaTabs().forEach(item => item.classList.toggle('active', item === tab));
        window.renderRequests?.();
      }
      if (event.target.closest('#refreshWorkbench')) void refreshWorkbench();
    });
    if (typeof BamcoNavigation !== 'undefined') BamcoNavigation.on('navigation-after', detail => {
      if (detail.to === 'approvals' || detail.to === 'requestHistory') void refreshWorkbench({quiet: true});
    });
    document.addEventListener('bamco:domain-invalidated', event => {
      if (relevantInvalidation(event.detail)) void refreshWorkbench({quiet: true});
    });
    document.addEventListener('bamco:profiles-updated', () => {
      window.renderRequests?.(); window.renderRequestHistory?.();
    });
    window.addEventListener('focus', () => {
      if (!document.hidden && ['approvals', 'requestHistory'].includes(state?.view)) void refreshWorkbench({quiet: true});
    });
  }
  const qaTabs = () => [...document.querySelectorAll('[data-workbench-filter]')];
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true}); else boot();
  window.bamcoApprovalCenter = {sync, filter: () => filter, refresh: refreshWorkbench, state: () => ({filter})};
  // Transitional event-hook alias only.  It forwards to the single canonical
  // snapshot loader above; it does not restore the old polling/data path.
  window.bamcoRequestSync = Object.freeze({refresh: () => refreshWorkbench()});
})();

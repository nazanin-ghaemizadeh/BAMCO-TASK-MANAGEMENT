/* Central workbench presentation for the organization-based Approval Engine. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, fa, notify } = E;
  let pending = null;
  function sync() {
    if (!q('#approvalsView')) return;
    q('#approvalsView').classList.toggle('workbench-ready', true);
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true}); else boot();
  window.bamcoApprovalCenter = {sync, refresh: refreshWorkbench, state: () => ({})};
  // Transitional event-hook alias only.  It forwards to the single canonical
  // snapshot loader above; it does not restore the old polling/data path.
  window.bamcoRequestSync = Object.freeze({refresh: () => refreshWorkbench()});
})();

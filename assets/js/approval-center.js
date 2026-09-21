/* Central workbench presentation for the organization-based Approval Engine. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise; if (!E) return;
  const { q, fa, notify } = E;
  let filter = 'action';
  const route = id => (state.requestRoutes || []).find(item => String(item.request_id) === String(id));
  const allRows = () => [...(state.requests || []), ...(state.requestHistory || [])].filter((item, index, rows) => rows.findIndex(row => String(row.id) === String(item.id)) === index);
  function renderSummary() { const host = q('#workbenchSummary'); if (!host) return; const current = state.requests || [], history = state.requestHistory || []; const values = [['اقدام من', current.filter(row => route(row.id)?.actionable).length], ['درخواست‌های من', allRows().filter(row => String(row.requested_by) === String(state.user?.id)).length], ['نیازمند اصلاح', current.filter(row => row.request_status === 'needs_revision' && String(row.requested_by) === String(state.user?.id)).length], ['تأییدشده', history.filter(row => row.request_status === 'approved').length]]; host.innerHTML = values.map(([title, value]) => `<div><b>${fa(value)}</b><span>${title}</span></div>`).join(''); }
  function sync() { if (!q('#approvalsView')) return; renderSummary(); q('#approvalsView').classList.toggle('workbench-ready', true); }
  function boot() { document.addEventListener('click', event => { const tab = event.target.closest('[data-workbench-filter]'); if (tab) { filter = tab.dataset.workbenchFilter; qaTabs().forEach(item => item.classList.toggle('active', item === tab)); window.renderRequests?.(); } if (event.target.closest('#refreshWorkbench')) { Promise.resolve(window.refresh?.()).catch(error => notify(error.message, true)); } }); if (typeof BamcoNavigation !== 'undefined') BamcoNavigation.on('navigation-after', detail => { if (detail.to === 'approvals') sync(); }); }
  const qaTabs = () => [...document.querySelectorAll('[data-workbench-filter]')];
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoApprovalCenter = { sync, filter: () => filter, state: () => ({ filter }) };
})();

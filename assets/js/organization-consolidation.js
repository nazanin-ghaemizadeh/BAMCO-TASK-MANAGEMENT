/* Keep people, access and organization structure as the single administration surface. */
(() => {
  'use strict';
  const LEGACY_ROUTE = 'organizationAdmin';
  let observer = null;
  let returningHome = false;

  function removeLegacyOrganizationAdmin() {
    document.querySelectorAll(`#nav [data-view="${LEGACY_ROUTE}"]`).forEach(node => node.remove());
    document.getElementById(`${LEGACY_ROUTE}View`)?.remove();
    document.getElementById('orgAdminDialog')?.remove();

    const current = window.Bamco?.state?.view || window.state?.view;
    if (current === LEGACY_ROUTE && !returningHome) {
      returningHome = true;
      queueMicrotask(() => {
        try {
          if (typeof window.bamcoShowHome === 'function') window.bamcoShowHome();
          else window.BamcoNavigation?.navigate?.('people');
        } finally {
          returningHome = false;
        }
      });
    }
  }

  removeLegacyOrganizationAdmin();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', removeLegacyOrganizationAdmin, { once: true });
  }
  const root = document.getElementById('appView') || document.body;
  if (root && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(removeLegacyOrganizationAdmin);
    observer.observe(root, { childList: true, subtree: true });
  }
  window.addEventListener('bamco:feature-access-changed', removeLegacyOrganizationAdmin);
  window.addEventListener('bamco:navigation-after', removeLegacyOrganizationAdmin);
  window.Bamco?.lifecycle?.on?.('navigation-after', removeLegacyOrganizationAdmin);
  window.BamcoOrganizationConsolidation = Object.freeze({
    removeLegacy: removeLegacyOrganizationAdmin,
    dispose: () => observer?.disconnect()
  });
})();

(() => {
  'use strict';
  const q = (s, r = document) => r?.querySelector(s);
  const qa = (s, r = document) => [...(r?.querySelectorAll(s) || [])];
  const openSites = new Set(), openCategories = new Set();
  let categoryMap = new Map(), timer = 0;

  function disclosure(kind, id, open) {
    return `<button type="button" class="feature-disclosure" data-${kind}-toggle="${id}" aria-expanded="${open}" aria-label="${open ? 'بستن' : 'باز کردن'}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.5 7.5 4.5 4.5 4.5-4.5"/></svg></button>`;
  }
  function enhanceSites() {
    qa('#sitesFeatureBody .feature-site-card').forEach(card => {
      const id = card.dataset.siteId, head = q('.feature-site-head', card), open = openSites.has(id);
      if (!head) return;
      if (!q('[data-site-toggle]', head)) head.insertAdjacentHTML('afterbegin', disclosure('site', id, open));
      card.classList.toggle('feature-collapsed', !open);
      q('[data-site-toggle]', head)?.setAttribute('aria-expanded', String(open));
    });
  }
  function depth(id, seen = new Set()) {
    const row = categoryMap.get(String(id));
    if (!row?.parent_id || seen.has(String(id))) return 0;
    seen.add(String(id));
    return 1 + depth(row.parent_id, seen);
  }
  function orderCategoryCards() {
    const host = q('#documentsFeatureBody');
    if (!host) return;
    const cards = new Map(qa(':scope > .feature-category', host).map(card => [String(card.dataset.categoryId), card]));
    if (!cards.size) return;
    const children = new Map();
    for (const [id, row] of categoryMap) {
      const parent = row.parent_id && cards.has(String(row.parent_id)) ? String(row.parent_id) : '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(id);
    }
    const ordered = [], seen = new Set();
    const visit = id => {
      if (seen.has(id) || !cards.has(id)) return;
      seen.add(id); ordered.push(cards.get(id));
      (children.get(id) || []).forEach(visit);
    };
    (children.get('') || []).forEach(visit);
    cards.forEach((_, id) => visit(id));
    const current = qa(':scope > .feature-category', host);
    if (ordered.some((card, index) => current[index] !== card)) ordered.forEach(card => host.append(card));
  }
  function enhanceCategories() {
    orderCategoryCards();
    qa('#documentsFeatureBody .feature-category').forEach(card => {
      const id = card.dataset.categoryId, head = q(':scope > header', card), open = openCategories.has(id);
      if (!head) return;
      if (!q('[data-category-toggle]', head)) head.insertAdjacentHTML('afterbegin', disclosure('category', id, open));
      const actions = q('.feature-row-actions', head);
      if (!q('[data-add-subcategory]', head) && state?.profile?.role === 'manager') actions?.insertAdjacentHTML('afterbegin', `<button class="ghost" data-add-subcategory="${id}">زیر‌دسته جدید</button>`);
      card.classList.toggle('feature-collapsed', !open);
      card.style.setProperty('--category-depth', String(depth(id)));
      q('[data-category-toggle]', head)?.setAttribute('aria-expanded', String(open));
    });
  }
  async function refreshCategoryMap() {
    try {
      const rows = await selectAll('document_categories', 'select=id,parent_id,title&order=sort_order.asc,id.asc');
      categoryMap = new Map(rows.map(row => [String(row.id), row]));
      enhanceCategories();
    } catch {}
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { enhanceSites(); enhanceCategories(); }, 20);
  }
  function ensureCategoryParent() {
    const form = q('#docCategoryForm');
    if (!form || form.elements.parent_id) return;
    const label = document.createElement('label');
    label.className = 'category-parent-field';
    label.innerHTML = 'دسته مادر<select name="parent_id"><option value="">بدون دسته مادر</option></select>';
    const labels = qa(':scope > label', form);
    (labels[0] || q('.modal-head', form)).after(label);
  }
  function populateParent(selected = '') {
    ensureCategoryParent();
    const form = q('#docCategoryForm'), current = form.elements.id.value, select = form.elements.parent_id;
    select.innerHTML = '<option value="">بدون دسته مادر</option>' + [...categoryMap.values()]
      .filter(category => String(category.id) !== String(current))
      .map(category => `<option value="${category.id}">${'— '.repeat(depth(category.id))}${String(category.title).replace(/[&<>"']/g, '')}</option>`).join('');
    select.value = String(selected || '');
  }
  async function saveCategory(event) {
    const form = event.target;
    if (form.id !== 'docCategoryForm') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = q('[type=submit]', form), id = form.elements.id.value;
    const payload = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim() || null, parent_id: form.elements.parent_id.value ? Number(form.elements.parent_id.value) : null };
    if (!payload.title) return;
    button.disabled = true;
    try {
      if (id) await update('document_categories', `id=eq.${encodeURIComponent(id)}`, payload);
      else await insert('document_categories', { ...payload, sort_order: categoryMap.size, created_by: state.user.id });
      q('#docCategoryDialog').close(); toast('دسته‌بندی ذخیره شد.'); q('#documentsRefresh')?.click();
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }
  function openCashDashboard() {
    let dialog = q('#cashDashboardDialog');
    if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'cashDashboardDialog'; dialog.className = 'modal cash-dashboard-dialog'; document.body.append(dialog); }
    const source = q('#pettyCashSummary');
    dialog.innerHTML = `<div class="modal-head"><div><h3>داشبورد تنخواه</h3><p>خلاصه لحظه‌ای رویدادهای مالی</p></div><button type="button" data-close>×</button></div><div class="cash-summary">${source?.innerHTML || ''}</div><div class="modal-actions"><button class="primary" data-close>بستن</button></div>`;
    qa('[data-close]', dialog).forEach(button => button.onclick = () => dialog.close()); dialog.showModal();
  }
  document.addEventListener('click', event => {
    const site = event.target.closest('[data-site-toggle]');
    if (site) { event.preventDefault(); event.stopPropagation(); const id = site.dataset.siteToggle; openSites.has(id) ? openSites.delete(id) : openSites.add(id); enhanceSites(); return; }
    const category = event.target.closest('[data-category-toggle]');
    if (category) { event.preventDefault(); event.stopPropagation(); const id = category.dataset.categoryToggle; openCategories.has(id) ? openCategories.delete(id) : openCategories.add(id); enhanceCategories(); return; }
    const add = event.target.closest('[data-add-subcategory]');
    if (add) { event.preventDefault(); q('#addDocumentCategory')?.click(); setTimeout(() => populateParent(add.dataset.addSubcategory), 0); return; }
    if (event.target.closest('#cashDashboardToggle')) { event.preventDefault(); event.stopImmediatePropagation(); openCashDashboard(); }
  }, true);
  document.addEventListener('submit', saveCategory, true);
  new MutationObserver(records => {
    if (records.some(record => record.target.id === 'docCategoryDialog' && record.attributeName === 'open')) {
      const form = q('#docCategoryForm'), row = categoryMap.get(String(form?.elements?.id?.value || ''));
      populateParent(row?.parent_id || '');
    }
    schedule();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  const documents = q('#documentsFeatureBody'), sites = q('#sitesFeatureBody');
  if (documents) new MutationObserver(schedule).observe(documents, { childList: true, subtree: true });
  if (sites) new MutationObserver(schedule).observe(sites, { childList: true, subtree: true });
  q('#documentsRefresh')?.addEventListener('click', () => setTimeout(refreshCategoryMap, 50));
  window.addEventListener('focus', refreshCategoryMap);
  refreshCategoryMap(); schedule();
})();

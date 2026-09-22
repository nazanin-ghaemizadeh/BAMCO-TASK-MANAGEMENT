(() => {
  'use strict';
  const q = (s, r = document) => r?.querySelector(s);
  const qa = (s, r = document) => [...(r?.querySelectorAll(s) || [])];
  const canDocuments = (action = 'view') => window.BamcoAccess?.can?.('documents', action) === true;
  const denyDocuments = (action = 'view') => window.BamcoAccess?.denied?.('documents', action);
  const requireDocuments = (action = 'view') => {
    if (canDocuments(action)) return true;
    denyDocuments(action);
    return false;
  };
  const openSites = new Set(), openCategories = new Set();
  let categoryMap = new Map(), frame = 0, inboxFrame = 0;

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
      const actions = q('.feature-row-actions', head), addButton = q('[data-add-subcategory]', head);
      if (canDocuments('create')) {
        if (!addButton) actions?.insertAdjacentHTML('afterbegin', `<button class="ghost" data-add-subcategory="${id}">زیر‌دسته جدید</button>`);
      } else addButton?.remove();
      card.classList.toggle('feature-collapsed', !open);
      card.style.setProperty('--category-depth', String(depth(id)));
      q('[data-category-toggle]', head)?.setAttribute('aria-expanded', String(open));
    });
  }
  async function refreshCategoryMap() {
    if (!state?.token || !canDocuments('view')) { categoryMap = new Map(); schedule(); return; }
    try {
      const rows = await selectAll('document_categories', 'select=id,parent_id,title&order=sort_order.asc,id.asc');
      categoryMap = new Map(rows.map(row => [String(row.id), row]));
      schedule();
    } catch {}
  }
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      enhanceSites();
      enhanceCategories();
    });
  }

  const latinDigits = value => String(value ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const persianDigits = value => String(value ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  function normalizeInboxTaskIds() {
    const tasks = typeof state !== 'undefined' && Array.isArray(state.tasks) ? state.tasks : [];
    if (!tasks.length) return;
    const publicByInternal = new Map(tasks.map(task => [String(task.id), String(task.legacy_id ?? task.id)]));
    qa('#messageList .message-notification h4').forEach(title => {
      const text = title.textContent || '', match = text.match(/^وظیفه\s+([۰-۹0-9]+)/);
      if (!match) return;
      const internal = latinDigits(match[1]), publicId = publicByInternal.get(internal);
      if (!publicId || publicId === internal) return;
      const next = text.replace(/^وظیفه\s+[۰-۹0-9]+/, `وظیفه ${persianDigits(publicId)}`);
      if (next !== text) title.textContent = next;
    });
  }
  function scheduleInboxNormalization() {
    if (inboxFrame) return;
    inboxFrame = requestAnimationFrame(() => { inboxFrame = 0; normalizeInboxTaskIds(); });
  }
  function ensureCategoryParent() {
    const form = q('#docCategoryForm');
    if (!form || form.elements.parent_id) return;
    const label = document.createElement('label');
    label.className = 'category-parent-field';
    label.innerHTML = '<span dir="rtl">دسته مادر</span><select name="parent_id"><option value="">بدون دسته مادر</option></select>';
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
    const button = q('[type=submit]', form), id = form.elements.id.value, action = id ? 'edit' : 'create';
    const payload = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim() || null, parent_id: form.elements.parent_id.value ? Number(form.elements.parent_id.value) : null };
    if (!payload.title || !requireDocuments(action)) return;
    button.disabled = true;
    try {
      if (id) await update('document_categories', `id=eq.${encodeURIComponent(id)}`, payload);
      else await insert('document_categories', { ...payload, sort_order: categoryMap.size, created_by: state.user.id });
      q('#docCategoryDialog').close(); toast('دسته‌بندی ذخیره شد.'); q('#documentsRefresh')?.click();
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }
  async function openCashDashboard() {
    if (window.bamcoPettyCash?.load) await window.bamcoPettyCash.load();
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
    if (add) { event.preventDefault(); if (!requireDocuments('create')) return; q('#addDocumentCategory')?.click(); populateParent(add.dataset.addSubcategory); return; }
    if (event.target.closest('#cashDashboardToggle')) { event.preventDefault(); event.stopImmediatePropagation(); void openCashDashboard(); }
  }, true);
  document.addEventListener('submit', saveCategory, true);
  const categoryDialog = q('#docCategoryDialog');
  if (categoryDialog) new MutationObserver(() => {
    if (!categoryDialog.open) return;
    const form = q('#docCategoryForm'), row = categoryMap.get(String(form?.elements?.id?.value || ''));
    populateParent(row?.parent_id || '');
  }).observe(categoryDialog, { attributes: true, attributeFilter: ['open'] });
  const documents = q('#documentsFeatureBody'), sites = q('#sitesFeatureBody'), inbox = q('#messageList');
  if (documents) new MutationObserver(schedule).observe(documents, { childList: true, subtree: true });
  if (sites) new MutationObserver(schedule).observe(sites, { childList: true, subtree: true });
  if (inbox) new MutationObserver(scheduleInboxNormalization).observe(inbox, { childList: true, subtree: true });
  document.addEventListener('bamco-inbox-updated', scheduleInboxNormalization);
  window.addEventListener('bamco:feature-access-changed', () => {
    if (canDocuments('view')) void refreshCategoryMap();
    else { categoryMap = new Map(); schedule(); }
  });
  q('#documentsRefresh')?.addEventListener('click', () => void refreshCategoryMap());
  window.addEventListener('focus', () => { schedule(); scheduleInboxNormalization(); });
  window.bamcoFeatureStructure = { refreshCategories: refreshCategoryMap, schedule };
  void refreshCategoryMap(); schedule(); scheduleInboxNormalization();
})();

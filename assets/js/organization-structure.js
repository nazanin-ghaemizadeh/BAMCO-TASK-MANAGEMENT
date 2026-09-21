/* Organization is the authoritative relationship graph: a position belongs to
   a role, a person is assigned to a position, and only position links draw the
   hierarchy used by approval and scope services. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise;
  if (!E) return;
  const { q, esc, fa, fetchRows, setBusy, notify } = E;
  const model = { roles: [], units: [], positions: [], assignments: [], policies: [], loaded: false };
  let loading = null;
  const root = () => q('#organizationFeatureRoot');
  const today = () => new Date().toISOString().slice(0, 10);
  const role = id => model.roles.find(item => String(item.id) === String(id));
  const position = id => model.positions.find(item => String(item.id) === String(id));
  const activeAssignment = positionId => model.assignments.find(item => String(item.position_id) === String(positionId) && item.is_primary && !item.valid_to);
  const personLabel = userId => E.personName(userId);
  const positionLabel = item => `${item.title} · ${role(item.role_id)?.title || 'بدون نقش'}`;
  const initial = item => esc(String(personLabel(activeAssignment(item.id)?.user_id) || item.title || 'س').trim().charAt(0) || 'س');

  function userOrganization(userId) {
    const assignment = model.assignments.find(item => String(item.user_id) === String(userId) && item.is_primary && !item.valid_to);
    const assignedPosition = assignment && position(assignment.position_id);
    return assignedPosition ? { assignment, position: assignedPosition, role: role(assignedPosition.role_id) } : null;
  }

  function childrenOf(parentId) {
    return model.positions
      .filter(item => String(item.parent_position_id || '') === String(parentId || ''))
      .sort((a, b) => String(a.title).localeCompare(String(b.title), 'fa'));
  }

  function node(item, lineage = new Set()) {
    const assigned = activeAssignment(item.id);
    const orgRole = role(item.role_id);
    const descendants = lineage.has(item.id) ? [] : childrenOf(item.id);
    const nextLineage = new Set(lineage); nextLineage.add(item.id);
    return `<li class="org-chart-branch"><button type="button" class="org-chart-node" data-org-edit="${item.id}" aria-label="ویرایش ${esc(item.title)}"><span class="org-chart-circle">${initial(item)}</span><span class="org-chart-copy"><b>${esc(item.title)}</b><small>${esc(assigned ? personLabel(assigned.user_id) : 'جایگاه خالی')}</small><em>${esc(orgRole?.title || 'بدون نقش')}</em></span></button>${descendants.length ? `<ul>${descendants.map(child => node(child, nextLineage)).join('')}</ul>` : ''}<button type="button" class="org-chart-add ghost" data-org-child="${item.id}">＋ زیرمجموعه</button></li>`;
  }

  function chart() {
    const roots = model.positions.filter(item => !item.parent_position_id || !position(item.parent_position_id));
    const rendered = new Set();
    const tree = item => { rendered.add(String(item.id)); return node(item); };
    const primary = roots.map(tree);
    const detached = model.positions.filter(item => !rendered.has(String(item.id))).map(tree);
    return [...primary, ...detached].join('');
  }

  function render() {
    const host = root(); if (!host) return;
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>ساختار سازمانی</h3><p>روی هر دایره بزنید تا جایگاه، نقش سازمانی و فرد شاغل در آن را از منبع مرکزی انتخاب کنید.</p></div><div class="feature-toolbar-actions"><button type="button" class="primary" data-org-action="position">＋ جایگاه جدید</button><button type="button" class="ghost" data-org-action="unit">واحد جدید</button><button type="button" class="ghost" data-org-action="refresh">تازه‌سازی</button></div></div>
      <div class="enterprise-grid organization-grid"><section class="panel organization-chart-panel"><div class="panel-head"><div><h3>نمودار سازمانی</h3><small>شخص، سمت و نقش سه دادهٔ مستقل هستند.</small></div><span class="enterprise-count">${fa(model.positions.length)} جایگاه</span></div><div class="organization-chart" aria-label="نمودار سازمانی">${model.positions.length ? `<ul class="organization-chart-tree">${chart()}</ul>` : '<div class="empty">برای شروع، نخستین جایگاه سازمانی را بسازید.</div>'}</div></section><aside class="panel organization-directory"><div class="panel-head"><div><h3>نقش‌های سازمانی</h3><small>این نقش‌ها در جایگاه‌ها، دسترسی و گردش تأیید مشترک‌اند.</small></div></div><div class="organization-role-list">${model.roles.filter(item => item.active).map(item => `<div><b>${esc(item.title)}</b><span>سطح ${fa(item.level_no)}</span></div>`).join('')}</div><div class="organization-directory-note">برای تغییر نقش یک فرد، جایگاه او را از روی نمودار باز کنید؛ نقش به فرد کپی نمی‌شود.</div></aside></div>
      <dialog id="organizationPositionDialog" class="modal enterprise-modal"><form id="organizationPositionForm"><div class="modal-head"><div><h3>جایگاه سازمانی</h3><p>این فرم همان داده‌ای را ویرایش می‌کند که نمودار، محدودهٔ سازمانی و تأییدها از آن می‌خوانند.</p></div><button type="button" data-org-close>×</button></div><input type="hidden" name="id"><div class="form-grid"><label>عنوان سمت<input name="title" required placeholder="مثلاً رئیس برنامه‌ریزی"></label><label>کد جایگاه<input name="code" required class="english" dir="ltr" placeholder="PLAN-HEAD"></label><label>نقش سازمانی<select name="role_id" required></select></label><label>واحد سازمانی<select name="unit_id"><option value="">بدون واحد</option></select></label><label class="span-2">بالادست سازمانی<select name="parent_position_id"><option value="">بدون بالادست</option></select></label><label class="span-2">فرد شاغل در این جایگاه<select name="user_id"><option value="">جایگاه خالی</option></select><small>فهرست از «افراد و نقش‌ها» خوانده می‌شود.</small></label></div><div class="modal-actions"><button type="button" class="ghost" data-org-close>انصراف</button><button type="submit" class="primary">ذخیره جایگاه</button></div></form></dialog>
      <dialog id="organizationUnitDialog" class="modal enterprise-modal"><form id="organizationUnitForm"><div class="modal-head"><div><h3>واحد سازمانی</h3></div><button type="button" data-org-close>×</button></div><div class="form-grid"><label>عنوان واحد<input name="title" required></label><label>کد واحد<input name="code" required class="english" dir="ltr"></label><label class="span-2">واحد مادر<select name="parent_unit_id"><option value="">بدون واحد مادر</option>${model.units.map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('')}</select></label></div><div class="modal-actions"><button type="button" class="ghost" data-org-close>انصراف</button><button type="submit" class="primary">ذخیره واحد</button></div></form></dialog>`;
    bind();
  }

  function fillPositionForm(current = null) {
    const form = q('#organizationPositionForm'); if (!form) return;
    form.elements.role_id.innerHTML = model.roles.filter(item => item.active).map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
    form.elements.unit_id.innerHTML = '<option value="">بدون واحد</option>' + model.units.filter(item => item.active).map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
    form.elements.parent_position_id.innerHTML = '<option value="">بدون بالادست</option>' + model.positions.filter(item => item.active && String(item.id) !== String(current?.id)).map(item => `<option value="${item.id}">${esc(positionLabel(item))}</option>`).join('');
    form.elements.user_id.innerHTML = '<option value="">جایگاه خالی</option>' + (state.profiles || []).filter(item => item.active !== false).map(item => `<option value="${item.id}">${esc(item.display_name || item.full_name || item.email)}</option>`).join('');
    if (current) {
      for (const key of ['id', 'title', 'code', 'role_id', 'unit_id', 'parent_position_id']) form.elements[key].value = current[key] ?? '';
      form.elements.user_id.value = activeAssignment(current.id)?.user_id || '';
    }
  }

  function openPosition(id = null, parent = null) {
    const form = q('#organizationPositionForm'); if (!form) return;
    form.reset(); const current = id ? position(id) : null; fillPositionForm(current);
    if (!current && parent) form.elements.parent_position_id.value = String(parent);
    q('#organizationPositionDialog').showModal();
  }

  function createsCycle(positionId, parentId) {
    let cursor = parentId, guard = new Set();
    while (cursor) {
      if (String(cursor) === String(positionId)) return true;
      if (guard.has(String(cursor))) return true;
      guard.add(String(cursor)); cursor = position(cursor)?.parent_position_id || null;
    }
    return false;
  }

  async function setAssignment(positionId, userId) {
    const current = activeAssignment(positionId);
    if (String(current?.user_id || '') === String(userId || '')) return;
    const occupied = userId && model.assignments.find(item => String(item.user_id) === String(userId) && item.is_primary && !item.valid_to && String(item.position_id) !== String(positionId));
    if (occupied) await update('organization_position_assignments', 'id=eq.' + encodeURIComponent(occupied.id), { is_primary: false, valid_to: today() });
    if (current) await update('organization_position_assignments', `id=eq.${encodeURIComponent(current.id)}`, { is_primary: false, valid_to: today() });
    if (userId) await insert('organization_position_assignments', { position_id: positionId, user_id: userId, assigned_by: state.user.id, is_primary: true, valid_from: today() });
  }

  async function savePosition(event) {
    event.preventDefault(); const form = event.currentTarget, button = q('[type=submit]', form), id = form.elements.id.value;
    const parentId = form.elements.parent_position_id.value ? Number(form.elements.parent_position_id.value) : null;
    if (id && createsCycle(id, parentId)) return notify('نمی‌توان یک جایگاه را زیرمجموعهٔ خودش یا یکی از زیرمجموعه‌هایش قرار داد.', true);
    const payload = { title: form.elements.title.value.trim(), code: form.elements.code.value.trim(), role_id: Number(form.elements.role_id.value), unit_id: form.elements.unit_id.value ? Number(form.elements.unit_id.value) : null, parent_position_id: parentId };
    if (!payload.title || !payload.code) return notify('عنوان و کد جایگاه الزامی است.', true);
    setBusy(button, true);
    try {
      const rows = id ? await update('organization_positions', `id=eq.${encodeURIComponent(id)}`, payload) : await insert('organization_positions', { ...payload, created_by: state.user.id });
      const positionId = Number(id || rows?.[0]?.id); if (!positionId) throw new Error('ذخیره جایگاه تأیید نشد.');
      await setAssignment(positionId, form.elements.user_id.value || null);
      q('#organizationPositionDialog').close(); notify('جایگاه و انتساب آن ذخیره شد.'); await load({ ensureProfiles: false });
    } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }

  async function saveUnit(event) {
    event.preventDefault(); const form = event.currentTarget, button = q('[type=submit]', form); setBusy(button, true);
    try {
      await insert('organization_units', { title: form.elements.title.value.trim(), code: form.elements.code.value.trim(), parent_unit_id: form.elements.parent_unit_id.value ? Number(form.elements.parent_unit_id.value) : null, created_by: state.user.id });
      q('#organizationUnitDialog').close(); notify('واحد سازمانی ذخیره شد.'); await load({ ensureProfiles: false });
    } catch (error) { notify(error.message, true); } finally { setBusy(button, false); }
  }

  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-org-action]')?.dataset.orgAction;
      if (action === 'position') openPosition();
      if (action === 'unit') q('#organizationUnitDialog')?.showModal();
      if (action === 'refresh') void load();
      const edit = event.target.closest('[data-org-edit]'); if (edit) openPosition(edit.dataset.orgEdit);
      const child = event.target.closest('[data-org-child]'); if (child) openPosition(null, child.dataset.orgChild);
      if (event.target.closest('[data-org-close]')) event.target.closest('dialog')?.close();
    });
    host.addEventListener('submit', event => {
      if (event.target.id === 'organizationPositionForm') void savePosition(event);
      if (event.target.id === 'organizationUnitForm') void saveUnit(event);
    });
  }

  async function load({ ensureProfiles = true } = {}) {
    if (!root() || !state.profile || !isManager()) return;
    if (loading) return loading;
    const job = (async () => {
      try {
        if (ensureProfiles) await window.bamcoPeople?.refresh?.({ refreshOrganization: false });
        const [roles, units, positions, assignments, policies] = await Promise.all([
          fetchRows('organization_roles', 'select=*&active=eq.true&order=level_no.asc'),
          fetchRows('organization_units', 'select=*&active=eq.true&order=title.asc'),
          fetchRows('organization_positions', 'select=*&active=eq.true&order=title.asc'),
          fetchRows('organization_position_assignments', 'select=*&order=id.desc'),
          fetchRows('approval_policies', 'select=*&active=eq.true&order=id.asc')
        ]);
        Object.assign(model, { roles, units, positions, assignments, policies, loaded: true }); render();
        document.dispatchEvent(new CustomEvent('bamco:organization-updated', { detail: model }));
      } catch (error) { if (root()) root().innerHTML = `<div class="panel enterprise-error">${esc(error.message)}</div>`; }
    })();
    loading = job; try { return await job; } finally { if (loading === job) loading = null; }
  }

  function boot() {
    if (!root()) return; render();
    document.addEventListener('click', event => { if (event.target.closest('#nav [data-view="organization"]')) void load(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoOrganization = Object.freeze({ load, model, userOrganization });
})();

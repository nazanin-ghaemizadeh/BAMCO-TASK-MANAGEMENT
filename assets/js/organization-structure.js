/* Organizational hierarchy is stored only by position → parent position.
   Roles and people describe a position; neither one creates a reporting line. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise;
  if (!E) return;
  const { q, esc, fetchRows, rpc, removeRows, setBusy, notify } = E;
  const model = { roles: [], positions: [], assignments: [], loaded: false, scoped: false };
  let loading = null;
  const root = () => q('#organizationFeatureRoot');
  const canManageStructure = () => typeof isManager === 'function' && isManager();
  const role = id => model.roles.find(item => String(item.id) === String(id));
  const position = id => model.positions.find(item => String(item.id) === String(id));
  const activeAssignment = positionId => model.assignments.find(item =>
    String(item.position_id) === String(positionId) && item.is_primary && !item.valid_to
  );
  function organizationProfiles() {
    const people = canManageStructure()
      ? (state.profiles || [])
      : (state.organizationScope?.people || window.bamcoOrganizationAccess?.people?.() || []);
    const byId = new Map();
    for (const person of [state.profile, ...people].filter(Boolean)) {
      if (person.id) byId.set(String(person.id), person);
    }
    return byId;
  }
  const personLabel = (userId, profiles = organizationProfiles()) => {
    const person = profiles.get(String(userId));
    return person?.display_name || person?.full_name || person?.email || E.personName(userId);
  };
  const positionLabel = item => {
    const assigned = activeAssignment(item.id);
    return `${item.title} — ${assigned ? personLabel(assigned.user_id) : 'بدون فرد شاغل'}`;
  };
  const initial = (item, profiles) => esc(String(personLabel(activeAssignment(item.id)?.user_id, profiles) || item.title || 'س').trim().charAt(0) || 'س');
  const currentSession = (userId, snapshot) => state.user?.id === userId && !!state.token &&
    (!snapshot || window.bamcoAuth?.isCurrent?.(snapshot) !== false);

  function userOrganization(userId) {
    const assignment = model.assignments.find(item => String(item.user_id) === String(userId) && item.is_primary && !item.valid_to);
    const assignedPosition = assignment && position(assignment.position_id);
    return assignedPosition ? { assignment, position: assignedPosition, role: role(assignedPosition.role_id) } : null;
  }

  function sortPositions(left, right) {
    const level = Number(role(right.role_id)?.level_no || 0) - Number(role(left.role_id)?.level_no || 0);
    return level || String(left.title).localeCompare(String(right.title), 'fa');
  }

  function childrenOf(parentId) {
    return model.positions
      .filter(item => String(item.parent_position_id || '') === String(parentId || ''))
      .sort(sortPositions);
  }

  function isDescendant(candidateId, ancestorId) {
    let cursor = position(candidateId);
    const guard = new Set();
    while (cursor?.parent_position_id && !guard.has(String(cursor.id))) {
      guard.add(String(cursor.id));
      if (String(cursor.parent_position_id) === String(ancestorId)) return true;
      cursor = position(cursor.parent_position_id);
    }
    return false;
  }

  function node(item, rendered, depth = 1, lineage = new Set()) {
    const itemId = String(item.id);
    if (lineage.has(itemId) || rendered.has(itemId)) return null;
    rendered.add(itemId);
    const nextLineage = new Set(lineage);
    nextLineage.add(itemId);
    const children = childrenOf(item.id)
      .filter(child => !nextLineage.has(String(child.id)))
      .map(child => node(child, rendered, depth + 1, nextLineage))
      .filter(Boolean);
    const x = children.length
      ? children.reduce((sum, child) => sum + child.x, 0) / children.length
      : rendered.leafIndex++;
    rendered.maxDepth = Math.max(rendered.maxDepth, depth);
    return { item, children, depth, x };
  }

  function treeLayout() {
    const rendered = new Set();
    rendered.leafIndex = 0;
    rendered.maxDepth = 1;
    const roots = model.positions
      .filter(item => !item.parent_position_id || !position(item.parent_position_id))
      .sort(sortPositions);
    const branches = roots.map(item => node(item, rendered)).filter(Boolean);
    // Invalid cyclic data must not make the rest of the hierarchy disappear.
    // Each unresolved component is attached once under the common company root.
    for (const item of model.positions.sort(sortPositions)) {
      if (!rendered.has(String(item.id))) {
        const branch = node(item, rendered);
        if (branch) branches.push(branch);
      }
    }
    return { branches, leaves: Math.max(rendered.leafIndex, 1), maxDepth: rendered.maxDepth };
  }

  function chart() {
    const layout = treeLayout();
    const profiles = organizationProfiles();
    const nodeGap = 190;
    const margin = 120;
    const usedWidth = Math.max(0, (layout.leaves - 1) * nodeGap);
    const width = Math.max(640, usedWidth + margin * 2);
    const firstX = (width - usedWidth) / 2;
    const companyX = Math.round(width / 2);
    const companyY = 68;
    const firstY = 132;
    const levelGap = 184;
    const height = Math.max(360, firstY + (layout.maxDepth - 1) * levelGap + 142);
    const point = entry => ({ x: Math.round(firstX + entry.x * nodeGap), y: firstY + (entry.depth - 1) * levelGap });
    const links = [];
    const cards = [];
    const draw = (entry, parent = null) => {
      const target = point(entry);
      const source = parent ? point(parent) : { x: companyX, y: companyY };
      const sourceY = parent ? source.y + 42 : source.y;
      const targetY = target.y - 42;
      const middle = Math.round((sourceY + targetY) / 2);
      links.push(`<path class="org-chart-link" d="M ${source.x} ${sourceY} V ${middle} H ${target.x} V ${targetY}"/>`);
      const assigned = activeAssignment(entry.item.id);
      const orgRole = role(entry.item.role_id);
      const person = assigned ? personLabel(assigned.user_id, profiles) : '';
      const avatar = assigned
        ? `<span class="org-chart-circle" data-profile-photo="${esc(assigned.user_id)}" aria-label="تصویر پروفایل ${esc(person)}">${initial(entry.item, profiles)}</span>`
        : '<span class="org-chart-circle org-chart-circle-empty" aria-hidden="true"></span>';
      const copy = `${avatar}<span class="org-chart-copy"><b>${esc(entry.item.title)}</b>${assigned ? `<small>${esc(person)}</small>` : ''}<em>${esc(orgRole?.title || 'بدون نقش')}</em></span>`;
      const parentId = entry.item.parent_position_id == null ? '' : String(entry.item.parent_position_id);
      const attributes = `data-org-parent="${esc(parentId)}" style="left:${target.x}px;top:${target.y - 42}px"`;
      const label = assigned ? `${entry.item.title}، ${person}` : entry.item.title;
      cards.push(canManageStructure()
        ? `<button type="button" class="org-chart-node" data-org-edit="${entry.item.id}" ${attributes} aria-label="ویرایش ${esc(label)}">${copy}</button>`
        : `<div class="org-chart-node org-chart-node-readonly" ${attributes} role="treeitem" aria-label="${esc(label)}">${copy}</div>`);
      entry.children.forEach(child => draw(child, entry));
    };
    layout.branches.forEach(branch => draw(branch));
    return `<div class="organization-chart-canvas" role="tree" style="width:${width}px;height:${height}px"><svg class="org-chart-links" viewBox="0 0 ${width} ${height}" aria-hidden="true">${links.join('')}</svg><div class="org-chart-company" style="left:${companyX}px;top:16px"><div class="org-chart-company-node"><span class="org-chart-company-mark">ب</span><b>شرکت خودروسازان بم</b></div></div>${cards.join('')}</div>`;
  }

  function positionDialog() {
    if (!canManageStructure()) return '';
    return `<dialog id="organizationPositionDialog" class="modal enterprise-modal"><form id="organizationPositionForm"><div class="modal-head"><h3 id="organizationPositionDialogTitle">جایگاه سازمانی جدید</h3><button type="button" data-org-close>×</button></div><input type="hidden" name="id"><div class="form-grid"><label class="span-2">عنوان سمت<input name="title" required placeholder="مثلاً رئیس برنامه‌ریزی"></label><label>نقش سازمانی<select name="role_id" required></select></label><label>بالادست سازمانی<select name="parent_position_id"><option value="">بدون بالادست</option></select></label><label class="span-2">فرد شاغل در این جایگاه<select name="user_id"><option value="">بدون فرد شاغل</option></select></label></div><div class="modal-actions organization-position-actions"><button type="button" class="danger hidden" data-org-delete>حذف جایگاه</button><button type="button" class="ghost" data-org-close>انصراف</button><button type="submit" class="primary">ذخیره جایگاه</button></div></form></dialog>`;
  }

  function render() {
    const host = root();
    if (!host) return;
    const editor = canManageStructure();
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>ساختار سازمانی</h3></div><div class="feature-toolbar-actions"><button type="button" class="ghost" data-org-home data-home-action>بازگشت به خانه</button>${editor ? '<button type="button" class="primary" data-org-action="position">＋ جایگاه جدید</button>' : ''}</div></div>
      <div class="enterprise-grid organization-grid"><section class="panel organization-chart-panel"><div class="panel-head"><h3>نمودار سازمانی</h3></div><div class="organization-chart" aria-label="نمودار سازمانی">${model.positions.length ? chart() : `<div class="empty">${editor ? 'برای شروع، «جایگاه جدید» را بزنید.' : 'در حال حاضر جایگاهی در محدودهٔ نظارت شما ثبت نشده است.'}</div>`}</div></section></div>${positionDialog()}`;
    if (editor) bindPositionForm();
    void window.bamcoMedia?.avatars?.(host.querySelector('.organization-chart'), [...organizationProfiles().values()]);
    bind();
  }

  function fillPositionForm(current = null) {
    const form = q('#organizationPositionForm');
    if (!form) return;
    form.elements.role_id.innerHTML = model.roles.filter(item => item.active)
      .map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
    form.elements.parent_position_id.innerHTML = '<option value="">بدون بالادست</option>' + model.positions
      .filter(item => item.active && String(item.id) !== String(current?.id) && !isDescendant(item.id, current?.id))
      .sort(sortPositions)
      .map(item => `<option value="${item.id}">${esc(positionLabel(item))}</option>`).join('');
    form.elements.user_id.innerHTML = '<option value="">بدون فرد شاغل</option>' + (state.profiles || [])
      .filter(item => item.active !== false)
      .map(item => `<option value="${item.id}">${esc(item.display_name || item.full_name || item.email)}</option>`).join('');
    form.elements.id.value = current?.id || '';
    form.elements.title.value = current?.title || '';
    form.elements.role_id.value = current?.role_id ? String(current.role_id) : (form.elements.role_id.options[0]?.value || '');
    form.elements.parent_position_id.value = current?.parent_position_id ? String(current.parent_position_id) : '';
    form.elements.user_id.value = current ? (activeAssignment(current.id)?.user_id || '') : '';
    q('#organizationPositionDialogTitle').textContent = current ? 'ویرایش جایگاه سازمانی' : 'جایگاه سازمانی جدید';
    const remove = q('[data-org-delete]', form);
    remove.dataset.orgDelete = current?.id || '';
    remove.classList.toggle('hidden', !current);
  }

  function openPosition(id = null) {
    if (!canManageStructure()) return;
    const form = q('#organizationPositionForm');
    if (!form) return;
    form.reset();
    fillPositionForm(id ? position(id) : null);
    q('#organizationPositionDialog').showModal();
  }

  function createsCycle(positionId, parentId) {
    let cursor = parentId;
    const guard = new Set();
    while (cursor) {
      if (String(cursor) === String(positionId) || guard.has(String(cursor))) return true;
      guard.add(String(cursor));
      cursor = position(cursor)?.parent_position_id || null;
    }
    return false;
  }

  async function savePosition(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!canManageStructure()) return;
    const form = event.currentTarget?.id === 'organizationPositionForm' ? event.currentTarget : q('#organizationPositionForm');
    if (!form) return;
    const button = q('[type=submit]', form);
    const id = form.elements.id.value;
    const actorId = state.user?.id;
    const snapshot = window.bamcoAuth?.snapshot?.();
    if (!actorId) return notify('نشست کاربری معتبر نیست؛ صفحه را دوباره باز کنید.', true);
    const parentId = form.elements.parent_position_id.value ? Number(form.elements.parent_position_id.value) : null;
    if (id && createsCycle(id, parentId)) return notify('نمی‌توان یک جایگاه را زیرمجموعهٔ خودش یا یکی از زیرمجموعه‌هایش قرار داد.', true);
    const payload = {
      p_title: form.elements.title.value.trim(),
      p_role_id: Number(form.elements.role_id.value),
      p_parent_position_id: parentId,
      p_user_id: form.elements.user_id.value || null,
      p_position_id: id ? Number(id) : null
    };
    if (!payload.p_title || !payload.p_role_id) return notify('عنوان سمت و نقش سازمانی الزامی است.', true);
    setBusy(button, true);
    try {
      const saved = await rpc('save_organization_position', payload);
      if (!currentSession(actorId, snapshot)) return;
      if (!saved?.position_id) throw new Error('ذخیره جایگاه تأیید نشد.');
      q('#organizationPositionDialog')?.close();
      await load({ ensureProfiles: false, force: true });
      await window.bamcoOrganizationAccess?.refresh?.({ silent: true });
      if (!currentSession(actorId, snapshot)) return;
      notify('جایگاه سازمانی ذخیره شد.');
    } catch (error) {
      notify(error?.message || 'ذخیره جایگاه انجام نشد.', true);
    } finally {
      setBusy(button, false);
    }
  }

  async function deletePosition(id, button) {
    if (!canManageStructure()) return;
    const item = position(id);
    if (!item) return;
    if (childrenOf(id).length) return notify('ابتدا جایگاه‌های زیرمجموعه را جابه‌جا یا حذف کنید؛ حذف یک شاخهٔ کامل خودکار انجام نمی‌شود.', true);
    if (!await window.bamcoConfirm(`جایگاه «${item.title}» حذف شود؟ انتساب فرد به این جایگاه نیز حذف می‌شود.`)) return;
    setBusy(button, true, 'در حال حذف…');
    try {
      await removeRows('organization_positions', `id=eq.${encodeURIComponent(id)}`);
      q('#organizationPositionDialog')?.close();
      await load({ ensureProfiles: false, force: true });
      await window.bamcoOrganizationAccess?.refresh?.({ silent: true });
      notify('جایگاه سازمانی حذف شد.');
    } catch (error) {
      notify(error?.message || 'حذف جایگاه انجام نشد.', true);
    } finally {
      setBusy(button, false);
    }
  }

  function bindPositionForm() {
    const form = q('#organizationPositionForm');
    if (!form || form.dataset.orgSubmitBound === '1') return;
    form.dataset.orgSubmitBound = '1';
    form.setAttribute('method', 'dialog');
    form.addEventListener('submit', event => { void savePosition(event); });
  }

  function bind() {
    const host = root();
    if (!host || host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-org-action]')?.dataset.orgAction;
      if (action === 'position') {
        event.preventDefault();
        openPosition();
        return;
      }
      const edit = event.target.closest('[data-org-edit]');
      if (edit) {
        event.preventDefault();
        openPosition(edit.dataset.orgEdit);
        return;
      }
      const remove = event.target.closest('[data-org-delete]');
      if (remove?.dataset.orgDelete) {
        event.preventDefault();
        void deletePosition(remove.dataset.orgDelete, remove);
        return;
      }
      if (event.target.closest('[data-org-close]')) event.target.closest('dialog')?.close();
    });
  }

  function hydrateScopedDirectory(rows) {
    const roles = new Map();
    const positions = new Map();
    const assignments = [];
    for (const row of rows || []) {
      if (!row?.position_id) continue;
      if (row.role_id && !roles.has(String(row.role_id))) roles.set(String(row.role_id), {
        id: row.role_id,
        key: row.role_key,
        title: row.role_title || 'بدون نقش',
        level_no: row.role_level_no || 0,
        active: true
      });
      positions.set(String(row.position_id), {
        id: row.position_id,
        title: row.position_title || 'بدون عنوان',
        parent_position_id: row.parent_position_id || null,
        role_id: row.role_id || null,
        active: true
      });
      if (row.occupant_id) assignments.push({
        id: `scope-${row.position_id}`,
        position_id: row.position_id,
        user_id: row.occupant_id,
        is_primary: true,
        valid_to: null
      });
    }
    Object.assign(model, {
      roles: [...roles.values()],
      positions: [...positions.values()],
      assignments,
      loaded: true,
      scoped: true
    });
  }

  async function load({ ensureProfiles = true, force = false } = {}) {
    if (!root() || !state.profile) return;
    if (loading) {
      await loading;
      if (!force) return;
    }
    const job = (async () => {
      try {
        if (canManageStructure()) {
          if (ensureProfiles) await window.bamcoPeople?.refresh?.({ refreshOrganization: false });
          const [roles, positions, assignments] = await Promise.all([
            fetchRows('organization_roles', 'select=*&active=eq.true&order=level_no.asc'),
            fetchRows('organization_positions', 'select=*&active=eq.true&order=title.asc'),
            fetchRows('organization_position_assignments', 'select=*&order=id.desc')
          ]);
          Object.assign(model, { roles, positions, assignments, loaded: true, scoped: false });
        } else {
          await window.bamcoOrganizationAccess?.refresh?.({ silent: true });
          hydrateScopedDirectory(window.bamcoOrganizationAccess?.directory?.() || []);
        }
        render();
        document.dispatchEvent(new CustomEvent('bamco:organization-updated', { detail: model }));
      } catch (error) {
        if (root()) root().innerHTML = `<div class="panel enterprise-error"><b>ساختار سازمانی بارگذاری نشد.</b><p>${esc(error?.message || 'خطای ناشناخته')}</p><button type="button" class="ghost" data-home-action>بازگشت به خانه</button></div>`;
      }
    })();
    loading = job;
    try {
      return await job;
    } finally {
      if (loading === job) loading = null;
    }
  }

  function boot() {
    if (!root()) return;
    render();
    window.BamcoNavigation?.registerView?.('organization', { activate: load });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.bamcoOrganization = Object.freeze({ load, model, userOrganization });
})();

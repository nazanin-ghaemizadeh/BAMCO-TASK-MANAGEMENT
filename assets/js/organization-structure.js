/* The position tree is the only stored organizational hierarchy. A person is
   assigned to a position; people never become manual parent links themselves. */
(() => {
  'use strict';
  const E = window.bamcoEnterprise;
  if (!E) return;
  const { q, esc, fa, fetchRows, rpc, removeRows, setBusy, notify } = E;
  const model = { roles: [], positions: [], assignments: [], loaded: false };
  let loading = null;
  const root = () => q('#organizationFeatureRoot');
  const role = id => model.roles.find(item => String(item.id) === String(id));
  const position = id => model.positions.find(item => String(item.id) === String(id));
  const activeAssignment = positionId => model.assignments.find(item => String(item.position_id) === String(positionId) && item.is_primary && !item.valid_to);
  const personLabel = userId => E.personName(userId);
  const positionLabel = item => {
    const assigned = activeAssignment(item.id);
    return `${item.title} — ${assigned ? personLabel(assigned.user_id) : 'جایگاه خالی'}`;
  };
  const initial = item => esc(String(personLabel(activeAssignment(item.id)?.user_id) || item.title || 'س').trim().charAt(0) || 'س');
  const currentSession = (userId, snapshot) => state.user?.id === userId && !!state.token && (!snapshot || window.bamcoAuth?.isCurrent?.(snapshot) !== false);

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
    return `<li class="org-chart-branch"><button type="button" class="org-chart-node" data-org-edit="${item.id}" aria-label="ویرایش ${esc(item.title)}"><span class="org-chart-circle">${initial(item)}</span><span class="org-chart-copy"><b>${esc(item.title)}</b><small>${esc(assigned ? personLabel(assigned.user_id) : 'جایگاه خالی')}</small><em>${esc(orgRole?.title || 'بدون نقش')}</em></span></button>${descendants.length ? `<ul>${descendants.map(child => node(child, nextLineage)).join('')}</ul>` : ''}</li>`;
  }

  function chart() {
    const roots = model.positions.filter(item => !item.parent_position_id || !position(item.parent_position_id));
    const rendered = new Set();
    const tree = item => { rendered.add(String(item.id)); return node(item); };
    return [...roots.map(tree), ...model.positions.filter(item => !rendered.has(String(item.id))).map(tree)].join('');
  }

  function render() {
    const host = root(); if (!host) return;
    host.innerHTML = `<div class="feature-toolbar enterprise-toolbar"><div><h3>ساختار سازمانی</h3><p>روی هر دایره بزنید تا عنوان سمت، نقش، بالادست و فرد شاغل آن را ویرایش کنید.</p></div><div class="feature-toolbar-actions"><button type="button" class="ghost" data-org-home data-home-action>بازگشت به خانه</button><button type="button" class="primary" data-org-action="position">＋ جایگاه جدید</button></div></div>
      <div class="enterprise-grid organization-grid"><section class="panel organization-chart-panel"><div class="panel-head"><div><h3>نمودار سازمانی</h3><small>نقش و شخص از جایگاه جدا هستند؛ رابطهٔ بالادست فقط در همین درخت نگهداری می‌شود.</small></div><span class="enterprise-count">${fa(model.positions.length)} جایگاه</span></div><div class="organization-chart" aria-label="نمودار سازمانی">${model.positions.length ? `<ul class="organization-chart-tree">${chart()}</ul>` : '<div class="empty">برای شروع، «جایگاه جدید» را بزنید.</div>'}</div></section></div>
      <dialog id="organizationPositionDialog" class="modal enterprise-modal"><form id="organizationPositionForm"><div class="modal-head"><div><h3 id="organizationPositionDialogTitle">جایگاه سازمانی جدید</h3><p>این چهار داده مستقیماً نمودار، محدودهٔ سازمانی و گردش تأیید را به‌روزرسانی می‌کنند.</p></div><button type="button" data-org-close>×</button></div><input type="hidden" name="id"><div class="form-grid"><label class="span-2">عنوان سمت<input name="title" required placeholder="مثلاً رئیس برنامه‌ریزی"></label><label>نقش سازمانی<select name="role_id" required></select></label><label>بالادست سازمانی<select name="parent_position_id"><option value="">بدون بالادست</option></select><small>فهرست به‌صورت «سمت — فرد شاغل» نمایش داده می‌شود.</small></label><label class="span-2">فرد شاغل در این جایگاه<select name="user_id"><option value="">جایگاه خالی</option></select><small>فهرست از «افراد و نقش‌ها» خوانده می‌شود.</small></label></div><div class="modal-actions"><button type="button" class="danger hidden" data-org-delete>حذف جایگاه</button><span class="modal-actions-spacer"></span><button type="button" class="ghost" data-org-close>انصراف</button><button type="submit" class="primary">ذخیره جایگاه</button></div></form></dialog>`;
    bindPositionForm(); bind();
  }

  function fillPositionForm(current = null) {
    const form = q('#organizationPositionForm'); if (!form) return;
    form.elements.role_id.innerHTML = model.roles.filter(item => item.active).map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
    form.elements.parent_position_id.innerHTML = '<option value="">بدون بالادست</option>' + model.positions
      .filter(item => item.active && String(item.id) !== String(current?.id))
      .map(item => `<option value="${item.id}">${esc(positionLabel(item))}</option>`).join('');
    form.elements.user_id.innerHTML = '<option value="">جایگاه خالی</option>' + (state.profiles || [])
      .filter(item => item.active !== false)
      .map(item => `<option value="${item.id}">${esc(item.display_name || item.full_name || item.email)}</option>`).join('');
    form.elements.id.value = current?.id || '';
    form.elements.title.value = current?.title || '';
    form.elements.role_id.value = current?.role_id ? String(current.role_id) : (form.elements.role_id.options[0]?.value || '');
    form.elements.parent_position_id.value = current?.parent_position_id ? String(current.parent_position_id) : '';
    form.elements.user_id.value = current ? (activeAssignment(current.id)?.user_id || '') : '';
    q('#organizationPositionDialogTitle').textContent = current ? 'ویرایش جایگاه سازمانی' : 'جایگاه سازمانی جدید';
    const remove = q('[data-org-delete]', form); remove.dataset.orgDelete = current?.id || ''; remove.classList.toggle('hidden', !current);
  }

  function openPosition(id = null) {
    const form = q('#organizationPositionForm'); if (!form) return;
    form.reset(); fillPositionForm(id ? position(id) : null); q('#organizationPositionDialog').showModal();
  }

  function createsCycle(positionId, parentId) {
    let cursor = parentId; const guard = new Set();
    while (cursor) {
      if (String(cursor) === String(positionId) || guard.has(String(cursor))) return true;
      guard.add(String(cursor)); cursor = position(cursor)?.parent_position_id || null;
    }
    return false;
  }

  async function savePosition(event) {
    event.preventDefault(); event.stopPropagation();
    const form = event.currentTarget?.id === 'organizationPositionForm' ? event.currentTarget : q('#organizationPositionForm');
    if (!form) return;
    const button = q('[type=submit]', form), id = form.elements.id.value, actorId = state.user?.id, snapshot = window.bamcoAuth?.snapshot?.();
    if (!actorId) return notify('نشست کاربری معتبر نیست؛ صفحه را دوباره باز کنید.', true);
    const parentId = form.elements.parent_position_id.value ? Number(form.elements.parent_position_id.value) : null;
    if (id && createsCycle(id, parentId)) return notify('نمی‌توان یک جایگاه را زیرمجموعهٔ خودش یا یکی از زیرمجموعه‌هایش قرار داد.', true);
    const payload = { p_title: form.elements.title.value.trim(), p_role_id: Number(form.elements.role_id.value), p_parent_position_id: parentId, p_user_id: form.elements.user_id.value || null, p_position_id: id ? Number(id) : null };
    if (!payload.p_title || !payload.p_role_id) return notify('عنوان سمت و نقش سازمانی الزامی است.', true);
    setBusy(button, true);
    try {
      const saved = await rpc('save_organization_position', payload);
      if (!currentSession(actorId, snapshot)) return;
      if (!saved?.position_id) throw new Error('ذخیره جایگاه تأیید نشد.');
      q('#organizationPositionDialog')?.close();
      await load({ ensureProfiles: false, force: true });
      if (!currentSession(actorId, snapshot)) return;
      notify('جایگاه سازمانی ذخیره شد.');
    } catch (error) { notify(error?.message || 'ذخیره جایگاه انجام نشد.', true); } finally { setBusy(button, false); }
  }

  async function deletePosition(id, button) {
    const item = position(id); if (!item) return;
    if (childrenOf(id).length) return notify('ابتدا جایگاه‌های زیرمجموعه را جابه‌جا یا حذف کنید؛ حذف یک شاخهٔ کامل خودکار انجام نمی‌شود.', true);
    if (!await window.bamcoConfirm(`جایگاه «${item.title}» حذف شود؟ انتساب فرد به این جایگاه نیز حذف می‌شود.`)) return;
    setBusy(button, true, 'در حال حذف…');
    try {
      await removeRows('organization_positions', `id=eq.${encodeURIComponent(id)}`);
      q('#organizationPositionDialog')?.close(); await load({ ensureProfiles: false, force: true }); notify('جایگاه سازمانی حذف شد.');
    } catch (error) { notify(error?.message || 'حذف جایگاه انجام نشد.', true); } finally { setBusy(button, false); }
  }

  function bindPositionForm() {
    const form = q('#organizationPositionForm');
    if (!form || form.dataset.orgSubmitBound === '1') return;
    // A missed delegated listener must never fall back to navigation: this app
    // intentionally keeps its authenticated session only in memory.
    form.dataset.orgSubmitBound = '1';
    form.setAttribute('method', 'dialog');
    form.addEventListener('submit', event => { void savePosition(event); });
  }

  function bind() {
    const host = root(); if (!host || host.dataset.bound === '1') return;
    host.dataset.bound = '1';
    host.addEventListener('click', event => {
      const action = event.target.closest('[data-org-action]')?.dataset.orgAction;
      if (action === 'position') { event.preventDefault(); openPosition(); return; }
      const edit = event.target.closest('[data-org-edit]'); if (edit) { event.preventDefault(); openPosition(edit.dataset.orgEdit); return; }
      const remove = event.target.closest('[data-org-delete]'); if (remove?.dataset.orgDelete) { event.preventDefault(); void deletePosition(remove.dataset.orgDelete, remove); return; }
      if (event.target.closest('[data-org-close]')) event.target.closest('dialog')?.close();
    });
  }

  async function load({ ensureProfiles = true, force = false } = {}) {
    if (!root() || !state.profile || !isManager()) return;
    if (loading) { await loading; if (!force) return; }
    const job = (async () => {
      try {
        if (ensureProfiles) await window.bamcoPeople?.refresh?.({ refreshOrganization: false });
        const [roles, positions, assignments] = await Promise.all([
          fetchRows('organization_roles', 'select=*&active=eq.true&order=level_no.asc'),
          fetchRows('organization_positions', 'select=*&active=eq.true&order=title.asc'),
          fetchRows('organization_position_assignments', 'select=*&order=id.desc')
        ]);
        Object.assign(model, { roles, positions, assignments, loaded: true }); render();
        document.dispatchEvent(new CustomEvent('bamco:organization-updated', { detail: model }));
      } catch (error) {
        if (root()) root().innerHTML = `<div class="panel enterprise-error"><b>ساختار سازمانی بارگذاری نشد.</b><p>${esc(error?.message || 'خطای ناشناخته')}</p><button type="button" class="ghost" data-home-action>بازگشت به خانه</button></div>`;
      }
    })();
    loading = job; try { return await job; } finally { if (loading === job) loading = null; }
  }

  function boot() {
    if (!root()) return;
    render(); window.BamcoNavigation?.registerView?.('organization', { activate: load });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  window.bamcoOrganization = Object.freeze({ load, model, userOrganization });
})();

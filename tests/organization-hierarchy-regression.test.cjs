const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('organization tree renders every position once below one shared root', async t => {
  const f = await fixture({
    tables: {
      organization_roles: [
        { id: 1, title: 'مدیر', level_no: 5, active: true },
        { id: 2, title: 'سرپرست', level_no: 4, active: true },
        { id: 3, title: 'کارشناس', level_no: 3, active: true }
      ],
      organization_positions: [
        { id: 10, title: 'مدیرعامل', role_id: 1, parent_position_id: null, active: true },
        { id: 20, title: 'سرپرست محصول', role_id: 2, parent_position_id: 10, active: true },
        { id: 30, title: 'کارشناس کنترل', role_id: 3, parent_position_id: 20, active: true },
        { id: 40, title: 'کارشناس کیفیت', role_id: 3, parent_position_id: 10, active: true }
      ],
      organization_position_assignments: [
        { id: 1, position_id: 10, user_id: 'test-manager', is_primary: true, valid_to: null },
        { id: 2, position_id: 20, user_id: 'test-owner', is_primary: true, valid_to: null }
      ]
    }
  });
  t.after(() => f.dispose());

  f.profiles.find(person => person.id === 'test-manager').avatar_path = 'test-manager/avatar.png';
  f.profiles.find(person => person.id === 'test-manager').updated_at = '2026-09-22T09:00:00Z';
  f.profiles.find(person => person.id === 'test-owner').avatar_path = 'test-owner/avatar.png';
  f.profiles.find(person => person.id === 'test-owner').updated_at = '2026-09-22T09:00:00Z';
  await f.open('organization');
  const { d } = f;
  assert.equal(d.querySelectorAll('.org-chart-company').length, 0);
  assert.equal(d.querySelectorAll('.organization-chart-canvas').length, 1);
  const nodes = [...d.querySelectorAll('[data-org-edit]')];
  assert.deepEqual(nodes.map(node => node.dataset.orgEdit).sort(), ['10', '20', '30', '40']);
  assert.equal(new Set(nodes.map(node => node.dataset.orgEdit)).size, 4);
  assert.equal(d.querySelectorAll('.org-chart-card').length, 4);
  assert.deepEqual([...d.querySelectorAll('[data-org-parent="10"]')].map(node => node.dataset.orgEdit).sort(), ['20', '40']);
  assert.equal(d.querySelector('[data-org-edit="30"]').dataset.orgParent, '20');
  assert.ok(d.querySelector('[data-org-edit="10"] [data-profile-photo="test-manager"]'));
  assert.ok(d.querySelector('[data-org-edit="20"] [data-profile-photo="test-owner"]'));
  assert.equal(d.querySelectorAll('.org-chart-link').length, 3, 'only position-to-position connectors are drawn');
  assert.equal(d.querySelector('[data-org-link-to="10"]'), null, 'a top-level position has no artificial company connector');
  assert.ok(d.querySelector('[data-org-link-from="10"][data-org-link-to="20"]'));
  assert.ok(d.querySelector('[data-org-link-from="20"][data-org-link-to="30"]'));
  await until(() => d.querySelector('[data-org-edit="10"] .org-chart-avatar.has-image'));
  await until(() => d.querySelector('[data-org-edit="20"] .org-chart-avatar.has-image'));
  assert.equal(d.querySelector('.organization-chart').textContent.includes('جایگاه شما'), false);
  assert.equal(d.querySelector('.organization-chart').textContent.includes('جایگاه خالی'), false);
  assert.equal(d.querySelector('.organization-position-actions .modal-actions-spacer'), null);
});

test('a supervisor sees only the descendant branch and can choose only its occupants for a task', async t => {
  const directory = [
    {
      position_id: 20, parent_position_id: 10, position_title: 'سرپرست محصول',
      role_id: 2, role_title: 'سرپرست', role_level_no: 4,
      occupant_id: 'test-owner', occupant_display_name: 'سرپرست آزمایشی',
      occupant_full_name: 'سرپرست آزمایشی', occupant_email: 'owner@example.test',
      occupant_active: true, occupant_avatar_path: 'test-owner/avatar.png',
      occupant_updated_at: '2026-09-22T09:00:00Z', is_current_position: true
    },
    {
      position_id: 30, parent_position_id: 20, position_title: 'کارشناس کنترل',
      role_id: 3, role_title: 'کارشناس', role_level_no: 3,
      occupant_id: 'test-subordinate', occupant_display_name: 'زیرمجموعه آزمایشی',
      occupant_full_name: 'زیرمجموعه آزمایشی', occupant_email: 'subordinate@example.test',
      occupant_active: true, occupant_avatar_path: 'test-subordinate/avatar.png',
      occupant_updated_at: '2026-09-22T09:00:00Z', is_current_position: false
    }
  ];
  const f = await fixture({
    role: 'owner',
    fetchResult: async ({ endpoint }) => (
      endpoint === 'organization_scope_directory_with_avatars' || endpoint === 'organization_scope_directory'
    ) ? directory : undefined
  });
  t.after(() => f.dispose());

  const { w, d } = f;
  assert.equal(w.bamcoOrganizationAccess.canManageTasks(), true);
  assert.equal(d.querySelector('#organizationView').classList.contains('hidden'), true);
  assert.equal(d.querySelector('#kanbanDeleteBtn').classList.contains('hidden'), false);
  await f.open('organization');

  assert.equal(d.querySelectorAll('[data-org-edit]').length, 0, 'only structure managers edit positions');
  assert.equal(d.querySelector('[data-org-action="position"]'), null);
  assert.deepEqual([...d.querySelectorAll('.org-chart-node')].map(node => node.textContent).filter(Boolean).length, 2);
  assert.ok(d.querySelector('[data-profile-photo="test-owner"]'));
  assert.ok(d.querySelector('[data-profile-photo="test-subordinate"]'));
  await until(() => d.querySelector('[data-profile-photo="test-owner"].has-image'));
  await until(() => d.querySelector('[data-profile-photo="test-subordinate"].has-image'));

  w.openTask();
  const ownerIds = [...d.querySelector('#taskForm [name="owner_id"]').options].map(option => option.value);
  assert.deepEqual(ownerIds, ['', 'test-owner', 'test-subordinate']);
});

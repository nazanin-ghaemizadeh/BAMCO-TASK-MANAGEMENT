const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('people access matrix mirrors aliases and saves through the canonical access RPC', async () => {
  const effective = new Map();
  const f = await fixture({ fetchResult: async ({ endpoint, body }) => {
    if (endpoint === 'feature_access_manage_snapshot') {
      const enabled = effective.get(body.p_feature_key) === true;
      return {
        users: [
          { id: 'test-manager', full_name: 'مدیر آزمایشی', email: 'manager@example.test', active: true },
          { id: 'test-owner', full_name: 'متولی آزمایشی', email: 'owner@example.test', active: true }
        ],
        grants: [],
        effective_grants: [{ user_id: 'test-owner', can_view: enabled }]
      };
    }
    if (endpoint === 'set_feature_access') {
      const ownerGrant = body.p_grants.find(row => row.user_id === 'test-owner');
      if (ownerGrant) effective.set(body.p_feature_key, ownerGrant.can_view === true);
      return true;
    }
    return undefined;
  }});
  try {
    await f.open('accessMatrix');
    await until(() => f.d.querySelector('.access-matrix-table'));
    assert.match(f.d.querySelector('.access-matrix-table').textContent, /مدیریت افراد/);
    assert.match(f.d.querySelector('.access-matrix-table').textContent, /مدیریت پروژه‌ها/);

    const letterCells = [...f.d.querySelectorAll('[data-access-feature="letters"][data-access-user="test-owner"]')];
    assert.equal(letterCells.length, 2, 'نامه‌های ورودی و خروجی یک منبع دسترسی مشترک دارند');
    letterCells[0].click();
    assert.ok([...f.d.querySelectorAll('[data-access-feature="letters"][data-access-user="test-owner"]')].every(button => button.getAttribute('aria-pressed') === 'true'));

    f.d.querySelector('[data-access-feature="projects"][data-access-user="test-owner"]').click();
    f.d.querySelector('[data-access-matrix-save]').click();
    await until(() => f.calls.some(call => call.endpoint === 'set_feature_access' && call.body.p_feature_key === 'projects'));
    const saved = f.calls.find(call => call.endpoint === 'set_feature_access' && call.body.p_feature_key === 'projects').body.p_grants[0];
    assert.deepEqual({ view: saved.can_view, create: saved.can_create, edit: saved.can_edit, delete: saved.can_delete, export: saved.can_export }, { view: true, create: true, edit: true, delete: true, export: true });
  } finally {
    await f.dispose();
  }
});

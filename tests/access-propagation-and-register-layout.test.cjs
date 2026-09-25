const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('parts register keeps the common table footer at the bottom of its workspace', () => {
  const css = read('assets/css/enterprise-features.css');
  const pager = read('assets/js/table-pages.js');
  assert.match(css, /#partsView\.focus-table-view:not\(\.hidden\)/);
  assert.match(css, /part-handover-panel>:is\(\.table-pagination,\.suite-table-options\)/);
  assert.match(css, /#partsView \.table-pagination select\{[^}]*border-radius:10px!important[^}]*background:#fff!important/);
  assert.match(pager, /pager\.className='table-pagination'/);
});

test('permanent vehicle register reads newest rows first without changing temporary ordering', () => {
  const vehicles = read('assets/js/vehicles.js');
  assert.match(vehicles, /scope==='vehiclePermanent'\?'id\.desc':'id\.asc'/);
  assert.match(vehicles, /scope==='vehicleTemporary'\?rows\.reverse\(\):rows/);
  assert.match(vehicles, /scope==='vehiclePermanent'\?data\[scope\]\.rows\.length-index:index\+1/);
});

test('every standalone task tab has a distinct feature grant and target grants update in place', () => {
  const navigation = read('assets/js/navigation-registry.js');
  const timeline = read('assets/js/timeline.js');
  const migration = read('supabase/migrations/20260923093000_access_propagation_and_timeline_scope.sql');
  assert.match(navigation, /\['taskTimeline', 'taskTimeline', 'تقویم و گانت'\]/);
  assert.match(timeline, /registerView\?\.\('taskTimeline',\{activate:activateView\}\)/);
  assert.match(migration, /update public\.feature_access_grants/);
  assert.match(migration, /public\.can_access_feature\('taskTimeline','view'\)/);
  assert.match(migration, /create policy tasks_scope_read/);
});

test('petty cash no longer renders an access-denied sentence inside its page', () => {
  assert.doesNotMatch(read('assets/js/petty-cash.js'), /دسترسی شما به گزارش تنخواه فعال نیست/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = fs.readFileSync('tests/browser/mock-api.js', 'utf8');
const source = fs.readFileSync('tests/browser/mock-project-report-api.js', 'utf8');
function fixture(scenario) {
  const w = { Response, URL, setTimeout, clearTimeout, setInterval() {}, atob,
    location: { href: 'http://127.0.0.1:9000/' } };
  w.window = w;
  vm.runInNewContext(base + '\n' + source, w);
  w.__projectReportFixture.configure(scenario);
  return { w, store: w.__projectReportFixture, api: w.__testApi,
    async call(endpoint, body = {}, method = 'POST') {
      const response = await w.fetch('http://127.0.0.1:9000/rest/v1/rpc/' + endpoint,
        { method, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    } };
}
test('browser fixture distinguishes ordinary cross-creator metadata from protected actions', async () => {
  const f = fixture('ordinary');
  const ws = (await f.call('list_project_workspace')).data;
  assert.notEqual(ws.projects[0].owner_id, f.api.actor.id);
  assert.equal(ws.projects[0].protected.can_delete, false);
  assert.equal(ws.items[1].protected.can_edit, false);
  assert.equal((await f.call('save_project_metadata', { p_project_id: 7101, p_payload: { title: 'Changed' } })).status, 200);
  assert.equal(f.store.projects[0].owner_id, ws.projects[0].owner_id);
  assert.equal((await f.call('save_project_metadata', { p_project_id: 7101, p_payload: { owner_id: f.api.actor.id } })).status, 403);
  for (const endpoint of ['save_project_activity', 'delete_project_activity', 'request_project_deletion']) assert.equal((await f.call(endpoint, {})).status, 403);
  assert.equal((await f.call('mutate_project_node', { p_project_id: 7101, p_item_id: 7202, p_action: 'delete', p_payload: {} })).status, 403);
});
test('browser fixture legacy controls return approval requests without direct task mutation', async () => {
  const f = fixture('legacy');
  const ws = (await f.call('list_project_workspace')).data;
  assert.equal(ws.projects[0].protected.can_create_activity, true);
  assert.equal(ws.items[1].protected.can_edit, true);
  assert.equal(ws.projects[1].protected.can_change_owner, true);
  const before = JSON.stringify(f.store.items);
  const result = await f.call('save_project_activity', { p_project_id: 7101, p_payload: { title: 'Approval only' } });
  assert.equal(result.data.applied_directly, false);
  assert.equal(JSON.stringify(f.store.items), before);
  assert.equal(f.store.requests.length, 1);
});
test('positive legacy owner choices are backed by the synthetic organization directory', async () => {
  const f = fixture('legacy'), ws = (await f.call('list_project_workspace')).data;
  for (const endpoint of ['organization_scope_directory_with_avatars', 'organization_scope_directory']) {
    const directory = (await f.call(endpoint)).data;
    const own = directory.find(row => row.is_current_position);
    assert.equal(own.occupant_id, f.api.actor.id);
    const child = directory.find(row => row.parent_position_id === own.position_id);
    assert.equal(child.occupant_id, f.api.profiles[0].id);
    assert(ws.projects[1].protected.owner_choice_ids.every(id => directory.some(row => row.occupant_id === id)));
  }
  for (const scenario of ['ordinary', 'timeline-only', 'performance-only']) {
    const other = fixture(scenario);
    assert.equal((await other.call('organization_scope_directory_with_avatars')).data.length, 0);
  }
});
test('shared browser fixture serves read-only report contracts for table and navigation audits', async () => {
  const w = { Response, URL, setTimeout, clearTimeout, setInterval() {}, atob };
  w.window = w;
  vm.runInNewContext(base, w);
  const call = async endpoint => {
    const result = await w.fetch('https://bamco.test/rest/v1/rpc/' + endpoint, { method: 'POST', body: '{}' });
    return { status: result.status, data: await result.json() };
  };
  const before = JSON.stringify(w.__testApi.tasks);
  for (const [endpoint, feature, count] of [['task_timeline_report_feed', 'taskTimeline', 1], ['performance_report_feed', 'performanceReport', 2]]) {
    const result = await call(endpoint);
    assert.equal(result.status, 200);
    assert.equal(result.data.schema, 'bamco.section-report.v1');
    assert.equal(result.data.feature, feature);
    assert.equal(result.data.tasks.length, count);
    assert(Array.isArray(result.data.definition_events));
    assert(result.data.profiles.every(row => Object.keys(row).sort().join(',') === 'display_name,id'));
    assert(!/request_id|routing|password|email|approval_status/.test(JSON.stringify(result.data)));
  }
  assert.equal(JSON.stringify(w.__testApi.tasks), before);
  w.__testApi.actor = w.__testApi.profiles[1];
  w.__testApi.featureAccess = [{ feature_key: 'performanceReport', can_view: true }];
  assert.equal((await call('performance_report_feed')).status, 200);
  assert.equal((await call('task_timeline_report_feed')).status, 403);
  w.__testApi.featureAccess.push({ feature_key: 'performanceReport', effect: 'deny' });
  assert.equal((await call('performance_report_feed')).status, 403);
  w.__testApi.actor = w.__testApi.profiles[0];
  w.__testApi.actor.active = false;
  assert.equal((await call('performance_report_feed')).status, 403);
});
test('browser fixture report-only accounts cannot reach the other report and never carry approval payloads', async () => {
  for (const [scenario, endpoint, other] of [
    ['timeline-only', 'task_timeline_report_feed', 'performance_report_feed'],
    ['performance-only', 'performance_report_feed', 'task_timeline_report_feed']
  ]) {
    const f = fixture(scenario), result = await f.call(endpoint);
    assert.equal(result.status, 200);
    assert.equal(result.data.tasks.length, 2);
    assert.equal((await f.call(other)).status, 403);
    assert.equal((await f.call('list_project_workspace')).status, 403);
    assert(!f.api.featureAccess.some(x => ['kanban', 'approvals'].includes(x.feature_key)));
    const encoded = JSON.stringify(result.data);
    assert(!/request_id|routing|password|email|approval_status/.test(encoded));
    assert(result.data.profiles.every(p => Object.keys(p).sort().join(',') === 'display_name,id'));
  }
});
test('browser fixture gates capture old successful responses before revocation', async () => {
  const f = fixture('timeline-only');
  f.store.revision = 'Old';
  f.store.holdNext('task_timeline_report_feed', 'old');
  const pending = f.call('task_timeline_report_feed');
  assert.equal(f.store.gates.old.entered, true);
  f.store.revision = 'New'; f.api.featureAccess = [];
  f.store.release('old');
  const result = await pending;
  assert.equal(result.status, 200);
  assert.match(result.data.tasks[0].title, /^Old/);
  assert.equal((await f.call('task_timeline_report_feed')).status, 403);
  assert.equal(f.store.expired.length, 0);
});
test('browser fixture supports fail-closed malformed/failed responses without changing base mock', async () => {
  const f = fixture('performance-only');
  f.store.malformedNext = 'performance_report_feed';
  assert.equal((await f.call('performance_report_feed')).data.schema, 'wrong-report');
  f.store.failNext = 'performance_report_feed';
  assert.equal((await f.call('performance_report_feed')).status, 503);
  assert.equal((await f.call('performance_report_feed')).data.schema, 'bamco.section-report.v1');
  assert.equal((await f.call('effective_feature_access')).data.schema, 'bamco.feature-access.v1');
});

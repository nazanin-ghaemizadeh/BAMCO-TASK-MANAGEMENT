const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/navigation-registry.js', 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const payload = (can_view = true) => ({ schema: 'bamco.feature-access.v1', grants: [{ feature_key: 'invoices', can_view }] });
function fixture(call) {
  const windowEvents = new EventTarget(), document = new EventTarget();
  Object.assign(document, { readyState: 'loading', hidden: false, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; } });
  const state = { token: 'token-a', user: { id: 'owner' }, profile: { id: 'owner', role: 'owner', active: true }, view: 'home' };
  let generation = 1;
  const c = { document, Bamco: { state }, BamcoData: { rpc: call }, bamcoAuth: { snapshot: () => ({ generation, userId: state.user?.id }) },
    Event, CustomEvent, queueMicrotask, setTimeout, clearTimeout,
    addEventListener: windowEvents.addEventListener.bind(windowEvents), dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents) };
  c.window = c; vm.runInNewContext(source, c);
  return { access: c.BamcoAccess, catalog: c.BamcoNavigationCatalog, state, document, window: c,
    nextSession() { generation++; }, fire(type, detail) { document.dispatchEvent(new CustomEvent(type, { detail })); } };
}

test('an older same-session response cannot undo the latest grant or revocation', async () => {
  for (const latest of [true, false]) {
    const old = deferred(), fresh = deferred(); let calls = 0;
    const f = fixture(() => (++calls === 1 ? old.promise : fresh.promise));
    const previous = f.access.refresh(), current = f.access.invalidate();
    fresh.resolve(payload(latest)); await current;
    old.resolve(payload(!latest)); await previous;
    assert.equal(f.access.can('invoices'), latest);
  }
});

test('an older access failure cannot hide tabs after a newer successful refresh', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const f = fixture(() => (++calls === 1 ? old.promise : fresh.promise));
  const previous = f.access.refresh(), current = f.access.invalidate();
  fresh.resolve(payload()); await current;
  old.reject(new Error('old disconnected request')); await previous;
  assert.equal(f.access.can('invoices'), true);
  assert.equal(f.access.snapshot().unavailable, false);
});

test('initial route waiters join an in-flight replacement instead of seeing premature denial', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0, settled = false;
  const f = fixture(() => (++calls === 1 ? old.promise : fresh.promise));
  const previous = f.access.refresh().then(result => { settled = true; return result; }), current = f.access.invalidate();
  old.resolve(payload(false)); await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'the route must await the latest authoritative response');
  fresh.resolve(payload(true)); await Promise.all([previous, current]);
  assert.equal(f.access.can('invoices'), true);
});

test('same-session token renewal retains the valid authoritative response', async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  const request = f.access.refresh(); f.state.token = 'renewed-token';
  pending.resolve(payload()); await request;
  assert.equal(f.access.isReady(), true);
  assert.equal(f.access.can('invoices'), true);
});

test('clear and same-user re-login invalidate both cached and in-flight grants', async () => {
  const pending = deferred(), f = fixture(() => pending.promise);
  const request = f.access.refresh(); f.access.clear(); f.nextSession(); f.state.token = 'new-login';
  pending.resolve(payload()); await request;
  assert.equal(f.access.isReady(), false);
  assert.equal(f.access.can('invoices'), false);
  const ready = fixture(async () => payload()); await ready.access.refresh();
  ready.nextSession();
  assert.equal(ready.access.can('invoices'), false);
});

test('inactive or signed-out accounts cannot reuse cached grants, including manager UI bypass', async () => {
  for (const role of ['owner', 'manager']) {
    const f = fixture(async () => payload()); f.state.profile.role = role; await f.access.refresh();
    f.state.profile.active = false; assert.equal(f.access.can('invoices'), false);
    f.state.profile.active = true; f.state.token = ''; assert.equal(f.access.can('invoices'), false);
  }
});

test('a new account cannot temporarily inherit the previous account manager profile', async () => {
  const f = fixture(async () => payload()); f.state.profile.role = 'manager'; await f.access.refresh();
  f.state.user = { id: 'different-owner' }; f.nextSession();
  assert.equal(f.access.can('invoices'), false);
  assert.equal(f.access.isSystemManager(), false);
});

test('role membership, own profile, foreground, pageshow and reconnection refresh access without polling', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return payload(); });
  await f.access.refresh();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  for (const domain of ['access', 'organization']) {
    const before = calls; f.fire('bamco:domain-invalidated', { domain }); await flush(); assert.equal(calls, before + 1);
  }
  let before = calls; f.fire('bamco:profiles-updated', { ids: ['other'] }); await flush(); assert.equal(calls, before);
  f.fire('bamco:profiles-updated', { ids: ['owner'] }); await flush(); assert.equal(calls, before + 1);
  before = calls; f.document.hidden = true; f.fire('visibilitychange'); await flush(); assert.equal(calls, before);
  f.document.hidden = false; f.fire('visibilitychange'); await flush(); assert.equal(calls, before + 1);
  for (const type of ['pageshow', 'online', 'focus']) {
    before = calls; f.window.dispatchEvent(new Event(type)); await flush(); assert.equal(calls, before + 1);
  }
});

test('failed or malformed canonical responses remain fail-closed and recover on a valid response', async () => {
  let response = {}; const f = fixture(async () => response);
  await f.access.refresh(); assert.equal(f.access.can('invoices'), false); assert.equal(f.access.can('settings'), true);
  response = payload(); await f.access.refresh(); assert.equal(f.access.can('invoices'), true);
});

test('access matrix uses its existing settings management authority in the canonical route', () => {
  const f = fixture(async () => payload()), route = f.catalog.routeFor('accessMatrix');
  assert.equal(route.featureKey, 'settings'); assert.equal(route.action, 'manage_access');
  assert.equal(f.catalog.routeFor('invoices').action, 'view');
  assert.equal(f.catalog.featureTitle('settings'), 'تنظیمات کاربری');
});

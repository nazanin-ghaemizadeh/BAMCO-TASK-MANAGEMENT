const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

test('feature access refresh never opens inactive pages over the card home',async t=>{
  const f=await fixture(),{w,d}=f;t.after(()=>f.dispose());
  w.bamcoShowHome();
  w.BamcoAccess.applyNavigation();
  await pause(40);
  const visibleHome=[...d.querySelectorAll('.workspace > .view')].filter(view=>!view.classList.contains('hidden')).map(view=>view.id);
  assert.deepEqual(visibleHome,['homeView'],'access grants must not unhide every granted view while home is active');

  await f.open('responseTracking');
  w.BamcoAccess.applyNavigation();
  await pause(40);
  const visibleRoute=[...d.querySelectorAll('.workspace > .view')].filter(view=>!view.classList.contains('hidden')).map(view=>view.id);
  assert.deepEqual(visibleRoute,['responseTrackingView'],'opening one route must leave exactly one workspace page visible');
  assert.equal(w.eval('state.view'),'responseTracking');
  assert.deepEqual(f.errors,[]);
});

test('access management is available only from the admin access page',async t=>{
  const f=await fixture(),{d}=f;t.after(()=>f.dispose());
  await f.open('responseTracking');
  assert.equal(d.querySelector('#responseTrackingView #featureAccessControl'),null);
  assert(d.querySelector('#responseTrackingView [data-response-access]').classList.contains('hidden'));
  await f.open('accessMatrix');
  assert.equal(d.querySelector('#accessMatrixView').classList.contains('hidden'),false);
  assert.match(d.querySelector('#accessMatrixView').textContent,/دسترسی/);
  assert.deepEqual(f.errors,[]);
});

test('authorization has a dedicated denial state and cannot own renderer hidden classes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/navigation-registry.js'),'utf8');
  const start=source.indexOf("document.querySelectorAll('[data-feature-key][data-feature-action]')");
  const end=source.indexOf('const current = state().view;',start);
  const block=source.slice(start,end);
  assert.match(block,/data-bamco-access-denied/);
  assert.doesNotMatch(block,/classList\.toggle\('hidden'/);
  const css=fs.readFileSync(path.join(__dirname,'../assets/css/app.css'),'utf8');
  assert.match(css,/\[data-bamco-access-denied="true"\]\{display:none!important\}/);
});

test('an RLS-filtered realtime access change refreshes the recipient portal immediately',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../assets/js/navigation-registry.js'),'utf8');
  assert.match(source,/document\.addEventListener\('bamco:domain-invalidated'/);
  assert.match(source,/event\.detail\?\.domain === 'access'/);
  assert.match(source,/void invalidate\(\)/);
});

test('people usernames use organizational email and local access buttons stay absent', async t => {
  const f = await fixture({ fetchResult: ({ endpoint }) => {
    if (endpoint === 'feature_access_manage_snapshot') return {
      schema: 'bamco.feature-access.v1', feature: { feature_key: 'letters' },
      users: [
        { id: 'test-manager', display_name: 'مدیر آزمایشی', email: 'manager@example.test', active: true },
        { id: 'test-owner', display_name: 'متولی آزمایشی', email: 'owner@example.test', active: true }
      ], grants: [], effective_grants: []
    };
  }});
  t.after(() => f.dispose());

  await f.open('people');
  await until(() => f.d.querySelector('#peopleBody [data-id="test-owner"]'));
  const owner = f.d.querySelector('#peopleBody [data-id="test-owner"]');
  assert.equal(owner.cells[6].textContent.trim(), 'owner@example.test');
  assert.equal(owner.cells[7].textContent.trim(), 'owner@example.test');

  await f.open('lettersIncoming');
  assert(f.d.querySelector('#lettersIncomingView [data-letter-action="access"]').classList.contains('hidden'));
  assert.equal(f.d.querySelector('#lettersIncomingView #featureAccessControl'),null);
  assert.deepEqual(f.errors, []);
});

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

test('access management is a normal action beside the current page controls',async t=>{
  const f=await fixture(),{d}=f;t.after(()=>f.dispose());
  await f.open('responseTracking');
  await until(()=>{
    const button=d.querySelector('#featureAccessControl');
    return button&&!button.classList.contains('hidden')&&button.closest('#responseTrackingView')&&button.parentElement?.classList.contains('bamco-command-bar');
  });
  const button=d.querySelector('#featureAccessControl');
  assert(button.classList.contains('ghost'));
  assert.equal(button.textContent.trim(),'مدیریت دسترسی');
  assert(button.parentElement.classList.contains('bamco-command-bar'));
  assert(button.closest('#responseTrackingView'));

  const css=fs.readFileSync(path.join(__dirname,'../assets/css/access-editor.css'),'utf8');
  assert.doesNotMatch(css,/body\.content-only[\s\S]*?#featureAccessControl/,'access management must not return to the old floating fixed-position layout');
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

test('people usernames use organizational email and the access editor shows names only', async t => {
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

  await f.open('letters');
  f.d.querySelector('#lettersAccess').click();
  await until(() => f.d.querySelector('#letterAccessDialog .permission-person'));
  const dialog = f.d.querySelector('#letterAccessDialog');
  assert.equal(dialog.querySelector('.permission-person-identity small'), null);
  assert.equal(dialog.querySelector('.permission-actions'), null);
  assert(!dialog.textContent.includes('برداشتن مشاهده، یک منع صریح ایجاد می‌کند'));
  assert.deepEqual(f.errors, []);
});

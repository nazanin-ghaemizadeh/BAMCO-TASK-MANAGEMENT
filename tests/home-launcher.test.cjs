const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('home launcher opens only visible routes and keeps account-specific layout choices',async()=>{
 const f=await fixture();
 try{
  const {d,w}=f,home=d.querySelector('#homeView');
  assert.equal(home.dataset.layout,'launcher');
  const tasks=d.querySelector('#nav .nav-group[data-group="tasks"]');
  const hidden=tasks.querySelector('[data-view="archive"]');hidden.classList.add('hidden');
  tasks.querySelector('.home-group-trigger').click();
  const dialog=d.querySelector('.home-launcher-dialog');
  assert.equal(dialog.open,true);
  assert.match(dialog.textContent,/کانبان/);
  assert.doesNotMatch(dialog.textContent,/آرشیو/);
  [...dialog.querySelectorAll('.home-launcher-route')].find(button=>button.textContent.includes('کانبان')).click();
  await until(()=>w.Bamco.state.view==='kanban');
  assert.equal(dialog.open,false);
  hidden.classList.remove('hidden');

  await f.open('settings');
  const settings=d.querySelector('#homeLayoutSettings');
  assert.equal(settings.querySelector('input[value="launcher"]').checked,true);
  const cards=settings.querySelector('input[value="cards"]');cards.checked=true;cards.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(home.dataset.layout,'cards');
  assert.equal(JSON.parse(w.localStorage.getItem('bamco.home.layout.v1.test-manager')).mode,'cards');

  const custom=settings.querySelector('input[value="custom"]');custom.checked=true;custom.dispatchEvent(new w.Event('change',{bubbles:true}));
  const before=w.bamcoHomeLayout.get().order;
  settings.querySelector('[data-home-move="1"]').click();
  const after=w.bamcoHomeLayout.get().order;
  assert.equal(after[0],before[1]);assert.equal(after[1],before[0]);
  assert.equal(home.dataset.layout,'custom');
  w.bamcoShowHome();
  assert.equal(d.querySelector(`#nav .nav-group[data-group="${after[0]}"]`).style.order,'0');

  w.Bamco.state.user={id:'test-owner'};w.bamcoHomeLayout.refresh();
  assert.equal(home.dataset.layout,'launcher','another account must not inherit the manager layout');
  w.Bamco.state.user={id:'test-manager'};w.bamcoHomeLayout.refresh();
  assert.equal(home.dataset.layout,'custom');
  assert.deepEqual(w.bamcoHomeLayout.get().order.slice(0,2),after.slice(0,2));
 }finally{await f.dispose()}
});

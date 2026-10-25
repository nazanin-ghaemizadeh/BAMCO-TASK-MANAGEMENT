const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,pause,until}=require('./helpers/app-fixture.cjs');

test('custodian launchers yield to timers, preserve denied routes and open authorized pages',async t=>{
 const f=await fixture({role:'owner'}),{w,d}=f;t.after(()=>f.dispose());
 const denied=d.querySelector('#nav [data-view="statisticalProcessControl"]');
 assert.equal(w.BamcoAccess.can('statisticalProcessControl','view'),false);
 for(const group of d.querySelectorAll('#nav .nav-group:not(.hidden)')){
  const trigger=group.querySelector('.home-group-trigger');if(!trigger)continue;
  trigger.click();await pause(30);
  const dialog=d.querySelector('.home-launcher-dialog');
  assert.equal(dialog.open,true,group.dataset.group);
  assert(dialog.querySelector('.home-launcher-route'));
  assert.equal(denied.hidden,true,'label decoration must preserve denied visibility');
  dialog.close();
 }
 for(const route of ['kanban','messages','documents']){
  w.bamcoShowHome();
  const source=d.querySelector(`#nav [data-view="${route}"]`);
  source.closest('.nav-group').querySelector('.home-group-trigger').click();
  await pause(30);
  d.querySelector(`.home-launcher-route[data-route="${route}"]`).click();
  await until(()=>w.Bamco.state.view===route);
  assert.equal(d.querySelector('.home-launcher-dialog').open,false);
  assert.equal(d.querySelector(`#${route}View`).classList.contains('hidden'),false);
 }
 assert.deepEqual(f.errors,[]);
});

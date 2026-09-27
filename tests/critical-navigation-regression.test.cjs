const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('cash and both vehicle registers open through the canonical navigation lifecycle',async t=>{
 const f=await fixture({tables:{
  petty_cash_entries:[{id:31,entry_no:1,event_date:'2026-09-27',entry_type:'expense',amount:250000,status:'active',category:'خرید',description:'آزمون'}],
  petty_cash_attachments:[],
  vehicle_permanent_records:[{id:41,plate_number:'12الف345',vehicle_type:'Sedan'}],
  vehicle_temporary_records:[{id:42,plate_number:'22ب456',vehicle_type:'SUV'}]
 }});t.after(()=>f.dispose());

 await f.open('pettyCash');
 await until(()=>f.d.querySelector('#pettyCashBody tr'));
 assert.equal(f.d.querySelector('#pettyCashView').classList.contains('hidden'),false);
 assert.match(f.d.querySelector('#pettyCashBody').textContent,/خرید/);

 for(const [route,rowId] of [['vehiclePermanent','41'],['vehicleTemporary','42']]){
  await f.open(route);
  await until(()=>f.d.querySelector(`#${route}View tbody tr[data-id="${rowId}"]`));
  assert.equal(f.d.querySelector(`#${route}View`).classList.contains('hidden'),false);
 }
 assert.deepEqual(f.errors,[]);
});

test('vehicle buttons have one navigation owner and petty cash registers its route',()=>{
 const fs=require('node:fs');
 const sidebar=fs.readFileSync('assets/js/sidebar.js','utf8');
 const pettyCash=fs.readFileSync('assets/js/petty-cash.js','utf8');
 const navigation=fs.readFileSync('assets/js/core/application.js','utf8');
 assert.doesNotMatch(sidebar,/\[permanent,temporary\]\.filter\(Boolean\)\.forEach/);
 assert.match(pettyCash,/registerView\?\.\('pettyCash'/);
 assert.match(navigation,/function activateView\(id\)/);
});

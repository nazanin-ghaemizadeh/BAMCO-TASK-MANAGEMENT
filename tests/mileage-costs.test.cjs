const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('mileage costs opens independently and saves a freely entered cost type',async t=>{
 const f=await fixture({tables:{mileage_cost_entries:[],mileage_cost_attachments:[],petty_cash_entries:[{id:'cash-only',entry_no:1,event_date:'2026-11-11',entry_type:'expense',amount:'123',category:'بنزین',status:'active'}]}});
 t.after(()=>f.dispose());
 await f.open('mileageCosts');
 await until(()=>f.d.querySelector('#addMileageEntry'));
 f.d.querySelector('#addMileageEntry').click();
 const form=f.d.querySelector('#mileageCostsDialog form');assert(form);
 assert.equal(form.elements.category.tagName,'INPUT');
 form.elements.category.value='هزینه اختصاصی پیمایش';form.elements.amount.value='123456';form.elements.responsible_id.value='test-manager';
 await form.onsubmit({preventDefault(){}});
 await until(()=>f.d.querySelector('#mileageCostsBody').textContent.includes('هزینه اختصاصی پیمایش'));
 assert(!f.d.querySelector('#mileageCostsBody').textContent.includes('بنزین'));
 await f.open('pettyCash');await until(()=>f.d.querySelector('#pettyCashBody').textContent.includes('بنزین'));
 assert(!f.d.querySelector('#pettyCashBody').textContent.includes('هزینه اختصاصی پیمایش'));
});

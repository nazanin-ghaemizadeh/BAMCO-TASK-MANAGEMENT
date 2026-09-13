const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('owner gets only the granted vehicle tab and sees no access management',async t=>{
 const f=await fixture({role:'owner',tables:{vehicle_access:[{user_id:'test-owner',scope:'permanent'}],vehicle_permanent_records:[]}});t.after(()=>f.dispose());
 await until(()=>!f.d.querySelector('[data-view=vehiclePermanent]').classList.contains('hidden'));
 assert(f.d.querySelector('[data-view=vehicleTemporary]').classList.contains('hidden'));
 await f.open('vehiclePermanent');assert(f.d.querySelector('#vehiclePermanentView .vehicle-access-button').classList.contains('hidden'));
 f.d.querySelector('#vehiclePermanentView .vehicle-add').click();assert(f.d.querySelector('#vehicleRecordDialog').open);f.d.querySelector('#vehicleRecordForm').elements.plate_number.value='TEST';f.d.querySelector('#vehicleRecordForm').requestSubmit();await until(()=>f.tables.vehicle_permanent_records.length===1);
 f.tables.vehicle_access.length=0;f.w.dispatchEvent(new f.w.Event('focus'));await until(()=>f.d.querySelector('[data-view=vehiclePermanent]').classList.contains('hidden'));assert(f.d.querySelector('#vehiclePermanentView').classList.contains('hidden'));assert.deepEqual(f.errors,[]);
});
test('manager saves scoped vehicle grants in the shared searchable dialog',async t=>{
 const f=await fixture({tables:{vehicle_access:[]}});t.after(()=>f.dispose());await f.open('vehicleTemporary');await until(()=>!f.d.querySelector('#vehicleTemporaryView .vehicle-access-button').classList.contains('hidden'));
 f.d.querySelector('#vehicleTemporaryView .vehicle-access-button').click();await until(()=>f.d.querySelector('#vehicleAccessDialog input[type=checkbox]'));
 const dialog=f.d.querySelector('#vehicleAccessDialog');assert(dialog.classList.contains('permission-dialog'));assert(dialog.querySelector('[data-search]'));dialog.querySelector('input[value="test-owner"]').checked=true;dialog.querySelector('form').requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='set_vehicle_access'));const call=f.calls.find(c=>c.endpoint==='set_vehicle_access');assert.equal(call.body.p_scope,'temporary');assert.deepEqual(call.body.p_user_ids,['test-owner']);assert.deepEqual(f.errors,[]);
});
test('owner preview is removed from navigation and workspace',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 assert.equal(f.d.querySelector('[data-view="ownerPreview"],#ownerPreviewView'),null);
 assert(!f.calls.some(c=>c.endpoint==='owner_workspace_preview'));assert.deepEqual(f.errors,[]);
});

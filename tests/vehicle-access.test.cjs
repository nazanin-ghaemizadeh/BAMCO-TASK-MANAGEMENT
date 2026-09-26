const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('owner gets only the granted vehicle tab and sees no access management',async t=>{
 let allowed=true;
 const f=await fixture({role:'owner',tables:{vehicle_permanent_records:[]},fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:allowed?[{feature_key:'vehiclePermanent',can_view:true,can_create:true,can_edit:true,can_delete:true,can_export:true}]:[]}:undefined});t.after(()=>f.dispose());
 await until(()=>!f.d.querySelector('[data-view=vehiclePermanent]').classList.contains('hidden'));
 assert(f.d.querySelector('[data-view=vehicleTemporary]').classList.contains('hidden'));
 await f.open('vehiclePermanent');assert(f.d.querySelector('#vehiclePermanentView .vehicle-access-button').classList.contains('hidden'));
 f.d.querySelector('#vehiclePermanentView .vehicle-add').click();assert(f.d.querySelector('#vehicleRecordDialog').open);f.d.querySelector('#vehicleRecordForm').elements.plate_number.value='TEST';f.d.querySelector('#vehicleRecordForm').requestSubmit();await until(()=>f.tables.vehicle_permanent_records.length===1);
 allowed=false;f.w.dispatchEvent(new f.w.Event('focus'));await until(()=>f.d.querySelector('[data-view=vehiclePermanent]').classList.contains('hidden'));assert(f.d.querySelector('#vehiclePermanentView').classList.contains('hidden'));assert.deepEqual(f.errors,[]);
});
test('manager vehicle pages also keep access management in the admin page only',async t=>{const f=await fixture();t.after(()=>f.dispose());await f.open('vehicleTemporary');assert.match(require('node:fs').readFileSync('assets/css/personal-workspace.css','utf8'),/\.vehicle-access-button[^}]*display:none!important/);assert.equal(f.d.querySelector('#vehicleTemporaryView #featureAccessControl'),null);await f.open('accessMatrix');assert.equal(f.d.querySelector('#accessMatrixView').classList.contains('hidden'),false);assert.deepEqual(f.errors,[])});
test('each vehicle tab displays identifiers from one independently of database keys',async t=>{
 const f=await fixture({tables:{vehicle_temporary_records:[{id:4,plate_number:'79و'}]}});t.after(()=>f.dispose());await f.open('vehicleTemporary');await until(()=>f.d.querySelector('#vehicleTemporaryView tbody tr[data-id]'));
 assert.equal(f.d.querySelector('#vehicleTemporaryView tbody tr[data-id] td').textContent.trim(),'۱');assert.deepEqual(f.errors,[]);
});

test('vehicle registers localize every number except the English vehicle type',async t=>{
 const f=await fixture({tables:{vehicle_temporary_records:[{id:4,plate_number:'12 ب 345',vehicle_type:'BMW X5',chassis_number:'CH-123',last_mileage:7438,exit_time:'08:20'}]}});t.after(()=>f.dispose());await f.open('vehicleTemporary');await until(()=>f.d.querySelector('#vehicleTemporaryView tbody tr[data-id]'));
 const row=f.d.querySelector('#vehicleTemporaryView tbody tr[data-id]');
 assert.match(row.textContent,/۷۴۳۸/);assert.match(row.textContent,/۰۸:۲۰/);assert.match(row.textContent,/CH-۱۲۳/);
 const type=row.querySelector('.vehicle-type-latin');assert.equal(type.textContent,'BMW X5');assert.match(type.getAttribute('style')||type.className,/vehicle-type-latin/);
 row.click();f.d.querySelector('#vehicleTemporaryView .vehicle-edit').click();const form=f.d.querySelector('#vehicleRecordForm');
 assert.equal(form.elements.last_mileage.value,'۷۴۳۸');assert.equal(form.elements.vehicle_type.value,'BMW X5');assert(form.elements.vehicle_type.classList.contains('vehicle-type-latin'));
 assert.deepEqual(f.errors,[]);
});
test('owner preview is removed from navigation and workspace',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 assert.equal(f.d.querySelector('[data-view="ownerPreview"],#ownerPreviewView'),null);
 assert(!f.calls.some(c=>c.endpoint==='owner_workspace_preview'));assert.deepEqual(f.errors,[]);
});

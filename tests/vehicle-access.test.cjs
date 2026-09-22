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
test('manager saves scoped vehicle grants through the shared feature editor',async t=>{
 const f=await fixture({fetchResult:({endpoint,body})=>{
  if(endpoint==='feature_access_manage_snapshot')return {schema:'bamco.feature-access.v1',feature:{feature_key:body.p_feature_key},users:[{id:'test-manager',display_name:'مدیر آزمایشی',active:true},{id:'test-owner',display_name:'متولی آزمایشی',active:true}],grants:[],effective_grants:[]};
  if(endpoint==='set_feature_access')return {schema:'bamco.feature-access.v1',feature_key:body.p_feature_key,changed:1};
 }});t.after(()=>f.dispose());await f.open('vehicleTemporary');await until(()=>!f.d.querySelector('#vehicleTemporaryView .vehicle-access-button').classList.contains('hidden'));
 f.d.querySelector('#vehicleTemporaryView .vehicle-access-button').click();await until(()=>f.d.querySelector('#vehicleAccessDialog input[type=checkbox]'));
 const dialog=f.d.querySelector('#vehicleAccessDialog');assert(dialog.classList.contains('permission-dialog'));assert(dialog.querySelector('[data-search]'));dialog.querySelector('input[value="test-owner"]').click();dialog.querySelector('form').requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='set_feature_access'));const call=f.calls.find(c=>c.endpoint==='set_feature_access');assert.equal(call.body.p_feature_key,'vehicleTemporary');assert.deepEqual(call.body.p_grants,[{user_id:'test-owner',effect:'allow',can_view:true,can_create:false,can_edit:false,can_delete:false,can_export:false}]);assert.deepEqual(f.errors,[]);
});
test('each vehicle tab displays identifiers from one independently of database keys',async t=>{
 const f=await fixture({tables:{vehicle_temporary_records:[{id:4,plate_number:'79و'}]}});t.after(()=>f.dispose());await f.open('vehicleTemporary');await until(()=>f.d.querySelector('#vehicleTemporaryView tbody tr[data-id]'));
 assert.equal(f.d.querySelector('#vehicleTemporaryView tbody tr[data-id] td').textContent.trim(),'۱');assert.deepEqual(f.errors,[]);
});
test('owner preview is removed from navigation and workspace',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 assert.equal(f.d.querySelector('[data-view="ownerPreview"],#ownerPreviewView'),null);
 assert(!f.calls.some(c=>c.endpoint==='owner_workspace_preview'));assert.deepEqual(f.errors,[]);
});

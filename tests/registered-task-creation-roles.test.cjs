const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
for(const role of ['manager','head','deputy','expert','supervisor','office_manager'])test(`registered creation for ${role}`,async t=>{
 const allowed=['manager','head','deputy'].includes(role);
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>{
  if(endpoint==='organization_scope_directory_with_avatars'||endpoint==='organization_scope_directory')return [{position_id:1,role_key:role,is_current_position:true,occupant_id:'test-owner',occupant_active:true}];
 }});t.after(()=>f.dispose());
 await f.w.bamcoOrganizationAccess.refresh();await f.open('kanban');
 f.d.querySelector('#addTaskBtn').click();await until(()=>f.d.querySelector('#taskDialog').open);
 const form=f.d.querySelector('#taskForm'),registered=[...form.elements.status.options].find(x=>x.value==='ثبت شده');
 assert.equal(!!registered,allowed);
 if(allowed){
  assert.equal(form.elements.status.value,'ثبت شده');form.elements.title.value='Synthetic intake';form.requestSubmit();
  await until(()=>f.calls.some(c=>c.endpoint==='tasks'&&c.method==='POST'));
  const call=f.calls.find(c=>c.endpoint==='tasks'&&c.method==='POST');assert.equal(call.body.owner_id,null);assert.equal(call.body.created_by,'test-owner');
  assert.equal(f.calls.some(c=>c.endpoint==='submit_change_request'),false);
 }else assert.notEqual(form.elements.status.value,'ثبت شده');
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

for(const role of ['head','manager'])test(role+' combines ordinary edit with scoped intake assignment without create, and rejects stale saves',async t=>{
 const tasks=[{id:201,title:'Synthetic mixed-grant intake',description:'Before',owner_id:null,created_by:role==='manager'?'test-owner':'test-child',status:'ثبت شده',priority:'متوسط',start_date:null,due_date:null,done_date:null,reminder_days:0,archived:false,row_version:1}];
 const directory=[
  {position_id:1,parent_position_id:null,role_key:role,occupant_id:'test-owner',occupant_full_name:'Synthetic supervisor',occupant_active:true,is_current_position:true},
  {position_id:2,parent_position_id:1,role_key:'expert',occupant_id:'test-child',occupant_full_name:'Synthetic child',occupant_active:true,is_current_position:false},
  {position_id:3,parent_position_id:2,role_key:'expert',occupant_id:'test-grandchild',occupant_full_name:'Synthetic grandchild',occupant_active:true,is_current_position:false}
 ];
 const f=await fixture({role:'owner',tables:{tasks},fetchResult:({endpoint,method,data})=>{
  if(endpoint==='effective_feature_access')return{schema:'bamco.feature-access.v1',kanban_supervision:true,kanban_assignment:true,kanban_intake_creator_ids:['test-owner','test-child','test-grandchild'],kanban_supervised_owner_ids:['test-child','test-grandchild'],grants:[{feature_key:'kanban',can_view:true,can_edit:true,can_create:false}]};
  if(['organization_scope_directory_with_avatars','organization_scope_directory'].includes(endpoint))return directory;
  if(endpoint==='task_status_view')return tasks;
  if(endpoint==='tasks'&&method==='PATCH'){for(const row of data)row.row_version++;return data;}
 }});
 t.after(()=>f.dispose());
 const {w,d}=f;
 await w.bamcoOrganizationAccess.refresh();await w.eval('refresh()');w.openEdit(201);
 assert.equal(w.BamcoAccess.isSystemManager(),false);
 assert.equal(w.BamcoAccess.canExplicit('kanban','edit'),true);
 assert.equal(w.BamcoAccess.canExplicit('kanban','create'),false);
 assert.equal(w.BamcoAccess.canAssignKanban(),true);
 const form=d.querySelector('#taskForm');
 assert.equal([...form.elements.status.options].find(option=>option.value==='انجام شده').disabled,true,'ownerless intake follows bounded server authority despite ordinary edit');
 form.elements.status.value='منتظر پاسخ';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(form.elements.owner_id.disabled,false);
 assert.deepEqual([...form.elements.owner_id.options].map(option=>option.value).sort(),['','test-child','test-grandchild']);
 form.elements.owner_id.value='test-grandchild';form.elements.start_date.value='2026-10-05';
 delete w.Bamco.state.editing.row_version;form.requestSubmit();
 await until(()=>f.calls.some(call=>call.endpoint==='ui-notice'&&String(call.body).includes('برای تخصیص، صفحه را تازه‌سازی کنید')));
 assert.equal(f.calls.filter(call=>call.endpoint==='tasks'&&call.method==='PATCH').length,0,'missing version cannot issue an unguarded claim');
 w.Bamco.state.editing.row_version=1;form.requestSubmit();
 await until(()=>f.calls.some(call=>call.endpoint==='tasks'&&call.method==='PATCH'));
 const first=f.calls.find(call=>call.endpoint==='tasks'&&call.method==='PATCH');
 assert.equal(first.body.owner_id,'test-grandchild');
 assert.equal(new URL(first.url).searchParams.get('row_version'),'eq.1');
 await until(()=>!d.querySelector('#taskDialog').open);await w.eval('refresh()');w.openEdit(201);
 assert.equal(form.elements.owner_id.value,'test-grandchild');assert.equal(w.Bamco.state.editing.row_version,2);
 assert.equal([...form.elements.status.options].find(option=>option.value==='انجام شده').disabled,false,'existing ordinary edit authority is retained once the task has a subordinate owner');
 tasks[0].row_version++;tasks[0].description='Committed elsewhere';
 form.elements.description.value='Stale replacement';form.requestSubmit();
 await until(()=>f.calls.some(call=>call.endpoint==='ui-notice'&&String(call.body).includes('وظیفه یا دسترسی شما تغییر کرده است')));
 assert.equal(tasks[0].description,'Committed elsewhere');
 assert.equal(d.querySelector('#taskDialog').open,true);
 assert.equal(new URL(f.calls.filter(call=>call.endpoint==='tasks'&&call.method==='PATCH').at(-1).url).searchParams.get('row_version'),'eq.2');
});

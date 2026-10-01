const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

const managerDirectory=[
 {position_id:20,parent_position_id:10,role_key:'manager',role_title:'مدیر',role_level_no:40,occupant_id:'test-owner',occupant_active:true,is_current_position:true},
 {position_id:30,parent_position_id:20,role_key:'expert',role_title:'کارشناس',role_level_no:30,occupant_id:'test-subordinate',occupant_active:true,is_current_position:false},
 {position_id:10,parent_position_id:null,role_key:'deputy',role_title:'معاون',role_level_no:50,occupant_id:'test-manager',occupant_active:true,is_current_position:false}
];
test('organizational manager creates own task directly, keeps descendants direct and rejects peers',async t=>{
 const f=await fixture({role:'owner',tables:{tasks:[]},fetchResult:async({endpoint})=>endpoint.startsWith('organization_scope_directory')?managerDirectory:undefined});
 t.after(()=>f.dispose());const {w,d}=f;
 await w.bamcoOrganizationAccess.refresh();await f.open('kanban');
 assert.equal(w.eval("canDirectlyCreateFor('test-subordinate')"),true);
 assert.equal(w.eval("canDirectlyCreateFor('test-manager')"),false);
 assert.equal(w.eval("canDirectlyCreateFor('test-peer')"),false);
 d.querySelector('#addTaskBtn').click();const form=d.querySelector('#taskForm');
 form.elements.status.value='در حال انجام';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));
 form.elements.owner_id.value='test-owner';form.elements.owner_id.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(d.querySelector('#saveTaskBtn').textContent,'ثبت وظیفه');
 form.elements.title.value='ثبت مستقیم وظیفه مدیر';
 w.eval("setJalaliField('start_date_j','2026-10-01');setJalaliField('due_date_j','2026-10-10')");
 form.requestSubmit();await until(()=>!d.querySelector('#taskDialog').open);
 const write=f.calls.find(call=>call.endpoint==='tasks'&&call.method==='POST');
 assert.ok(write);assert.equal(write.body.owner_id,'test-owner');
 assert.equal(f.calls.some(call=>call.endpoint==='submit_change_request'),false);
 assert.equal(f.tables.tasks.length,1);assert.equal(!!f.tables.tasks[0].archived,false);
});

test('all task writers normalize completed and renamed completed statuses into archive',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 for(const label of ['انجام شده','پایان یافته']){
  const completed=f.w.bamcoOptions.rows('status').find(row=>row.kind==='completed');completed.label=label;
  const data={status:label,priority:'متوسط',owner_id:'test-owner',archived:false,start_date:null,due_date:null,done_date:null};
  f.w.bamcoOptions.normalizeTask(data,null);
  assert.equal(data.archived,true);assert.match(data.done_date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(data.archived_at);
  const legacy={...data,archived:false,archived_at:null};const edited={...legacy};
  f.w.bamcoOptions.normalizeTask(edited,legacy);assert.equal(edited.archived,true);
 }
});

test('Excel accepts ownerless registered rows and archives completed rows on import',async t=>{
 const f=await fixture({tables:{tasks:[]}});t.after(()=>f.dispose());const {w}=f;
 const XLSX=await w.ensureBamcoXLSX(),book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([
  {'عنوان فعالیت':'بدون متولی اولیه','وضعیت':'ثبت شده','اولویت':'متوسط'},
  {'عنوان فعالیت':'کار انجام شده','وضعیت':'انجام شده','اولویت':'متوسط','متولی':'owner@example.test'}
 ]),'tasks');
 const bytes=XLSX.write(book,{bookType:'xlsx',type:'array'});
 await w.BAMCO_DATA_IO.parse({name:'tasks.xlsx',arrayBuffer:async()=>bytes});
 assert.equal(f.tables.tasks.length,2);
 assert.equal(f.tables.tasks[0].owner_id,null);assert.equal(f.tables.tasks[0].archived,false);
 assert.equal(f.tables.tasks[1].archived,true);assert.ok(f.tables.tasks[1].done_date);
 assert.ok(f.tables.tasks[1].archived_at);
});

test('editing a completed archived task keeps the original archive timestamp',async t=>{
 const archivedAt='2026-09-01T09:00:00Z';
 const f=await fixture({tables:{tasks:[{id:501,title:'آرشیو',description:'old',owner_id:'test-owner',created_by:'test-manager',status:'انجام شده',priority:'متوسط',archived:true,archived_at:archivedAt,done_date:'2026-09-01'}]}});
 t.after(()=>f.dispose());await f.open('archive');f.w.openEdit(501);
 const form=f.d.querySelector('#taskForm');form.elements.description.value='new';form.requestSubmit();
 await until(()=>!f.d.querySelector('#taskDialog').open);
 const write=f.calls.find(call=>call.endpoint==='tasks'&&call.method==='PATCH');
 assert.ok(write);assert.equal(write.body.archived_at,archivedAt);
});

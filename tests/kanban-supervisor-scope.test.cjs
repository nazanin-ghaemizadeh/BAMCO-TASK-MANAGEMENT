const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
const task=(id,owner_id,extra={})=>({id,title:'Synthetic '+id,description:'Before',owner_id,created_by:owner_id,status:'در حال انجام',priority:'متوسط',start_date:'2026-09-20',due_date:'2026-10-30',reminder_days:0,archived:false,...extra});
const directory=[
 {position_id:1,parent_position_id:null,role_key:'head',occupant_id:'test-owner',occupant_full_name:'Synthetic chief',occupant_active:true,is_current_position:true},
 {position_id:2,parent_position_id:1,role_key:'expert',occupant_id:'test-child',occupant_full_name:'Synthetic child',occupant_active:true,is_current_position:false},
 {position_id:3,parent_position_id:2,role_key:'expert',occupant_id:'test-grandchild',occupant_full_name:'Synthetic grandchild',occupant_active:true,is_current_position:false},
 {position_id:4,parent_position_id:1,role_key:'expert',occupant_id:'test-inactive',occupant_full_name:'Synthetic inactive',occupant_active:false,is_current_position:false}
];
const grant=(feature_key,bits={})=>({feature_key,can_view:false,can_create:false,can_edit:false,can_delete:false,can_export:false,can_manage_access:false,can_bypass_approval:false,...bits});
async function setup(t,role='head'){
 let allowed=true;
 const tasks=[task(101,'test-child'),task(102,'test-grandchild')];
 const f=await fixture({role:'owner',tables:{tasks},fetchResult:({endpoint})=>{
  if(endpoint==='effective_feature_access')return{schema:'bamco.feature-access.v1',kanban_supervision:allowed,kanban_supervised_owner_ids:allowed?['test-child','test-grandchild']:[],grants:[grant('kanban'),grant('dashboard',{can_view:true})]};
  if(endpoint==='organization_scope_directory_with_avatars'||endpoint==='organization_scope_directory')return directory.map(row=>row.is_current_position?{...row,role_key:role}:row);
  if(endpoint==='task_status_view')return allowed?tasks:[];
 }});
 t.after(()=>f.dispose());
 f.revoke=async()=>{allowed=false;await f.w.BamcoAccess.invalidate();};
 await f.w.bamcoOrganizationAccess.refresh();await f.w.eval('refresh()');
 return f;
}
for(const role of ['head','manager'])test(role+' gains bounded Kanban editing with owner/status guards and no ordinary grant',async t=>{
 const f=await setup(t,role),{w,d}=f;
 assert.equal(w.BamcoAccess.can('kanban','view'),true);
 assert.equal(w.BamcoAccess.can('kanban','edit'),true);
 for(const action of ['view','edit','create','delete','export','manage_access','bypass_approval'])assert.equal(w.BamcoAccess.canExplicit('kanban',action),false);
 for(const action of ['create','delete','export','manage_access','bypass_approval'])assert.equal(w.BamcoAccess.can('kanban',action),false);
 const access=w.bamcoOrganizationAccess;
 assert.equal(access.canDirectlyManageTask(task(102,'test-grandchild')),true);
 for(const row of [task(103,'test-peer'),task(104,'test-owner'),task(105,'test-inactive'),task(106,null),task(107,'test-child',{archived:true})])assert.equal(access.canDirectlyManageTask(row),false);
 for(const action of ['delete','archive','restore'])assert.equal(access.canDirectlyManageTask(task(101,'test-child'),action),false);
 assert(!Array.from(access.descendantUserIds()).includes('test-inactive'));
 await f.open('kanban');w.openEdit(102);
 const form=d.querySelector('#taskForm');
 assert.equal(d.querySelector('#taskDialogTitle').textContent,'ویرایش وظیفه');
 assert.equal(form.elements.owner_id.value,'test-grandchild');assert.equal(form.elements.owner_id.disabled,true);
 for(const label of ['انجام شده','ثبت شده'])assert.equal([...form.elements.status.options].find(option=>option.value===label).disabled,true);
 form.elements.description.value='Edited subordinate content';form.requestSubmit();
 await until(()=>f.calls.some(call=>call.endpoint==='tasks'&&call.method==='PATCH'));
 const patch=f.calls.find(call=>call.endpoint==='tasks'&&call.method==='PATCH');
 assert.equal(patch.body.owner_id,'test-grandchild');assert.equal(patch.body.description,'Edited subordinate content');
 assert.equal(patch.body.archived,undefined);assert.equal(f.calls.some(call=>call.endpoint==='submit_change_request'),false);
 // A direct archive action is also blocked if invoked outside the UI.
 const writes=f.calls.filter(call=>call.method!=='GET'&&call.endpoint==='tasks').length;
 await w.archiveTask(101);assert.equal(f.calls.filter(call=>call.method!=='GET'&&call.endpoint==='tasks').length,writes);
 await f.open('dashboard');w.renderDashboard();
 assert.equal(d.querySelector('#dashboardCards [data-key=total] strong').textContent,'۰','new Kanban-only rows do not enter prior dashboard dataset');
 await f.revoke();
 assert.equal(w.BamcoAccess.canSuperviseKanban(),false);assert.equal(w.BamcoAccess.can('kanban','view'),false);
 assert.equal(access.canDirectlyManageTask(task(102,'test-grandchild')),false,'stale organizational scope cannot restore revoked capability');
});
test('supervision snapshot fails closed for mismatched profile, inactive account, logout and RPC failure',async t=>{
 const f=await setup(t),{w}=f,s=w.Bamco.state;
 s.profile={...s.profile,id:'different-user'};assert.equal(w.BamcoAccess.canSuperviseKanban(),false);assert.equal(w.BamcoAccess.can('kanban','view'),false);
 s.profile={...s.profile,id:s.user.id,active:false};assert.equal(w.BamcoAccess.canSuperviseKanban(),false);
 s.profile.active=true;assert.equal(w.BamcoAccess.canSuperviseKanban(),true);
 const data=w.BamcoData;w.BamcoData={...data,rpc:(name,body)=>name==='effective_feature_access'?Promise.reject(Error('synthetic outage')):data.rpc(name,body)};
 await w.BamcoAccess.invalidate();assert.equal(w.BamcoAccess.canSuperviseKanban(),false);
 w.BamcoData=data;await w.BamcoAccess.invalidate();assert.equal(w.BamcoAccess.canSuperviseKanban(),true);
 s.token='';assert.equal(w.BamcoAccess.canSuperviseKanban(),false);
});
test('Kanban supervisor policy and triggers enforce the isolated PostgreSQL security matrix',()=>{
 const run=spawnSync(process.execPath,['scripts/test-kanban-supervisor-scope-sql.mjs'],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 assert.equal(run.status,0,run.stdout+'\n'+run.stderr);assert.match(run.stdout,/PASS canonical SQL/);
});

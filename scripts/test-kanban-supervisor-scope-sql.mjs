// Isolated real PostgreSQL policies/triggers, synthetic identities only.
import assert from 'node:assert/strict';
import {featureDb,source,canonicalFunction,ids} from '../tests/helpers/feature-access-db.mjs';
const {db,as,root,one,can,snapshot,grant,features}=await featureDb();
const enterprise=source('supabase/migrations/20260922074613_enterprise_relationship_authorization_consolidation.sql');
const proposal=source('supabase/schema-proposals/kanban-supervisor-scope.sql');
const fn=(file,name)=>canonicalFunction(source(`supabase/migrations/${file}`),name);
const rows=async()=> (await db.query('select id from public.tasks order by id')).rows.map(row=>row.id);
const denied=async work=>{try{const out=await work();assert.deepEqual(out,[])}catch(e){assert.match(e.message,/permission|مجوز|42501/);}};
try{
 await features(['kanban','archive','taskTimeline','organization','dashboard','approvals','projects']);
 await db.exec(`
 create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('role',true),'none'),'authenticated') $$;
 alter table public.organization_roles add column role_key text,add column active boolean default true,add column title text,add column level_no int;
 alter table public.organization_positions add column parent_position_id bigint,add column title text;
 alter table public.organization_position_assignments add column id bigint generated always as identity;
 delete from public.organization_position_assignments;
 update public.organization_roles set role_key=case id when 1 then 'head' else 'manager' end,title='Synthetic role',level_no=case id when 1 then 30 else 40 end;
 insert into public.organization_roles(id,role_key,title,level_no) values(3,'expert','Synthetic expert',10);
 update public.organization_positions set title='Synthetic position';
 insert into public.organization_positions(id,role_id,parent_position_id,title) values(3,3,1,'Synthetic child'),(4,3,3,'Synthetic grandchild'),(5,3,2,'Synthetic other branch'),(6,3,null,'Synthetic peer');
 create table public.tasks(id bigint primary key,title text,description text,status text default 'در حال انجام',priority text default 'متوسط',owner_id uuid,created_by uuid,created_at timestamptz default now(),start_date date default current_date,due_date date default current_date+1,done_date date,reminder_days int default 0,manager_notes text,archived boolean default false,archived_at timestamptz,source text default 'manual',legacy_id bigint,row_version int default 0,last_updated_at timestamptz,former_owner_name text,owner_deleted_at timestamptz,last_update_note text,change_reason text,source_row_hash text);
 create table public.projects(id bigint primary key,owner_id uuid);
 create table public.project_items(id bigint primary key,task_id bigint,project_id bigint,item_type text,approval_state text);
 create table public.task_statuses(key text,label text,kind text,active boolean,owner_mode text,start_mode text,due_mode text,tracks_deadline boolean,archivable boolean);
 insert into public.task_statuses values('doing','در حال انجام','active',true,'required','required','required',true,false),('waiting','منتظر پاسخ','waiting',true,'required','optional','none',false,false),('registered','ثبت شده','registered',true,'none','none','none',false,false),('done','انجام شده','completed',true,'required','optional','optional',false,true);
 grant usage on schema private to authenticated; grant select on public.task_statuses to authenticated;
 alter table public.task_statuses add column aliases text[] default '{}',add column merged_into text;
 -- Only out-of-scope privileged approval paths are stubbed false, never allow.
 create function private.is_verified_task_approval_path(bigint,uuid) returns boolean language sql as $$select false$$;
 create function private.is_verified_revision_note_path(bigint) returns boolean language sql as $$select false$$;
 create function private.is_manager() returns boolean language sql as $$select false$$;
 create function public.platform_can_access_project(bigint) returns boolean language sql as $$select false$$;
 `);
 // Resolve status keys, labels, aliases and merged values with the actual catalog.
 const catalog=source('supabase/migrations/20260910225741_unified_task_catalog.sql');
 for(const name of ['private.option_normalize','private.task_status_option']){
  const definition=catalog.split('\n').find(line=>line.startsWith(`create or replace function ${name}(`));
  assert.ok(definition);await db.exec(definition);
 }
 for(const name of ['private.organization_active_primary_positions','private.organization_descendant_position_ids','private.organization_strict_descendant_user_ids','private.organization_scope_directory_rows','public.organization_scope_directory_with_avatars']) await db.exec(canonicalFunction(enterprise,name));
 // Canonical later hierarchy owns the organizational manager self exception.
 await db.exec(fn('20260923180000_manager_self_authority_and_revision_notes.sql','private.organization_actor_can_direct_manage_user'));
 for(const name of ['public.bamco_is_system_manager','public.bamco_can_direct_manage_organization_user'])await db.exec(fn('20260922102000_enterprise_relationship_authorization_policy_contract.sql',name));
 await db.exec(fn('20260923093000_access_propagation_and_timeline_scope.sql','public.organization_scope_user_ids'));
 for(const name of ['public.organization_can_assign_task'])await db.exec(canonicalFunction(enterprise,name));
 await db.exec(fn('20260922143000_request_workflow_root_repair.sql','public.organization_can_manage_task'));
 await db.exec(fn('20260925014953_project_activity_approval_workflow.sql','private.enforce_task_hierarchy_scope'));
 await db.exec(fn('20260925014953_project_activity_approval_workflow.sql','private.guard_project_activity_task_binding'));
 await db.exec(source('supabase/migrations/20261001104307_restore_catalog_task_lifecycle.sql'));
 await db.exec(`create trigger project_activity_task_binding_guard before update on public.tasks for each row execute function private.guard_project_activity_task_binding();
 create trigger task_hierarchy_scope before insert or update on public.tasks for each row execute function private.enforce_task_hierarchy_scope();
 create trigger trg_enforce_task_rules before insert or update on public.tasks for each row execute function private.enforce_task_rules();
 alter table public.tasks enable row level security; grant select,insert,update,delete on public.tasks to authenticated;
 `);
 await db.exec(source('supabase/migrations/20260923095000_restore_task_scope_policy.sql'));
 await db.exec(source('supabase/migrations/20260926113231_task_edit_and_chat_recipient_scope.sql').split('-- Return only eligible')[0]);
 await db.exec(`create policy tasks_direct_insert on public.tasks for insert to authenticated with check(public.can_access_feature('kanban','create') and created_by=auth.uid() and public.bamco_can_direct_manage_organization_user(owner_id));`);
 // Chief direct, manager role, descendant none, grandchild delegated, peer peer,
 // other branch resource. All names and rows are generated, not production.
 for(const [name,pos] of [['direct',1],['role',2],['none',3],['delegated',4],['resource',5],['peer',6]]) await db.query('insert into public.organization_position_assignments(user_id,position_id) values($1,$2)',[ids[name],pos]);
 for(const [id,name,archived] of [[1,'direct',false],[2,'none',false],[3,'delegated',false],[4,'resource',false],[5,'peer',false],[6,'none',true],[7,null,false]]) await db.query("insert into public.tasks(id,title,owner_id,created_by,archived,status) values($1,'Synthetic task',$2,$3,$4,$5)",[id,name?ids[name]:null,name?ids.direct:null,archived,name?'در حال انجام':'ثبت شده']);
 for(const name of ['direct','role','none','delegated','peer','resource'])await grant('organization',name);
 await as('direct');assert.deepEqual(await rows(),[],'reproduce chief blocked without ordinary Kanban grant');
 await root();await db.exec(proposal);
 await as('direct');assert.deepEqual(await rows(),[2,3],'chief sees immediate and transitive strict descendants only');
 assert.equal((await snapshot()).kanban_supervision,true);
 for(const action of ['view','edit','create','delete','export','manage_access','bypass_approval'])assert.equal(await can('kanban',action),false,`ordinary ${action} stays false`);
 assert.equal((await db.query("update tasks set title='Edited by chief',description='Synthetic',priority='بالا',manager_notes='Note' where id=3 returning id")).rows.length,1);
 assert.equal((await db.query("update tasks set status='منتظر پاسخ' where id=3 returning id")).rows.length,1,'non-terminal status applies real lifecycle validation');
 assert.equal((await db.query('update tasks set owner_id=$1 where id=3 returning owner_id',[ids.none])).rows[0].owner_id,ids.none,'owned task can be reassigned inside the same active branch');
 await db.query('update tasks set owner_id=$1 where id=3',[ids.delegated]);
 for(const sql of ["owner_id='"+ids.peer+"'",'archived=true',"source='project'","created_by='"+ids.peer+"'","legacy_id=100","source_row_hash='x'","status='انجام شده'","status='ثبت شده'"]){
  await assert.rejects(db.exec('update tasks set '+sql+' where id=3'),/نظارتی|row-level|policy|ثبت‌کننده|متولی|42501/,'protected mutation blocked: '+sql);
 }
 assert.equal((await db.query("update tasks set title='Forbidden' where id in(1,4,5,6,7) returning id")).rows.length,0,'own/peer/other/archived/orphan rows not editable through supervision');
 assert.equal((await db.query('delete from tasks where id=2 returning id')).rows.length,0,'no delete policy created');
 await assert.rejects(db.query("insert into tasks(id,title,owner_id,created_by) values(99,'New',$1,$2)",[ids.none,ids.direct]),/مجوز|ثبت مستقیم|row-level|policy/);
 await as('role');assert.deepEqual(await rows(),[4],'organizational manager gets their own branch');
 await as('peer');assert.deepEqual(await rows(),[],'peer expert gains nothing');
 // Every invalidation takes effect at the next statement, with no stale JWT grant.
 for(const [revoke,restore] of [
  ["update profiles set active=false where id='"+ids.direct+"'","update profiles set active=true where id='"+ids.direct+"'"],
  ["update organization_positions set active=false where id=1","update organization_positions set active=true where id=1"],
  ["update organization_roles set active=false where id=1","update organization_roles set active=true where id=1"],
  ["update organization_position_assignments set valid_to=current_date where user_id='"+ids.direct+"'","update organization_position_assignments set valid_to=null where user_id='"+ids.direct+"'"],
  ["update organization_position_assignments set is_primary=false where user_id='"+ids.direct+"'","update organization_position_assignments set is_primary=true where user_id='"+ids.direct+"'"],
  ["update app_features set active=false where feature_key='kanban'","update app_features set active=true where feature_key='kanban'"]
 ]){
  await root();await db.exec(revoke);await as('direct');assert.equal((await snapshot()).kanban_supervision,false);await denied(rows);await root();await db.exec(restore);
 }
 await grant('kanban','direct',{can_view:false},{effect:'deny'});await as('direct');assert.equal((await snapshot()).kanban_supervision,false);assert.deepEqual(await rows(),[]);
 await root();await db.exec("update feature_access_grants set revoked_at=now() where feature_key='kanban'");await as('direct');assert.deepEqual(await rows(),[2,3],'revoked deny no longer masks current role entitlement');
 await root();await db.query('update profiles set active=false where id=$1',[ids.none]);await as('direct');assert.deepEqual(await rows(),[3],'inactive subordinate denied');
 await root();await db.query('update profiles set active=true where id=$1',[ids.none]);await db.exec('update organization_positions set active=false where id=3');await as('direct');assert.deepEqual(await rows(),[],'inactive intermediate position cuts off subtree');await root();await db.exec('update organization_positions set active=true where id=3');
 // Legacy partial-null denies match the canonical resolver too.
 await grant('kanban','direct',{can_view:false},{effect:'deny',resource_id:'legacy-untyped'});await as('direct');assert.equal((await snapshot()).kanban_supervision,false);assert.deepEqual(await rows(),[]);
 await root();await db.exec("update feature_access_grants set revoked_at=now() where feature_key='kanban' and revoked_at is null");
 // Dated primary assignments may overlap despite the open-ended unique index.
 await db.query('insert into organization_position_assignments(user_id,position_id,valid_to) values($1,6,current_date+1)',[ids.direct]);
 await db.exec("insert into organization_positions(id,role_id,parent_position_id,title) values(7,3,6,'Secondary root descendant')");
 await db.query('insert into organization_position_assignments(user_id,position_id,valid_to) values($1,7,current_date+1)',[ids.resource]);
 await db.exec("update feature_access_grants set revoked_at=now() where feature_key='organization' and user_id='"+ids.direct+"'");
 await as('direct');assert.deepEqual(await rows(),[2,3],'non-head secondary root never broadens supervisor tasks');
 assert.deepEqual((await snapshot()).kanban_supervised_owner_ids.sort(),[ids.none,ids.delegated].sort());
 assert.deepEqual((await db.query('select user_id from organization_scope_user_ids()')).rows.map(r=>r.user_id).sort(),[ids.direct,ids.none,ids.delegated].sort(),'supervision-only scope remains qualified-root only');
 assert.deepEqual((await db.query('select position_id from organization_scope_directory_with_avatars()')).rows.map(r=>r.position_id).sort(),[1,3,4]);
 await root();await db.exec('delete from organization_position_assignments where valid_to is not null');await grant('organization','direct');
 // Project-bound guard is the actual existing trigger and must still reject.
 await db.query('insert into projects values(1,$1)',[ids.none]);await db.exec("insert into project_items values(1,2,1,'activity','pending')");await as('direct');await assert.rejects(db.exec("update tasks set title='pending project change' where id=2"),/درخواست باز/);
 await root();await db.exec("update project_items set approval_state='approved'");await as('direct');await assert.rejects(db.exec("update tasks set title='project change' where id=2"),/مجوز ویرایش پروژه/);
 // Preserve old explicit grant semantics, including existing archive edit.
 await root();await db.exec('delete from project_items');await grant('kanban','direct',{can_edit:true});await grant('archive','direct');await as('direct');assert.deepEqual(await rows(),[1,2,3,6]);
 assert.equal((await db.query("update tasks set title='Existing archive edit' where id=6 returning id")).rows.length,1);
 // Dedicated intake fixture: two heads report to the same organizational
 // manager, each with a separate active subordinate branch. No system-manager
 // profile or ordinary Kanban grant is used for these assignment assertions.
 await root();await db.exec("update feature_access_grants set revoked_at=now() where feature_key in ('kanban','archive')");
 Object.assign(ids,{chief2:'00000000-0000-0000-0000-000000000010',child2:'00000000-0000-0000-0000-000000000011',otherManager:'00000000-0000-0000-0000-000000000012',otherHead:'00000000-0000-0000-0000-000000000013'});
 for(const name of ['chief2','child2','otherManager','otherHead'])await db.query('insert into profiles(id,display_name) values($1,$2)',[ids[name],`Synthetic ${name}`]);
 await db.exec("update organization_positions set parent_position_id=2 where id=1; insert into organization_positions(id,role_id,parent_position_id,title) values(8,1,2,'Synthetic second head'),(9,3,8,'Synthetic second branch'),(10,3,1,'Synthetic inactive member'),(11,2,null,'Synthetic unrelated manager'),(12,1,11,'Synthetic unrelated head'),(13,3,2,'Synthetic intermediate expert')");
 for(const [name,position] of [['chief2',8],['child2',9],['inactive',10],['otherManager',11],['otherHead',12]])await db.query('insert into organization_position_assignments(user_id,position_id) values($1,$2)',[ids[name],position]);
 await as('missing');await root();
 for(const [id,creator,status,archived] of [
  [100,'role','ثبت شده',false],[101,'direct','ثبت شده',false],
  [102,'none','ثبت شده',false],[103,'chief2','ثبت شده',false],
  [104,'child2','ثبت شده',false],[105,'delegated','intake-alias',false],
  [106,'peer','ثبت شده',false],[107,null,'ثبت شده',false],
  [108,'inactive','ثبت شده',false],[109,'direct','منتظر پاسخ',false],
  [112,'direct','ثبت شده',true],
  [113,'role','ثبت شده',false],[114,'role','ثبت شده',false],
  [115,'otherManager','ثبت شده',false],[116,'otherHead','ثبت شده',false]
 ]){
  if(id===105)await db.exec("update task_statuses set aliases=array['intake-alias'] where kind='registered'");
  await db.query('insert into tasks(id,title,created_by,status,archived) values($1,$2,$3,$4,$5)',[id,`Synthetic intake ${id}`,creator?ids[creator]:null,status,archived]);
 }
 // Seed two historic deletion-marker shapes without manufacturing a deletion
 // operation. Normal triggers are restored before every authorization assertion.
 await db.exec("alter table tasks disable trigger user");
 await db.query("insert into tasks(id,title,created_by,status,owner_deleted_at) values(110,'Synthetic deleted owner',$1,'ثبت شده',now())",[ids.direct]);
 await db.query("insert into tasks(id,title,created_by,status,former_owner_name) values(111,'Synthetic former owner',$1,'ثبت شده','Former synthetic member')",[ids.direct]);
 await db.exec("alter table tasks enable trigger user");
 await db.query("insert into tasks(id,title,owner_id,created_by) values(120,'Inactive owner',$1,$2),(121,'Scoped owner external creator',$3,$4)",[ids.inactive,ids.direct,ids.none,ids.peer]);
 const intakeRows=async()=> (await db.query('select id from tasks where id>=100 order by id')).rows.map(r=>r.id);
 const chiefRows=[100,101,102,105,113,114,121];
 const chief2Rows=[100,103,104,113,114];
 const managerRows=[100,101,102,103,104,105,113,114,121];
 await as('direct');assert.deepEqual(await intakeRows(),chiefRows,'head sees self/descendant and immediate-manager intake, never unrelated-manager/peer/orphan/inactive/archived intake');
 const chiefSnapshot=await snapshot();assert.equal(chiefSnapshot.kanban_assignment,true);
 assert.deepEqual(chiefSnapshot.kanban_intake_creator_ids.sort(),[ids.direct,ids.none,ids.delegated,ids.role].sort());
 await as('chief2');assert.deepEqual(await intakeRows(),chief2Rows,'second head gets their own branch plus the same manager intake');
 assert.deepEqual((await snapshot()).kanban_intake_creator_ids.sort(),[ids.chief2,ids.child2,ids.role].sort());
 // Shared intake does not broaden either chief's assignable-owner set, or
 // include a manager/head from an unrelated tree.
 assert.deepEqual((await snapshot()).kanban_supervised_owner_ids,[ids.child2]);
 await as('otherHead');assert.deepEqual(await intakeRows(),[115,116],'unrelated head sees only their own immediate manager intake');
 await as('direct');assert.deepEqual((await snapshot()).kanban_supervised_owner_ids.sort(),[ids.none,ids.delegated].sort());
 // Immediate manager occupancy is live, active, primary and date-bounded.
 for(const [invalidate,restore] of [
  ["update profiles set active=false where id='"+ids.role+"'","update profiles set active=true where id='"+ids.role+"'"],
  ["update organization_positions set active=false where id=2","update organization_positions set active=true where id=2"],
  ["update organization_roles set active=false where id=2","update organization_roles set active=true where id=2"],
  ["update organization_position_assignments set valid_to=current_date where user_id='"+ids.role+"'","update organization_position_assignments set valid_to=null where user_id='"+ids.role+"'"],
  ["update organization_position_assignments set valid_from=current_date+1 where user_id='"+ids.role+"'","update organization_position_assignments set valid_from=current_date where user_id='"+ids.role+"'"],
  ["update organization_position_assignments set is_primary=false where user_id='"+ids.role+"'","update organization_position_assignments set is_primary=true where user_id='"+ids.role+"'"]
 ]){
  await root();await db.exec(invalidate);
  for(const actor of ['direct','chief2']){
   await as(actor);assert.equal((await intakeRows()).includes(100),false,'invalid immediate manager no longer contributes intake');
   assert.equal((await snapshot()).kanban_intake_creator_ids.includes(ids.role),false);
   assert.equal((await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=100 returning id",[actor==='direct'?ids.none:ids.child2])).rows.length,0);
  }
  await root();await db.exec(restore);
 }
 // A head cannot borrow an ancestor manager through a non-manager position,
 // nor another manager through a secondary non-head assignment.
 await root();await db.exec('update organization_positions set parent_position_id=13 where id=1');
 await as('direct');assert.equal((await intakeRows()).includes(100),false,'no nearest-manager expansion across an intermediate position');
 await as('chief2');assert.equal((await intakeRows()).includes(100),true,'immediate sibling is unaffected');
 await root();await db.exec('update organization_positions set parent_position_id=2 where id=1;update organization_positions set parent_position_id=11 where id=13');
 await db.query('insert into organization_position_assignments(user_id,position_id,valid_to) values($1,13,current_date+1)',[ids.direct]);
 await as('direct');assert.equal((await snapshot()).kanban_intake_creator_ids.includes(ids.otherManager),false,'non-head secondary roots cannot borrow their manager intake');
 await root();await db.exec('delete from organization_position_assignments where position_id=13;update organization_positions set parent_position_id=2 where id=13');
 await as('role');assert.deepEqual(await intakeRows(),managerRows,'manager sees self and both active descendant branches');
 assert.equal((await snapshot()).kanban_assignment,true);
 for(const action of ['view','edit','create','delete','export','manage_access','bypass_approval'])assert.equal(await can('kanban',action),false);
 await as('peer');assert.deepEqual(await intakeRows(),[]);assert.equal((await snapshot()).kanban_assignment,false);assert.deepEqual((await snapshot()).kanban_intake_creator_ids,[]);
 await as('direct');
 assert.equal((await db.query("update tasks set title='Edited intake',manager_notes='Synthetic note' where id=102 returning id")).rows.length,1,'intake content may be edited before assignment');
 assert.equal((await one('select owner_id from tasks where id=102')).owner_id,null);
 // The old status cannot silently clear a newly selected owner.
 await assert.rejects(db.query('update tasks set owner_id=$1 where id=101',[ids.none]),/تخصیص نظارتی/);
 await assert.rejects(db.exec("update tasks set status='منتظر پاسخ' where id=101"),/نظارتی/);
 await assert.rejects(db.query("update tasks set owner_id=$1,status='در حال انجام' where id=101",[ids.none]),/تاریخ شروع و تاریخ پایان/,'real active lifecycle still requires dates');
 const beforeAssignment=await one('select row_version from tasks where id=101');
 const assigned=(await db.query("update tasks set owner_id=$1,status='در حال انجام',start_date=current_date,due_date=current_date+7 where id=101 and row_version=$2 returning *",[ids.delegated,beforeAssignment.row_version])).rows[0];
 assert.equal(assigned.owner_id,ids.delegated);assert.equal(assigned.row_version,beforeAssignment.row_version+1);assert.equal(assigned.archived,false);
 await as('peer');await as('direct');
 const reloaded=await one('select owner_id,status,row_version,created_by from tasks where id=101');
 assert.deepEqual(reloaded,{owner_id:ids.delegated,status:'در حال انجام',row_version:assigned.row_version,created_by:ids.direct},'assignment survives a fresh read under the actor session');
 const reassigned=(await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=101 returning owner_id,status,due_date,row_version",[ids.none])).rows[0];
 assert.equal(reassigned.owner_id,ids.none);assert.equal(reassigned.status,'منتظر پاسخ');assert.equal(reassigned.due_date,null);assert.equal(reassigned.row_version,assigned.row_version+1);
 // Every possible ownership escape is denied on both intake and owned rows.
 for(const target of [ids.direct,ids.role,ids.peer,ids.chief2,ids.child2,ids.inactive,'00000000-0000-0000-0000-999999999999']){
  for(const id of [101,102])await assert.rejects(db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=$2",[target,id]),/تخصیص نظارتی|42501/);
 }
 for(const sql of ['owner_id=null',"status='ثبت شده'","status='انجام شده'","status='unrecognized'"]){
  await assert.rejects(db.exec('update tasks set '+sql+' where id=101'),/نظارتی|42501/);
 }
 for(const sql of ["created_by='"+ids.peer+"'","source='project'",'archived=true','archived_at=now()','done_date=current_date','id=999','created_at=now()','row_version=999','last_updated_at=now()','legacy_id=999',"source_row_hash='forged'","former_owner_name='forged'",'owner_deleted_at=now()']){
  await assert.rejects(db.exec('update tasks set '+sql+' where id=102'),/نظارتی|ثبت‌کننده|42501/,'intake protected field: '+sql);
 }
 // A caller-supplied maintenance flag must not bypass column protection,
 // lifecycle validation or the version increment used for stale-claim checks.
 await db.exec("select set_config('bamco.resequencing','1',false)");
 try{
  for(const sql of ["source_row_hash='forged'",'legacy_id=999',"title='Skip lifecycle'","owner_id='"+ids.none+"',status='منتظر پاسخ'"]){
   await assert.rejects(db.exec('update tasks set '+sql+' where id=102'),/نظارتی|42501/,'spoofed resequencing cannot widen supervision');
  }
 }finally{await db.exec("select set_config('bamco.resequencing','',false)")}
 assert.equal((await db.query("update tasks set title='Not allowed' where id in(103,104,106,107,108,109,110,111,112,115,116,120) returning id")).rows.length,0,'out-of-scope creator, deleted owner, inactive owner/creator and archived rows stay uneditable');
 assert.equal((await db.query('delete from tasks where id in(101,102) returning id')).rows.length,0,'intake permission creates no delete path');
 await assert.rejects(db.query("insert into tasks(id,title,owner_id,created_by) values(999,'No create',$1,$2)",[ids.none,ids.direct]),/مجوز|ثبت مستقیم|row-level|policy/);
 // Both sibling heads can make the first claim on the same parent-manager
 // intake. The winner's new owner is authoritative; creator sharing ends then.
 for(const [id,winner,owner,loser,loserOwner] of [
  [113,'direct',ids.none,'chief2',ids.child2],
  [114,'chief2',ids.child2,'direct',ids.none]
 ]){
  await as(loser);const staleClaim=await one('select row_version from tasks where id=$1',[id]);assert.ok(staleClaim);
  await as(winner);
  await assert.rejects(db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=$2",[loserOwner,id]),/تخصیص نظارتی/,'shared intake never authorizes a sibling branch destination');
  const claimed=(await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=$2 and row_version=$3 returning owner_id,row_version",[owner,id,staleClaim.row_version])).rows[0];
  assert.equal(claimed.owner_id,owner);assert.equal(claimed.row_version,staleClaim.row_version+1);
  await as('missing');await as(winner);assert.equal((await one('select owner_id from tasks where id=$1',[id])).owner_id,owner,'winning chief reloads persisted claim');
  await as(loser);assert.equal(await one('select id from tasks where id=$1',[id]),undefined,'sibling loses shared intake visibility after assignment');
  for(const versionFilter of ['',` and row_version=${staleClaim.row_version}`]){
   assert.equal((await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=$2"+versionFilter+' returning id',[loserOwner,id])).rows.length,0,'losing sibling cannot overwrite a claim, even without a version filter');
  }
  await as('role');assert.equal((await one('select owner_id from tasks where id=$1',[id])).owner_id,owner,'parent manager retains normal descendant visibility');
 }
 // Both heads and the manager can persist a first assignment in their own tree.
 await as('chief2');await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=103",[ids.child2]);
 await as('missing');await as('chief2');assert.equal((await one('select owner_id from tasks where id=103')).owner_id,ids.child2);
 await as('role');await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=100",[ids.resource]);
 await as('missing');await as('role');assert.equal((await one('select owner_id from tasks where id=100')).owner_id,ids.resource);
 // Simulate a stale claimant with an overlapping authorized view: manager
 // assigns a descendant-created intake to another branch before the head saves.
 await as('direct');const stale=await one('select row_version from tasks where id=105');assert.ok(stale);
 await as('role');await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=105 and row_version=$2",[ids.resource,stale.row_version]);
 await as('direct');assert.equal(await one('select id from tasks where id=105'),undefined,'old intake creator is not a visibility fallback once owned in another branch');
 assert.equal((await db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=105 returning id",[ids.none])).rows.length,0,'stale outside-branch actor cannot overwrite the assignment even without version filtering');
 await as('role');assert.equal((await db.query("update tasks set owner_id=$1 where id=105 and row_version=$2 returning id",[ids.none,stale.row_version])).rows.length,0,'optimistic version also stops stale saves by an actor who still has scope');
 assert.equal((await one('select owner_id from tasks where id=105')).owner_id,ids.resource);
 // Intake derives from live active creator/assignment state, not JWT metadata.
 await root();await db.query('update profiles set active=false where id=$1',[ids.none]);await as('direct');assert.equal((await intakeRows()).includes(102),false);
 assert.equal((await snapshot()).kanban_intake_creator_ids.includes(ids.none),false);
 await root();await db.query('update profiles set active=true where id=$1',[ids.none]);await db.query('update organization_position_assignments set valid_to=current_date where user_id=$1',[ids.none]);await as('direct');assert.equal((await intakeRows()).includes(102),false);
 await root();await db.query('update organization_position_assignments set valid_to=null where user_id=$1',[ids.none]);
 await grant('kanban','direct',{can_view:false},{effect:'deny'});await as('direct');assert.deepEqual(await intakeRows(),[]);assert.equal((await snapshot()).kanban_assignment,false);assert.deepEqual((await snapshot()).kanban_intake_creator_ids,[]);
 await root();await db.exec("update feature_access_grants set revoked_at=now() where feature_key='kanban'");
 // A registered project-bound intake cannot sidestep its existing project guard.
 await db.query('insert into projects values(2,$1)',[ids.none]);await db.exec("insert into project_items values(2,102,2,'activity','pending')");await as('direct');await assert.rejects(db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=102",[ids.none]),/درخواست باز/);
 await root();await db.exec("update project_items set approval_state='approved' where id=2");await as('direct');await assert.rejects(db.query("update tasks set owner_id=$1,status='منتظر پاسخ' where id=102",[ids.none]),/مجوز ویرایش پروژه/);
 // Exact helper ACLs and no public actor parameter/impersonation overload.
 for(const signature of ['private.kanban_supervision_enabled(uuid)','private.kanban_supervised_owner_ids(uuid)','private.kanban_intake_creator_ids(uuid)','private.kanban_supervisor_can_access_owner(uuid,uuid)','private.kanban_supervisor_can_access_task(uuid,public.tasks)']){
  assert.equal((await one("select has_function_privilege('authenticated',$1,'execute') allowed",[signature])).allowed,false,signature);
 }
 for(const signature of ['public.kanban_supervisor_can_access_owner(uuid)','public.kanban_supervisor_can_access_task(public.tasks)']){
  const acl=await one("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') browser",[signature]);assert.deepEqual(acl,{anon:false,browser:true});
 }
 const publicHelpers=(await db.query("select p.proname,p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('kanban_supervisor_can_access_task','kanban_supervisor_can_access_owner') order by p.proname")).rows;
 assert.deepEqual(publicHelpers,[{proname:'kanban_supervisor_can_access_owner',pronargs:1},{proname:'kanban_supervisor_can_access_task',pronargs:1}]);
 console.log('PASS canonical SQL: two chiefs share immediate-manager intake, branch-scoped first claims and sibling revocation, active parent occupancy, unrelated manager denial, persisted first assignment/reassignment/reload, stale-claim protection, active branch boundaries, ordinary grant isolation, deny/revocation, protected fields, lifecycle enforcement, project guard, existing archive authority and helper ACLs');
}finally{await db.close()}

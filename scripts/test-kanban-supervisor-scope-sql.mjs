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
 create function private.task_status_option(value text) returns public.task_statuses language sql as $$select s from public.task_statuses s where label=value or key=value limit 1$$;
 -- Only out-of-scope privileged approval paths are stubbed false, never allow.
 create function private.is_verified_task_approval_path(bigint,uuid) returns boolean language sql as $$select false$$;
 create function private.is_verified_revision_note_path(bigint) returns boolean language sql as $$select false$$;
 create function private.is_manager() returns boolean language sql as $$select false$$;
 create function public.platform_can_access_project(bigint) returns boolean language sql as $$select false$$;
 `);
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
 for(const [id,name,archived] of [[1,'direct',false],[2,'none',false],[3,'delegated',false],[4,'resource',false],[5,'peer',false],[6,'none',true],[7,null,false]]) await db.query("insert into public.tasks(id,title,owner_id,created_by,archived,status) values($1,'Synthetic task',$2,$3,$4,$5)",[id,name?ids[name]:null,ids.direct,archived,name?'در حال انجام':'ثبت شده']);
 for(const name of ['direct','role','none','delegated','peer','resource'])await grant('organization',name);
 await as('direct');assert.deepEqual(await rows(),[],'reproduce chief blocked without ordinary Kanban grant');
 await root();await db.exec(proposal);
 await as('direct');assert.deepEqual(await rows(),[2,3],'chief sees immediate and transitive strict descendants only');
 assert.equal((await snapshot()).kanban_supervision,true);
 for(const action of ['view','edit','create','delete','export','manage_access','bypass_approval'])assert.equal(await can('kanban',action),false,`ordinary ${action} stays false`);
 assert.equal((await db.query("update tasks set title='Edited by chief',description='Synthetic',priority='بالا',manager_notes='Note' where id=3 returning id")).rows.length,1);
 assert.equal((await db.query("update tasks set status='منتظر پاسخ' where id=3 returning id")).rows.length,1,'non-terminal status applies real lifecycle validation');
 for(const sql of ["owner_id='"+ids.none+"'",'archived=true',"source='project'","created_by='"+ids.peer+"'","legacy_id=100","source_row_hash='x'","status='انجام شده'","status='ثبت شده'"]){
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
 const acl=(await one("select has_function_privilege('anon','public.kanban_supervisor_can_access_owner(uuid)','execute') anon,has_function_privilege('authenticated','private.kanban_supervision_enabled(uuid)','execute') private,has_function_privilege('authenticated','public.kanban_supervisor_can_access_owner(uuid)','execute') browser"));
 assert.deepEqual(acl,{anon:false,private:false,browser:true});
 console.log('PASS canonical SQL: head/manager transitive scope, ordinary grant isolation, direct deny/revocation/inactive boundaries, protected columns, lifecycle archive rejection, project approval guard, existing archive authority and ACL');
}finally{await db.close()}

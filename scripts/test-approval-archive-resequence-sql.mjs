// Synthetic PostgreSQL: real approval RPC, application/verifier and hierarchy guard.
import assert from 'node:assert/strict';
import {featureDb,source,canonicalFunction,ids} from '../tests/helpers/feature-access-db.mjs';
const {db,as,root,one,grant,features}=await featureDb();
const patch=source('supabase/migrations/20261021093916_scoped_archive_resequence_context.sql');
const extract=(file,name)=>{
 const sql=source('supabase/migrations/'+file);
 if(sql.toLowerCase().includes('create or replace function '+name.toLowerCase()+'(')){
  const start=sql.toLowerCase().indexOf('create or replace function '+name.toLowerCase()+'(');
  const body=sql.slice(start),tag=body.match(/\bas\s+(\$\w*\$)/i)[1];
  return body.slice(0,body.indexOf(tag,body.indexOf(tag)+tag.length)+tag.length+1);
 }
 throw Error(name);
};
const rpc=(id,decision='approved')=>one('select public.review_request_stage($1,$2,null,null) result',[id,decision]);
const context=()=>one("select coalesce(current_setting('bamco.resequencing',true),'') setting,(select count(*) from private.task_delete_resequence_context) contexts");
try{
 await features(['approvals']);await grant('approvals','direct',{can_edit:true});await grant('approvals','peer',{can_edit:true});
 await db.exec(`
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('role',true),'none'),'authenticated')$$;
 create table public.tasks(id bigint generated always as identity primary key,legacy_id bigint,title text,description text,owner_id uuid,created_by uuid,status text,priority text,start_date date,due_date date,done_date date,reminder_days integer,manager_notes text,archived boolean default false,archived_at timestamptz,change_reason text,source text default 'manual',former_owner_name text,owner_deleted_at timestamptz,last_updated_at timestamptz,row_version integer default 0);
 create table public.project_items(id bigint,task_id bigint,item_type text,owner_id uuid);
 create table public.organization_workflows(id bigint primary key,current_step integer,status text,updated_at timestamptz);
 create table public.organization_workflow_steps(id bigint generated always as identity primary key,workflow_id bigint,step_no integer,approver_id uuid,decision text,note text,decided_at timestamptz);
 create table public.change_requests(id bigint primary key,request_type text,task_id bigint,applied_task_id bigint,requested_by uuid,request_status text,organization_workflow_id bigint,proposed_data jsonb,final_data jsonb,manager_note text,reviewed_by uuid,reviewed_at timestamptz,completed_at timestamptz);
 create table public.change_request_events(request_id bigint,actor_id uuid,event_type text,note text,snapshot jsonb);
 create function private.emit_relationship_event(uuid,text,text,text,text,text,jsonb) returns void language sql as $$select$$;
 create function private.sync_task_display_references() returns void language plpgsql as $$begin
 if current_setting('test.sync_failure',true)='1' then raise exception 'Synthetic sync failure';end if;
 end$$;
 create function private.is_verified_revision_note_path(bigint) returns boolean language sql as $$select false$$;
 -- Conservative surrounding authorization: no direct access to unrelated tasks.
 create function public.organization_can_manage_task(bigint) returns boolean language sql as $$select false$$;
 create function public.organization_can_assign_task(uuid) returns boolean language sql as $$select false$$;
 create function private.kanban_supervisor_can_access_task(uuid,public.tasks) returns boolean language sql as $$select false$$;
 create function private.organization_actor_can_direct_manage_user(uuid,uuid) returns boolean language sql as $$select false$$;
 create function private.is_manager() returns boolean language sql as $$select false$$;
 create table public.task_statuses(label text,kind text);
 insert into task_statuses values('انجام شده','completed'),('در حال انجام','active');
 create function private.task_status_option(text) returns public.task_statuses language sql as $$select s from public.task_statuses s where label=$1$$;
 grant usage on schema private to authenticated;
 `);
 const guards=source('supabase/migrations/20261006110441_authorized_task_delete_resequence_context.sql');
 await db.exec(guards.slice(0,guards.indexOf('CREATE OR REPLACE FUNCTION')));
 await db.exec(extract('20261006110441_authorized_task_delete_resequence_context.sql','private.enforce_task_hierarchy_scope'));
 await db.exec(extract('20260925014953_project_activity_approval_workflow.sql','private.is_verified_task_approval_path'));
 await db.exec(extract('20261006112057_approved_task_delete_resequence_context.sql','private.apply_change_request'));
 await db.exec(source('supabase/migrations/20261006063711_approval_revision_note_variable_fix.sql'));
 await db.exec(source('supabase/migrations/20261006110107_approval_existing_task_revision_note_fix.sql'));
 await db.exec(extract('20261001104307_restore_catalog_task_lifecycle.sql','private.enforce_task_rules'));
 await db.exec(extract('20260915123000_sync_task_display_refs_after_all_resequences.sql','private.resequence_archived_task_display_ids'));
 await db.exec(`
 revoke all on function private.resequence_archived_task_display_ids() from public,anon,authenticated,service_role;
 create function private.sort_archive_after_dates_change() returns trigger language plpgsql security definer set search_path='' as $$begin perform private.resequence_archived_task_display_ids();return null;end$$;
 create trigger task_hierarchy_scope before insert or update on tasks for each row execute function private.enforce_task_hierarchy_scope();
 create trigger task_rules before insert or update on tasks for each row execute function private.enforce_task_rules();
 create trigger archive_order after insert or update of archived,done_date on tasks for each statement execute function private.sort_archive_after_dates_change();
 grant select,update on tasks to authenticated;
 `);
 // Two out-of-branch archived tasks need reordering; a third is the subordinate's.
 await db.exec('alter table tasks disable trigger user');
 for(const [id,owner,number,date,archived] of [[1,ids.resource,1,'2026-10-02',true],[2,ids.peer,2,'2026-10-01',true],[3,ids.none,3,null,false]])
  await db.query("insert into tasks(id,owner_id,created_by,legacy_id,done_date,archived,title,status,start_date,due_date) overriding system value values($1,$2,$2,$3,$4,$5,'Synthetic','در حال انجام','2026-10-01','2026-10-31')",[id,owner,number,date,archived]);
 await db.exec("select setval(pg_get_serial_sequence('public.tasks','id'),100);alter table tasks enable trigger user");
 for(const [id,type,task] of [[1,'create',null],[2,'complete',3],[3,'update',3]]){
  await db.query("insert into organization_workflows values($1,1,'in_review',now())",[id]);
  await db.query("insert into organization_workflow_steps(workflow_id,step_no,approver_id,decision) values($1,1,$2,'pending')",[id,ids.direct]);
  await db.query("insert into change_requests(id,request_type,task_id,requested_by,request_status,organization_workflow_id,proposed_data) values($1,$2,$3,$4,'in_review',$1,$5::jsonb)",[id,type,task,ids.none,JSON.stringify({owner_id:ids.none,title:'Synthetic new',status:'در حال انجام',start_date:'2026-10-01',due_date:'2026-10-31'})]);
 }
 for(const id of [1,2]){
  await as('direct');await assert.rejects(rpc(id),e=>e.code==='42501'&&/ویرایش مستقیم/.test(e.message));
 }
 console.log('PASS baseline subordinate create/complete approvals fail in archive renumbering');
 await root();await db.exec(patch);
 const acl=await one("select proacl::text acl from pg_proc where oid='private.resequence_archived_task_display_ids()'::regprocedure");
 for(const id of [1,2,3]){
  await as('direct');await db.exec('begin');assert.equal((await rpc(id)).result,'approved');
  await root();assert.equal((await one('select request_status from change_requests where id=$1',[id])).request_status,'approved');
  assert.deepEqual(await context(),{setting:'',contexts:0});
  assert.deepEqual((await db.query('select id from tasks where archived order by legacy_id')).rows.map(r=>r.id),id===2?[2,1,3]:[2,1]);
  await db.exec('rollback');
 }
 console.log('PASS create/complete/update approvals, unrelated archive order and context cleanup');
 await as('peer');await assert.rejects(rpc(1),e=>e.code==='42501');
 await as('none');await assert.rejects(rpc(1),e=>e.code==='42501');
 await as('direct');await assert.rejects(db.exec('select private.resequence_archived_task_display_ids()'),e=>e.code==='42501');
 await db.exec("select set_config('bamco.resequencing','1',false)");
 await assert.rejects(db.exec('update tasks set legacy_id=77 where id=1'),e=>e.code==='42501');
 await assert.rejects(db.exec('insert into private.task_delete_resequence_context values(pg_backend_pid(),txid_current())'),e=>e.code==='42501');
 await db.exec("select set_config('bamco.resequencing','',false)");
 await root();assert.deepEqual(await context(),{setting:'',contexts:0});
 console.log('PASS peer/ungranted reviewer, private entrypoint, forged marker and context-table access denied');
 // Do not consume a caller's existing deletion-maintenance context.
 await db.exec('begin;insert into private.task_delete_resequence_context values(pg_backend_pid(),txid_current())');
 await db.exec("select set_config('bamco.resequencing','prior',true);select private.resequence_archived_task_display_ids()");
 assert.deepEqual(await context(),{setting:'prior',contexts:1});await db.exec('rollback');
 await db.exec("select set_config('test.sync_failure','1',false)");
 await as('direct');await assert.rejects(rpc(1),/Synthetic sync failure/);
 await root();assert.deepEqual(await context(),{setting:'',contexts:0});
 assert.equal((await one('select request_status from change_requests where id=1')).request_status,'in_review');
 await db.exec("select set_config('test.sync_failure','',false)");
 await db.exec(patch);assert.equal((await one("select proacl::text acl from pg_proc where oid='private.resequence_archived_task_display_ids()'::regprocedure")).acl,acl.acl);
 console.log('PASS nested context preserved, downstream failure atomicity and unchanged restricted ACL');
}finally{await db.close()}

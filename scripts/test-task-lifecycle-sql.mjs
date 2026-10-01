// Real PostgreSQL trigger semantics in isolated WASM Postgres, with no network,
// credentials, production data, or claim to run the entire Supabase schema.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const migration=fs.readFileSync(new URL('../supabase/migrations/20261001104307_restore_catalog_task_lifecycle.sql',import.meta.url),'utf8');
const oldFunction=fs.readFileSync(new URL('../tests/sql/fixtures/live-task-rules-20261001.sql',import.meta.url),'utf8');
try{
 await db.exec(`
 create schema private;
 create table public.profiles(id uuid primary key,full_name text,active boolean);
 create table public.task_statuses(key text primary key,label text,kind text,active boolean,owner_mode text,start_mode text,due_mode text,tracks_deadline boolean,archivable boolean);
 create table public.priorities(key text primary key,label text,active boolean);
 create function private.is_manager() returns boolean language sql as 'select true';
 create function private.task_status_option(value text) returns public.task_statuses language sql as 'select s from public.task_statuses s where key=value or label=value limit 1';
 create function private.task_priority_option(value text) returns public.priorities language sql as 'select p from public.priorities p where key=value or label=value limit 1';
 create table public.tasks(id bigint generated always as identity primary key,title text default 'test',description text,source text default 'manual',owner_id uuid,created_by uuid,status text,priority text default 'متوسط',start_date date,due_date date,done_date date,archived boolean default false,archived_at timestamptz,former_owner_name text,owner_deleted_at timestamptz,last_updated_at timestamptz,row_version integer default 0,reminder_days integer default 0);
 insert into public.task_statuses values ('done','انجام شده','completed',true,'required','optional','optional',false,true),('custom_done','پایان یافته','completed',true,'required','optional','optional',false,true),('doing','در حال انجام','active',true,'required','required','required',true,false),('registered','ثبت شده','registered',true,'none','none','none',false,false);
 insert into public.priorities values ('medium','متوسط',true);
 ${oldFunction}
 create trigger trg_enforce_task_rules before insert or update on public.tasks for each row execute function private.enforce_task_rules();
 `);
 const actor='00000000-0000-0000-0000-000000000001';
 let row=(await db.query("insert into tasks(status,owner_id) values ('انجام شده',$1) returning *",[actor])).rows[0];
 assert.equal(row.archived,false,'captured live trigger reproduces missing auto-archive');
 const legacyId=row.id;
 await db.exec(migration);
 for(const status of ['انجام شده','پایان یافته']){
  row=(await db.query('insert into tasks(status,owner_id) values ($1,$2) returning *',[status,actor])).rows[0];
  assert.equal(row.archived,true);assert.ok(row.archived_at);assert.ok(row.done_date);
 }
 row=(await db.query("update tasks set title='edited legacy completion' where id=$1 returning *",[legacyId])).rows[0];
 assert.equal(row.archived,true,'editing legacy completed row repairs lifecycle');
 row=(await db.query("insert into tasks(status,owner_id,start_date,due_date) values ('در حال انجام',$1,current_date,current_date+1) returning *",[actor])).rows[0];
 assert.equal(row.archived,false);
 row=(await db.query("update tasks set status='پایان یافته' where id=$1 returning *",[row.id])).rows[0];
 assert.equal(row.archived,true,'custom completion transition archives');
 const originalArchiveDate=row.archived_at;
 row=(await db.query("update tasks set title='repeat edit' where id=$1 returning *",[row.id])).rows[0];
 assert.equal(String(row.archived_at),String(originalArchiveDate),'archive timestamp is stable');
 await assert.rejects(db.query("insert into tasks(status,owner_id) values ('در حال انجام',$1)",[actor]),/تاریخ شروع/);
 row=(await db.query("insert into tasks(status,owner_id,start_date,due_date,archived) values ('در حال انجام',$1,current_date,current_date+1,true) returning *",[actor])).rows[0];
 assert.equal(row.archived,true,'unrelated existing archive validation is unchanged');
 row=(await db.query("insert into tasks(status,owner_id,start_date,due_date) values ('ثبت شده',$1,current_date,current_date+1) returning *",[actor])).rows[0];
 assert.equal(row.owner_id,null);assert.equal(row.start_date,null);assert.equal(row.due_date,null);
 row=(await db.query("insert into tasks(status,owner_id,archived,source) values ('انجام شده',$1,true,'excel') returning *",[actor])).rows[0];
 assert.equal(row.done_date,null,'unknown historical Excel completion date survives import');
 assert.equal(row.archived_at,null,'unknown historical archive timestamp stays unknown');
 row=(await db.query("update tasks set title='historical edit' where id=$1 returning *",[row.id])).rows[0];
 assert.equal(row.done_date,null);assert.equal(row.archived_at,null);
 // The proposed function differs from the exact live body only by the archive block.
 const liveBody=oldFunction.split('AS $function$')[1].split('end $function$')[0];
 const patchedBody=migration.split('AS $function$')[1].split('end $function$')[0];
 assert.equal(patchedBody.replace(/ -- Completion archives an active row;[\s\S]*? end if;\n/,''),liveBody);
 console.log('Task lifecycle SQL: original auto-archive failure reproduced; catalog completion, custom labels, legacy edit repair, stable dates and validation PASS.');
}finally{await db.close()}

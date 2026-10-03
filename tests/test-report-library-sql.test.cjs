// Real PostgreSQL semantics in isolated PGlite; no Supabase connection/fixtures.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync('supabase/schema-proposals/test-reports.sql','utf8');
const actor='11111111-1111-4111-8111-111111111111',year='33333333-3333-4333-8333-333333333333',file='44444444-4444-4444-8444-444444444444',token='55555555-5555-4555-8555-555555555555',otherToken='66666666-6666-4666-8666-666666666666';
const path=`years/${year}/${file}.pdf`;

test('staged test-report SQL enforces constraints, timestamp transactions, RLS, private storage and leases',async t=>{
 const db=new PGlite();
 const scalar=async(q,p=[])=>(await db.query(q,p)).rows[0];
 const as=async(role,query)=>{await db.exec(`set role ${role}`);try{return await db.query(query)}finally{await db.exec('reset role')}};
 const createFile=()=>db.query(`insert into test_report_files(id,year_id,title,description,original_file_name,storage_path,mime_type,file_size,sha256,created_by,created_at,updated_at) values($1,$2,'عنوان','شرح','report.pdf',$3,'application/pdf',123,$4,$5,'2000-01-01','2000-01-01') returning *`,[file,year,path,'a'.repeat(64),actor]);
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role bypassrls;
   create schema storage;
   create table public.profiles(id uuid primary key);
   create function public.can_access_feature(p_feature_key text,p_action text default 'view') returns boolean language sql stable as $$select p_feature_key='documents' and p_action='view' and coalesce(current_setting('test.documents_view',true),'off')='on'$$;
   revoke all on function public.can_access_feature(text,text) from public;
   grant execute on function public.can_access_feature(text,text) to authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated,service_role;
   grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
   -- Deliberately broad legacy policy: new restrictive guards must still win.
   create policy broad_legacy_storage_policy on storage.objects for all to public using(true) with check(true);
   insert into profiles values('${actor}');
  `);
  await db.exec(sql);
  await t.test('starts empty, private bucket and public tables have no browser write grants',async()=>{
   assert.equal((await scalar('select count(*)::int as n from test_report_years')).n,0);
   assert.equal((await scalar('select count(*)::int as n from test_report_files')).n,0);
   const bucket=await scalar("select * from storage.buckets where id='test-reports-private'");assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),26214400);assert(bucket.allowed_mime_types.includes('application/pdf'));
   for(const table of ['test_report_years','test_report_files'])for(const privilege of ['INSERT','UPDATE','DELETE']){
    assert.equal((await scalar(`select has_table_privilege('authenticated','public.${table}','${privilege}') as allowed`)).allowed,false);
   }
  });
  await t.test('exact six branches, Jalali range, uniqueness and immutable folder identity',async()=>{
   await db.query("insert into test_report_years(id,domain,report_type,jalali_year,created_by,created_at) values($1,'environment','research',1405,$2,'2000-01-01')",[year,actor]);
   for(const domain of ['environment','standard'])for(const reportType of ['research','production','type_engineering']){
    await db.query('insert into test_report_years(id,domain,report_type,jalali_year) values(gen_random_uuid(),$1,$2,1406)',[domain,reportType]);
   }
   assert.equal((await scalar('select count(*)::int n from test_report_years')).n,7);
   await assert.rejects(db.query("insert into test_report_years(id,domain,report_type,jalali_year) values(gen_random_uuid(),'environment','research',1405)"),/unique/);
   for(const bad of [1199,1601])await assert.rejects(db.query("insert into test_report_years(id,domain,report_type,jalali_year) values(gen_random_uuid(),'environment','research',$1)",[bad]),/check constraint/);
   await assert.rejects(db.query("insert into test_report_years(id,domain,report_type,jalali_year) values(gen_random_uuid(),'other','research',1405)"),/check constraint/);
   await assert.rejects(db.query("update test_report_years set domain='standard' where id=$1",[year]),/identity cannot be changed/);
   for(const y of [1200,1600])await db.query('update test_report_years set jalali_year=$1 where id=$2',[y,year]);
  });
  let initialYear,initialFile;
  await t.test('server timestamps and parent modification timestamps persist transactionally',async()=>{
   initialYear=await scalar('select * from test_report_years where id=$1',[year]);assert.notEqual(new Date(initialYear.created_at).getUTCFullYear(),2000);
   initialFile=(await createFile()).rows[0];assert.equal(initialFile.status,'pending');assert.notEqual(new Date(initialFile.created_at).getUTCFullYear(),2000);
   const after=await scalar('select * from test_report_years where id=$1',[year]);assert(new Date(after.updated_at)>new Date(initialYear.updated_at));
   await db.query("update test_report_files set title='edited',created_at='1999-01-01',updated_at='1999-01-01' where id=$1",[file]);
   const updated=await scalar('select * from test_report_files where id=$1',[file]);assert.equal(String(updated.created_at),String(initialFile.created_at));assert(new Date(updated.updated_at)>new Date(initialFile.updated_at));
   const beforeRollback=await scalar('select updated_at from test_report_years where id=$1',[year]);
   await db.exec('begin');await db.query("update test_report_files set title='rolled back' where id=$1",[file]);await db.exec('rollback');
   assert.equal(String((await scalar('select updated_at from test_report_years where id=$1',[year])).updated_at),String(beforeRollback.updated_at));
   await assert.rejects(db.query('delete from test_report_years where id=$1',[year]),/foreign key/);
   await assert.rejects(db.query('update test_report_files set year_id=gen_random_uuid() where id=$1',[file]),/identity cannot be changed/);
   await assert.rejects(db.query('update test_report_files set sha256=$1 where id=$2',['b'.repeat(64),file]),/identity cannot be changed/);
  });
  await t.test('documents view reveals pending metadata; unrelated/anonymous users cannot read',async()=>{
   await db.exec("set test.documents_view='on'");
   assert.equal((await as('authenticated','select count(*)::int n from test_report_files')).rows[0].n,1);
   await db.exec("set test.documents_view='off'");
   assert.equal((await as('authenticated','select count(*)::int n from test_report_files')).rows[0].n,0);
   assert.equal((await as('authenticated','select count(*)::int n from test_report_years')).rows[0].n,0);
   await assert.rejects(as('anon','select * from test_report_files'),/permission denied/);
   await assert.rejects(as('authenticated',`update test_report_files set title='bypass' where id='${file}'`),/permission denied/);
   await assert.rejects(as('authenticated',`select public.test_report_claim_operation('${file}','${token}','upload')`),/permission denied/);
   await assert.rejects(as('authenticated',`select public.test_report_finish_delete('${file}','${token}')`),/permission denied/);
   await db.exec("set test.documents_view='on'");
  });
  await t.test('private object reads require ready rows and documents view despite legacy broad policies',async()=>{
   await db.query("insert into storage.objects(bucket_id,name) values('test-reports-private',$1),('other-bucket','existing.txt')",[path]);
   const selected=()=>as('authenticated',"select name from storage.objects where bucket_id='test-reports-private'");
   assert.equal((await selected()).rows.length,0);
   await db.query("update test_report_files set status='ready' where id=$1",[file]);assert.equal((await selected()).rows.length,1);
   await db.exec("set test.documents_view='off'");assert.equal((await selected()).rows.length,0);
   await db.exec("set test.documents_view='on'");
   assert.equal((await as('anon',"select * from storage.objects where bucket_id='test-reports-private'")).rows.length,0);
   assert.equal((await as('anon',"select * from storage.objects where bucket_id='other-bucket'")).rows.length,1);
   await assert.rejects(as('authenticated',"insert into storage.objects(bucket_id,name) values('test-reports-private','bypass.pdf')"),/row-level security/);
   assert.equal((await as('authenticated',"update storage.objects set name='bypass.pdf' where bucket_id='test-reports-private' returning *")).rows.length,0);
   assert.equal((await as('authenticated',"delete from storage.objects where bucket_id='test-reports-private' returning *")).rows.length,0);
   await assert.rejects(as('authenticated',"update storage.objects set bucket_id='test-reports-private' where bucket_id='other-bucket'"),/row-level security/);
   await db.query("update test_report_files set status='deleting' where id=$1",[file]);assert.equal((await selected()).rows.length,0);
   assert.equal((await as('authenticated','select status from test_report_files')).rows[0].status,'deleting');
   await assert.rejects(db.query("update test_report_files set status='ready' where id=$1",[file]),/Invalid report file status transition/);
  });
  await t.test('service-only leases serialize operations, reject stale tokens and tombstone deletion',async()=>{
   const claim=async(tok,action)=>(await as('service_role',`select public.test_report_claim_operation('${file}','${tok}','${action}') result`)).rows[0].result;
   assert.equal((await claim(token,'delete')).claimed,true);
   const busy=await claim(otherToken,'upload');assert.equal(busy.claimed,false);assert(busy.retry_after>0);
   assert.equal((await as('service_role',`select public.test_report_finish_delete('${file}','${otherToken}') result`)).rows[0].result,false);
   const old=await scalar('select updated_at from test_report_years where id=$1',[year]);
   assert.equal((await as('service_role',`select public.test_report_finish_delete('${file}','${token}') result`)).rows[0].result,true);
   assert.equal((await scalar('select count(*)::int n from test_report_files')).n,0);
   assert(new Date((await scalar('select updated_at from test_report_years where id=$1',[year])).updated_at)>new Date(old.updated_at));
   assert.equal((await claim(otherToken,'upload')).deleted,true);
   await db.query('delete from test_report_years where id=$1',[year]);
  });
  await t.test('upload finalization requires active matching operation and atomically clears lease',async()=>{
   await db.query("insert into test_report_years(id,domain,report_type,jalali_year) values($1,'environment','research',1405)",[year]);
   // Isolated fixture reset only: production tombstones are never removed.
   await db.query('delete from private.test_report_operations where id=$1',[file]);await createFile();
   await as('service_role',`select public.test_report_claim_operation('${file}','${token}','upload')`);
   assert.equal((await as('service_role',`select public.test_report_finish_upload('${file}','${otherToken}') result`)).rows[0].result,null);
   await db.query("update private.test_report_operations set expires_at=clock_timestamp()-interval '1 second' where id=$1",[file]);
   assert.equal((await as('service_role',`select public.test_report_finish_upload('${file}','${token}') result`)).rows[0].result,null);
   await as('service_role',`select public.test_report_claim_operation('${file}','${otherToken}','upload')`);
   const ready=(await as('service_role',`select public.test_report_finish_upload('${file}','${otherToken}') result`)).rows[0].result;
   assert.equal(ready.status,'ready');assert.equal(ready.id,file);
   assert.equal((await scalar('select token from private.test_report_operations where id=$1',[file])).token,null);
  });
 }finally{await db.close()}
});

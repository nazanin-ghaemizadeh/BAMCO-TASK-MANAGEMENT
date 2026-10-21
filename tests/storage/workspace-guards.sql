-- Run against the deployed database with an administrative connection.
-- Read-only regression probes; session settings are rolled back.
begin;
do $test$
declare actor uuid; expected bigint; visible bigint; bucket text; r record; allowed boolean; expression text; namespace text;
begin
 select id into strict actor from public.profiles where role='manager' and active limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 foreach bucket in array array['avatars','stickers'] loop
  select count(*) into expected from storage.objects where bucket_id=bucket;
  if expected=0 then raise exception 'Expected existing image fixtures in %',bucket;end if;
  execute 'set local role authenticated';
  select count(*) into visible from storage.objects where bucket_id=bucket;
  execute 'reset role';
  if visible<>expected then raise exception '%: expected %, visible %',bucket,expected,visible;end if;
 end loop;
 -- Every copied guard must leave the other workspaces untouched.
 for r in select policyname,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE'
  and (policyname like 'process_invoice_objects_%' or policyname like 'quality_invoice_objects_%' or policyname like 'process_test_report_storage_%' or policyname like 'quality_test_report_storage_%') loop
  namespace:=split_part(r.policyname,'_',1);
  foreach expression in array array[r.qual,r.with_check] loop
   if expression is null then continue;end if;
   foreach bucket in array array['avatars','stickers',case namespace when 'process' then 'quality-stickers' else 'process-stickers' end] loop
    execute format('select (%s) from (select %L::text bucket_id, %L::text name) objects',expression,bucket,'regression/no-file') into allowed;
    if allowed is distinct from true then raise exception '% blocked unrelated bucket %',r.policyname,bucket;end if;
   end loop;
   if r.policyname like '%invoice_objects_insert_guard' or r.policyname like '%test_report_storage_no_client_insert' then
    bucket:=namespace||case when r.policyname like '%invoice_objects_%' then '-invoices-private' else '-test-reports-private' end;
    execute format('select (%s) from (select %L::text bucket_id, %L::text name) objects',expression,bucket,'regression/no-file') into allowed;
    if allowed is distinct from false then raise exception '% allowed protected client writes',r.policyname;end if;
   end if;
  end loop;
 end loop;
 -- An authenticated identity without workspace membership still sees no files.
 perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','role','authenticated')::text,true);
 execute 'set local role authenticated';
 select count(*) into visible from storage.objects;
 execute 'reset role';
 if visible<>0 then raise exception 'Nonmember can read % files',visible;end if;
end
$test$;
select 'workspace storage guards passed' as result;
rollback;

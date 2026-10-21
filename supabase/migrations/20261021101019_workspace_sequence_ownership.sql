-- Independent serial ownership, realtime publication and push infrastructure.
-- These contain no copied business rows or existing subscriptions/jobs.
do $$
declare target text; r record; definition text;
begin
 foreach target in array array['bamco_process','bamco_quality'] loop
  execute format('alter sequence %I.task_id_seq owned by %I.tasks.id',target,target);
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   for r in select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname=target and tablename=r.tablename) then
     execute format('alter publication supabase_realtime add table %I.%I',target,r.tablename);
    end if;
   end loop;
  end if;
  execute format('insert into %I.web_push_config select (jsonb_populate_record(null::%I.web_push_config,jsonb_build_object(''singleton'',true,''worker_key'',encode(extensions.gen_random_bytes(32),''hex'')))).* where not exists(select 1 from %I.web_push_config)',target||'_private',target||'_private',target||'_private');
  definition:=pg_get_functiondef(to_regprocedure(format('%I.dispatch_web_push()',target||'_private')));
  execute replace(definition,'/functions/v1/web-push-worker','/functions/v1/'||replace(target,'bamco_','')||'-web-push-worker');
  if to_regnamespace('cron') is not null then
   perform cron.schedule(target||'-push','* * * * *',format('select %I.dispatch_web_push()',target||'_private'));
   perform cron.schedule(target||'-task-alerts','* * * * *',format('select %I.dispatch_task_due_alerts()',target||'_private'));
  end if;
 end loop;
end $$;

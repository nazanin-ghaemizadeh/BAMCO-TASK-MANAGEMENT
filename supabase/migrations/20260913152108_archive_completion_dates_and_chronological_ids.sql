-- Authorized archive repair. Keep a private, immutable source snapshot.
set local lock_timeout='5s';
lock table public.tasks in share row exclusive mode;
create table private.archive_completion_backup_20260913 as select id,to_jsonb(t) as original from public.tasks t;
revoke all on private.archive_completion_backup_20260913 from public,anon,authenticated;
alter table public.tasks disable trigger task_portal_event;
select set_config('bamco.resequencing','1',true);
update public.tasks set done_date=due_date where archived and done_date is null and due_date is not null;
select set_config('bamco.resequencing','',true);
alter table public.tasks enable trigger task_portal_event;

-- Reuse archive display-number slots, preserving active task numbers and all PKs.
create or replace function private.resequence_archived_task_display_ids()
returns void language plpgsql security definer set search_path='' as $$
declare mapping jsonb;previous_setting text;
begin
 if current_setting('bamco.resequencing',true)='1' then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));
 with ranked as (
  select id,legacy_id,row_number() over(order by done_date asc nulls first,id) as seq from public.tasks where archived
 ),slots as (
  select legacy_id,row_number() over(order by legacy_id,id) as seq from public.tasks where archived
 )
 select jsonb_agg(jsonb_build_object('id',r.id,'new_number',s.legacy_id)) into mapping
 from ranked r join slots s using(seq) where r.legacy_id is distinct from s.legacy_id;
 if mapping is null then return;end if;
 previous_setting:=current_setting('bamco.resequencing',true);
 perform set_config('bamco.resequencing','1',true);
 update public.tasks t set legacy_id=-t.legacy_id from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint) where t.id=m.id;
 update public.tasks t set legacy_id=m.new_number from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint) where t.id=m.id;
 perform set_config('bamco.resequencing',coalesce(previous_setting,''),true);
end;$$;
revoke all on function private.resequence_archived_task_display_ids() from public,anon,authenticated;
select private.resequence_archived_task_display_ids();

create or replace function private.sort_archive_after_dates_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.resequence_archived_task_display_ids();return null;
end;$$;
revoke all on function private.sort_archive_after_dates_change() from public,anon,authenticated;
create trigger sort_archive_after_dates_change after insert or update of archived,done_date on public.tasks for each statement execute function private.sort_archive_after_dates_change();

-- Abort the entire migration if any unrelated value changed.
do $$ begin
 if exists(select 1 from private.archive_completion_backup_20260913 b full join public.tasks t using(id)
  where b.id is null or t.id is null or
  case when (b.original->>'archived')::boolean then
   (to_jsonb(t)-array['done_date','legacy_id']) is distinct from (b.original-array['done_date','legacy_id'])
   or t.done_date is distinct from coalesce((b.original->>'done_date')::date,(b.original->>'due_date')::date)
  else to_jsonb(t) is distinct from b.original end) then raise exception 'Archive repair changed unrelated data';end if;
 if exists(with ranked as(select legacy_id,row_number() over(order by done_date asc nulls first,id) n from public.tasks where archived) select 1 from ranked where legacy_id<>n) then raise exception 'Archive numbering verification failed';end if;
end $$;

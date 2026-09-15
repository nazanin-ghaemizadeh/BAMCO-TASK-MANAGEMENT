-- Keep the public task number (legacy_id) present and contiguous after every
-- insert/import.  The primary key remains immutable; legacy_id is display-only.
set local lock_timeout='5s';
lock table public.tasks in share row exclusive mode;

-- Repair rows that were imported without a display number.  The existing
-- resequencer preserves the established order and puts missing values after
-- the current range, so existing links and task primary keys are untouched.
do $$
begin
  if exists(
    select 1
    from public.tasks
    where legacy_id is null
  ) or exists(
    select 1
    from public.tasks
    group by legacy_id
    having count(*) > 1
  ) or exists(
    select 1
    from public.tasks
    where legacy_id < 1
  ) then
    perform private.resequence_task_display_ids();
  end if;
end;
$$;

-- Direct inserts (including Excel imports) may omit legacy_id or carry an
-- obsolete/high number.  Re-check the complete range after each write so the
-- fallback-to-primary-key rendering can never leak into the UI again.
create or replace function private.ensure_task_display_ids_after_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if current_setting('bamco.resequencing',true)='1' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));
  perform private.ensure_task_display_ids_contiguous();
  return null;
end;
$function$;

revoke all on function private.ensure_task_display_ids_after_write() from public,anon,authenticated;

drop trigger if exists task_display_ids_contiguous_after_write on public.tasks;
create trigger task_display_ids_contiguous_after_write
after insert or update of legacy_id on public.tasks
for each statement
execute function private.ensure_task_display_ids_after_write();

notify pgrst,'reload schema';

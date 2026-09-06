create or replace function public.delete_task_and_resequence(p_task_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start bigint;
  v_row record;
begin
  if not (select private.is_manager()) then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  -- One shared display-id sequence is used across active and archived tasks.
  -- Lock the table so a delete from either view cannot race with resequencing.
  lock table public.tasks in share row exclusive mode;

  select coalesce(min(coalesce(legacy_id, id)), 1)
    into v_start
  from public.tasks;

  delete from public.tasks where id = p_task_id;
  if not found then
    raise exception 'تسک پیدا نشد';
  end if;

  for v_row in
    select id, row_number() over (order by coalesce(legacy_id, id), id) as seq
    from public.tasks
  loop
    update public.tasks set legacy_id = -v_row.seq where id = v_row.id;
  end loop;

  for v_row in
    select id, -legacy_id as seq
    from public.tasks
    order by -legacy_id
  loop
    update public.tasks
       set legacy_id = v_start + v_row.seq - 1
     where id = v_row.id;
  end loop;
end;
$$;

revoke all on function public.delete_task_and_resequence(bigint) from public, anon;
grant execute on function public.delete_task_and_resequence(bigint) to authenticated;

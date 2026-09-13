-- Regression assertion: deleting a change request must preserve task history.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid=c.conrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='task_history'
      and c.conname='task_history_request_id_fkey'
      and c.confdeltype='n'
  ) then
    raise exception 'task_history_request_id_fkey must use ON DELETE SET NULL';
  end if;
end $$;

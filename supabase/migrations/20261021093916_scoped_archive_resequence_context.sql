-- Archive ordering can renumber tasks outside the approver's own branch.
-- Authorize only this private, ID-only maintenance window with the existing
-- unforgeable transaction context; leave all hierarchy/RPC checks unchanged.
create or replace function private.resequence_archived_task_display_ids()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  mapping jsonb;
  previous_setting text;
  context_inserted integer:=0;
begin
  if current_setting('bamco.resequencing',true)='1' then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));
  with ranked as (
    select id,legacy_id,row_number() over(order by done_date asc nulls first,id) as seq
    from public.tasks where archived
  ),slots as (
    select legacy_id,row_number() over(order by legacy_id,id) as seq
    from public.tasks where archived
  )
  select jsonb_agg(jsonb_build_object('id',r.id,'new_number',s.legacy_id)) into mapping
  from ranked r join slots s using(seq)
  where r.legacy_id is distinct from s.legacy_id;
  if mapping is null then return; end if;

  previous_setting:=current_setting('bamco.resequencing',true);
  insert into private.task_delete_resequence_context(backend_pid,transaction_id)
  values(pg_backend_pid(),txid_current()) on conflict do nothing;
  get diagnostics context_inserted=row_count;
  perform set_config('bamco.resequencing','1',true);
  begin
    update public.tasks t
       set legacy_id=-t.legacy_id
      from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint)
     where t.id=m.id;
    update public.tasks t
       set legacy_id=m.new_number
      from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint)
     where t.id=m.id;
  exception when others then
    perform set_config('bamco.resequencing',coalesce(previous_setting,''),true);
    if context_inserted=1 then
      delete from private.task_delete_resequence_context
      where backend_pid=pg_backend_pid() and transaction_id=txid_current();
    end if;
    raise;
  end;
  perform set_config('bamco.resequencing',coalesce(previous_setting,''),true);
  if context_inserted=1 then
    delete from private.task_delete_resequence_context
    where backend_pid=pg_backend_pid() and transaction_id=txid_current();
  end if;
  perform private.sync_task_display_references();
end;
$$;

revoke all on function private.resequence_archived_task_display_ids()
  from public,anon,authenticated,service_role;

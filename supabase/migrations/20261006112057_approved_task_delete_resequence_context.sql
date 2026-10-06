CREATE OR REPLACE FUNCTION private.apply_change_request(p_request_id bigint, p_actor uuid, p_payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.change_requests%rowtype;
  tid bigint;
  v_previous_request_id text:=coalesce(
    current_setting('bamco.request_id',true),'');
  v_previous_source_path text:=coalesce(
    current_setting('bamco.source_path',true),'');
  v_previous_approval_apply text:=coalesce(
    current_setting('bamco.approval_apply',true),'');
begin
  select * into r
  from public.change_requests
  where id=p_request_id
  for update;
  if not found then
    raise exception 'درخواست پیدا نشد.' using errcode='P0002';
  end if;

  perform set_config('bamco.request_id',r.id::text,true);
  perform set_config('bamco.source_path','approval_workflow',true);
  perform set_config('bamco.approval_apply','1',true);

  if r.request_type='create' then
    insert into public.tasks(
      title,description,owner_id,status,priority,start_date,due_date,done_date,
      reminder_days,manager_notes,created_by,change_reason
    ) values(
      p_payload->>'title',coalesce(p_payload->>'description',''),
      coalesce(nullif(p_payload->>'owner_id','')::uuid,r.requested_by),
      coalesce(p_payload->>'status','ثبت شده'),
      coalesce(p_payload->>'priority','متوسط'),
      nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,
      nullif(p_payload->>'done_date','')::date,
      coalesce(nullif(p_payload->>'reminder_days','')::integer,0),
      coalesce(p_payload->>'manager_notes',''),r.requested_by,
      'درخواست شماره '||r.id
    ) returning id into tid;
  else
    tid:=r.task_id;
    if r.request_type='delete' then
      if not private.is_verified_task_approval_path(
        tid,(select task.created_by from public.tasks task where task.id=tid)
      ) then
        raise exception 'مسیر تأیید حذف وظیفه معتبر نیست.' using errcode='42501';
      end if;
      insert into private.task_delete_resequence_context(backend_pid,transaction_id)
      values(pg_backend_pid(),txid_current());
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('bamco-task-display-id-resequence',0)
      );
      lock table public.tasks in share row exclusive mode;
      delete from public.tasks where id=tid;
      perform private.resequence_task_display_ids();
      delete from private.task_delete_resequence_context
      where backend_pid=pg_backend_pid() and transaction_id=txid_current();
    elsif r.request_type='complete' then
      update public.tasks
      set status='انجام شده',
          due_date=case
            when p_payload?'due_date'
            then nullif(p_payload->>'due_date','')::date
            else due_date
          end,
          done_date=coalesce(
            nullif(p_payload->>'done_date','')::date,current_date),
          archived=true,
          archived_at=now(),
          change_reason='درخواست شماره '||r.id
      where id=tid;
    else
      update public.tasks
      set title=coalesce(p_payload->>'title',title),
          description=coalesce(p_payload->>'description',description),
          status=coalesce(p_payload->>'status',status),
          priority=coalesce(p_payload->>'priority',priority),
          owner_id=case
            when p_payload?'owner_id'
            then nullif(p_payload->>'owner_id','')::uuid
            else owner_id
          end,
          done_date=case
            when p_payload?'done_date'
            then nullif(p_payload->>'done_date','')::date
            else done_date
          end,
          archived=case
            when p_payload?'archived'
            then (p_payload->>'archived')::boolean
            else archived
          end,
          archived_at=case
            when p_payload->>'archived'='true' then now()
            else archived_at
          end,
          start_date=case
            when p_payload?'start_date'
            then nullif(p_payload->>'start_date','')::date
            else start_date
          end,
          due_date=case
            when p_payload?'due_date'
            then nullif(p_payload->>'due_date','')::date
            else due_date
          end,
          reminder_days=case
            when p_payload?'reminder_days'
            then coalesce(nullif(p_payload->>'reminder_days','')::integer,0)
            else reminder_days
          end,
          manager_notes=coalesce(p_payload->>'manager_notes',manager_notes),
          change_reason='درخواست شماره '||r.id
      where id=tid;
    end if;
  end if;

  update public.change_requests
  set task_id=case
        when r.request_type='delete' then null
        else coalesce(task_id,tid)
      end,
      applied_task_id=case
        when r.request_type='delete' then null
        else tid
      end,
      request_status='approved',
      final_data=p_payload,
      completed_at=now(),
      reviewed_by=p_actor,
      reviewed_at=now()
  where id=r.id;
  insert into public.change_request_events(
    request_id,actor_id,event_type,note,snapshot
  ) values(
    r.id,p_actor,'applied','تغییر روی وظیفه اعمال شد',
    jsonb_build_object('task_id',tid)
  );

  perform set_config('bamco.request_id',v_previous_request_id,true);
  perform set_config('bamco.source_path',v_previous_source_path,true);
  perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
  return tid;
exception when others then
  perform set_config('bamco.request_id',v_previous_request_id,true);
  perform set_config('bamco.source_path',v_previous_source_path,true);
  perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
  raise;
end;
$function$
;

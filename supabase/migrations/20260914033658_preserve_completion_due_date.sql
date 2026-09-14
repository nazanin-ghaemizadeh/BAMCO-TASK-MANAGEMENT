-- A completion request may carry an explicitly corrected due date. Keep that
-- date when the manager approves the request instead of silently discarding it.
create or replace function private.apply_change_request(p_request_id bigint, p_actor uuid, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare r public.change_requests%rowtype; tid bigint;
begin
 select * into r from public.change_requests where id=p_request_id for update;
 perform set_config('app.request_id',r.id::text,true);perform set_config('app.source_path','approval_workflow',true);
 if r.request_type='create' then
  insert into public.tasks(title,description,owner_id,status,priority,start_date,due_date,done_date,reminder_days,manager_notes,created_by,change_reason)
  values(p_payload->>'title',coalesce(p_payload->>'description',''),coalesce(nullif(p_payload->>'owner_id','')::uuid,r.requested_by),coalesce(p_payload->>'status','ثبت شده'),coalesce(p_payload->>'priority','متوسط'),nullif(p_payload->>'start_date','')::date,nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'done_date','')::date,coalesce(nullif(p_payload->>'reminder_days','')::int,0),coalesce(p_payload->>'manager_notes',''),p_actor,'درخواست شماره '||r.id) returning id into tid;
 else
  tid=r.task_id;
  if r.request_type='delete' then
   lock table public.tasks in share row exclusive mode;
   delete from public.tasks where id=tid;
   perform private.resequence_task_display_ids();
  elsif r.request_type='complete' then
   update public.tasks set
    status='انجام شده',
    due_date=case when p_payload?'due_date' then nullif(p_payload->>'due_date','')::date else due_date end,
    done_date=coalesce(nullif(p_payload->>'done_date','')::date,current_date),
    archived=true,archived_at=now(),change_reason='درخواست شماره '||r.id
   where id=tid;
  else update public.tasks set
   title=coalesce(p_payload->>'title',title),description=coalesce(p_payload->>'description',description),
   status=coalesce(p_payload->>'status',status),priority=coalesce(p_payload->>'priority',priority),
   owner_id=case when p_payload?'owner_id' then nullif(p_payload->>'owner_id','')::uuid else owner_id end,
   done_date=case when p_payload?'done_date' then nullif(p_payload->>'done_date','')::date else done_date end,
   archived=case when p_payload?'archived' then (p_payload->>'archived')::boolean else archived end,
   archived_at=case when p_payload->>'archived'='true' then now() else archived_at end,
   start_date=case when p_payload?'start_date' then nullif(p_payload->>'start_date','')::date else start_date end,
   due_date=case when p_payload?'due_date' then nullif(p_payload->>'due_date','')::date else due_date end,
   reminder_days=case when p_payload?'reminder_days' then coalesce(nullif(p_payload->>'reminder_days','')::int,0) else reminder_days end,
   manager_notes=coalesce(p_payload->>'manager_notes',manager_notes),change_reason='درخواست شماره '||r.id where id=tid;
  end if;
 end if;
 update public.change_requests set task_id=coalesce(task_id,tid),applied_task_id=tid,request_status='approved',final_data=p_payload,completed_at=now(),reviewed_by=p_actor,reviewed_at=now() where id=r.id;
 insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot) values(r.id,p_actor,'applied','تغییر روی وظیفه اعمال شد',jsonb_build_object('task_id',tid));
 return tid;
end;
$function$;

revoke all on function private.apply_change_request(bigint,uuid,jsonb) from public,anon,authenticated;

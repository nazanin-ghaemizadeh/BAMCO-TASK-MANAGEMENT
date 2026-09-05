create or replace function public.review_change_request(p_request_id bigint,p_decision text,p_manager_note text default null)
returns void language plpgsql security invoker set search_path=''
as $$
declare r public.change_requests%rowtype; payload jsonb; new_task_id bigint;
begin
  if not (select private.is_manager()) then raise exception 'دسترسی مدیر لازم است'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'تصمیم نامعتبر است'; end if;
  select * into r from public.change_requests where id=p_request_id and request_status='pending' for update;
  if not found then raise exception 'درخواست باز پیدا نشد'; end if;
  payload=r.proposed_data;
  if p_decision='approved' then
    if r.request_type='create' then
      insert into public.tasks(title,description,owner_id,status,priority,start_date,done_date,due_date,reminder_days,manager_notes,created_by)
      values(payload->>'title',coalesce(payload->>'description',''),(payload->>'owner_id')::uuid,coalesce(payload->>'status','ثبت شده'),coalesce(payload->>'priority','متوسط'),nullif(payload->>'start_date','')::date,nullif(payload->>'done_date','')::date,nullif(payload->>'due_date','')::date,coalesce((payload->>'reminder_days')::integer,0),coalesce(payload->>'manager_notes',''),(select auth.uid())) returning id into new_task_id;
      update public.change_requests set task_id=new_task_id where id=r.id;
    elsif r.request_type='update' then
      update public.tasks set title=coalesce(payload->>'title',title),description=coalesce(payload->>'description',description),status=coalesce(payload->>'status',status),priority=coalesce(payload->>'priority',priority),start_date=case when payload?'start_date' then nullif(payload->>'start_date','')::date else start_date end,done_date=case when payload?'done_date' then nullif(payload->>'done_date','')::date else done_date end,due_date=case when payload?'due_date' then nullif(payload->>'due_date','')::date else due_date end,reminder_days=coalesce((payload->>'reminder_days')::integer,reminder_days) where id=r.task_id;
    elsif r.request_type='complete' then
      update public.tasks set status='انجام شده',done_date=coalesce(nullif(payload->>'done_date','')::date,current_date),archived=true,archived_at=now() where id=r.task_id;
    end if;
  end if;
  update public.change_requests set request_status=p_decision,manager_note=p_manager_note,reviewed_by=(select auth.uid()),reviewed_at=now() where id=r.id;
end $$;
revoke all on function public.review_change_request(bigint,text,text) from public,anon;
grant execute on function public.review_change_request(bigint,text,text) to authenticated;

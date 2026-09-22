-- The prior migration created the dispatcher before its final summary source
-- was attached. Replace it atomically so existing projects start queueing the
-- browser notifications immediately.
create or replace function private.dispatch_task_due_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  with due_tasks as (
    select task.id,task.owner_id,task.due_date,
      case
        when task.due_date < current_date then 'overdue'
        when task.due_date <= current_date+greatest(coalesce(task.reminder_days,0),0) then 'warning'
      end as due_state
    from public.tasks task
    join lateral private.task_status_option(task.status) status_option on true
    where task.owner_id is not null
      and task.due_date is not null
      and not task.archived
      and coalesce(status_option.tracks_deadline,false)
      and status_option.kind not in ('completed','cancelled','registered')
      and task.due_date <= current_date+greatest(coalesce(task.reminder_days,0),0)
  ), recipients as (
    select due.id,due.due_date,due.due_state,owner_profile.id as recipient_id
    from due_tasks due
    join public.profiles owner_profile on owner_profile.id=due.owner_id and owner_profile.active
    union
    select due.id,due.due_date,due.due_state,manager_profile.id as recipient_id
    from due_tasks due
    join public.profiles manager_profile on manager_profile.active and manager_profile.role='manager'
  ), inserted as (
    insert into private.task_due_alert_log(task_id,recipient_id,due_state,due_date)
    select id,recipient_id,due_state,due_date from recipients
    on conflict do nothing
    returning task_id,recipient_id,due_state,due_date
  ), summaries as (
    select recipient_id,
      count(*) filter(where due_state='warning')::integer as warning_count,
      count(*) filter(where due_state='overdue')::integer as overdue_count,
      jsonb_agg(jsonb_build_object('task_id',task_id,'state',due_state,'due_date',due_date) order by task_id) as tasks
    from inserted
    group by recipient_id
  )
  insert into public.notifications(user_id,notification_type,title,body,entity_type,entity_id,action,metadata)
  select recipient_id,
    'task_alert',
    'هشدار وظایف',
    case
      when warning_count>0 and overdue_count>0 then warning_count::text||' وظیفه در هشدار و '||overdue_count::text||' وظیفه در دیرکرد است.'
      when overdue_count>0 then overdue_count::text||' وظیفه در دیرکرد است.'
      else warning_count::text||' وظیفه وارد بازه هشدار شده است.'
    end,
    'task_alert_summary',
    current_date::text,
    'open_tasks',
    jsonb_build_object('warning_count',warning_count,'overdue_count',overdue_count,'tasks',tasks)
  from summaries;
end;
$$;

revoke all on function private.dispatch_task_due_alerts() from public,anon,authenticated;

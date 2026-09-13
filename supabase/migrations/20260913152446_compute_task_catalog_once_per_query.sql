set local lock_timeout='5s';
create temporary table bamco_task_view_before on commit drop as select id,to_jsonb(v) payload from public.task_status_view v;
create or replace view public.task_status_view with(security_invoker=true) as
with task_rows as materialized(select * from public.tasks),
status_values as materialized(select distinct status from task_rows),
priority_values as materialized(select distinct priority from task_rows),
status_options as materialized(select v.status lookup_value,s.* from status_values v left join lateral private.task_status_option(v.status) s on true),
priority_options as materialized(select v.priority lookup_value,p.* from priority_values v left join lateral private.task_priority_option(v.priority) p on true)
select t.id,t.title,t.description,t.owner_id,coalesce(s.label,t.status) status,coalesce(p.label,t.priority) priority,
t.start_date,t.done_date,t.due_date,t.reminder_days,t.last_updated_at,t.manager_notes,t.archived,t.archived_at,
t.created_by,t.created_at,t.legacy_id,t.row_version,t.source,t.source_row_hash,
case when t.archived or s.kind in ('completed','cancelled') then 'وظیفه به پایان رسیده است'
when not coalesce(s.tracks_deadline,false) then 'فاقد شرایط دیرکرد'
when t.due_date<current_date then 'دیرکرد'
when t.due_date is not null and current_date >= (t.due_date-t.reminder_days) then 'دوره هشدار'
else 'فاقد شرایط دیرکرد' end due_state,
case when t.archived and t.done_date>t.due_date then t.done_date-t.due_date else 0 end delay_days,
case when t.archived and t.done_date<t.due_date then t.due_date-t.done_date else 0 end advance_days,
t.former_owner_name,t.owner_deleted_at,s.key status_key,p.key priority_key,s.kind status_kind,s.color status_color,p.color priority_color,t.last_update_note
from task_rows t left join status_options s on s.lookup_value is not distinct from t.status
left join priority_options p on p.lookup_value is not distinct from t.priority;
do $$ begin
if exists(select 1 from bamco_task_view_before b full join public.task_status_view v using(id) where b.id is null or v.id is null or b.payload is distinct from to_jsonb(v)) then raise exception 'Task view output changed';end if;
end $$;

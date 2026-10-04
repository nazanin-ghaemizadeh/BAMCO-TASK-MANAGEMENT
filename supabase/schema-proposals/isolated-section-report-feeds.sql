-- LOCAL REVIEW PROPOSAL: not a deployed migration.
-- Read-only section feeds. The tasks SELECT policy and workflow snapshots are
-- deliberately unchanged. These functions never mutate tasks or approvals.
begin;
create or replace function private.section_report_feed(p_feature text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_tasks jsonb; v_events jsonb:='[]'::jsonb; v_profiles jsonb; v_start text;
begin
 if p_feature not in ('taskTimeline','performanceReport') or not private.feature_can_access_for(auth.uid(),p_feature,'view') then
  raise exception 'Report section access denied' using errcode='42501'; end if;
 if p_feature='taskTimeline' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into v_tasks from (
   select t.id,t.legacy_id,t.title,t.description,t.owner_id,t.status,t.priority,t.start_date,t.due_date,t.done_date,t.reminder_days,t.archived,
    coalesce(nullif(p.display_name,''),nullif(p.full_name,''),t.former_owner_name,'—') owner_name
   from public.tasks t left join public.profiles p on p.id=t.owner_id where not t.archived
  ) t;
 else
  select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) into v_tasks from (
   select id,owner_id,created_by,status,priority,start_date,due_date,done_date,reminder_days,archived
   from public.tasks
  ) t;
  -- Preserve the report's request/direct-definition deduplication, but return
  -- only daily aggregate counts. No request identifiers, text, decisions,
  -- approver routing or request payloads enter the report client/cache.
  with definitions as (
   select r.requested_by::text actor_id,
    coalesce(nullif(r.proposed_data->>'owner_id',''),nullif(r.final_data->>'owner_id',''),r.requested_by::text) owner_id,
    (r.created_at at time zone 'UTC')::date created_day
   from public.change_requests r where r.request_type='create' and r.requested_by is not null
   union all
   select t.created_by::text,coalesce(t.owner_id,t.created_by)::text,(t.created_at at time zone 'UTC')::date
   from public.tasks t where t.created_by is not null and lower(t.source) in ('web','project') and not exists(
    select 1 from public.change_requests r where r.request_type='create' and (r.task_id=t.id or r.applied_task_id=t.id)
   )
  ), grouped as (
   select actor_id,owner_id,created_day,count(*) as event_count from definitions group by actor_id,owner_id,created_day
  ) select coalesce(jsonb_agg(jsonb_build_object('actorId',actor_id,'ownerId',owner_id,'createdAt',created_day,'count',event_count) order by created_day,actor_id,owner_id),'[]'::jsonb) into v_events from grouped;
  select coalesce(value->>'value',value#>>'{}') into v_start from public.app_settings where key='performance_monitoring_started_at' limit 1;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',coalesce(nullif(p.display_name,''),nullif(p.full_name,''),'—')) order by p.id),'[]'::jsonb) into v_profiles
 from public.profiles p where exists(select 1 from jsonb_array_elements(v_tasks) t where t->>'owner_id'=p.id::text or t->>'created_by'=p.id::text)
  or exists(select 1 from jsonb_array_elements(v_events) e where e->>'actorId'=p.id::text);
 return jsonb_build_object('schema','bamco.section-report.v1','feature',p_feature,'tasks',v_tasks,'definition_events',v_events,'profiles',v_profiles,
  'monitoring_started_at',coalesce(nullif(v_start,''),'2026-09-05T20:30:00Z'));
end;
$$;
create or replace function public.task_timeline_report_feed() returns jsonb language sql security invoker set search_path='' as $$select private.section_report_feed('taskTimeline');$$;
create or replace function public.performance_report_feed() returns jsonb language sql security invoker set search_path='' as $$select private.section_report_feed('performanceReport');$$;
revoke all on function private.section_report_feed(text),public.task_timeline_report_feed(),public.performance_report_feed() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.section_report_feed(text),public.task_timeline_report_feed(),public.performance_report_feed() to authenticated;
commit;

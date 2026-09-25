-- Deleting a task clears both change_requests.task_id and applied_task_id through
-- foreign keys. The applied_task_id cleanup fires the project request-state
-- trigger for every historical approved request linked to that task. Those rows
-- are immutable history, not a new workflow transition, and must not attempt to
-- read the task while it is being deleted.

-- A create request represents a task that does not exist yet. Binding it to an
-- existing task would let a caller manufacture misleading request history and
-- split task_id from the newly materialized applied_task_id. The apply step may
-- populate both references later; only the initial INSERT is constrained.
create or replace function private.guard_change_request_create_binding()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.request_type='create' and new.task_id is not null then
    raise exception 'درخواست ایجاد نباید به وظیفهٔ موجود متصل باشد.'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_change_request_create_binding()
  from public,anon,authenticated;

drop trigger if exists change_request_create_binding_guard
  on public.change_requests;
create trigger change_request_create_binding_guard
before insert on public.change_requests
for each row execute function private.guard_change_request_create_binding();

drop trigger if exists change_request_project_activity_sync
  on public.change_requests;
drop trigger if exists change_request_project_activity_sync_insert
  on public.change_requests;

create trigger change_request_project_activity_sync_insert
after insert on public.change_requests
for each row execute function private.sync_project_activity_request_state();

create trigger change_request_project_activity_sync
after update of request_status,proposed_data,final_data,applied_task_id
on public.change_requests
for each row
when (
  not (
    old.proposed_data->>'request_context'='project_activity'
    and old.request_status='approved'
    and new.request_status='approved'
    and old.applied_task_id is not null
    and new.applied_task_id is null
    and (
      new.task_id is not distinct from old.task_id
      or new.task_id is null
    )
    and (to_jsonb(new)-array['task_id','applied_task_id']::text[])
        is not distinct from
        (to_jsonb(old)-array['task_id','applied_task_id']::text[])
  )
)
execute function private.sync_project_activity_request_state();

-- legacy_id is presentation state maintained only by the canonical global
-- resequencers. A direct PostgREST PATCH must never invoke their SECURITY
-- DEFINER/audit-suppression path or choose another task's visible identifier.
create or replace function private.guard_task_legacy_id_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('bamco.resequencing',true),'')='1'
     and (to_jsonb(new)-'legacy_id')
         is not distinct from (to_jsonb(old)-'legacy_id') then
    return new;
  end if;
  raise exception 'شناسهٔ نمایشی وظیفه فقط توسط سامانه قابل بازشماری است.'
    using errcode='42501';
end;
$$;

revoke all on function private.guard_task_legacy_id_update()
  from public,anon,authenticated;

drop trigger if exists task_legacy_id_update_guard on public.tasks;
create trigger task_legacy_id_update_guard
before update of legacy_id on public.tasks
for each row execute function private.guard_task_legacy_id_update();

create or replace function private.guard_task_legacy_id_insert()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_max bigint;
begin
  if new.legacy_id is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('bamco-task-display-id-resequence',0)
  );
  select coalesce(max(task.legacy_id),0) into v_max
  from public.tasks task;
  if new.legacy_id<=0 or new.legacy_id<=v_max then
    raise exception 'شناسهٔ ورودی باید مثبت و پس از آخرین شناسهٔ وظیفه باشد.'
      using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_task_legacy_id_insert()
  from public,anon,authenticated;

drop trigger if exists task_legacy_id_insert_guard on public.tasks;
create trigger task_legacy_id_insert_guard
before insert on public.tasks
for each row execute function private.guard_task_legacy_id_insert();

-- Collapse any stale permissive hierarchy policies and keep one coherent write
-- policy per operation. Excel import may still supply legacy_id on INSERT, but
-- only an actor with Kanban create authority and valid organization scope can
-- insert; all later legacy_id changes are system-only via the guard above.
drop policy if exists tasks_hierarchy_insert on public.tasks;
drop policy if exists tasks_hierarchy_update on public.tasks;
drop policy if exists tasks_direct_insert on public.tasks;
drop policy if exists tasks_direct_update on public.tasks;

create policy tasks_direct_insert
on public.tasks for insert to authenticated
with check (
  public.can_access_feature('kanban','create')
  and created_by=(select auth.uid())
  and (
    (owner_id is null and public.bamco_is_system_manager())
    or (
      owner_id is not null
      and public.bamco_can_direct_manage_organization_user(owner_id)
    )
  )
);

create policy tasks_direct_update
on public.tasks for update to authenticated
using (
  public.can_access_feature('kanban','edit')
  and public.organization_can_manage_task(id)
)
with check (
  public.can_access_feature('kanban','edit')
  and public.bamco_can_direct_manage_organization_user(
    coalesce(owner_id,created_by)
  )
);

-- Fresh migration replay can otherwise leave the later hierarchy versions of
-- these SECURITY DEFINER RPCs in place. Keep their organization-scope check,
-- but also require the operation-specific Kanban capability explicitly so the
-- functions cannot bypass RLS through their definer privileges.
create or replace function public.delete_tasks_and_resequence(
  p_task_ids bigint[]
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requested integer;
  v_authorized integer;
  v_count integer;
  v_start bigint;
begin
  select count(distinct selected.id) into v_requested
  from unnest(coalesce(p_task_ids,array[]::bigint[])) selected(id)
  where selected.id is not null;
  if v_requested=0 then
    raise exception 'هیچ وظیفه‌ای انتخاب نشده است.' using errcode='22023';
  end if;

  select count(*) into v_authorized
  from public.tasks task
  where task.id=any(p_task_ids)
    and public.organization_can_manage_task(task.id)
    and private.feature_can_access_for(auth.uid(),'kanban','delete');
  if v_authorized<>v_requested then
    raise exception 'حذف مستقیم فقط برای وظایف زیردستان و با مجوز حذف مجاز است.'
      using errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bamco-task-display-id-resequence',0)
  );
  lock table public.tasks in share row exclusive mode;
  perform private.ensure_task_display_ids_contiguous();
  select min(task.legacy_id) into v_start
  from public.tasks task
  where task.id=any(p_task_ids);
  delete from public.tasks where id=any(p_task_ids);
  get diagnostics v_count=row_count;
  if v_count<>v_requested then
    raise exception 'تعداد وظایف حذف‌شده با انتخاب برابر نیست.';
  end if;
  if v_start is not null then
    perform private.resequence_task_display_ids_from(v_start);
  end if;
  return v_count;
end;
$$;

create or replace function public.restore_tasks_to_kanban_and_resequence(
  p_task_ids bigint[]
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requested integer;
  v_authorized integer;
  v_count integer;
begin
  select count(distinct selected.id) into v_requested
  from unnest(coalesce(p_task_ids,array[]::bigint[])) selected(id)
  where selected.id is not null;
  if v_requested=0 then
    raise exception 'هیچ وظیفه‌ای انتخاب نشده است.' using errcode='22023';
  end if;

  select count(*) into v_authorized
  from public.tasks task
  where task.id=any(p_task_ids)
    and task.archived
    and public.organization_can_manage_task(task.id)
    and private.feature_can_access_for(auth.uid(),'kanban','edit');
  if v_authorized<>v_requested then
    raise exception 'بازگردانی مستقیم فقط برای وظایف آرشیوی زیردستان و با مجوز ویرایش مجاز است.'
      using errcode='42501';
  end if;
  if exists(
    select 1 from public.tasks task
    where task.id=any(p_task_ids)
      and task.archived
      and (
        task.owner_id is null
        or task.start_date is null
        or task.due_date is null
      )
  ) then
    raise exception 'برای بازگشت به کانبان، متولی و تاریخ شروع و پایان باید کامل باشد.'
      using errcode='22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bamco-task-display-id-resequence',0)
  );
  lock table public.tasks in share row exclusive mode;
  update public.tasks
  set archived=false,
      archived_at=null,
      status='در حال انجام',
      done_date=null
  where id=any(p_task_ids) and archived;
  get diagnostics v_count=row_count;
  if v_count<>v_requested then
    raise exception 'تعداد وظایف بازگردانده‌شده با انتخاب برابر نیست.';
  end if;
  perform private.ensure_task_display_ids_contiguous();
  return v_count;
end;
$$;

revoke all on function public.delete_tasks_and_resequence(bigint[])
  from public,anon;
revoke all on function public.restore_tasks_to_kanban_and_resequence(bigint[])
  from public,anon;
grant execute on function public.delete_tasks_and_resequence(bigint[])
  to authenticated,service_role;
grant execute on function public.restore_tasks_to_kanban_and_resequence(bigint[])
  to authenticated,service_role;

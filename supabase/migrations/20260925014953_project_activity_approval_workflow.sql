-- Project activities participate in the canonical task approval lifecycle.
--
-- Contract:
--   * a normal user creating/editing/deleting their own project activity
--     produces a normal change_request (create/update/delete);
--   * the request remains visible to every existing task-definition metric
--     because request_type stays `create` and context is carried in JSON;
--   * a task is materialized in Kanban only after approval;
--   * managers/bypass users and superiors acting for strict descendants retain
--     the existing direct-management authority;
--   * activity and task rows are bound/deleted atomically and cannot be
--     bypassed through direct Data API writes.

alter table public.project_items
  add column if not exists approval_request_id bigint
    references public.change_requests(id) on delete set null,
  add column if not exists approval_state text not null default 'approved';

alter table public.project_items
  drop constraint if exists project_items_approval_state_check;
alter table public.project_items
  add constraint project_items_approval_state_check
  check (approval_state in (
    'pending','in_review','needs_revision','approved','rejected','cancelled'
  ));

-- Fail without rewriting legacy data if production contains an ambiguous
-- task/WBS binding. The detail identifies the exact cleanup needed before a
-- retry; the current production audit found neither condition.
do $$
declare
  v_non_activity_ids text;
  v_duplicate_task_ids text;
begin
  select string_agg(item.id::text,',' order by item.id)
    into v_non_activity_ids
  from public.project_items item
  where item.task_id is not null and item.item_type<>'activity';
  if v_non_activity_ids is not null then
    raise exception 'Legacy project task links require explicit classification.'
      using errcode='23514',
            detail='project_items ids: '||v_non_activity_ids;
  end if;

  select string_agg(duplicate.task_id::text,',' order by duplicate.task_id)
    into v_duplicate_task_ids
  from (
    select item.task_id
    from public.project_items item
    where item.task_id is not null
    group by item.task_id having count(*)>1
  ) duplicate;
  if v_duplicate_task_ids is not null then
    raise exception 'A Kanban task is linked to multiple project items.'
      using errcode='23505',
            detail='task ids: '||v_duplicate_task_ids;
  end if;
end;
$$;

alter table public.project_items
  drop constraint if exists project_items_task_link_activity_only;
alter table public.project_items
  add constraint project_items_task_link_activity_only
  check (task_id is null or item_type='activity');

create index if not exists project_items_approval_request_idx
  on public.project_items(approval_request_id)
  where approval_request_id is not null;

create unique index if not exists project_items_task_unique_idx
  on public.project_items(task_id)
  where task_id is not null;

-- Adopt any legacy open request already attached to a project task. Ambiguous
-- or cross-owner rows stop with diagnostics instead of being silently changed.
do $$
declare
  v_ambiguous_items text;
  v_owner_mismatches text;
begin
  select string_agg(open_request.item_id::text,',' order by open_request.item_id)
    into v_ambiguous_items
  from (
    select item.id item_id
    from public.project_items item
    join public.change_requests request on request.task_id=item.task_id
    where item.item_type='activity'
      and request.request_status in ('pending','in_review','needs_revision')
    group by item.id having count(*)>1
  ) open_request;
  if v_ambiguous_items is not null then
    raise exception 'Multiple open requests exist for a legacy project activity.'
      using errcode='23505',detail='project_items ids: '||v_ambiguous_items;
  end if;

  select string_agg(item.id::text,',' order by item.id)
    into v_owner_mismatches
  from public.project_items item
  join public.projects project on project.id=item.project_id
  join public.change_requests request on request.task_id=item.task_id
  where item.item_type='activity'
    and request.request_status in ('pending','in_review','needs_revision')
    and (
      item.owner_id is distinct from project.owner_id
      or request.requested_by is distinct from project.owner_id
    );
  if v_owner_mismatches is not null then
    raise exception 'Legacy project requests have incompatible requesters/owners.'
      using errcode='23514',detail='project_items ids: '||v_owner_mismatches;
  end if;
end;
$$;

update public.change_requests request
set proposed_data=(coalesce(request.proposed_data,'{}'::jsonb)-'progress')
  || jsonb_build_object(
    'request_context','project_activity',
    'request_label',case request.request_type
      when 'delete' then 'حذف فعالیت از پروژه'
      when 'complete' then 'تکمیل فعالیت پروژه'
      when 'status' then 'تغییر وضعیت فعالیت پروژه'
      when 'priority' then 'تغییر اولویت فعالیت پروژه'
      when 'description' then 'تغییر توضیحات فعالیت پروژه'
      when 'due_date' then 'تغییر تاریخ فعالیت پروژه'
      else 'ویرایش فعالیت در پروژه' end,
    'project_id',item.project_id,
    'project_item_id',item.id,
    'item_type','activity',
    'parent_item_id',item.parent_item_id,
    'owner_id',item.owner_id,
    'source','project'
  )
from public.project_items item
where item.task_id=request.task_id
  and item.item_type='activity'
  and request.request_status in ('pending','in_review','needs_revision');

update public.project_items item
set approval_request_id=request.id,
    approval_state=request.request_status,
    updated_at=now()
from public.change_requests request
where request.task_id=item.task_id
  and item.item_type='activity'
  and request.request_status in ('pending','in_review','needs_revision');

create unique index if not exists change_requests_one_open_project_item_idx
  on public.change_requests((proposed_data->>'project_item_id'))
  where proposed_data->>'request_context'='project_activity'
    and proposed_data->>'project_item_id' is not null
    and request_status in ('pending','in_review','needs_revision');

comment on column public.project_items.approval_request_id is
  'Latest canonical task change request associated with this project activity.';
comment on column public.project_items.approval_state is
  'Materialization state of an activity. Only approved activities may exist in Kanban.';

-- Project scope must not depend on whether another feature happens to grant
-- organization-directory access. The project feature itself is sufficient to
-- traverse the actor's strict descendant branch.
create or replace function public.platform_can_access_project(p_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.can_access_feature('projects','view') and exists(
    select 1
    from public.projects project
    where project.id=p_project_id
      and (
        project.created_by=auth.uid()
        or project.owner_id=auth.uid()
        or exists(
          select 1 from public.project_members member
          where member.project_id=project.id and member.user_id=auth.uid()
        )
        or private.is_system_manager(auth.uid())
        or project.owner_id in (
          select scoped.user_id
          from private.organization_strict_descendant_user_ids(auth.uid()) scoped
        )
      )
  );
$$;

revoke all on function public.platform_can_access_project(bigint) from public,anon;
grant execute on function public.platform_can_access_project(bigint) to authenticated;

-- An owner change after WBS creation would split project visibility from the
-- owner of its Kanban tasks. A future reassignment feature must move both in a
-- single explicit transaction instead of mutating only projects.owner_id.
create or replace function private.enforce_project_owner_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Legacy rows may retain a nullable manager reference different from the
  -- non-null owner. During service-role account deletion, normalize that one
  -- FK cleanup to the owner so the project remains valid and manageable.
  if coalesce(
       current_user='postgres'
       and auth.role()='service_role'
       and nullif(current_setting('bamco.deleting_person',true),'')=old.manager_id::text
       and old.manager_id is not null
       and old.manager_id is distinct from old.owner_id
       and new.manager_id is null
       and (to_jsonb(new)-'manager_id')
           is not distinct from (to_jsonb(old)-'manager_id'),
       false
     ) then
    new.manager_id:=new.owner_id;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'ایجادکنندهٔ پروژه قابل تغییر نیست.' using errcode='42501';
  end if;

  if new.owner_id is distinct from old.owner_id
     or new.manager_id is distinct from old.manager_id then
    if not private.organization_actor_can_direct_manage_user(auth.uid(),old.owner_id)
       or not private.organization_actor_can_direct_manage_user(auth.uid(),new.owner_id) then
      raise exception 'انتقال متولی پروژه فقط برای مدیر مستقیمِ متولی قبلی و جدید مجاز است.'
        using errcode='42501';
    end if;
    if exists(
      select 1 from public.project_items item where item.project_id=old.id
    ) then
      raise exception 'پس از تعریف فعالیت، تغییر متولی پروژه فقط از مسیر انتقال یکپارچه مجاز است.'
        using errcode='23514';
    end if;
    if exists(
      select 1 from public.change_requests request
      where request.proposed_data->>'request_context'='project_activity'
        and request.proposed_data->>'project_id'=old.id::text
        and request.request_status in ('pending','in_review','needs_revision')
    ) then
      raise exception 'تا تعیین تکلیف درخواست‌های باز، متولی پروژه قابل تغییر نیست.'
        using errcode='55000';
    end if;
    if new.owner_id is distinct from new.manager_id then
      raise exception 'متولی و مسئول پروژه باید یک شخص باشند.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_project_owner_consistency()
  from public, anon, authenticated;

drop trigger if exists projects_owner_consistency_guard on public.projects;
create trigger projects_owner_consistency_guard
before update of owner_id, manager_id, created_by on public.projects
for each row execute function private.enforce_project_owner_consistency();

create or replace function private.enforce_project_item_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_owner uuid;
  v_verified_person_delete boolean:=false;
begin
  -- Serialize structural edits per project. This makes the cycle check valid
  -- even when two independently approved move requests race each other.
  perform 1 from public.projects project
  where project.id=new.project_id for update;
  if tg_op='UPDATE' then
    -- delete_person_account is service-role-only and runs as postgres. Its FK
    -- cleanup must be able to clear this nullable historical reference without
    -- opening a caller-controlled path to rewrite the WBS node.
    v_verified_person_delete:=coalesce(
      current_user='postgres'
      and auth.role()='service_role'
      and nullif(current_setting('bamco.deleting_person',true),'')=old.created_by::text
      and old.created_by is not null
      and new.created_by is null
      and (to_jsonb(new)-'created_by')
          is not distinct from (to_jsonb(old)-'created_by'),
      false
    );
  end if;
  if tg_op='UPDATE' and (
    new.project_id is distinct from old.project_id
    or new.item_type is distinct from old.item_type
    or (
      new.created_by is distinct from old.created_by
      and not coalesce(v_verified_person_delete,false)
    )
  ) then
    raise exception 'پروژه، نوع و ثبت‌کنندهٔ گره ساختار شکست قابل تغییر نیست.'
      using errcode='23514';
  end if;
  select project.owner_id into v_project_owner
  from public.projects project where project.id=new.project_id;
  if not found or new.owner_id is distinct from v_project_owner then
    raise exception 'متولی گره ساختار شکست باید با متولی پروژه یکسان باشد.'
      using errcode='23514';
  end if;
  if new.parent_item_id is not null then
    if not exists(
      select 1 from public.project_items parent
      where parent.id=new.parent_item_id
        and parent.project_id=new.project_id
        and parent.item_type in ('phase','activity')
    ) then
      raise exception 'گره بالادست باید متعلق به همین پروژه باشد.' using errcode='23514';
    end if;
    if tg_op='UPDATE' and exists(
      with recursive ancestors(id,parent_item_id) as (
        select parent.id,parent.parent_item_id
        from public.project_items parent where parent.id=new.parent_item_id
        union all
        select parent.id,parent.parent_item_id
        from public.project_items parent
        join ancestors child on child.parent_item_id=parent.id
      )
      select 1 from ancestors where id=old.id
    ) then
      raise exception 'ساختار شکست نمی‌تواند حلقوی باشد.' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_project_item_identity()
  from public,anon,authenticated;

drop trigger if exists project_item_identity_guard on public.project_items;
create trigger project_item_identity_guard
before insert or update of project_id,item_type,created_by,owner_id,parent_item_id
on public.project_items
for each row execute function private.enforce_project_item_identity();

-- Keep project writes within the same self/descendant scope used by the
-- organization tree. The former UPDATE check allowed moving an accessible
-- project to an arbitrary user.
drop policy if exists projects_feature_update on public.projects;
create policy projects_feature_update on public.projects
  for update to authenticated
  using (
    public.can_access_feature('projects','edit')
    and public.platform_can_access_project(id)
  )
  with check (
    public.can_access_feature('projects','edit')
    and owner_id=manager_id
    and (
      (select public.bamco_is_system_manager())
      or owner_id=(select auth.uid())
      or owner_id in (
        select descendant.user_id
        from public.bamco_strict_descendant_user_ids() descendant
      )
    )
  );

-- Activities are writable only through the two audited RPCs below. Phases and
-- milestones remain planning nodes and keep their direct WBS editing behavior.
drop policy if exists project_items_scoped_insert on public.project_items;
drop policy if exists project_items_scoped_update on public.project_items;
drop policy if exists project_items_scoped_delete on public.project_items;

create policy project_items_scoped_insert on public.project_items
  for insert to authenticated
  with check (
    item_type in ('phase','milestone') and task_id is null
    and public.can_access_feature('projects','create')
    and public.platform_can_access_project(project_id)
    and created_by=(select auth.uid())
  );

create policy project_items_scoped_update on public.project_items
  for update to authenticated
  using (
    item_type in ('phase','milestone') and task_id is null
    and public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  )
  with check (
    item_type in ('phase','milestone') and task_id is null
    and public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  );

create policy project_items_scoped_delete on public.project_items
  for delete to authenticated
  using (
    item_type in ('phase','milestone') and task_id is null
    and public.can_access_feature('projects','delete')
    and public.platform_can_access_project(project_id)
  );

drop policy if exists project_members_scoped_insert on public.project_members;
drop policy if exists project_members_scoped_update on public.project_members;
drop policy if exists project_members_scoped_delete on public.project_members;
create policy project_members_scoped_insert on public.project_members
  for insert to authenticated
  with check (
    public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  );
create policy project_members_scoped_update on public.project_members
  for update to authenticated
  using (
    public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  )
  with check (
    public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  );
create policy project_members_scoped_delete on public.project_members
  for delete to authenticated
  using (
    public.can_access_feature('projects','edit')
    and public.platform_can_access_project(project_id)
  );

drop policy if exists project_dependencies_scoped_insert on public.project_dependencies;
drop policy if exists project_dependencies_scoped_update on public.project_dependencies;
drop policy if exists project_dependencies_scoped_delete on public.project_dependencies;
create policy project_dependencies_scoped_insert on public.project_dependencies
  for insert to authenticated
  with check (
    public.can_access_feature('projects','edit')
    and exists(
      select 1
      from public.project_items predecessor
      join public.project_items successor
        on successor.id=project_dependencies.successor_item_id
       and successor.project_id=predecessor.project_id
      where predecessor.id=project_dependencies.predecessor_item_id
        and public.platform_can_access_project(predecessor.project_id)
    )
  );
create policy project_dependencies_scoped_update on public.project_dependencies
  for update to authenticated
  using (
    public.can_access_feature('projects','edit')
    and exists(
      select 1 from public.project_items item
      where item.id=project_dependencies.predecessor_item_id
        and public.platform_can_access_project(item.project_id)
    )
  )
  with check (
    public.can_access_feature('projects','edit')
    and exists(
      select 1
      from public.project_items predecessor
      join public.project_items successor
        on successor.id=project_dependencies.successor_item_id
       and successor.project_id=predecessor.project_id
      where predecessor.id=project_dependencies.predecessor_item_id
        and public.platform_can_access_project(predecessor.project_id)
    )
  );
create policy project_dependencies_scoped_delete on public.project_dependencies
  for delete to authenticated
  using (
    public.can_access_feature('projects','edit')
    and exists(
      select 1 from public.project_items item
      where item.id=project_dependencies.predecessor_item_id
        and public.platform_can_access_project(item.project_id)
    )
  );

-- Do not let a container/project cascade invalidate an in-flight approval.
-- Once open requests are resolved, the normal cascade removes the WBS subtree
-- and the DELETE sync removes every linked task atomically.
create or replace function private.guard_project_item_open_request_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Serialize with save_project_activity, which locks the same project before
  -- validating a parent and inserting its request.
  perform 1 from public.projects project
  where project.id=old.project_id for update;

  if exists(
    with recursive subtree(id,item_type) as (
      select old.id,old.item_type
      union all
      select child.id,child.item_type
      from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    )
    select 1 from subtree
    where id<>old.id and item_type='activity'
  ) then
    raise exception 'ابتدا فعالیت‌های زیرمجموعه را جداگانه حذف کنید.'
      using errcode='55000';
  end if;

  if exists(
    with recursive subtree(id) as (
      select old.id
      union all
      select child.id
      from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    )
    select 1
    from subtree
    join public.change_requests request
      on request.proposed_data->>'parent_item_id'=subtree.id::text
    where request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'project_id'=old.project_id::text
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'این گره، بالادستِ یک درخواست فعالیت باز است.' using errcode='55000';
  end if;

  if exists(
    with recursive subtree(id) as (
      select old.id
      union all
      select child.id
      from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    )
    select 1
    from subtree
    join public.project_items item on item.id=subtree.id
    join public.change_requests request on request.id=item.approval_request_id
    where request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'ابتدا درخواست بازِ فعالیت‌های زیرمجموعه را تعیین تکلیف کنید.'
      using errcode='55000';
  end if;
  return old;
end;
$$;

create or replace function private.guard_project_open_request_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if exists(
    select 1 from public.project_items item
    where item.project_id=old.id and item.item_type='activity'
  ) then
    raise exception 'ابتدا فعالیت‌های پروژه را از مسیر حذف فعالیت تعیین تکلیف کنید.'
      using errcode='55000';
  end if;

  if exists(
    select 1 from public.change_requests request
    where request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'project_id'=old.id::text
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'پروژه دارای درخواست فعالیت باز است و فعلاً قابل حذف نیست.'
      using errcode='55000';
  end if;

  if exists(
    select 1
    from public.project_items item
    join public.change_requests request on request.id=item.approval_request_id
    where item.project_id=old.id
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'پروژه دارای درخواست فعالیت باز است و فعلاً قابل حذف نیست.'
      using errcode='55000';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_project_item_open_request_delete(),
  private.guard_project_open_request_delete() from public,anon,authenticated;

drop trigger if exists project_item_open_request_delete_guard on public.project_items;
create trigger project_item_open_request_delete_guard
before delete on public.project_items
for each row execute function private.guard_project_item_open_request_delete();

drop trigger if exists project_open_request_delete_guard on public.projects;
create trigger project_open_request_delete_guard
before delete on public.projects
for each row execute function private.guard_project_open_request_delete();

-- Custom GUCs are only hints. Every privileged task mutation also binds the
-- current request, requester and actual approver/workflow step before a trigger
-- treats it as an internal approval operation.
create or replace function private.is_verified_task_approval_path(
  p_task_id bigint,
  p_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with setting as (
    select case
      when coalesce(current_setting('bamco.request_id',true),'')~'^[0-9]+$'
      then current_setting('bamco.request_id',true)::bigint
      else null end request_id
  )
  select coalesce(exists(
    select 1
    from setting
    join public.change_requests request on request.id=setting.request_id
    left join public.organization_workflows workflow
      on workflow.id=request.organization_workflow_id
    left join public.organization_workflow_steps step
      on step.workflow_id=workflow.id
     and step.step_no=workflow.current_step
    where coalesce(current_setting('bamco.approval_apply',true),'')='1'
      and coalesce(current_setting('bamco.source_path',true),'')='approval_workflow'
      and request.requested_by=case
        when p_task_id is null then p_created_by
        else coalesce(
          (select item.owner_id from public.project_items item
           where item.task_id=p_task_id and item.item_type='activity'),
          (select task.owner_id from public.tasks task where task.id=p_task_id),
          p_created_by
        ) end
      and (
        (p_task_id is null and request.request_type='create' and request.task_id is null)
        or request.task_id=p_task_id
        or request.applied_task_id=p_task_id
      )
      and request.request_status in ('pending','in_review','approved')
      and (
        (
          request.request_status='approved'
          and request.reviewed_by=auth.uid()
          and coalesce(workflow.status,'') not in ('approved','rejected','cancelled')
          and request.xmin::text::bigint=txid_current()
        )
        or (
          request.request_status in ('pending','in_review')
          and workflow.status='in_review'
          and step.decision='approved'
          and (step.approver_id=auth.uid() or private.is_system_manager(auth.uid()))
        )
      )
  ),false);
$$;

create or replace function private.is_verified_revision_note_path(p_task_id bigint)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    coalesce(current_setting('bamco.approval_apply',true),'')='1'
    and coalesce(current_setting('bamco.source_path',true),'')='approval_revision_note'
    and exists(
      select 1 from public.change_requests request
      where request.task_id=p_task_id
        and request.request_status='needs_revision'
        and request.reviewed_by=auth.uid()
        and request.xmin::text::bigint=txid_current()
    ),false
  );
$$;

revoke all on function private.is_verified_task_approval_path(bigint,uuid),
  private.is_verified_revision_note_path(bigint)
  from public,anon,authenticated;

-- A task linked to an activity must never be deleted independently. Before
-- this guard, ON DELETE SET NULL invoked the activity sync trigger and silently
-- created a replacement task, making an approved delete appear ineffective.
create or replace function private.guard_project_activity_task_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id bigint;
  v_request_context text;
  v_request_type text;
begin
  if not exists(
    select 1 from public.project_items item
    where item.task_id=old.id and item.item_type='activity'
  ) then
    return old;
  end if;

  v_request_id:=nullif(current_setting('bamco.request_id',true),'')::bigint;
  if v_request_id is not null then
    select request.request_type,request.proposed_data->>'request_context'
      into v_request_type,v_request_context
    from public.change_requests request
    where request.id=v_request_id;
    if v_request_type='delete' and v_request_context='project_activity'
       and private.is_verified_task_approval_path(old.id,old.created_by) then
      return old;
    end if;
  end if;

  raise exception 'حذف فعالیت پروژه باید از بخش پروژه و مسیر تأیید انجام شود.'
    using errcode='42501';
end;
$$;

revoke all on function private.guard_project_activity_task_delete()
  from public, anon, authenticated;

drop trigger if exists project_activity_task_delete_guard on public.tasks;
create trigger project_activity_task_delete_guard
before delete on public.tasks
for each row execute function private.guard_project_activity_task_delete();

create or replace function private.guard_project_activity_task_binding()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_owner uuid;
  v_item public.project_items%rowtype;
  v_owner_mode text;
  v_verified_approval boolean;
  v_revision_note boolean;
  v_verified_person_delete boolean:=false;
begin
  select item.* into v_item
  from public.project_items item
  where item.task_id=old.id and item.item_type='activity';
  if not found then return new; end if;
  select project.owner_id into v_project_owner
  from public.projects project
  where project.id=v_item.project_id;

  v_verified_approval:=private.is_verified_task_approval_path(old.id,old.created_by);
  v_revision_note:=private.is_verified_revision_note_path(old.id)
    and row(
      new.title,new.description,new.owner_id,new.status,new.priority,
      new.start_date,new.done_date,new.due_date,new.reminder_days,
      new.archived,new.source,new.created_by
    ) is not distinct from row(
      old.title,old.description,old.owner_id,old.status,old.priority,
      old.start_date,old.done_date,old.due_date,old.reminder_days,
      old.archived,old.source,old.created_by
    );

  -- The service-role account deletion routine clears nullable task.created_by
  -- references after preserving the task. Permit only that exact reference
  -- cleanup; private.enforce_task_rules independently verifies the postgres
  -- deletion path and rejects a caller-spoofed custom GUC.
  v_verified_person_delete:=current_user='postgres'
    and auth.role()='service_role'
    and nullif(current_setting('bamco.deleting_person',true),'')=old.created_by::text
    and old.created_by is not null
    and new.created_by is null
    and (to_jsonb(new)-'created_by')
        is not distinct from (to_jsonb(old)-'created_by');
  if v_verified_person_delete then
    return new;
  end if;

  if v_item.approval_state in ('pending','in_review','needs_revision')
     and not (v_verified_approval or v_revision_note) then
    raise exception 'تا تعیین تکلیف درخواست باز، تغییر مستقیم این فعالیت مجاز نیست.'
      using errcode='55000';
  end if;

  if not (v_verified_approval or v_revision_note) and (
       not private.feature_can_access_for(auth.uid(),'projects','edit')
       or not public.platform_can_access_project(v_item.project_id)
     ) then
    raise exception 'ویرایش وظیفهٔ متصل به پروژه به مجوز ویرایش پروژه نیاز دارد.'
      using errcode='42501';
  end if;

  select option.owner_mode into v_owner_mode
  from private.task_status_option(new.status) option;
  if coalesce(v_owner_mode,'required')='none' then
    if new.owner_id is not null and new.owner_id is distinct from v_project_owner then
      raise exception 'متولی وظیفهٔ پروژه با متولی پروژه سازگار نیست.' using errcode='23514';
    end if;
  elsif new.owner_id is distinct from v_project_owner then
    raise exception 'متولی وظیفهٔ پروژه باید با متولی پروژه یکسان بماند.' using errcode='23514';
  end if;
  if new.source is distinct from 'project' then
    raise exception 'منبع وظیفهٔ متصل به پروژه قابل تغییر نیست.' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_project_activity_task_binding()
  from public,anon,authenticated;

drop trigger if exists project_activity_task_binding_guard on public.tasks;
create trigger project_activity_task_binding_guard
before update of
  title,description,owner_id,status,priority,start_date,due_date,done_date,
  reminder_days,manager_notes,archived,source,created_by
on public.tasks
for each row execute function private.guard_project_activity_task_binding();

-- The repository's last hierarchy migration predates the canonical
-- approval-apply guard. Restore it so approvals executed under the superior's
-- JWT can materialize or change the requester's task.
create or replace function private.enforce_task_hierarchy_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_verified_approval boolean;
  v_revision_note boolean:=false;
  v_verified_resequence boolean:=false;
  v_verified_person_delete boolean:=false;
  v_deleting_person text:=nullif(
    current_setting('bamco.deleting_person',true),'');
begin
  v_verified_approval:=private.is_verified_task_approval_path(
       case when tg_op='UPDATE' then old.id else null end,
       case when tg_op='UPDATE' then old.created_by else new.created_by end
     );
  if tg_op='UPDATE' then
    v_revision_note:=private.is_verified_revision_note_path(old.id)
      and row(
        new.title,new.description,new.owner_id,new.status,new.priority,
        new.start_date,new.done_date,new.due_date,new.reminder_days,
        new.archived,new.source,new.created_by
      ) is not distinct from row(
        old.title,old.description,old.owner_id,old.status,old.priority,
        old.start_date,old.done_date,old.due_date,old.reminder_days,
        old.archived,old.source,old.created_by
      );
    v_verified_resequence:=coalesce(current_setting('bamco.resequencing',true),'')='1'
      and row(
        new.title,new.description,new.owner_id,new.status,new.priority,
        new.start_date,new.done_date,new.due_date,new.reminder_days,
        new.manager_notes,new.archived,new.source,new.created_by
      ) is not distinct from row(
        old.title,old.description,old.owner_id,old.status,old.priority,
        old.start_date,old.done_date,old.due_date,old.reminder_days,
        old.manager_notes,old.archived,old.source,old.created_by
      );
    -- delete_person_account first clears ownership and its FK cleanup can then
    -- clear created_by in a separate UPDATE. Permit either/both references to
    -- become NULL, but only when every changed reference belongs to the exact
    -- deletion target and no other task field is touched. The ordinary task
    -- rules trigger independently requires the trusted postgres deletion path,
    -- so a caller-supplied custom GUC cannot use this exception by itself.
    v_verified_person_delete:=current_user='postgres'
      and auth.role()='service_role'
      and v_deleting_person is not null
      and (
        new.owner_id is distinct from old.owner_id
        or new.created_by is distinct from old.created_by
      )
      and (
        new.owner_id is not distinct from old.owner_id
        or (new.owner_id is null and old.owner_id::text=v_deleting_person)
      )
      and (
        new.created_by is not distinct from old.created_by
        or (new.created_by is null and old.created_by::text=v_deleting_person)
      )
      and (to_jsonb(new)-array['owner_id','created_by'])
          is not distinct from
          (to_jsonb(old)-array['owner_id','created_by']);
  end if;
  if v_verified_approval or v_revision_note
     or v_verified_resequence or v_verified_person_delete
     or auth.role()='service_role'
     or v_actor is null then
    return new;
  end if;
  if tg_op='INSERT' then
    if new.created_by is distinct from v_actor then
      raise exception 'ثبت‌کنندهٔ وظیفه باید کاربر جاری باشد.' using errcode='42501';
    end if;
    if not public.organization_can_assign_task(new.owner_id) then
      raise exception 'ثبت مستقیم فقط برای زیردست سازمانی یا مجوز عبور از تأیید مجاز است.'
        using errcode='42501';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'ثبت‌کنندهٔ وظیفه قابل تغییر نیست.' using errcode='42501';
    end if;
    if not public.organization_can_manage_task(old.id) then
      raise exception 'ویرایش مستقیم فقط برای وظیفهٔ زیردست سازمانی مجاز است.'
        using errcode='42501';
    end if;
    if not private.organization_actor_can_direct_manage_user(
      v_actor,coalesce(new.owner_id,new.created_by)
    ) then
      raise exception 'متولی جدید در محدودهٔ مدیریت مستقیم شما نیست.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_task_hierarchy_scope()
  from public,anon,authenticated;

-- Pending self-service activities intentionally have no task_id. Approved and
-- direct-manager activities retain the canonical two-way task synchronization.
create or replace function private.sync_project_activity_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id bigint;
  v_task_status text;
  v_status_kind text;
  v_completed boolean;
  v_request_id bigint;
  v_request_is_project_delete boolean:=false;
begin
  -- DELETE must run even under a project/phase/activity cascade. The previous
  -- depth-first guard skipped child activities and left orphan Kanban tasks.
  if tg_op='DELETE' then
    if old.item_type='activity' and old.task_id is not null then
      delete from public.tasks where id=old.task_id;
      perform set_config('bamco.project_activity_deleted_task','1',true);
    end if;
    return old;
  end if;

  -- Approval state, WBS parent/progress and audit metadata do not map to task
  -- columns. Avoid a no-op task UPDATE: it would create history/row-version
  -- churn and, once the item is pending, be rejected by the binding guard.
  -- Keep the one repair/materialization case for an approved taskless activity.
  if tg_op='UPDATE'
     and row(
       new.item_type,new.task_id,new.title,new.description,new.owner_id,
       new.status,new.priority,new.planned_start,new.planned_end
     ) is not distinct from row(
       old.item_type,old.task_id,old.title,old.description,old.owner_id,
       old.status,old.priority,old.planned_start,old.planned_end
     )
     and not (
       new.item_type='activity'
       and new.task_id is null
       and new.approval_state='approved'
     ) then
    return new;
  end if;

  -- The service-role account deletion loop clears nullable FK references one
  -- column at a time. A created_by-only WBS cleanup is not a business edit and
  -- must not issue a no-op task UPDATE (which would bump row_version/audit or
  -- be rejected while an approval is open).
  if tg_op='UPDATE'
     and coalesce(
       current_user='postgres'
       and auth.role()='service_role'
       and nullif(current_setting('bamco.deleting_person',true),'')=old.created_by::text
       and old.created_by is not null
       and new.created_by is null
       and (to_jsonb(new)-'created_by')
           is not distinct from (to_jsonb(old)-'created_by'),
       false
     ) then
    return new;
  end if;

  if pg_trigger_depth()>1 then
    return new;
  end if;

  if new.item_type<>'activity' then
    if new.task_id is not null then
      update public.tasks
      set archived=true,archived_at=coalesce(archived_at,now())
      where id=new.task_id;
    end if;
    return new;
  end if;

  -- While an approved project delete is removing the task, the FK sets
  -- task_id to NULL before the request-state trigger removes the item. Do not
  -- recreate the task in that short interval.
  v_request_id:=nullif(current_setting('bamco.request_id',true),'')::bigint;
  if v_request_id is not null then
    select exists(
      select 1 from public.change_requests request
      where request.id=v_request_id
        and request.request_type='delete'
        and request.proposed_data->>'request_context'='project_activity'
    ) into v_request_is_project_delete;
  end if;
  if v_request_is_project_delete then
    return new;
  end if;

  if new.task_id is null and new.approval_state<>'approved' then
    return new;
  end if;

  v_task_status:=private.project_item_task_status(new.status);
  select status_option.kind into v_status_kind
  from private.task_status_option(v_task_status) status_option;
  v_completed:=coalesce(v_status_kind='completed',false);

  if new.task_id is null then
    insert into public.tasks(
      title,description,owner_id,status,priority,start_date,due_date,
      done_date,archived,archived_at,created_by,source
    ) values(
      new.title,new.description,new.owner_id,v_task_status,
      private.project_item_task_priority(new.priority),new.planned_start,new.planned_end,
      case when v_completed then current_date else null end,
      v_completed,case when v_completed then now() else null end,
      new.created_by,'project'
    ) returning id into v_task_id;
    update public.project_items set task_id=v_task_id where id=new.id;
  else
    update public.tasks
    set title=new.title,
        description=new.description,
        owner_id=new.owner_id,
        status=v_task_status,
        priority=private.project_item_task_priority(new.priority),
        start_date=new.planned_start,
        due_date=new.planned_end,
        done_date=case when v_completed then coalesce(done_date,current_date) else null end,
        archived=v_completed,
        archived_at=case when v_completed then coalesce(archived_at,now()) else null end,
        source='project'
    where id=new.task_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_project_activity_task()
  from public, anon, authenticated;

-- A task status whose catalog owner_mode is `none` legitimately stores a NULL
-- task.owner_id. The WBS owner nevertheless remains the project owner, so the
-- reverse sync must not erase it.
create or replace function private.sync_task_project_activity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if pg_trigger_depth()>1 then
    return new;
  end if;
  update public.project_items item
  set title=new.title,
      description=new.description,
      status=private.task_project_item_status(new.status),
      priority=private.task_project_item_priority(new.priority),
      planned_start=new.start_date,
      planned_end=new.due_date,
      progress=case
        when new.archived
          or coalesce((private.task_status_option(new.status)).kind='completed',false)
        then 100
        when old.archived
          or coalesce((private.task_status_option(old.status)).kind='completed',false)
        then 0
        else item.progress end,
      updated_at=now()
  where item.task_id=new.id and item.item_type='activity';
  return new;
end;
$$;

revoke all on function private.sync_task_project_activity()
  from public,anon,authenticated;

-- Recompute every container from its executable leaf descendants. The UPDATE
-- predicate writes only changed totals, so nested trigger invocations converge
-- without relying on a caller-spoofable session flag.
create or replace function private.rollup_project_phase_progress()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_id bigint:=case when tg_op='DELETE' then old.project_id else new.project_id end;
begin
  if tg_op='DELETE'
     or (tg_op='UPDATE' and new.parent_item_id is distinct from old.parent_item_id) then
    update public.project_items former_parent
    set progress=0,updated_at=now()
    where former_parent.id=old.parent_item_id
      and former_parent.item_type in ('phase','activity')
      and former_parent.progress is distinct from 0
      and not exists(
        select 1 from public.project_items child
        where child.parent_item_id=former_parent.id
      );
  end if;

  with recursive descendants(ancestor_id,descendant_id,progress,weight) as (
    select parent.id,child.id,child.progress,coalesce(nullif(child.weight,0),1)
    from public.project_items parent
    join public.project_items child on child.parent_item_id=parent.id
    where parent.project_id=v_project_id
    union all
    select path.ancestor_id,child.id,child.progress,
           coalesce(nullif(child.weight,0),1)
    from descendants path
    join public.project_items child on child.parent_item_id=path.descendant_id
  ), leaf_values as (
    select path.ancestor_id,path.progress,path.weight
    from descendants path
    where not exists(
      select 1 from public.project_items child
      where child.parent_item_id=path.descendant_id
    )
  ), totals as (
    select leaf.ancestor_id,
           coalesce(round(sum(leaf.progress*leaf.weight)/nullif(sum(leaf.weight),0),2),0) progress
    from leaf_values leaf group by leaf.ancestor_id
  )
  update public.project_items container
  set progress=totals.progress,updated_at=now()
  from totals
  where container.id=totals.ancestor_id
    and container.project_id=v_project_id
    and container.item_type in ('phase','activity')
    and container.progress is distinct from totals.progress;

  update public.projects project
  set progress=public.project_calculated_progress(project.id),updated_at=now()
  where project.id=v_project_id and project.progress_override is null;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function private.rollup_project_phase_progress()
  from public,anon,authenticated;

create or replace function private.resequence_after_project_item_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('bamco.project_activity_deleted_task',true),'')='1' then
    perform private.resequence_task_display_ids();
    perform set_config('bamco.project_activity_deleted_task','',true);
  end if;
  return null;
end;
$$;

revoke all on function private.resequence_after_project_item_delete()
  from public,anon,authenticated;

drop trigger if exists project_items_task_resequence_after_delete
  on public.project_items;
create trigger project_items_task_resequence_after_delete
after delete on public.project_items
for each statement execute function private.resequence_after_project_item_delete();

-- Build the exact task payload expected by the canonical approval engine while
-- retaining enough immutable context to apply the project half atomically.
create or replace function private.project_activity_request_payload(
  p_item public.project_items,
  p_label text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'request_context','project_activity',
    'request_label',p_label,
    'project_id',p_item.project_id,
    'project_item_id',p_item.id,
    'item_type','activity',
    'title',p_item.title,
    'description',coalesce(p_item.description,''),
    'owner_id',p_item.owner_id,
    'status',private.project_item_task_status(p_item.status),
    'priority',private.project_item_task_priority(p_item.priority),
    'start_date',p_item.planned_start,
    'due_date',p_item.planned_end,
    'done_date',null,
    'parent_item_id',p_item.parent_item_id,
    'progress',p_item.progress,
    'source','project'
  );
$$;

revoke all on function private.project_activity_request_payload(public.project_items,text)
  from public, anon, authenticated;

-- Only the domain RPC can originate a project-activity create request. The
-- generic public submit RPC rejects caller-supplied request_context metadata.
create or replace function private.submit_project_activity_create_request(
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_project_id bigint;
  v_parent_id bigint;
  v_request_id bigint;
begin
  if v_actor is null
     or not exists(select 1 from public.profiles profile where profile.id=v_actor and profile.active) then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
     or p_payload->>'request_context'<>'project_activity'
     or p_payload->>'item_type'<>'activity'
     or nullif(p_payload->>'project_item_id','') is not null then
    raise exception 'زمینهٔ درخواست فعالیت پروژه نامعتبر است.' using errcode='22023';
  end if;
  v_project_id:=nullif(p_payload->>'project_id','')::bigint;
  v_parent_id:=nullif(p_payload->>'parent_item_id','')::bigint;
  if nullif(btrim(p_payload->>'title'),'') is null then
    raise exception 'عنوان فعالیت الزامی است.' using errcode='22023';
  end if;
  if not private.feature_can_access_for(v_actor,'projects','create')
     or not private.feature_can_access_for(v_actor,'kanban','create') then
    raise exception 'مجوز ثبت درخواست فعالیت پروژه را ندارید.' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.projects project
    where project.id=v_project_id
      and project.owner_id=v_actor
      and project.manager_id=v_actor
      and public.platform_can_access_project(project.id)
  ) then
    raise exception 'درخواست شخصی فقط برای پروژهٔ خود کاربر مجاز است.' using errcode='42501';
  end if;
  if v_parent_id is not null and not exists(
    select 1 from public.project_items parent
    where parent.id=v_parent_id
      and parent.project_id=v_project_id
      and parent.item_type in ('phase','activity')
  ) then
    raise exception 'فعالیت بالادست باید متعلق به همین پروژه باشد.' using errcode='23514';
  end if;

  p_payload:=p_payload||jsonb_build_object(
    'request_context','project_activity',
    'request_label','تعریف فعالیت در پروژه',
    'project_id',v_project_id,
    'project_item_id',null,
    'item_type','activity',
    'parent_item_id',v_parent_id,
    'owner_id',v_actor,
    'source','project'
  );
  insert into public.change_requests(
    task_id,request_type,before_data,proposed_data,requested_by,
    request_status,requester_note
  ) values(
    null,'create',null,p_payload,v_actor,'pending',null
  ) returning id into v_request_id;
  perform private.route_change_request(v_request_id);
  return v_request_id;
end;
$$;

revoke all on function private.submit_project_activity_create_request(jsonb)
  from public,anon,authenticated;

create or replace function private.submit_project_activity_change_request(
  p_request_type text,
  p_item_id bigint,
  p_payload jsonb,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_item public.project_items%rowtype;
  v_parent_id bigint;
  v_progress numeric;
  v_request_id bigint;
  v_before_data jsonb;
  v_label text;
  v_task_payload jsonb;
begin
  if v_actor is null
     or not exists(select 1 from public.profiles profile where profile.id=v_actor and profile.active) then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  if p_request_type not in ('update','delete')
     or jsonb_typeof(coalesce(p_payload,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'درخواست تغییر فعالیت پروژه نامعتبر است.' using errcode='22023';
  end if;

  select item.* into v_item
  from public.project_items item
  join public.projects project on project.id=item.project_id
  where item.id=p_item_id
    and item.item_type='activity'
    and item.owner_id=v_actor
    and project.owner_id=v_actor
  for update of item;
  if not found then
    raise exception 'فعالیت پروژه در محدودهٔ شخصی شما پیدا نشد.' using errcode='42501';
  end if;
  if v_item.task_id is null then
    raise exception 'فعالیت تأییدشده باید وظیفهٔ کانبان داشته باشد.' using errcode='23514';
  end if;
  if not private.feature_can_access_for(
       v_actor,'projects',case when p_request_type='delete' then 'delete' else 'edit' end
     )
     or not private.feature_can_access_for(
       v_actor,'kanban',case when p_request_type='delete' then 'delete' else 'edit' end
     ) then
    raise exception 'مجوز ثبت درخواست تغییر فعالیت پروژه را ندارید.' using errcode='42501';
  end if;
  if v_item.approval_state in ('pending','in_review','needs_revision')
     and exists(
       select 1 from public.change_requests request
       where request.id=v_item.approval_request_id
         and request.request_status in ('pending','in_review','needs_revision')
     ) then
    raise exception 'این فعالیت یک درخواست باز دارد.' using errcode='55000';
  end if;

  v_parent_id:=case when p_payload?'parent_item_id'
    then nullif(p_payload->>'parent_item_id','')::bigint else v_item.parent_item_id end;
  v_progress:=case when p_payload?'progress'
    then nullif(p_payload->>'progress','')::numeric else v_item.progress end;
  v_progress:=coalesce(v_progress,0);
  if v_progress<0 or v_progress>100 then
    raise exception 'درصد پیشرفت باید بین صفر تا صد باشد.' using errcode='22023';
  end if;
  if v_parent_id is not null and not exists(
    select 1 from public.project_items parent
    where parent.id=v_parent_id and parent.project_id=v_item.project_id
      and parent.item_type in ('phase','activity')
  ) then
    raise exception 'فعالیت بالادست باید متعلق به همین پروژه باشد.' using errcode='23514';
  end if;
  if v_parent_id is not null and exists(
    with recursive ancestors(id,parent_item_id) as (
      select parent.id,parent.parent_item_id
      from public.project_items parent where parent.id=v_parent_id
      union all
      select parent.id,parent.parent_item_id
      from public.project_items parent
      join ancestors child on child.parent_item_id=parent.id
    )
    select 1 from ancestors where id=v_item.id
  ) then
    raise exception 'ساختار شکست نمی‌تواند حلقوی باشد.' using errcode='23514';
  end if;

  select to_jsonb(task) into v_before_data
  from public.tasks task where task.id=v_item.task_id;
  if not found then
    raise exception 'وظیفهٔ متصل به فعالیت پیدا نشد.' using errcode='23514';
  end if;
  v_label:=case when p_request_type='delete'
    then 'حذف فعالیت از پروژه' else 'ویرایش فعالیت در پروژه' end;
  v_task_payload:=(coalesce(p_payload,'{}'::jsonb)-array[
    'request_context','request_label','project_id','project_item_id',
    'item_type','parent_item_id','progress','source'
  ]::text[])||jsonb_build_object(
    'request_context','project_activity',
    'request_label',v_label,
    'project_id',v_item.project_id,
    'project_item_id',v_item.id,
    'item_type','activity',
    'parent_item_id',v_parent_id,
    'owner_id',v_actor,
    'progress',v_progress,
    'source','project'
  );

  insert into public.change_requests(
    task_id,request_type,before_data,proposed_data,requested_by,
    request_status,requester_note
  ) values(
    v_item.task_id,p_request_type,v_before_data,v_task_payload,v_actor,'pending',p_note
  ) returning id into v_request_id;
  perform private.route_change_request(v_request_id);
  return v_request_id;
end;
$$;

revoke all on function private.submit_project_activity_change_request(text,bigint,jsonb,text)
  from public,anon,authenticated;

-- Generic Kanban edits/deletes of a task with source=project are enriched from
-- the trusted task<->WBS binding. A browser can neither forge nor replace the
-- immutable project context.
create or replace function public.submit_change_request(
  p_request_type text,
  p_task_id bigint,
  p_proposed_data jsonb,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_request_id bigint;
  v_before_data jsonb;
  v_owner uuid;
  v_item public.project_items%rowtype;
  v_context jsonb;
  v_label text;
begin
  if v_actor is null
     or not exists(select 1 from public.profiles profile where profile.id=v_actor and profile.active) then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then
    raise exception 'اطلاعات درخواست نامعتبر است.' using errcode='22023';
  end if;
  if p_request_type not in (
    'create','update','status','priority','description','complete','delete','due_date'
  ) then
    raise exception 'نوع درخواست نامعتبر است.' using errcode='22023';
  end if;
  if p_proposed_data ?| array[
    'request_context','request_label','project_id','project_item_id',
    'source','item_type','parent_item_id'
  ] then
    raise exception 'زمینهٔ پروژه فقط توسط سامانه تعیین می‌شود.' using errcode='42501';
  end if;
  if not private.feature_can_access_for(
    v_actor,'kanban',case
      when p_request_type='create' then 'create'
      when p_request_type='delete' then 'delete'
      else 'edit' end
  ) then
    raise exception 'مجوز ثبت درخواست وظیفه ندارید.' using errcode='42501';
  end if;

  if p_request_type='create' then
    if nullif(btrim(p_proposed_data->>'title'),'') is null then
      raise exception 'عنوان فعالیت الزامی است.' using errcode='22023';
    end if;
    v_owner:=coalesce(nullif(p_proposed_data->>'owner_id','')::uuid,v_actor);
    if v_owner is distinct from v_actor then
      raise exception 'درخواست شخصی فقط برای خود کاربر قابل ثبت است؛ تخصیص زیردست مستقیماً توسط بالادست انجام می‌شود.'
        using errcode='42501';
    end if;
    p_proposed_data:=coalesce(p_proposed_data,'{}'::jsonb)||jsonb_build_object(
      'owner_id',v_actor,
      'status',coalesce(p_proposed_data->'status','"ثبت شده"'::jsonb),
      'start_date',coalesce(p_proposed_data->'start_date','null'::jsonb),
      'due_date',coalesce(p_proposed_data->'due_date','null'::jsonb),
      'done_date',coalesce(p_proposed_data->'done_date','null'::jsonb)
    );
  else
    select coalesce(task.owner_id,task.created_by),to_jsonb(task)
      into v_owner,v_before_data
    from public.tasks task
    where task.id=p_task_id;
    if not found then
      raise exception 'وظیفهٔ درخواستی پیدا نشد.' using errcode='P0002';
    end if;

    select item.* into v_item
    from public.project_items item
    where item.task_id=p_task_id and item.item_type='activity'
    for update;
    if found then
      v_owner:=v_item.owner_id;
      if v_item.owner_id is distinct from v_actor
         or not exists(
           select 1 from public.projects project
           where project.id=v_item.project_id and project.owner_id=v_actor
         ) then
        raise exception 'پیوند فعالیت پروژه با متولی معتبر نیست.' using errcode='23514';
      end if;
      if not private.feature_can_access_for(
        v_actor,'projects',case when p_request_type='delete' then 'delete' else 'edit' end
      ) or not public.platform_can_access_project(v_item.project_id) then
        raise exception 'مجوز تغییر فعالیت پروژه را ندارید.' using errcode='42501';
      end if;
      if v_item.approval_state in ('pending','in_review','needs_revision')
         and exists(
           select 1 from public.change_requests open_request
           where open_request.id=v_item.approval_request_id
             and open_request.request_status in ('pending','in_review','needs_revision')
         ) then
        raise exception 'این فعالیت یک درخواست باز دارد.' using errcode='55000';
      end if;
      v_label:=case p_request_type
        when 'delete' then 'حذف فعالیت از پروژه'
        when 'complete' then 'تکمیل فعالیت پروژه'
        when 'status' then 'تغییر وضعیت فعالیت پروژه'
        when 'priority' then 'تغییر اولویت فعالیت پروژه'
        when 'description' then 'تغییر توضیحات فعالیت پروژه'
        when 'due_date' then 'تغییر تاریخ فعالیت پروژه'
        else 'ویرایش فعالیت در پروژه' end;
      v_context:=jsonb_build_object(
        'request_context','project_activity',
        'request_label',v_label,
        'project_id',v_item.project_id,
        'project_item_id',v_item.id,
        'item_type','activity',
        'parent_item_id',v_item.parent_item_id,
        'owner_id',v_item.owner_id,
        'source','project'
      );
      p_proposed_data:=(coalesce(p_proposed_data,'{}'::jsonb)-'progress')||v_context;
    end if;
    if v_owner is distinct from v_actor then
      raise exception 'درخواست تغییر فقط برای وظیفهٔ خود کاربر قابل ثبت است.'
        using errcode='42501';
    end if;
  end if;

  insert into public.change_requests(
    task_id,request_type,before_data,proposed_data,requested_by,
    request_status,requester_note
  ) values(
    p_task_id,p_request_type,v_before_data,coalesce(p_proposed_data,'{}'::jsonb),
    v_actor,'pending',p_note
  ) returning id into v_request_id;
  perform private.route_change_request(v_request_id);
  return v_request_id;
end;
$$;

revoke all on function public.submit_change_request(text,bigint,jsonb,text)
  from public,anon;
grant execute on function public.submit_change_request(text,bigint,jsonb,text)
  to authenticated;

-- Synchronize terminal and revision states back to the WBS. This trigger runs
-- after private.apply_change_request, so applied_task_id is already stable.
create or replace function private.sync_project_activity_request_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id bigint;
  v_project_id bigint;
  v_payload jsonb;
  v_key text;
  v_bound_task_id bigint;
  v_task public.tasks%rowtype;
begin
  if coalesce(new.proposed_data->>'request_context','')<>'project_activity' then
    return new;
  end if;

  if tg_op='UPDATE'
     and pg_trigger_depth()>1
     and old.request_status='approved'
     and new.request_status='approved'
     and nullif(old.proposed_data->>'project_item_id','') is null
     and coalesce(new.proposed_data->>'project_item_id','')~'^[0-9]+$'
     and new.proposed_data=jsonb_set(
       old.proposed_data,'{project_item_id}',new.proposed_data->'project_item_id',true
     )
     and new.final_data is not distinct from old.final_data
     and new.applied_task_id is not distinct from old.applied_task_id then
    return new;
  end if;

  v_item_id:=nullif(new.proposed_data->>'project_item_id','')::bigint;
  v_project_id:=nullif(new.proposed_data->>'project_id','')::bigint;

  -- Terminal/revision transitions must remain possible after a permission is
  -- revoked, a requester is deactivated, or a pending CREATE's parent changes.
  -- They never materialize data; only an already-bound item may be unlocked.
  if new.request_status in ('needs_revision','rejected','cancelled') then
    if new.request_type<>'create' and v_item_id is not null then
      update public.project_items item
      set approval_state=case
            when new.request_status='needs_revision' then 'needs_revision'
            else 'approved' end,
          updated_at=now()
      where item.id=v_item_id
        and item.approval_request_id=new.id
        and item.item_type='activity';
    end if;
    return new;
  end if;

  if v_project_id is null then
    raise exception 'زمینهٔ فعالیت پروژه در درخواست ناقص است.' using errcode='23514';
  end if;

  v_bound_task_id:=new.task_id;
  if tg_op='UPDATE' then
    v_bound_task_id:=coalesce(new.task_id,old.task_id);
  end if;

  if new.proposed_data->>'item_type'<>'activity'
     or new.proposed_data->>'owner_id' is distinct from new.requested_by::text then
    raise exception 'نوع یا متولی درخواست فعالیت پروژه معتبر نیست.' using errcode='23514';
  end if;
  if not private.feature_can_access_for(
       new.requested_by,'projects',case
         when new.request_type='create' then 'create'
         when new.request_type='delete' then 'delete'
         else 'edit' end
     )
     or not private.feature_can_access_for(
       new.requested_by,'kanban',case
         when new.request_type='create' then 'create'
         when new.request_type='delete' then 'delete'
         else 'edit' end
     ) then
    raise exception 'ثبت‌کننده مجوز لازم برای این درخواست فعالیت پروژه را ندارد.'
      using errcode='42501';
  end if;
  if not exists(
    select 1 from public.projects project
    where project.id=v_project_id and project.owner_id=new.requested_by
  ) then
    raise exception 'درخواست به پروژهٔ متولی دیگری متصل شده است.' using errcode='42501';
  end if;
  if nullif(new.proposed_data->>'parent_item_id','')::bigint is not null
     and not exists(
       select 1 from public.project_items parent
       where parent.id=nullif(new.proposed_data->>'parent_item_id','')::bigint
         and parent.project_id=v_project_id
         and parent.item_type in ('phase','activity')
     ) then
    raise exception 'فعالیت بالادستِ درخواست متعلق به همین پروژه نیست.' using errcode='23514';
  end if;
  if new.request_type='create' then
    if new.request_status<>'approved' and (v_item_id is not null or new.task_id is not null) then
      raise exception 'درخواست تعریف فعالیت پیش از تأیید نباید WBS یا task داشته باشد.'
        using errcode='23514';
    end if;
  else
    if v_item_id is null or not exists(
      select 1
      from public.project_items item
      where item.id=v_item_id
        and item.project_id=v_project_id
        and item.item_type='activity'
        and item.owner_id=new.requested_by
        and (
          item.task_id=v_bound_task_id
          or (
            new.request_type='delete'
            and new.request_status='approved'
            and item.task_id is null
            and item.approval_request_id=new.id
          )
        )
    ) then
      raise exception 'پیوند درخواست با فعالیت یا task معتبر نیست.' using errcode='23514';
    end if;
  end if;

  -- Canonical review treats final_data as a replacement, not a patch. Mirror
  -- that contract here; task-backed fields are read from the applied task
  -- below so partial final review payloads cannot diverge Kanban and WBS.
  v_payload:=coalesce(new.final_data,new.proposed_data,'{}'::jsonb);
  if jsonb_typeof(v_payload) is distinct from 'object' then
    v_payload:='{}'::jsonb;
  end if;
  -- A final-review editor may change task fields, but never the immutable WBS
  -- binding supplied by the server.
  foreach v_key in array array[
    'request_context','request_label','project_id','project_item_id',
    'item_type','parent_item_id','owner_id','progress','source'
  ] loop
    if new.proposed_data?v_key then
      v_payload:=jsonb_set(v_payload,array[v_key],new.proposed_data->v_key,true);
    end if;
  end loop;
  if not new.proposed_data?'progress' then
    v_payload:=v_payload-'progress';
  end if;

  if new.request_status in ('pending','in_review') then
    if v_item_id is null then
      return new;
    end if;
    update public.project_items item
    set approval_request_id=new.id,
        approval_state=new.request_status,
        updated_at=now()
    where item.id=v_item_id
      and item.project_id=v_project_id
      and item.item_type='activity';
    return new;
  end if;

  if new.request_status='approved' then
    if new.request_type='delete' then
      if v_item_id is null then
        raise exception 'شناسهٔ فعالیت برای حذف تأییدشده موجود نیست.' using errcode='23514';
      end if;
      delete from public.project_items item
      where item.id=v_item_id
        and item.project_id=v_project_id
        and item.item_type='activity';
      return new;
    end if;

    select task.* into v_task
    from public.tasks task
    where task.id=coalesce(new.applied_task_id,new.task_id);
    if not found then
      raise exception 'وظیفهٔ اعمال‌شده برای فعالیت پروژه پیدا نشد.' using errcode='23514';
    end if;

    if new.request_type='create' and v_item_id is null then
      if not exists(
        select 1 from public.projects project
        where project.id=v_project_id
          and project.owner_id=nullif(v_payload->>'owner_id','')::uuid
      ) then
        raise exception 'متولی یا پروژهٔ درخواست با ساختار فعلی سازگار نیست.' using errcode='23514';
      end if;

      insert into public.project_items(
        project_id,parent_item_id,task_id,item_type,title,description,owner_id,
        status,priority,planned_start,planned_end,progress,weight,created_by,
        approval_request_id,approval_state
      ) values(
        v_project_id,nullif(v_payload->>'parent_item_id','')::bigint,
        coalesce(new.applied_task_id,new.task_id),'activity',
        v_task.title,v_task.description,
        nullif(v_payload->>'owner_id','')::uuid,
        private.task_project_item_status(v_task.status),
        private.task_project_item_priority(v_task.priority),
        v_task.start_date,v_task.due_date,
        case
          when coalesce((private.task_status_option(v_task.status)).kind='completed',false)
            then 100
          else greatest(
            0,least(100,coalesce(nullif(v_payload->>'progress','')::numeric,0))
          )
        end,
        1,new.requested_by,new.id,'approved'
      ) returning id into v_item_id;

      update public.tasks
      set source='project',
          owner_id=nullif(v_payload->>'owner_id','')::uuid
      where id=coalesce(new.applied_task_id,new.task_id);

      update public.change_requests
      set proposed_data=jsonb_set(
        proposed_data,'{project_item_id}',to_jsonb(v_item_id),true
      )
      where id=new.id;
      return new;
    end if;

    if v_item_id is null then
      raise exception 'شناسهٔ فعالیت پروژه در درخواست موجود نیست.' using errcode='23514';
    end if;

    update public.project_items item
    set task_id=coalesce(new.applied_task_id,new.task_id,item.task_id),
        title=v_task.title,
        description=v_task.description,
        owner_id=coalesce(nullif(v_payload->>'owner_id','')::uuid,item.owner_id),
        status=private.task_project_item_status(v_task.status),
        priority=private.task_project_item_priority(v_task.priority),
        planned_start=v_task.start_date,
        planned_end=v_task.due_date,
        parent_item_id=case when v_payload?'parent_item_id'
          then nullif(v_payload->>'parent_item_id','')::bigint else item.parent_item_id end,
        progress=case
          when coalesce((private.task_status_option(v_task.status)).kind='completed',false)
            then 100
          when v_payload?'progress'
            then greatest(
              0,least(100,coalesce(nullif(v_payload->>'progress','')::numeric,item.progress))
            )
          else item.progress end,
        approval_request_id=new.id,
        approval_state='approved',
        updated_at=now()
    where item.id=v_item_id
      and item.project_id=v_project_id
      and item.item_type='activity';

    if not found then
      raise exception 'فعالیت پروژهٔ متناظر با درخواست پیدا نشد.' using errcode='P0002';
    end if;

    update public.tasks
    set source='project',
        owner_id=nullif(v_payload->>'owner_id','')::uuid
    where id=coalesce(new.applied_task_id,new.task_id);
    return new;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_project_activity_request_state()
  from public, anon, authenticated;

drop trigger if exists change_request_project_activity_sync on public.change_requests;
create trigger change_request_project_activity_sync
after insert or update of request_status,proposed_data,final_data,applied_task_id
on public.change_requests
for each row execute function private.sync_project_activity_request_state();

create or replace function public.save_project_activity(
  p_item_id bigint,
  p_project_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_item public.project_items%rowtype;
  v_owner uuid;
  v_parent_id bigint;
  v_progress numeric;
  v_direct boolean;
  v_request_id bigint;
  v_request_status text;
  v_request_payload jsonb;
  v_title text;
begin
  if v_actor is null
     or not exists(select 1 from public.profiles profile where profile.id=v_actor and profile.active) then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'اطلاعات فعالیت نامعتبر است.' using errcode='22023';
  end if;

  select * into v_project
  from public.projects project
  where project.id=p_project_id
    and public.platform_can_access_project(project.id)
  for update;
  if not found then
    raise exception 'پروژه در محدودهٔ دسترسی شما نیست.' using errcode='42501';
  end if;

  v_owner:=coalesce(nullif(p_payload->>'owner_id','')::uuid,v_project.owner_id);
  if v_owner is distinct from v_project.owner_id then
    raise exception 'متولی فعالیت باید با متولی پروژه یکسان باشد.' using errcode='23514';
  end if;
  v_direct:=private.organization_actor_can_direct_manage_user(v_actor,v_owner);
  if v_owner is distinct from v_actor and not v_direct then
    raise exception 'متولی پروژه در محدودهٔ سازمانی شما نیست.' using errcode='42501';
  end if;

  v_title:=nullif(btrim(p_payload->>'title'),'');
  if v_title is null then
    raise exception 'عنوان فعالیت الزامی است.' using errcode='22023';
  end if;
  v_parent_id:=nullif(p_payload->>'parent_item_id','')::bigint;
  if v_parent_id is not null and not exists(
    select 1 from public.project_items parent
    where parent.id=v_parent_id
      and parent.project_id=v_project.id
      and parent.item_type in ('phase','activity')
  ) then
    raise exception 'فعالیت بالادست باید متعلق به همین پروژه باشد.' using errcode='23514';
  end if;
  v_progress:=coalesce(nullif(p_payload->>'progress','')::numeric,0);
  if v_progress<0 or v_progress>100 then
    raise exception 'درصد پیشرفت باید بین صفر تا صد باشد.' using errcode='22023';
  end if;

  if p_item_id is null then
    if not private.feature_can_access_for(v_actor,'projects','create')
       or not private.feature_can_access_for(v_actor,'kanban','create') then
      raise exception 'مجوز افزودن فعالیت پروژه را ندارید.' using errcode='42501';
    end if;

    if v_direct then
      insert into public.project_items(
        project_id,parent_item_id,item_type,title,description,owner_id,status,priority,
        planned_start,planned_end,progress,weight,created_by,approval_state
      ) values(
        v_project.id,v_parent_id,'activity',v_title,p_payload->>'description',v_owner,
        coalesce(nullif(p_payload->>'status',''),'ثبت شده'),
        coalesce(nullif(p_payload->>'priority',''),'medium'),
        nullif(p_payload->>'planned_start','')::date,
        nullif(p_payload->>'planned_end','')::date,
        v_progress,1,v_actor,'approved'
      ) returning * into v_item;
      return jsonb_build_object(
        'project_item_id',v_item.id,'request_id',null,
        'applied_directly',true,'request_context','project_activity'
      );
    end if;

    -- Normal self-service creation does not create a WBS row or Kanban task.
    -- The request-state trigger creates both only after final approval.
    v_request_payload:=jsonb_build_object(
      'request_context','project_activity',
      'request_label','تعریف فعالیت در پروژه',
      'project_id',v_project.id,
      'project_item_id',null,
      'item_type','activity',
      'parent_item_id',v_parent_id,
      'title',v_title,
      'description',coalesce(p_payload->>'description',''),
      'owner_id',v_owner,
      'status',private.project_item_task_status(
        coalesce(nullif(p_payload->>'status',''),'ثبت شده')
      ),
      'priority',private.project_item_task_priority(
        coalesce(nullif(p_payload->>'priority',''),'medium')
      ),
      'start_date',nullif(p_payload->>'planned_start','')::date,
      'due_date',nullif(p_payload->>'planned_end','')::date,
      'done_date',null,
      'progress',v_progress,
      'source','project'
    );
    v_request_id:=private.submit_project_activity_create_request(v_request_payload);

    return jsonb_build_object(
      'project_item_id',null,'request_id',v_request_id,
      'applied_directly',false,'request_context','project_activity'
    );
  end if;

  if not private.feature_can_access_for(v_actor,'projects','edit') then
    raise exception 'مجوز ویرایش فعالیت پروژه را ندارید.' using errcode='42501';
  end if;
  if not private.feature_can_access_for(v_actor,'kanban','edit') then
    raise exception 'مجوز ویرایش وظیفهٔ مرتبط را ندارید.' using errcode='42501';
  end if;

  select * into v_item
  from public.project_items item
  where item.id=p_item_id
    and item.project_id=v_project.id
    and item.item_type='activity'
  for update;
  if not found then
    raise exception 'فعالیت پروژه پیدا نشد.' using errcode='P0002';
  end if;
  if v_item.owner_id is distinct from v_project.owner_id then
    raise exception 'متولی فعالیت با متولی پروژه همگام نیست؛ انتقال یکپارچه لازم است.'
      using errcode='23514';
  end if;
  if v_parent_id is not null and exists(
    with recursive ancestors(id,parent_item_id) as (
      select parent.id,parent.parent_item_id
      from public.project_items parent where parent.id=v_parent_id
      union all
      select parent.id,parent.parent_item_id
      from public.project_items parent
      join ancestors child on child.parent_item_id=parent.id
    )
    select 1 from ancestors where id=v_item.id
  ) then
    raise exception 'ساختار شکست نمی‌تواند حلقوی باشد.' using errcode='23514';
  end if;
  if v_item.approval_state in ('pending','in_review','needs_revision')
     and exists(
       select 1 from public.change_requests request
       where request.id=v_item.approval_request_id
         and request.request_status in ('pending','in_review','needs_revision')
     ) then
    raise exception 'این فعالیت یک درخواست باز دارد؛ اصلاح یا بررسی را از کارتابل تأییدها انجام دهید.'
      using errcode='55000';
  end if;

  if v_direct then
    update public.project_items
    set parent_item_id=v_parent_id,
        title=v_title,
        description=p_payload->>'description',
        status=coalesce(nullif(p_payload->>'status',''),status),
        priority=coalesce(nullif(p_payload->>'priority',''),priority),
        planned_start=nullif(p_payload->>'planned_start','')::date,
        planned_end=nullif(p_payload->>'planned_end','')::date,
        progress=v_progress,
        approval_state='approved',
        updated_at=now()
    where id=v_item.id
    returning * into v_item;
    return jsonb_build_object(
      'project_item_id',v_item.id,'request_id',null,
      'applied_directly',true,'request_context','project_activity'
    );
  end if;

  if v_item.owner_id is distinct from v_actor then
    raise exception 'ویرایش این فعالیت در اختیار متولی یا بالادست او نیست.' using errcode='42501';
  end if;

  if v_item.task_id is null then
    raise exception 'فعالیت تأییدشده باید یک وظیفهٔ کانبان معتبر داشته باشد.' using errcode='23514';
  end if;

  v_item.parent_item_id:=v_parent_id;
  v_item.title:=v_title;
  v_item.description:=p_payload->>'description';
  v_item.status:=coalesce(nullif(p_payload->>'status',''),v_item.status);
  v_item.priority:=coalesce(nullif(p_payload->>'priority',''),v_item.priority);
  v_item.planned_start:=nullif(p_payload->>'planned_start','')::date;
  v_item.planned_end:=nullif(p_payload->>'planned_end','')::date;
  v_item.progress:=v_progress;
  v_request_payload:=private.project_activity_request_payload(
    v_item,'ویرایش فعالیت در پروژه'
  );
  v_request_id:=private.submit_project_activity_change_request(
    'update',v_item.id,v_request_payload,null
  );
  select request_status into v_request_status
  from public.change_requests where id=v_request_id;
  update public.project_items
  set approval_request_id=v_request_id,
      approval_state=coalesce(v_request_status,'pending'),
      updated_at=now()
  where id=v_item.id;

  return jsonb_build_object(
    'project_item_id',v_item.id,'request_id',v_request_id,
    'applied_directly',false,'request_context','project_activity'
  );
end;
$$;

create or replace function public.delete_project_activity(p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid:=auth.uid();
  v_item public.project_items%rowtype;
  v_direct boolean;
  v_request_id bigint;
  v_request_status text;
begin
  if v_actor is null then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  select item.* into v_item
  from public.project_items item
  where item.id=p_item_id
    and item.item_type='activity'
    and public.platform_can_access_project(item.project_id)
  for update;
  if not found then
    raise exception 'فعالیت پروژه پیدا نشد.' using errcode='P0002';
  end if;
  if not private.feature_can_access_for(v_actor,'projects','delete') then
    raise exception 'مجوز حذف فعالیت پروژه را ندارید.' using errcode='42501';
  end if;
  if not private.feature_can_access_for(v_actor,'kanban','delete') then
    raise exception 'مجوز حذف وظیفهٔ مرتبط را ندارید.' using errcode='42501';
  end if;
  if v_item.approval_state in ('pending','in_review','needs_revision')
     and exists(
       select 1 from public.change_requests request
       where request.id=v_item.approval_request_id
         and request.request_status in ('pending','in_review','needs_revision')
     ) then
    raise exception 'این فعالیت یک درخواست باز دارد و تا تعیین تکلیف قابل حذف نیست.'
      using errcode='55000';
  end if;

  v_direct:=private.organization_actor_can_direct_manage_user(v_actor,v_item.owner_id);
  if v_direct then
    delete from public.project_items where id=v_item.id;
    return jsonb_build_object(
      'project_item_id',v_item.id,'request_id',null,
      'applied_directly',true,'request_context','project_activity'
    );
  end if;
  if v_item.owner_id is distinct from v_actor then
    raise exception 'حذف این فعالیت در اختیار متولی یا بالادست او نیست.' using errcode='42501';
  end if;
  if v_item.task_id is null then
    raise exception 'درخواست تعریف فعالیت ابتدا باید تعیین تکلیف شود.' using errcode='55000';
  end if;

  v_request_id:=private.submit_project_activity_change_request(
    'delete',v_item.id,'{}'::jsonb,null
  );
  select request_status into v_request_status
  from public.change_requests where id=v_request_id;
  update public.project_items
  set approval_request_id=v_request_id,
      approval_state=coalesce(v_request_status,'pending'),
      updated_at=now()
  where id=v_item.id;

  return jsonb_build_object(
    'project_item_id',v_item.id,'request_id',v_request_id,
    'applied_directly',false,'request_context','project_activity'
  );
end;
$$;

-- Revision/amendment dialogs intentionally omit immutable project context.
-- Preserve that context and the originally authorized owner server-side.
create or replace function private.merge_project_request_context(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb:=coalesce(p_existing,'{}'::jsonb)||coalesce(p_incoming,'{}'::jsonb);
  v_key text;
  v_owner uuid;
begin
  if coalesce(p_existing->>'request_context','')<>'project_activity' then
    return p_incoming;
  end if;
  v_owner:=nullif(p_existing->>'owner_id','')::uuid;
  if p_incoming?'owner_id'
     and nullif(p_incoming->>'owner_id','')::uuid is distinct from v_owner then
    raise exception 'متولی درخواست فعالیت پروژه قابل تغییر نیست.' using errcode='42501';
  end if;
  foreach v_key in array array[
    'request_context','request_label','project_id','project_item_id',
    'item_type','parent_item_id','owner_id','source'
  ] loop
    if p_existing?v_key then
      v_result:=jsonb_set(v_result,array[v_key],p_existing->v_key,true);
    end if;
  end loop;
  -- Generic Kanban lifecycle requests intentionally have no caller-controlled
  -- WBS progress. Amendment must not be able to introduce it later; only the
  -- project-domain request that originally carried progress may preserve it.
  if p_existing?'progress' then
    v_result:=jsonb_set(v_result,'{progress}',p_existing->'progress',true);
  else
    v_result:=v_result-'progress';
  end if;
  return v_result;
end;
$$;

revoke all on function private.merge_project_request_context(jsonb,jsonb)
  from public, anon, authenticated;

create or replace function public.resubmit_change_request(
  p_request_id bigint,
  p_proposed_data jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.change_requests%rowtype;
  v_owner uuid;
  v_is_project_activity boolean;
begin
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then
    raise exception 'اطلاعات درخواست نامعتبر است.' using errcode='22023';
  end if;
  if auth.uid() is null then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;

  select * into v_request
  from public.change_requests
  where id=p_request_id
    and requested_by=auth.uid()
    and request_status='needs_revision'
  for update;
  if not found then
    raise exception 'درخواست قابل اصلاح پیدا نشد.' using errcode='42501';
  end if;

  v_is_project_activity:=coalesce(
    v_request.proposed_data->>'request_context'='project_activity',false
  );
  if not private.feature_can_access_for(
    auth.uid(),'kanban',case
      when v_request.request_type='create' then 'create'
      when v_request.request_type='delete' then 'delete'
      else 'edit' end
  ) or (
    v_is_project_activity and not private.feature_can_access_for(
      auth.uid(),'projects',case
        when v_request.request_type='create' then 'create'
        when v_request.request_type='delete' then 'delete'
        else 'edit' end
    )
  ) then
    raise exception 'مجوز ارسال مجدد درخواست را ندارید.' using errcode='42501';
  end if;
  if v_is_project_activity then
    p_proposed_data:=private.merge_project_request_context(
      v_request.proposed_data,p_proposed_data
    );
  elsif p_proposed_data ?| array[
    'request_context','request_label','project_id','project_item_id',
    'source','item_type','parent_item_id'
  ] then
    raise exception 'زمینهٔ پروژه فقط برای درخواست اصلی فعالیت پروژه مجاز است.'
      using errcode='42501';
  elsif v_request.request_type in ('create','update','status','priority','description','due_date') then
    v_owner:=nullif(p_proposed_data->>'owner_id','')::uuid;
    if v_owner is not null and v_owner is distinct from v_request.requested_by then
      raise exception 'درخواست شخصی فقط می‌تواند متولی ثبت‌کننده را داشته باشد.' using errcode='42501';
    end if;
    p_proposed_data:=jsonb_set(
      coalesce(p_proposed_data,'{}'::jsonb),
      '{owner_id}',to_jsonb(v_request.requested_by::text),true
    );
  end if;

  if v_request.organization_workflow_id is not null then
    update public.organization_workflows
    set status='cancelled',updated_at=now()
    where id=v_request.organization_workflow_id;
  end if;

  update public.change_requests
  set proposed_data=coalesce(p_proposed_data,'{}'::jsonb),
      request_status='pending',revision_count=revision_count+1,
      resubmitted_at=now(),reviewed_by=null,reviewed_at=null,
      manager_note=null,current_stage=1,completed_at=null,final_data=null,
      applied_task_id=null,organization_workflow_id=null
  where id=v_request.id;

  insert into public.change_request_events(
    request_id,actor_id,event_type,note,snapshot
  ) values(
    p_request_id,auth.uid(),'resubmitted',
    'درخواست پس از اصلاح دوباره ارسال شد',p_proposed_data
  );
  perform private.route_change_request(p_request_id);
end;
$$;

create or replace function public.amend_change_request(
  p_request_id bigint,
  p_proposed_data jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.change_requests%rowtype;
  v_owner uuid;
  v_is_project_activity boolean;
begin
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then
    raise exception 'اطلاعات درخواست نامعتبر است.' using errcode='22023';
  end if;
  if auth.uid() is null then
    raise exception 'نشست فعال لازم است.' using errcode='42501';
  end if;
  select * into v_request
  from public.change_requests
  where id=p_request_id
    and requested_by=auth.uid()
    and request_status in ('pending','in_review')
  for update;
  if not found then
    raise exception 'درخواست قابل ویرایش پیدا نشد.' using errcode='42501';
  end if;

  v_is_project_activity:=coalesce(
    v_request.proposed_data->>'request_context'='project_activity',false
  );
  if not private.feature_can_access_for(
    auth.uid(),'kanban',case
      when v_request.request_type='create' then 'create'
      when v_request.request_type='delete' then 'delete'
      else 'edit' end
  ) or (
    v_is_project_activity and not private.feature_can_access_for(
      auth.uid(),'projects',case
        when v_request.request_type='create' then 'create'
        when v_request.request_type='delete' then 'delete'
        else 'edit' end
    )
  ) then
    raise exception 'مجوز ویرایش درخواست را ندارید.' using errcode='42501';
  end if;
  if v_is_project_activity then
    p_proposed_data:=private.merge_project_request_context(
      v_request.proposed_data,p_proposed_data
    );
  elsif p_proposed_data ?| array[
    'request_context','request_label','project_id','project_item_id',
    'source','item_type','parent_item_id'
  ] then
    raise exception 'زمینهٔ پروژه فقط برای درخواست اصلی فعالیت پروژه مجاز است.'
      using errcode='42501';
  else
    v_owner:=nullif(p_proposed_data->>'owner_id','')::uuid;
    if v_owner is not null and v_owner is distinct from auth.uid() then
      raise exception 'درخواست شخصی فقط می‌تواند متولی خود کاربر را داشته باشد.' using errcode='42501';
    end if;
    if p_proposed_data?'owner_id' then
      p_proposed_data:=jsonb_set(
        p_proposed_data,'{owner_id}',to_jsonb(auth.uid()::text),true
      );
    end if;
  end if;

  if v_request.organization_workflow_id is not null then
    update public.organization_workflows
    set status='cancelled',updated_at=now()
    where id=v_request.organization_workflow_id;
  end if;
  update public.change_requests
  set proposed_data=coalesce(p_proposed_data,'{}'::jsonb),
      request_status='pending',revision_count=revision_count+1,
      resubmitted_at=now(),reviewed_by=null,reviewed_at=null,
      manager_note=null,current_stage=1,completed_at=null,final_data=null,
      applied_task_id=null,organization_workflow_id=null
  where id=v_request.id;
  insert into public.change_request_events(
    request_id,actor_id,event_type,note,snapshot
  ) values(
    p_request_id,auth.uid(),'amended',
    'ثبت‌کننده درخواست را ویرایش و دوباره ارسال کرد.',p_proposed_data
  );
  perform private.route_change_request(p_request_id);
end;
$$;

-- Approval assignment/result messages use the domain label carried by the
-- request instead of collapsing project activity creation into the generic
-- «تعریف وظیفه» wording.
create or replace function private.trusted_project_activity_request_label(
  p_request_id bigint
)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case request.request_type
    when 'create' then 'تعریف فعالیت در پروژه'
    when 'delete' then 'حذف فعالیت از پروژه'
    when 'complete' then 'تکمیل فعالیت پروژه'
    when 'status' then 'تغییر وضعیت فعالیت پروژه'
    when 'priority' then 'تغییر اولویت فعالیت پروژه'
    when 'description' then 'تغییر توضیحات فعالیت پروژه'
    when 'due_date' then 'تغییر تاریخ فعالیت پروژه'
    else 'ویرایش فعالیت در پروژه' end
  from public.change_requests request
  join public.projects project
    on project.id=nullif(request.proposed_data->>'project_id','')::bigint
   and project.owner_id=request.requested_by
  where request.id=p_request_id
    and request.proposed_data->>'request_context'='project_activity'
    and request.proposed_data->>'item_type'='activity'
    and request.proposed_data->>'source'='project'
    and request.proposed_data->>'owner_id'=request.requested_by::text;
$$;

revoke all on function private.trusted_project_activity_request_label(bigint)
  from public,anon,authenticated;

create or replace function private.create_portal_event(
  p_user uuid,
  p_title text,
  p_body text,
  p_type text,
  p_entity_type text,
  p_entity_id text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  mid bigint;
  v_sender uuid:=auth.uid();
  v_sender_name text;
  v_request_label text;
  v_activity_title text;
begin
  if p_user is null
     or not exists(select 1 from public.profiles where id=p_user and active) then
    return;
  end if;

  if p_entity_type='change_request' and coalesce(p_entity_id,'')~'^[0-9]+$' then
    select private.trusted_project_activity_request_label(request.id),
           coalesce(
             nullif(request.proposed_data->>'title',''),
             nullif(request.before_data->>'title','')
           )
      into v_request_label,v_activity_title
    from public.change_requests request
    where request.id=p_entity_id::bigint;
    if nullif(v_request_label,'') is not null and p_type='approval_request' then
      p_title:=v_request_label;
      p_body:='درخواست «'||v_request_label||'» برای «'
        ||coalesce(nullif(v_activity_title,''),'—')||'» در کارتابل شما قرار گرفت.';
    elsif nullif(v_request_label,'') is not null and p_type='request_revision' then
      p_title:=v_request_label||'؛ نیازمند اصلاح';
      p_body:='درخواست «'||v_request_label||'» برای «'
        ||coalesce(nullif(v_activity_title,''),'—')||'» نیازمند اصلاح است. '
        ||coalesce(p_body,'');
    end if;
  end if;

  select coalesce(nullif(display_name,''),nullif(full_name,''),email::text,'سامانه')
    into v_sender_name from public.profiles where id=v_sender;
  v_sender_name:=coalesce(v_sender_name,'سامانه');

  insert into public.portal_messages(
    sender_id,subject,body,importance,allow_reply,require_ack,template_key,
    sender_name_snapshot,entity_type,entity_id
  ) values(
    v_sender,left(coalesce(p_title,'پیام سامانه'),240),coalesce(p_body,''),
    'normal',false,false,coalesce(nullif(p_type,''),'system_event'),
    v_sender_name,nullif(p_entity_type,''),nullif(p_entity_id,'')
  ) returning id into mid;

  insert into public.portal_message_recipients(message_id,recipient_id)
  values(mid,p_user) on conflict do nothing;

  if p_entity_type='task' then
    update public.chat_messages
    set body=coalesce(p_body,'')
    where source_portal_message_id=mid
      and body like 'BAMCO_PORTAL_MESSAGE_V1:%';
    update public.portal_message_recipients
    set read_at=coalesce(read_at,now()),dismissed_at=coalesce(dismissed_at,now())
    where message_id=mid and recipient_id=p_user;
  end if;
end;
$$;

create or replace function private.emit_relationship_event(
  p_user uuid,
  p_action text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request_label text;
  v_activity_title text;
begin
  if p_user is null
     or not exists(select 1 from public.profiles profile where profile.id=p_user and profile.active) then
    return;
  end if;
  if p_action='approval_assigned'
     and p_entity_type='change_request'
     and coalesce(p_entity_id,'')~'^[0-9]+$' then
    select private.trusted_project_activity_request_label(request.id),
           coalesce(
             nullif(request.proposed_data->>'title',''),
             nullif(request.before_data->>'title','')
           )
      into v_request_label,v_activity_title
    from public.change_requests request
    where request.id=p_entity_id::bigint;
    if nullif(v_request_label,'') is not null then
      p_title:=v_request_label;
      p_body:='درخواست «'||v_request_label||'» برای «'
        ||coalesce(nullif(v_activity_title,''),'—')||'» در کارتابل شما قرار گرفت.';
      p_metadata:=coalesce(p_metadata,'{}'::jsonb)
        || jsonb_build_object('request_context','project_activity','request_label',v_request_label);
    end if;
  end if;
  insert into public.notifications(
    user_id,notification_type,title,body,entity_type,entity_id,action,metadata
  ) values(
    p_user,coalesce(nullif(p_action,''),'relationship_event'),
    left(coalesce(p_title,'اعلان سامانه'),240),coalesce(p_body,''),
    nullif(p_entity_type,''),nullif(p_entity_id,''),nullif(p_action,''),
    coalesce(p_metadata,'{}'::jsonb)
  );
end;
$$;

create or replace function private.notify_request_result()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_result text;
  v_type text;
  v_title text;
  v_body text;
begin
  if new.request_status is not distinct from old.request_status then return new; end if;
  if new.request_status not in ('approved','rejected','needs_revision','cancelled') then return new; end if;
  v_result:=case new.request_status
    when 'approved' then 'تأیید شد'
    when 'rejected' then 'رد شد'
    when 'needs_revision' then 'برای اصلاح برگشت داده شد'
    else 'لغو شد' end;
  v_type:=coalesce(private.trusted_project_activity_request_label(new.id),case new.request_type
    when 'create' then 'تعریف وظیفه'
    when 'delete' then 'حذف وظیفه'
    when 'complete' then 'اعلام انجام'
    when 'priority' then 'تغییر اولویت'
    when 'status' then 'تغییر وضعیت'
    when 'description' then 'تغییر توضیحات'
    when 'due_date' then 'تغییر تاریخ پایان'
    else 'ویرایش وظیفه' end);
  select title into v_title
  from public.tasks where id=coalesce(new.applied_task_id,new.task_id);
  v_title:=coalesce(
    nullif(v_title,''),
    nullif(new.proposed_data->>'title',''),
    nullif(new.before_data->>'title',''),
    '—'
  );
  v_body:='نتیجه درخواست شماره '||new.id||' ('||v_type||') برای «'
    ||v_title||'»: '||v_result||'.';
  if nullif(btrim(coalesce(new.manager_note,'')),'') is not null then
    v_body:=v_body||' توضیح مدیر: '||new.manager_note;
  end if;
  perform private.create_portal_event(
    new.requested_by,'نتیجه درخواست شما',v_body,
    'request_result','change_request',new.id::text
  );
  return new;
end;
$$;

revoke all on function private.create_portal_event(uuid,text,text,text,text,text)
  from public,anon,authenticated;
revoke all on function private.emit_relationship_event(uuid,text,text,text,text,text,jsonb)
  from public,anon,authenticated;
revoke all on function private.notify_request_result()
  from public,anon,authenticated;

revoke all on function public.save_project_activity(bigint,bigint,jsonb)
  from public, anon;
revoke all on function public.delete_project_activity(bigint)
  from public, anon;
revoke all on function public.resubmit_change_request(bigint,jsonb)
  from public, anon;
revoke all on function public.amend_change_request(bigint,jsonb)
  from public, anon;
grant execute on function public.save_project_activity(bigint,bigint,jsonb)
  to authenticated;
grant execute on function public.delete_project_activity(bigint)
  to authenticated;
grant execute on function public.resubmit_change_request(bigint,jsonb)
  to authenticated;
grant execute on function public.amend_change_request(bigint,jsonb)
  to authenticated;

notify pgrst,'reload schema';

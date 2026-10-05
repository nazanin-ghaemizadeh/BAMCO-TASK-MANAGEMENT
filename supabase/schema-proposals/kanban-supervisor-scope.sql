-- Scoped Kanban supervision only; no ordinary feature grants are changed.
-- Active primary organizational heads/managers gain view/edit/assignment of
-- existing nonarchived tasks owned by strict descendants, plus registered
-- ownerless intake created by themselves, active strict descendants, or the
-- active manager occupying a head position's immediate parent position.
-- Explicit user deny wins. No create/delete/export/approval/bypass grant.
-- PROPOSAL ONLY: this file has not been applied to production.
create or replace function private.kanban_supervision_enabled(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    p_actor is not null
    and exists(select 1 from public.profiles p where p.id=p_actor and p.active)
    and exists(select 1 from public.app_features f where f.feature_key='kanban' and f.active)
    and not exists(
      select 1 from public.feature_access_grants g
      where g.feature_key='kanban' and g.subject_kind='user' and g.user_id=p_actor
        and g.effect='deny' and g.revoked_at is null
        and g.resource_type is null
    )
    and exists(
      select 1 from public.organization_position_assignments a
      join public.organization_positions p on p.id=a.position_id and p.active
      join public.organization_roles r on r.id=p.role_id and r.active
      where a.user_id=p_actor and a.is_primary and a.valid_from<=current_date
        and (a.valid_to is null or a.valid_to>current_date)
        and r.role_key in ('head','manager')
    ),false);
$$;
revoke all on function private.kanban_supervision_enabled(uuid) from public,anon,authenticated;

-- Restrict each root to its own qualifying role, even if dated primary
-- assignments temporarily overlap (the legacy unique index covers open-ended
-- rows only). A second non-supervisory position cannot expand this capability.
create or replace function private.kanban_supervised_owner_ids(p_actor uuid)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
  with roots as (
    select p.id from public.organization_position_assignments a
    join public.organization_positions p on p.id=a.position_id and p.active
    join public.organization_roles r on r.id=p.role_id and r.active
    where a.user_id=p_actor and a.is_primary and a.valid_from<=current_date
      and (a.valid_to is null or a.valid_to>current_date)
      and r.role_key in ('head','manager')
      and private.kanban_supervision_enabled(p_actor)
  ), descendants as (
    select d.position_id from roots root
    cross join lateral private.organization_descendant_position_ids(root.id) d
    where d.position_id<>root.id
  )
  select distinct a.user_id from public.organization_position_assignments a
  join descendants d on d.position_id=a.position_id
  join public.profiles p on p.id=a.user_id and p.active
  where a.is_primary and a.valid_from<=current_date
    and (a.valid_to is null or a.valid_to>current_date) and a.user_id<>p_actor;
$$;
revoke all on function private.kanban_supervised_owner_ids(uuid) from public,anon,authenticated;

create or replace function private.kanban_supervisor_can_access_owner(p_actor uuid,p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    private.kanban_supervision_enabled(p_actor)
    and p_owner is not null and p_owner<>p_actor
    and p_owner in(select d.user_id from private.kanban_supervised_owner_ids(p_actor) d),false);
$$;
revoke all on function private.kanban_supervisor_can_access_owner(uuid,uuid) from public,anon,authenticated;

-- The intake creator set is authoritative and intentionally narrower than a
-- company-wide inbox. A head also receives registered intake from their
-- immediate parent manager, shared with sibling heads until first assignment.
-- This does not add the manager or sibling branches to assignable owners.
-- Ownerless/deleted-owner repairs are not intake.
create or replace function private.kanban_intake_creator_ids(p_actor uuid)
returns table(user_id uuid) language sql stable security definer set search_path='' as $$
  select p_actor where private.kanban_supervision_enabled(p_actor)
  union
  select d.user_id from private.kanban_supervised_owner_ids(p_actor) d
  union
  select manager_assignment.user_id
  from public.organization_position_assignments head_assignment
  join public.organization_positions head_position
    on head_position.id=head_assignment.position_id and head_position.active
  join public.organization_roles head_role
    on head_role.id=head_position.role_id and head_role.active
      and head_role.role_key='head'
  join public.organization_positions manager_position
    on manager_position.id=head_position.parent_position_id and manager_position.active
  join public.organization_roles manager_role
    on manager_role.id=manager_position.role_id and manager_role.active
      and manager_role.role_key='manager'
  join public.organization_position_assignments manager_assignment
    on manager_assignment.position_id=manager_position.id
      and manager_assignment.is_primary
      and manager_assignment.valid_from<=current_date
      and (manager_assignment.valid_to is null or manager_assignment.valid_to>current_date)
  join public.profiles manager_profile
    on manager_profile.id=manager_assignment.user_id and manager_profile.active
  where private.kanban_supervision_enabled(p_actor)
    and head_assignment.user_id=p_actor and head_assignment.is_primary
    and head_assignment.valid_from<=current_date
    and (head_assignment.valid_to is null or head_assignment.valid_to>current_date);
$$;
revoke all on function private.kanban_intake_creator_ids(uuid) from public,anon,authenticated;

create or replace function private.kanban_supervisor_can_access_task(p_actor uuid,p_task public.tasks)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    private.kanban_supervision_enabled(p_actor)
    and not p_task.archived
    and (
      private.kanban_supervisor_can_access_owner(p_actor,p_task.owner_id)
      or (
        p_task.owner_id is null
        and p_task.owner_deleted_at is null
        and p_task.former_owner_name is null
        and (private.task_status_option(p_task.status)).kind='registered'
        and p_task.created_by in (
          select creator.user_id from private.kanban_intake_creator_ids(p_actor) creator
        )
      )
    ),false);
$$;
revoke all on function private.kanban_supervisor_can_access_task(uuid,public.tasks) from public,anon,authenticated;

-- A browser cannot choose or impersonate the actor.
create or replace function public.kanban_supervisor_can_access_owner(p_owner uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.kanban_supervisor_can_access_owner(auth.uid(),p_owner);
$$;
revoke all on function public.kanban_supervisor_can_access_owner(uuid) from public,anon;
grant execute on function public.kanban_supervisor_can_access_owner(uuid) to authenticated;

-- All public helpers bind the actor to the current session; callers cannot
-- supply an actor UUID. The composite row is used directly by RLS, including
-- WITH CHECK after lifecycle triggers have normalized the destination row.
create or replace function public.kanban_supervisor_can_access_task(p_task public.tasks)
returns boolean language sql stable security definer set search_path='' as $$
  select private.kanban_supervisor_can_access_task(auth.uid(),p_task);
$$;
revoke all on function public.kanban_supervisor_can_access_task(public.tasks) from public,anon;
grant execute on function public.kanban_supervisor_can_access_task(public.tasks) to authenticated;

create policy tasks_supervisor_kanban_read on public.tasks for select to authenticated
using (public.kanban_supervisor_can_access_task(tasks));
create policy tasks_supervisor_kanban_edit on public.tasks for update to authenticated
using (public.kanban_supervisor_can_access_task(tasks))
with check (public.kanban_supervisor_can_access_task(tasks));

create or replace function public.effective_feature_access()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'schema','bamco.feature-access.v1',
    'kanban_supervision',private.kanban_supervision_enabled(auth.uid()),
    'kanban_assignment',private.kanban_supervision_enabled(auth.uid()),
    'kanban_intake_creator_ids',coalesce((select jsonb_agg(creator.user_id order by creator.user_id) from private.kanban_intake_creator_ids(auth.uid()) creator),'[]'::jsonb),
    'kanban_supervised_owner_ids',coalesce((select jsonb_agg(d.user_id) from private.kanban_supervised_owner_ids(auth.uid()) d),'[]'::jsonb),
    'grants',coalesce(jsonb_agg(
      jsonb_build_object(
        'feature_key',feature.feature_key,
        'route_key',feature.route_key,
        'can_view',private.feature_can_access_for(auth.uid(),feature.feature_key,'view'),
        'can_create',private.feature_can_access_for(auth.uid(),feature.feature_key,'create'),
        'can_edit',private.feature_can_access_for(auth.uid(),feature.feature_key,'edit'),
        'can_delete',private.feature_can_access_for(auth.uid(),feature.feature_key,'delete'),
        'can_export',private.feature_can_access_for(auth.uid(),feature.feature_key,'export'),
        'can_manage_access',private.feature_can_access_for(auth.uid(),feature.feature_key,'manage_access'),
        'can_bypass_approval',private.feature_can_access_for(auth.uid(),feature.feature_key,'bypass_approval')
      ) order by feature.sort_order,feature.feature_key
    ),'[]'::jsonb)
  )
  from public.app_features feature
  where feature.active and auth.uid() is not null;
$$;

create or replace function public.organization_scope_user_ids(p_actor uuid default auth.uid())
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then return; end if;
  if not (
    private.kanban_supervision_enabled(auth.uid())
    or public.can_access_feature('organization','view')
    or public.can_access_feature('kanban','view')
    or public.can_access_feature('archive','view')
    or public.can_access_feature('taskTimeline','view')
    or public.can_access_feature('messageCenter','view')
    or public.can_access_feature('sentMessages','view')
    or public.can_access_feature('responseTracking','view')
  ) then
    raise exception 'مجوز مشاهدهٔ دامنهٔ سازمانی ندارید.' using errcode='42501';
  end if;
  if p_actor is distinct from auth.uid() and not public.bamco_is_system_manager() then
    raise exception 'دامنهٔ سازمانی فقط برای کاربر جاری قابل محاسبه است.' using errcode='42501';
  end if;
  if private.kanban_supervision_enabled(auth.uid()) and not (
    public.can_access_feature('organization','view')
    or public.can_access_feature('kanban','view')
    or public.can_access_feature('archive','view')
    or public.can_access_feature('taskTimeline','view')
    or public.can_access_feature('messageCenter','view')
    or public.can_access_feature('sentMessages','view')
    or public.can_access_feature('responseTracking','view')
  ) then
    return query select d.user_id from private.kanban_supervised_owner_ids(auth.uid()) d union select auth.uid();
    return;
  end if;
  if private.is_system_manager(p_actor) then
    return query select profile.id from public.profiles profile where profile.active;
    return;
  end if;
  return query
    with roots as (
      select position_id from private.organization_active_primary_positions(p_actor)
    ), tree as (
      select branch.position_id
      from roots root
      cross join lateral private.organization_descendant_position_ids(root.position_id) branch
    )
    select distinct assignment.user_id
    from public.organization_position_assignments assignment
    join tree on tree.position_id=assignment.position_id
    join public.profiles profile on profile.id=assignment.user_id and profile.active
    where assignment.is_primary
      and assignment.valid_from<=current_date
      and (assignment.valid_to is null or assignment.valid_to>current_date)
    union
    select p_actor;
end;
$$;

create or replace function private.organization_scope_directory_rows()
returns table(
  position_id bigint,
  parent_position_id bigint,
  position_title text,
  role_id bigint,
  role_key text,
  role_title text,
  role_level_no integer,
  occupant_id uuid,
  occupant_display_name text,
  occupant_full_name text,
  occupant_email text,
  occupant_active boolean,
  occupant_avatar_path text,
  occupant_updated_at timestamptz,
  is_current_position boolean
)
language sql
stable
security definer
set search_path=''
as $$
  with recursive current_positions as (
    select position_id from private.organization_active_primary_positions(auth.uid())
  ), seeds as (
    select position.id,position.parent_position_id
    from public.organization_positions position
    where position.active
      and (
        private.kanban_supervision_enabled(auth.uid())
        or public.can_access_feature('organization','view')
        or public.can_access_feature('kanban','view')
        or public.can_access_feature('archive','view')
      )
      and (
        private.is_system_manager(auth.uid())
        or (position.id in (select position_id from current_positions) and (
          public.can_access_feature('organization','view')
          or public.can_access_feature('kanban','view')
          or public.can_access_feature('archive','view')
          or exists(select 1 from public.organization_roles r where r.id=position.role_id and r.active and r.role_key in ('head','manager'))
        ))
      )
  ), tree(position_id,parent_position_id) as (
    select id,parent_position_id from seeds
    union
    select child.id,child.parent_position_id
    from public.organization_positions child
    join tree parent on parent.position_id=child.parent_position_id
    where child.active
  )
  select
    position.id,
    position.parent_position_id,
    position.title,
    role.id,
    role.role_key,
    role.title,
    role.level_no,
    assignment.user_id,
    profile.display_name,
    profile.full_name,
    profile.email::text,
    profile.active,
    profile.avatar_path,
    profile.updated_at,
    position.id in (select position_id from current_positions)
  from tree
  join public.organization_positions position on position.id=tree.position_id
  join public.organization_roles role on role.id=position.role_id and role.active
  left join lateral (
    select active_assignment.user_id
    from public.organization_position_assignments active_assignment
    where active_assignment.position_id=position.id
      and active_assignment.is_primary
      and active_assignment.valid_from<=current_date
      and (active_assignment.valid_to is null or active_assignment.valid_to>current_date)
    order by active_assignment.id desc
    limit 1
  ) assignment on true
  left join public.profiles profile on profile.id=assignment.user_id
  order by role.level_no desc,position.title,position.id;
$$;

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
  -- A supervision-only writer has no task-resequencing capability. Do not
  -- let the inherited maintenance GUC skip its column/lifecycle checks or
  -- suppress row_version increments. Existing verified approval, revision,
  -- deletion and ordinary task-management paths remain unchanged.
  if tg_op='UPDATE'
     and v_actor is not null and auth.role()<>'service_role'
     and not v_verified_approval and not v_revision_note
     and not v_verified_person_delete
     and not public.organization_can_manage_task(old.id)
     and private.kanban_supervisor_can_access_task(v_actor,old)
     and coalesce(current_setting('bamco.resequencing',true),'')='1' then
    raise exception 'دسترسی نظارتی کانبان مجوز عبور از کنترل محتوا و چرخهٔ وظیفه را ندارد.'
      using errcode='42501';
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
    if not public.organization_can_manage_task(old.id)
       and private.kanban_supervisor_can_access_task(v_actor,old) then
      -- Allow content and bounded ownership changes, never creator/source or
      -- system fields. The unchanged project guard independently validates
      -- pending approvals, project permission, source and owner binding.
      if (to_jsonb(new)-array[
          'title','description','owner_id','status','priority','start_date','due_date',
          'reminder_days','manager_notes','last_update_note','change_reason'
        ]) is distinct from (to_jsonb(old)-array[
          'title','description','owner_id','status','priority','start_date','due_date',
          'reminder_days','manager_notes','last_update_note','change_reason'
        ]) then
        raise exception 'دسترسی نظارتی کانبان فقط برای ویرایش محتوا و تخصیص در محدودهٔ مجاز است؛ آرشیو یا اطلاعات سیستمی قابل تغییر نیست.'
          using errcode='42501';
      end if;
      if new.owner_id is null then
        -- Existing intake may remain unassigned while its content is edited.
        -- An owned task cannot be released back to intake by this capability.
        if old.owner_id is not null
           or (private.task_status_option(new.status)).kind is distinct from 'registered' then
          raise exception 'دسترسی نظارتی فقط برای وظیفهٔ ثبت‌شدهٔ بدون متولی یا متولی فعال در محدودهٔ مجاز است.'
            using errcode='42501';
        end if;
      elsif not private.kanban_supervisor_can_access_owner(v_actor,new.owner_id)
         or coalesce((private.task_status_option(new.status)).kind not in ('active','waiting'),true) then
        -- Registered status clears owner in the lifecycle trigger. Requiring
        -- active/waiting here prevents reporting a successful lost assignment.
        raise exception 'تخصیص نظارتی به زیردست فعال و وضعیت در حال انجام یا منتظر پاسخ نیاز دارد.'
          using errcode='42501';
      end if;
      return new;
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

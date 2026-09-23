-- A feature grant must take effect in the recipient's active session without
-- a transient revoke.  Keep one direct grant per user/feature and update it
-- in place so Supabase Realtime emits one deterministic UPDATE event.
create or replace function public.set_feature_access(
  p_feature_key text,
  p_grants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_grant jsonb;
  v_user uuid;
  v_effect text;
  v_grant_id bigint;
  v_changed integer:=0;
begin
  if not exists(select 1 from public.app_features where feature_key=p_feature_key and active) then
    raise exception 'قابلیت سامانه معتبر نیست.' using errcode='22023';
  end if;
  if v_actor is null or not (
    private.is_system_manager(v_actor)
    or private.feature_can_access_for(v_actor,'settings','manage_access')
    or private.feature_can_access_for(v_actor,p_feature_key,'manage_access')
  ) then
    raise exception 'دسترسی مدیریت دسترسی لازم است.' using errcode='42501';
  end if;
  if jsonb_typeof(p_grants) is distinct from 'array' then
    raise exception 'فهرست دسترسی نامعتبر است.' using errcode='22023';
  end if;

  for v_grant in select value from jsonb_array_elements(p_grants)
  loop
    begin
      v_user:=nullif(v_grant->>'user_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'شناسه کاربر نامعتبر است.' using errcode='22023';
    end;
    if v_user is null or not exists(select 1 from public.profiles where id=v_user and active) then
      raise exception 'کاربر فعال برای دسترسی پیدا نشد.' using errcode='22023';
    end if;
    if v_user=v_actor and private.is_system_manager(v_actor) then
      continue;
    end if;
    v_effect:=case lower(coalesce(v_grant->>'effect','allow')) when 'deny' then 'deny' else 'allow' end;

    -- Remove only duplicate historical rows, never the canonical row that a
    -- signed-in recipient is subscribed to through Realtime.
    select grant_row.id into v_grant_id
    from public.feature_access_grants grant_row
    where grant_row.feature_key=p_feature_key
      and grant_row.subject_kind='user'
      and grant_row.user_id=v_user
      and grant_row.resource_type is null
      and grant_row.resource_id is null
      and grant_row.revoked_at is null
    order by grant_row.id
    limit 1
    for update;

    if v_grant_id is not null then
      delete from public.feature_access_grants grant_row
      where grant_row.feature_key=p_feature_key
        and grant_row.subject_kind='user'
        and grant_row.user_id=v_user
        and grant_row.resource_type is null
        and grant_row.resource_id is null
        and grant_row.revoked_at is null
        and grant_row.id<>v_grant_id;

      update public.feature_access_grants
      set effect=v_effect,
          can_view=coalesce((v_grant->>'can_view')::boolean,false),
          can_create=coalesce((v_grant->>'can_create')::boolean,false),
          can_edit=coalesce((v_grant->>'can_edit')::boolean,false),
          can_delete=coalesce((v_grant->>'can_delete')::boolean,false),
          can_export=coalesce((v_grant->>'can_export')::boolean,false),
          can_manage_access=coalesce((v_grant->>'can_manage_access')::boolean,false),
          can_bypass_approval=coalesce((v_grant->>'can_bypass_approval')::boolean,false),
          granted_by=v_actor,
          granted_at=now(),
          metadata=jsonb_build_object('source','feature_access_editor')
      where id=v_grant_id;
    else
      insert into public.feature_access_grants(
        feature_key,subject_kind,user_id,effect,
        can_view,can_create,can_edit,can_delete,can_export,can_manage_access,can_bypass_approval,
        granted_by,metadata
      ) values(
        p_feature_key,'user',v_user,v_effect,
        coalesce((v_grant->>'can_view')::boolean,false),
        coalesce((v_grant->>'can_create')::boolean,false),
        coalesce((v_grant->>'can_edit')::boolean,false),
        coalesce((v_grant->>'can_delete')::boolean,false),
        coalesce((v_grant->>'can_export')::boolean,false),
        coalesce((v_grant->>'can_manage_access')::boolean,false),
        coalesce((v_grant->>'can_bypass_approval')::boolean,false),
        v_actor,jsonb_build_object('source','feature_access_editor')
      );
    end if;

    v_changed:=v_changed+1;
    insert into public.audit_trail(actor_id,action,target_type,target_id,new_data,metadata)
    values(
      v_actor,'feature_access_set','feature_access_grant',p_feature_key||':'||v_user::text,
      v_grant,jsonb_build_object('feature_key',p_feature_key,'effect',v_effect)
    );
  end loop;
  return jsonb_build_object('schema','bamco.feature-access.v1','feature_key',p_feature_key,'changed',v_changed);
end;
$$;

-- Timeline is a first-class tab.  Its feature grant is sufficient to read the
-- caller's reporting branch, while archive data remains archive-only.
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
    public.can_access_feature('organization','view')
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

create or replace function public.organization_can_view_task(p_task_id bigint)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and (
      public.can_access_feature('kanban','view')
      or public.can_access_feature('archive','view')
      or public.can_access_feature('taskTimeline','view')
    )
    and exists(select 1 from public.tasks task where task.id=p_task_id and (
      (task.owner_id is null and private.is_system_manager(auth.uid()))
      or (task.owner_id is not null and private.organization_actor_can_view_user(auth.uid(),coalesce(task.owner_id,task.created_by)))
    ));
$$;

drop policy if exists tasks_scope_read on public.tasks;
create policy tasks_scope_read
  on public.tasks for select to authenticated
  using (
    (
      (not archived and (
        public.can_access_feature('kanban','view')
        or public.can_access_feature('taskTimeline','view')
      ))
      or (archived and public.can_access_feature('archive','view'))
    )
    and public.organization_can_view_task(id)
  );

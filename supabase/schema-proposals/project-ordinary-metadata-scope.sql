-- LOCAL REVIEW PROPOSAL: not a deployed migration.
-- Requires the seven-key business-section capability proposal from PR135.
-- Project section CRUD is separate from owner/member/task/approval authority.
-- Do not add projects to the generic feature_grant_allows normalization list.
-- Existing project/task policies and protected workflow functions are unchanged.
begin;
do $$ begin
 if to_regprocedure('private.feature_uses_section_capabilities(text)') is null then
  raise exception 'Apply business_section_capabilities before project_ordinary_metadata_scope' using errcode='55000';
 end if;
 if private.feature_uses_section_capabilities('projects') then
  raise exception 'Projects must retain separate protected authority, outside the shared normalizer' using errcode='55000';
 end if;
end $$;
create or replace function private.project_ordinary_allowed(p_action text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_action in ('view','create','edit','delete','export')
   and private.feature_can_access_for(auth.uid(),'projects','view')
   and (private.is_system_manager(auth.uid()) or not exists(
     select 1 from public.feature_access_grants g
     where g.feature_key='projects' and g.subject_kind='user' and g.user_id=auth.uid()
       and g.revoked_at is null and g.resource_type is null and g.effect='deny'
       and private.feature_grant_allows(g,p_action)
   )),false);
$$;
revoke all on function private.project_ordinary_allowed(text) from public,anon;
grant execute on function private.project_ordinary_allowed(text) to authenticated;

-- UI capabilities are derived from the same legacy raw grants, relationship
-- helper and organizational authority used by the unchanged protected RPCs.
-- They are hints for this actor only; every mutation reauthorizes on the server.
create or replace function private.project_protected_context(p_project_id bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 with p as (select * from public.projects where id=p_project_id), authority as (
  select p.*,public.platform_can_access_project(p.id) legacy_scope,
   private.organization_actor_can_direct_manage_user(auth.uid(),p.owner_id) direct_owner,
   exists(select 1 from public.project_items i where i.project_id=p.id) has_items,
   exists(select 1 from public.change_requests r where r.proposed_data->>'request_context'='project_activity'
     and r.proposed_data->>'project_id'=p.id::text and r.request_status in ('pending','in_review','needs_revision')) has_open_activity
  from p
 ), capabilities as (
  select a.*,
   (legacy_scope and private.feature_can_access_for(auth.uid(),'projects','edit') and direct_owner and not has_items and not has_open_activity) owner_edit
  from authority a
 ) select jsonb_build_object(
  'can_delete',legacy_scope and private.feature_can_access_for(auth.uid(),'projects','delete'),
  'can_create_activity',legacy_scope and (owner_id=auth.uid() or direct_owner)
    and private.feature_can_access_for(auth.uid(),'projects','create') and private.feature_can_access_for(auth.uid(),'kanban','create'),
  'can_change_owner',owner_edit,
  'owner_lock_reason',case when has_items then 'items' when has_open_activity then 'open_request' when not owner_edit then 'authority' else null end,
  'owner_choice_ids',case when owner_edit then coalesce((select jsonb_agg(target.id order by target.id)
    from public.profiles target where target.active and private.organization_actor_can_direct_manage_user(auth.uid(),target.id)
      and (private.is_system_manager(auth.uid()) or target.id=auth.uid() or target.id in (
        select scoped.user_id from private.organization_strict_descendant_user_ids(auth.uid()) scoped
      ))),'[]'::jsonb) else '[]'::jsonb end
 ) from capabilities;
$$;
revoke all on function private.project_protected_context(bigint) from public,anon,authenticated;

create or replace function private.project_activity_protected_context(p_item_id bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'can_edit',i.item_type='activity' and public.platform_can_access_project(i.project_id)
   and private.feature_can_access_for(auth.uid(),'projects','edit') and private.feature_can_access_for(auth.uid(),'kanban','edit')
   and i.owner_id=p.owner_id and (private.organization_actor_can_direct_manage_user(auth.uid(),p.owner_id) or (p.owner_id=auth.uid() and i.task_id is not null))
   and not (i.approval_state in ('pending','in_review','needs_revision') and exists(
    select 1 from public.change_requests r where r.id=i.approval_request_id and r.request_status in ('pending','in_review','needs_revision'))),
  'can_delete',i.item_type='activity' and public.platform_can_access_project(i.project_id)
   and private.feature_can_access_for(auth.uid(),'projects','delete') and private.feature_can_access_for(auth.uid(),'kanban','delete')
   and (private.organization_actor_can_direct_manage_user(auth.uid(),i.owner_id) or (i.owner_id=auth.uid() and i.task_id is not null))
   and not (i.approval_state in ('pending','in_review','needs_revision') and exists(
    select 1 from public.change_requests r where r.id=i.approval_request_id and r.request_status in ('pending','in_review','needs_revision')))
 ) from public.project_items i join public.projects p on p.id=i.project_id where i.id=p_item_id;
$$;
revoke all on function private.project_activity_protected_context(bigint) from public,anon,authenticated;

create or replace function private.project_workspace()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.project_ordinary_allowed('view') then raise exception 'Project section access denied' using errcode='42501'; end if;
 return jsonb_build_object(
  'create_owner_ids',coalesce((select jsonb_agg(p.id order by p.id) from public.profiles p where p.active and (p.id=auth.uid() or (private.feature_can_access_for(auth.uid(),'projects','create') and p.id in (select scoped.user_id from private.organization_strict_descendant_user_ids(auth.uid()) scoped)))),'[]'::jsonb),
  'projects',coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at desc,p.id desc) from (
    select id,project_code,title,description,owner_id,manager_id,planned_start,planned_end,status,priority,
      progress,progress_override,created_at,updated_at,private.project_protected_context(id) protected from public.projects) p),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.project_id,i.id) from (
    select id,project_id,parent_item_id,task_id,item_type,title,description,owner_id,status,priority,
      planned_start,planned_end,progress,weight,approval_state,approval_request_id,private.project_activity_protected_context(id) protected from public.project_items) i),'[]'::jsonb),
  'dependencies',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from (
    select id,predecessor_item_id,successor_item_id,dependency_type,lag_days from public.project_dependencies) d),'[]'::jsonb));
end;
$$;

-- Only these user-editable descriptive fields are accepted. Identity, ownership,
-- membership, arbitrary metadata, overrides and task bindings are not writable.
create or replace function private.save_project_metadata(p_project_id bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.projects%rowtype;
begin
 if not private.project_ordinary_allowed(case when p_project_id is null then 'create' else 'edit' end) then
  raise exception 'Project metadata access denied' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_payload) k where k not in ('title','description','status','priority','planned_start','planned_end')
 ) then raise exception 'Unsupported project metadata field' using errcode='22023'; end if;
 if p_project_id is null then
  -- Self-responsibility is the existing default. Assignment to anybody else
  -- continues through the legacy project creation path and its raw grants.
  insert into public.projects(project_code,title,description,owner_id,manager_id,planned_start,planned_end,status,priority,created_by,updated_by)
  values('PRJ-'||gen_random_uuid()::text,trim(p_payload->>'title'),p_payload->>'description',auth.uid(),auth.uid(),
   nullif(p_payload->>'planned_start','')::date,nullif(p_payload->>'planned_end','')::date,
   coalesce(p_payload->>'status','registered'),coalesce(p_payload->>'priority','medium'),auth.uid(),auth.uid()) returning * into v_row;
 else
  select * into v_row from public.projects where id=p_project_id for update;
  if not found then raise exception 'Project not found' using errcode='P0002'; end if;
  -- A queued call must observe revocation or profile deactivation committed
  -- while it waited for the project row lock.
  if not private.project_ordinary_allowed('edit') then raise exception 'Project metadata access denied' using errcode='42501'; end if;
  update public.projects set
   title=case when p_payload?'title' then trim(p_payload->>'title') else title end,
   description=case when p_payload?'description' then p_payload->>'description' else description end,
   status=case when p_payload?'status' then p_payload->>'status' else status end,
   priority=case when p_payload?'priority' then p_payload->>'priority' else priority end,
   planned_start=case when p_payload?'planned_start' then nullif(p_payload->>'planned_start','')::date else planned_start end,
   planned_end=case when p_payload?'planned_end' then nullif(p_payload->>'planned_end','')::date else planned_end end,
   updated_by=auth.uid(),updated_at=now() where id=p_project_id returning * into v_row;
  if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 end if;
 if coalesce(trim(v_row.title),'')='' then raise exception 'Project title is required' using errcode='23514'; end if;
 return jsonb_build_object('id',v_row.id);
end;
$$;

create or replace function private.mutate_project_node(p_project_id bigint,p_item_id bigint,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_row public.project_items%rowtype; v_data public.project_items%rowtype;
begin
 if p_action not in ('create','edit','delete') or not private.project_ordinary_allowed(p_action) then
  raise exception 'Project node access denied' using errcode='42501'; end if;
 if (p_action='create') is distinct from (p_item_id is null) then raise exception 'Invalid node operation' using errcode='22023'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_payload) k where k not in ('item_type','title','description','status','priority','planned_start','planned_end','parent_item_id','progress','weight')
 ) then raise exception 'Unsupported project node field' using errcode='22023'; end if;
 select * into v_project from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if not private.project_ordinary_allowed(p_action) then raise exception 'Project node access denied' using errcode='42501'; end if;
 if p_item_id is not null then
  select * into v_row from public.project_items where id=p_item_id and project_id=p_project_id for update;
  if not found then raise exception 'Project node not found' using errcode='P0002'; end if;
  if v_row.item_type not in ('phase','milestone') or v_row.task_id is not null or v_row.approval_state<>'approved' then
   raise exception 'Task-linked activity requires the existing workflow' using errcode='42501'; end if;
  if p_payload?'item_type' and p_payload->>'item_type' is distinct from v_row.item_type then
   raise exception 'Project node type is immutable' using errcode='23514'; end if;
 end if;
 if not private.project_ordinary_allowed(p_action) then raise exception 'Project node access denied' using errcode='42501'; end if;
 if p_action='delete' then
  if exists(with recursive subtree as (
    select i.id,i.item_type,i.task_id from public.project_items i where i.id=p_item_id
    union select i.id,i.item_type,i.task_id from public.project_items i join subtree s on i.parent_item_id=s.id
   ) select 1 from subtree where item_type not in ('phase','milestone') or task_id is not null) then
   raise exception 'Task-linked descendants require the existing workflow' using errcode='42501'; end if;
  -- Existing delete triggers additionally protect all open activity requests.
  delete from public.project_items where id=p_item_id and project_id=p_project_id returning * into v_row;
  if not found then raise exception 'Project node not found' using errcode='P0002'; end if;
 else
  if p_action='create' then
   v_row.project_id:=p_project_id; v_row.owner_id:=v_project.owner_id; v_row.created_by:=auth.uid();
   v_row.item_type:=p_payload->>'item_type'; v_row.progress:=0; v_row.weight:=1;
   v_row.status:='registered'; v_row.priority:='medium';
  end if;
  v_data:=jsonb_populate_record(v_row,p_payload);
  if v_data.item_type not in ('phase','milestone') or coalesce(trim(v_data.title),'')='' then
   raise exception 'Invalid ordinary project node' using errcode='23514'; end if;
  -- Phases retain derived progress, never turn a metadata edit into a rollup override.
  if v_data.item_type='phase' then v_data.progress:=coalesce(v_row.progress,0); end if;
  if v_data.item_type='milestone' and (v_data.planned_start is null or v_data.planned_end is distinct from v_data.planned_start) then
   raise exception 'Milestone needs one date' using errcode='23514'; end if;
  if p_action='create' then
   insert into public.project_items(project_id,item_type,title,description,owner_id,parent_item_id,status,priority,planned_start,planned_end,progress,weight,created_by)
   values(p_project_id,v_data.item_type,trim(v_data.title),v_data.description,v_project.owner_id,v_data.parent_item_id,v_data.status,v_data.priority,
    v_data.planned_start,v_data.planned_end,v_data.progress,v_data.weight,auth.uid()) returning * into v_row;
  else
   update public.project_items set title=trim(v_data.title),description=v_data.description,parent_item_id=v_data.parent_item_id,
    status=v_data.status,priority=v_data.priority,planned_start=v_data.planned_start,planned_end=v_data.planned_end,
    progress=v_data.progress,weight=v_data.weight,updated_at=now()
   where id=p_item_id and project_id=p_project_id returning * into v_row;
   if not found then raise exception 'Project node not found' using errcode='P0002'; end if;
  end if;
 end if;
 return jsonb_build_object('id',v_row.id);
end;
$$;

create or replace function private.mutate_project_dependency(p_project_id bigint,p_dependency_id bigint,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.project_dependencies%rowtype; v_data public.project_dependencies%rowtype;
begin
 if p_action not in ('create','edit','delete') or not private.project_ordinary_allowed(p_action) then
  raise exception 'Project dependency access denied' using errcode='42501'; end if;
 if (p_action='create') is distinct from (p_dependency_id is null) then raise exception 'Invalid dependency operation' using errcode='22023'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or exists(
  select 1 from jsonb_object_keys(p_payload) k where k not in ('predecessor_item_id','successor_item_id','dependency_type','lag_days')
 ) then raise exception 'Unsupported project dependency field' using errcode='22023'; end if;
 -- The shared project row lock serializes graph mutations with WBS edits.
 perform 1 from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='P0002'; end if;
 if not private.project_ordinary_allowed(p_action) then raise exception 'Project dependency access denied' using errcode='42501'; end if;
 if p_dependency_id is not null then
  select d.* into v_row from public.project_dependencies d
  join public.project_items p on p.id=d.predecessor_item_id
  join public.project_items s on s.id=d.successor_item_id
  where d.id=p_dependency_id and p.project_id=p_project_id and s.project_id=p_project_id for update of d;
  if not found then raise exception 'Dependency not found in project' using errcode='P0002'; end if;
 else v_row.dependency_type:='FS'; v_row.lag_days:=0; end if;
 if not private.project_ordinary_allowed(p_action) then raise exception 'Project dependency access denied' using errcode='42501'; end if;
 if p_action='delete' then
  delete from public.project_dependencies where id=p_dependency_id returning * into v_row;
  if not found then raise exception 'Dependency not found' using errcode='P0002'; end if;
 else
  v_data:=jsonb_populate_record(v_row,p_payload);
  if not exists(select 1 from public.project_items p join public.project_items s on s.id=v_data.successor_item_id
    where p.id=v_data.predecessor_item_id and p.project_id=p_project_id and s.project_id=p_project_id) then
   raise exception 'Dependency endpoints must belong to this project' using errcode='23514'; end if;
  if p_action='create' then
   insert into public.project_dependencies(predecessor_item_id,successor_item_id,dependency_type,lag_days,created_by)
   values(v_data.predecessor_item_id,v_data.successor_item_id,v_data.dependency_type,v_data.lag_days,auth.uid()) returning * into v_row;
  else
   update public.project_dependencies set predecessor_item_id=v_data.predecessor_item_id,successor_item_id=v_data.successor_item_id,
    dependency_type=v_data.dependency_type,lag_days=v_data.lag_days where id=p_dependency_id returning * into v_row;
   if not found then raise exception 'Dependency not found' using errcode='P0002'; end if;
  end if;
 end if;
 return jsonb_build_object('id',v_row.id);
end;
$$;

create or replace function public.list_project_workspace() returns jsonb language sql security invoker set search_path='' as $$ select private.project_workspace(); $$;
create or replace function public.save_project_metadata(p_project_id bigint,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_project_metadata(p_project_id,p_payload); $$;
create or replace function public.mutate_project_node(p_project_id bigint,p_item_id bigint,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_project_node(p_project_id,p_item_id,p_action,p_payload); $$;
create or replace function public.mutate_project_dependency(p_project_id bigint,p_dependency_id bigint,p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_project_dependency(p_project_id,p_dependency_id,p_action,p_payload); $$;
revoke all on function private.project_workspace(),private.save_project_metadata(bigint,jsonb),private.mutate_project_node(bigint,bigint,text,jsonb),private.mutate_project_dependency(bigint,bigint,text,jsonb),public.list_project_workspace(),public.save_project_metadata(bigint,jsonb),public.mutate_project_node(bigint,bigint,text,jsonb),public.mutate_project_dependency(bigint,bigint,text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.project_workspace(),private.save_project_metadata(bigint,jsonb),private.mutate_project_node(bigint,bigint,text,jsonb),private.mutate_project_dependency(bigint,bigint,text,jsonb),public.list_project_workspace(),public.save_project_metadata(bigint,jsonb),public.mutate_project_node(bigint,bigint,text,jsonb),public.mutate_project_dependency(bigint,bigint,text,jsonb) to authenticated;

-- Validate graph structure on legacy direct writes as well as the metadata RPC.
-- A project lock prevents concurrent reciprocal edges from passing separately.
create or replace function private.prevent_project_dependency_cycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_project bigint; v_old_project bigint;
begin
 select p.project_id into v_project from public.project_items p
 join public.project_items s on s.id=new.successor_item_id and s.project_id=p.project_id
 where p.id=new.predecessor_item_id;
 if not found then raise exception 'Dependency endpoints must share a project' using errcode='23514'; end if;
 if tg_op='UPDATE' then
  select project_id into v_old_project from public.project_items where id=old.predecessor_item_id;
  if v_project is distinct from v_old_project or new.id is distinct from old.id or new.created_by is distinct from old.created_by then
   raise exception 'Dependency identity is immutable' using errcode='23514'; end if;
 end if;
 perform 1 from public.projects where id=v_project for update;
 if exists(with recursive walk(node) as (
  select new.successor_item_id
  union select d.successor_item_id from public.project_dependencies d join walk w on w.node=d.predecessor_item_id
  where d.id is distinct from new.id
 ) select 1 from walk where node=new.predecessor_item_id) then
  raise exception 'Circular dependency is not allowed' using errcode='23514'; end if;
 return new;
end;
$$;
revoke all on function private.prevent_project_dependency_cycle() from public,anon,authenticated;

-- Preserve protected grants on future section checkbox changes.
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
  v_section_checked boolean;
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

    -- The checkbox represents the whole ordinary business section. Preserve
    -- independent management/bypass bits and all non-business semantics.
    -- Normalize only this explicitly requested future write; no backfill.
    if v_effect='allow'
       and private.feature_uses_section_capabilities(p_feature_key) then
      v_section_checked:=coalesce((v_grant->>'can_view')::boolean,false);
      v_grant:=v_grant || jsonb_build_object(
        'can_view',v_section_checked,'can_create',v_section_checked,
        'can_edit',v_section_checked,'can_delete',v_section_checked,
        'can_export',v_section_checked
      );
    end if;

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

    -- A section checkbox never assigns project responsibility, membership or
    -- task/approval authority. Preserve existing raw bits; a new section-only
    -- recipient starts with none. Role-derived authority remains unchanged.
    -- An unmarked legacy denial contains deny flags, never preserved rights.
    if p_feature_key='projects' then
      v_grant:=v_grant||coalesce((select jsonb_build_object(
        'can_create',g.can_create,'can_edit',g.can_edit,'can_delete',g.can_delete,
        'can_export',g.can_export,'can_manage_access',g.can_manage_access,
        'can_bypass_approval',g.can_bypass_approval
      ) from public.feature_access_grants g where g.id=v_grant_id
        and (g.effect='allow' or g.metadata->>'project_section_preserves_authority'='true')),
      '{"can_create":false,"can_edit":false,"can_delete":false,"can_export":false,"can_manage_access":false,"can_bypass_approval":false}'::jsonb);
    end if;

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
          metadata=jsonb_build_object('source','feature_access_editor')||case when p_feature_key='projects' then '{"project_section_preserves_authority":true}'::jsonb else '{}'::jsonb end
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
        v_actor,jsonb_build_object('source','feature_access_editor')||case when p_feature_key='projects' then '{"project_section_preserves_authority":true}'::jsonb else '{}'::jsonb end
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

revoke all on function public.set_feature_access(text,jsonb) from public,anon;
grant execute on function public.set_feature_access(text,jsonb) to authenticated;
commit;

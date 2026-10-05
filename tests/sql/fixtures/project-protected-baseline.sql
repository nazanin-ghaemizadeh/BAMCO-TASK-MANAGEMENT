-- Read-only schema capture; no live identities or records. Supporting external
-- organization/approval semantics are explicitly stubbed by the isolated runner.
CREATE OR REPLACE FUNCTION public.delete_project_activity(p_item_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.enforce_project_item_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.enforce_project_owner_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.feature_can_access_for(p_actor uuid, p_feature_key text, p_action text DEFAULT 'view'::text, p_resource_type text DEFAULT NULL::text, p_resource_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with active_feature as (
    select 1 from public.app_features feature
    where feature.feature_key=p_feature_key and feature.active
  ), matching_grants as (
    select grant_row.*
    from public.feature_access_grants grant_row
    where grant_row.feature_key=p_feature_key
      and grant_row.revoked_at is null
      and (
        grant_row.resource_type is null
        or (
          grant_row.resource_type is not distinct from p_resource_type
          and grant_row.resource_id is not distinct from p_resource_id
        )
      )
  ), direct_deny as (
    select 1
    from matching_grants grant_row
    where grant_row.subject_kind='user'
      and grant_row.user_id=p_actor
      and grant_row.effect='deny'
  ), direct_allow as (
    select 1
    from matching_grants grant_row
    where grant_row.subject_kind='user'
      and grant_row.user_id=p_actor
      and grant_row.effect='allow'
      and private.feature_grant_allows(grant_row,p_action)
  ), role_allow as (
    select 1
    from matching_grants grant_row
    join public.organization_position_assignments assignment
      on assignment.user_id=p_actor
     and assignment.is_primary
     and assignment.valid_from<=current_date
     and (assignment.valid_to is null or assignment.valid_to>current_date)
    join public.organization_positions position
      on position.id=assignment.position_id and position.active
    where grant_row.subject_kind='organization_role'
      and grant_row.role_id=position.role_id
      and grant_row.effect='allow'
      and private.feature_grant_allows(grant_row,p_action)
  )
  select coalesce(
    p_actor is not null
    and exists(select 1 from active_feature)
    and exists(select 1 from public.profiles profile where profile.id=p_actor and profile.active)
    and (
      private.is_system_manager(p_actor)
      or (
        not exists(select 1 from direct_deny)
        and (exists(select 1 from direct_allow) or exists(select 1 from role_allow))
      )
    ),false);
$function$;

CREATE OR REPLACE FUNCTION private.guard_project_item_open_request_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if private.project_delete_approval_active(old.project_id) then return old; end if;
  perform 1 from public.projects project where project.id=old.project_id for update;
  if exists(
    with recursive subtree(id,item_type) as (
      select old.id,old.item_type
      union all select child.id,child.item_type from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree where id<>old.id and item_type='activity'
  ) then
    raise exception 'ابتدا فعالیت‌های زیرمجموعه را جداگانه حذف کنید.' using errcode='55000';
  end if;
  if exists(
    with recursive subtree(id) as (
      select old.id union all select child.id from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree join public.change_requests request
      on request.proposed_data->>'parent_item_id'=subtree.id::text
    where request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'project_id'=old.project_id::text
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'این گره، بالادست یک درخواست فعالیت باز است.' using errcode='55000';
  end if;
  if exists(
    with recursive subtree(id) as (
      select old.id union all select child.id from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree join public.project_items item on item.id=subtree.id
      join public.change_requests request on request.id=item.approval_request_id
    where request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'ابتدا درخواست باز فعالیت‌های زیرمجموعه را تعیین تکلیف کنید.' using errcode='55000';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_project_open_request_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.project_delete_approval_active(old.id) then
    raise exception 'حذف پروژه باید برای تأیید بالادست ارسال شود.' using errcode='42501';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.platform_can_access_project(p_project_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.save_project_activity(p_item_id bigint, p_project_id bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;


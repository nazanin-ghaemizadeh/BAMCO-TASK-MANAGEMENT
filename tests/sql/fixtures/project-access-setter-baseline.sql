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

-- Save a position and its primary occupant as one database transaction.
-- The client sends only the four organizational fields; codes, integrity
-- checks and assignment hand-off remain canonical on the server.

create or replace function public.save_organization_position(
  p_title text,
  p_role_id bigint,
  p_parent_position_id bigint,
  p_user_id uuid,
  p_position_id bigint
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_position public.organization_positions%rowtype;
  v_current_user uuid;
  v_assignment_id bigint;
begin
  if v_actor is null or not private.platform_can_manage_org(v_actor) then
    raise exception 'دسترسی مدیریت ساختار سازمانی لازم است.' using errcode='42501';
  end if;

  -- Hierarchy and assignment changes are rare. Serializing them prevents two
  -- simultaneous saves from producing competing primary assignments or cycles.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bamco.organization_structure_write', 0)
  );

  p_title := nullif(pg_catalog.btrim(p_title), '');
  if p_title is null then
    raise exception 'عنوان سمت الزامی است.' using errcode='22023';
  end if;

  if p_role_id is null or not exists (
    select 1
    from public.organization_roles role_row
    where role_row.id=p_role_id and role_row.active
  ) then
    raise exception 'نقش سازمانی معتبر نیست.' using errcode='22023';
  end if;

  if p_position_id is not null and p_parent_position_id=p_position_id then
    raise exception 'یک جایگاه نمی‌تواند بالادست خودش باشد.' using errcode='23514';
  end if;

  if p_parent_position_id is not null and not exists (
    select 1
    from public.organization_positions parent_position
    where parent_position.id=p_parent_position_id and parent_position.active
  ) then
    raise exception 'بالادست سازمانی انتخاب‌شده معتبر نیست.' using errcode='22023';
  end if;

  if p_user_id is not null and not exists (
    select 1
    from public.profiles person
    where person.id=p_user_id and person.active
  ) then
    raise exception 'فرد شاغل انتخاب‌شده معتبر نیست.' using errcode='22023';
  end if;

  if p_position_id is null then
    insert into public.organization_positions(
      title, role_id, parent_position_id, code, created_by
    )
    values (
      p_title,
      p_role_id,
      p_parent_position_id,
      'ORG-' || pg_catalog.upper(
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
      ),
      v_actor
    )
    returning * into v_position;
  else
    update public.organization_positions
    set
      title=p_title,
      role_id=p_role_id,
      parent_position_id=p_parent_position_id,
      updated_at=pg_catalog.now()
    where id=p_position_id and active
    returning * into v_position;

    if not found then
      raise exception 'جایگاه سازمانی موردنظر یافت نشد.' using errcode='P0002';
    end if;
  end if;

  select assignment.user_id
  into v_current_user
  from public.organization_position_assignments assignment
  where assignment.position_id=v_position.id
    and assignment.is_primary
    and assignment.valid_to is null;

  if v_current_user is distinct from p_user_id then
    if p_user_id is not null then
      update public.organization_position_assignments
      set is_primary=false, valid_to=current_date
      where user_id=p_user_id
        and position_id<>v_position.id
        and is_primary
        and valid_to is null;
    end if;

    update public.organization_position_assignments
    set is_primary=false, valid_to=current_date
    where position_id=v_position.id
      and is_primary
      and valid_to is null;

    if p_user_id is not null then
      insert into public.organization_position_assignments(
        position_id, user_id, assigned_by, is_primary, valid_from
      )
      values (v_position.id, p_user_id, v_actor, true, current_date)
      returning id into v_assignment_id;
    end if;
  end if;

  if v_assignment_id is null then
    select assignment.id
    into v_assignment_id
    from public.organization_position_assignments assignment
    where assignment.position_id=v_position.id
      and assignment.is_primary
      and assignment.valid_to is null;
  end if;

  return jsonb_build_object(
    'position_id', v_position.id,
    'assignment_id', v_assignment_id,
    'title', v_position.title
  );
end;
$$;

revoke all on function public.save_organization_position(text, bigint, bigint, uuid, bigint) from public, anon;
grant execute on function public.save_organization_position(text, bigint, bigint, uuid, bigint) to authenticated;

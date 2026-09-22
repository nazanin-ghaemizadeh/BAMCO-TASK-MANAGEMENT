-- Feed the organization chart from the same hierarchy-limited directory used
-- for task supervision, while carrying only the avatar metadata needed by the
-- authenticated avatar reader.  The image bytes remain in private Storage.

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
set search_path = ''
as $$
  with recursive
  current_positions as (
    select assignment.position_id
    from public.organization_position_assignments assignment
    where assignment.user_id = auth.uid()
      and assignment.is_primary
      and assignment.valid_from <= current_date
      and (assignment.valid_to is null or assignment.valid_to >= current_date)
  ),
  seeds as (
    select position.id, position.parent_position_id
    from public.organization_positions position
    where position.active
      and (
        private.is_manager()
        or position.id in (select current_positions.position_id from current_positions)
      )
  ),
  tree(position_id, parent_position_id) as (
    select seed.id, seed.parent_position_id
    from seeds seed
    union
    select child.id, child.parent_position_id
    from public.organization_positions child
    join tree parent on parent.position_id = child.parent_position_id
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
    profile.email,
    profile.active,
    profile.avatar_path,
    profile.updated_at,
    position.id in (select current_positions.position_id from current_positions)
  from tree
  join public.organization_positions position on position.id = tree.position_id
  join public.organization_roles role on role.id = position.role_id and role.active
  left join lateral (
    select active_assignment.user_id
    from public.organization_position_assignments active_assignment
    where active_assignment.position_id = position.id
      and active_assignment.is_primary
      and active_assignment.valid_from <= current_date
      and (active_assignment.valid_to is null or active_assignment.valid_to >= current_date)
    order by active_assignment.id desc
    limit 1
  ) assignment on true
  left join public.profiles profile on profile.id = assignment.user_id
  order by role.level_no desc, position.title, position.id;
$$;

-- Keep the pre-existing function's signature stable because RLS policies call
-- it.  The new public endpoint below adds the avatar metadata for the chart.
create or replace function public.organization_scope_directory()
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
  is_current_position boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    directory.position_id,
    directory.parent_position_id,
    directory.position_title,
    directory.role_id,
    directory.role_key,
    directory.role_title,
    directory.role_level_no,
    directory.occupant_id,
    directory.occupant_display_name,
    directory.occupant_full_name,
    directory.occupant_email,
    directory.occupant_active,
    directory.is_current_position
  from private.organization_scope_directory_rows() directory;
$$;

create or replace function public.organization_scope_directory_with_avatars()
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
set search_path = ''
as $$
  select *
  from private.organization_scope_directory_rows();
$$;

revoke all on function private.organization_scope_directory_rows() from public, anon, authenticated;
revoke all on function public.organization_scope_directory() from public, anon;
revoke all on function public.organization_scope_directory_with_avatars() from public, anon;
grant execute on function public.organization_scope_directory() to authenticated;
grant execute on function public.organization_scope_directory_with_avatars() to authenticated;

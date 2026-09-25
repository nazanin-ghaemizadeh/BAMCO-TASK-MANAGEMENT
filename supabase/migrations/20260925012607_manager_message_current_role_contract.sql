-- Organization assignment end dates are exclusive across the platform.
create or replace function private.message_recipient_receives_registered(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    private.is_system_manager(p_user)
    or exists(
      select 1
      from public.organization_position_assignments assignment
      join public.organization_positions position
        on position.id=assignment.position_id and position.active
      join public.organization_roles role_row
        on role_row.id=position.role_id and role_row.active
      where assignment.user_id=p_user
        and assignment.is_primary
        and assignment.valid_from<=current_date
        and (assignment.valid_to is null or assignment.valid_to>current_date)
        and role_row.role_key='manager'
    ),
    false
  );
$$;

revoke all on function private.message_recipient_receives_registered(uuid) from public,anon,authenticated;

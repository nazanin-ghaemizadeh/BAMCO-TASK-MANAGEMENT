-- Direct user denies are explicit feature-wide overrides.  A deny row stores
-- all capabilities as false, so testing the capability value here would make
-- the deny invisible and allow an inherited/baseline grant to win.
create or replace function private.feature_can_access_for(
  p_actor uuid,
  p_feature_key text,
  p_action text default 'view',
  p_resource_type text default null,
  p_resource_id text default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
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
$$;

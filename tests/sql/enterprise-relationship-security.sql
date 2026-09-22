-- SQL-level security contract for the enterprise relationship consolidation.
-- It runs entirely inside a transaction: the direct deny and the profile
-- revision are intentionally rolled back after proving RLS/RPC behaviour.
begin;

do $$
declare
  v_actor uuid;
  v_feature text := 'qaEnterpriseSecurityContract';
  v_before timestamptz;
  v_after timestamptz;
begin
  if not exists(
    select 1 from public.app_features
    where feature_key in ('kanban','archive','approvals','messageCenter','letters','vehiclePermanent','pettyCash')
      and active
  ) then
    raise exception 'canonical feature registry is incomplete';
  end if;

  if exists(
    select 1
    from auth.users account
    join public.profiles profile on profile.id=account.id
    where profile.active
      and account.email is distinct from lower(profile.login_name)||'@no-email.invalid'
  ) then
    raise exception 'Auth credential identity is coupled to a corporate profile email';
  end if;

  select id into v_actor
  from public.profiles
  where active and role is distinct from 'manager'
  order by id
  limit 1;
  if v_actor is null then
    raise exception 'an active non-system-manager fixture is required';
  end if;

  -- An explicit, temporary deny must dominate baseline/role access and be
  -- visible to the auth-bound authorization RPC, not only to navigation.
  insert into public.app_features(feature_key,route_key,title,category,sort_order,active)
  values (v_feature, null, 'قرارداد آزمون امنیت', 'qa', 999999, true)
  on conflict(feature_key) do update set active=true;

  insert into public.feature_access_grants(
    feature_key,subject_kind,user_id,effect,can_view,metadata
  ) values (
    v_feature,'user',v_actor,'deny',true,
    jsonb_build_object('qa','enterprise-relationship-security')
  );

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub',v_actor,'role','authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  if public.can_access_feature(v_feature,'view') then
    raise exception 'explicit feature deny did not block the server authorization RPC';
  end if;
  if (public.effective_feature_access() -> 'grants') @> jsonb_build_array(
    jsonb_build_object('feature_key',v_feature,'can_view',true)
  ) then
    raise exception 'effective feature payload retained a denied view grant';
  end if;

  -- The current profile row is the only profile presentation source.  The
  -- controlled self RPC changes its revision without touching Auth identity.
  select updated_at into v_before from public.profiles where id=v_actor;
  perform public.update_my_profile('__BAMCO_QA_PROFILE__', null, null);
  select updated_at into v_after from public.profiles where id=v_actor;
  if v_after is null or v_after < v_before then
    raise exception 'canonical self profile update did not advance profile revision';
  end if;

  execute 'reset role';
end;
$$;

rollback;

select 'PASS: canonical feature deny, auth identity separation and profile revision contract; transaction rolled back' as result;

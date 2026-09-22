-- Generic feature-access management RPC contract.  It runs only with
-- transaction-local JWT claims and rolls every grant/audit change back.
begin;

do $$
declare
  v_actor uuid;
  v_target uuid;
  v_snapshot jsonb;
  v_result jsonb;
begin
  select profile.id into v_actor
  from public.profiles profile
  where profile.active and private.is_system_manager(profile.id)
  order by profile.id
  limit 1;
  select profile.id into v_target
  from public.profiles profile
  where profile.active and profile.id is distinct from v_actor
  order by profile.id
  limit 1;
  if v_actor is null or v_target is null then
    raise exception 'feature-access fixtures are required';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub',v_actor,'role','authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  select public.feature_access_manage_snapshot('messageCenter') into v_snapshot;
  if v_snapshot->>'schema' is distinct from 'bamco.feature-access.v1' then
    raise exception 'feature-access snapshot contract failed';
  end if;
  select public.set_feature_access(
    'messageCenter',
    jsonb_build_array(jsonb_build_object(
      'user_id',v_target::text,
      'effect','allow',
      'can_view',true,
      'can_create',false,
      'can_edit',false,
      'can_delete',false,
      'can_export',false,
      'can_manage_access',false,
      'can_bypass_approval',false
    ))
  ) into v_result;
  if coalesce((v_result->>'changed')::integer,0)<>1 then
    raise exception 'feature-access set contract did not report one change';
  end if;

  execute 'reset role';
end;
$$;

rollback;

select 'PASS: feature access management snapshot/set PLpgSQL contract; transaction rolled back' as result;

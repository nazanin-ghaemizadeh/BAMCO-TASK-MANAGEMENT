-- Transaction-only administrator grant/revoke verification across workspaces.
begin;
do $$declare ns text;actor uuid;recipient uuid;allowed boolean;feature text;payload jsonb;begin
 foreach ns in array array['public','bamco_process','bamco_quality'] loop
  execute format('select id from %I.profiles where active and role=''manager'' limit 1',ns) into strict actor;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach feature in array array['ovenAnalysis','statisticalProcessControl'] loop
   execute format('select %I.can_access_feature($1,''view'')',ns) into allowed using feature;
   if allowed is distinct from true then raise exception 'Manager cannot view %.%',ns,feature;end if;
   execute format('select %I.feature_access_manage_snapshot($1)',ns) into payload using feature;
   if payload is null then raise exception 'Manager access editor missing';end if;
  end loop;
  execute 'reset role';
 end loop;
 select id into strict recipient from public.profiles where active and role='owner' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',recipient,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if public.can_access_feature('ovenAnalysis','view') then raise exception 'New feature must require explicit grant';end if;
 execute 'reset role';
 select id into strict actor from public.profiles where active and role='manager' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.set_feature_access('ovenAnalysis',jsonb_build_array(jsonb_build_object('user_id',recipient,'effect','allow','can_view',true)));
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',recipient,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if not public.can_access_feature('ovenAnalysis','view') then raise exception 'Explicit view grant did not apply';end if;
 if public.can_access_feature('statisticalProcessControl','view') then raise exception 'Independent feature grant leaked';end if;
 execute 'reset role';
end$$;
select 'quality tool access tests passed' as result;
rollback;

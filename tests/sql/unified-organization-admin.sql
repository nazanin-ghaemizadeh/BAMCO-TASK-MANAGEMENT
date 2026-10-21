-- Run with the migration in a transaction; never commit synthetic test state.
do $test$
declare manager uuid;person uuid;u private.org_units;unit2 bigint;pkg bigint;out jsonb;feature text;flag boolean;before_count bigint;new_revision bigint;ns text;candidate record;role_value bigint;position_value jsonb;
begin
 select id into strict manager from public.profiles where role='manager' and active limit 1;
 select id into strict person from public.profiles where role<>'manager' and active limit 1;
 select * into strict u from private.org_units where schema_name='public' order by id limit 1;
 select count(*) into before_count from public.feature_access_grants;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.admin_org_snapshot();raise exception 'Ordinary user read admin data';exception when insufficient_privilege then null;end;
 begin perform public.admin_org_save('department','{"title":"Forbidden"}');raise exception 'Ordinary user wrote admin data';exception when insufficient_privilege then null;end;
 if public.can_access_feature('organizationAdmin','view') then raise exception 'Admin route was granted to ordinary user';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);execute 'set local role authenticated';
 foreach ns in array array['public','bamco_process','bamco_quality'] loop execute format('select %I.admin_org_snapshot()',ns) into out;if jsonb_array_length(out->'workspaces')<>3 then raise exception 'Incomplete central snapshot';end if;end loop;
 -- The central panel delegates position validation in every namespace.
 execute 'reset role';
 for candidate in select * from private.org_units order by id loop
  execute format('select id from %I.organization_roles where active order by level_no limit 1',candidate.schema_name) into role_value;
  execute 'set local role authenticated';
  position_value:=public.admin_org_save('position',jsonb_build_object('title','Synthetic central position','unit_id',candidate.id,'role_id',role_value));
  execute 'reset role';
  execute format('select exists(select 1 from %I.organization_positions where id=$1 and unit_id=$2)',candidate.schema_name) into flag using (position_value->'saved'->>'position_id')::bigint,candidate.local_unit_id;
  if not flag then raise exception 'Position was not linked to selected unit: %',candidate.schema_name;end if;
 end loop;
 execute 'set local role authenticated';
 out:=public.admin_org_save('package',jsonb_build_object('title','Synthetic observer','grants',jsonb_build_array(jsonb_build_object('feature_key','pettyCash','actions',jsonb_build_array('view')))));pkg:=(out->>'id')::bigint;
 -- An invalid second person must roll back the entire bulk assignment.
 begin
  perform public.admin_org_save('binding_batch',jsonb_build_object('unit_id',u.id,'package_id',pkg,'user_ids',jsonb_build_array(person,'00000000-0000-0000-0000-000000000000')));
  raise exception 'Invalid batch accepted';
 exception when raise_exception then if sqlerrm='Invalid batch accepted' then raise;end if;end;
 execute 'reset role';
 if exists(select 1 from private.org_bindings where package_id=pkg) then raise exception 'Invalid batch partially committed';end if;
 execute 'set local role authenticated';
 perform public.admin_org_save('binding_batch',jsonb_build_object('unit_id',u.id,'package_id',pkg,'user_ids',jsonb_build_array(person)));
 perform public.admin_org_save('binding',jsonb_build_object('unit_id',u.id,'user_id',person,'package_id',pkg));
 execute 'reset role';
 -- Retain all original direct grants in production; synthetic overrides below
 -- are confined to this rolled-back probe.
 update public.feature_access_grants set revoked_at=now() where user_id=person and feature_key='pettyCash';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);execute 'set local role authenticated';
 if not public.can_access_feature('pettyCash','view') then raise exception 'Package view did not apply';end if;
 if public.can_access_feature('pettyCash','create') then raise exception 'Observer package escalated to create';end if;
 if public.can_access_feature('settings','manage_access') then raise exception 'Package escalated to admin';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);execute 'set local role authenticated';
 out:=public.admin_org_effective(u.id,person);if not exists(select 1 from jsonb_array_elements(out) x where x->>'feature_key'='pettyCash' and (x->'permissions'->>'view')::boolean) then raise exception 'Effective access disagrees';end if;
 perform public.admin_org_save('features',jsonb_build_object('unit_id',u.id,'revision',u.revision,'features','[]'::jsonb));
 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);execute 'set local role authenticated';
 if public.can_access_feature('pettyCash','view') then raise exception 'Disabled unit feature still allowed';end if;
 if coalesce((public.effective_feature_access()->>'kanban_supervision')::boolean,false) then raise exception 'Unit ceiling bypassed by supervision';end if;
 execute 'reset role';select revision into new_revision from private.org_units where id=u.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.admin_org_save('features',jsonb_build_object('unit_id',u.id,'revision',u.revision,'features','[]'::jsonb));raise exception 'Stale update accepted';exception when raise_exception then if sqlerrm='Stale update accepted' then raise;end if;end;
 perform public.admin_org_save('features',jsonb_build_object('unit_id',u.id,'revision',new_revision,'features',jsonb_build_array('pettyCash')));
 perform public.admin_org_save('binding',jsonb_build_object('unit_id',u.id,'user_id',person,'package_id',pkg,'active',false));
 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);execute 'set local role authenticated';
 if public.can_access_feature('pettyCash','view') then raise exception 'Revoked package persisted';end if;
 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);execute 'set local role authenticated';
 perform public.admin_org_save('binding',jsonb_build_object('unit_id',u.id,'user_id',person,'package_id',pkg));
 perform public.set_feature_access('pettyCash',jsonb_build_array(jsonb_build_object('user_id',person,'effect','deny','can_view',false)));
 execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);execute 'set local role authenticated';
 if public.can_access_feature('pettyCash','view') then raise exception 'Package bypassed explicit direct deny';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);execute 'set local role authenticated';
 begin perform public.admin_org_save('package',jsonb_build_object('title','Escalation','grants',jsonb_build_array(jsonb_build_object('feature_key','settings','actions',jsonb_build_array('manage_access')))));raise exception 'Protected action accepted';exception when raise_exception then if sqlerrm='Protected action accepted' then raise;end if;end;
 out:=public.admin_org_save('department','{"title":"Synthetic deputy"}');
 out:=public.admin_org_save('unit',jsonb_build_object('title','Synthetic unit','department_id',out->>'id'));unit2:=(out->>'id')::bigint;
 perform public.admin_org_save('membership',jsonb_build_object('unit_id',unit2,'user_id',person));
 execute 'reset role';
 if exists(select 1 from private.org_bindings where user_id=person and active and unit_id=u.id) then raise exception 'Move retained old personal bindings';end if;
end
$test$;
select 'Central admin authorization, packages, unit ceiling, deny, revision and membership tests passed' as result;

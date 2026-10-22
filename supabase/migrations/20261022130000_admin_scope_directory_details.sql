-- Safe directory fields and the real structure revision for independent
-- People/Organization views. Access remains restricted by org_require_admin.
create or replace function public.admin_org_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ns text;result jsonb;data jsonb;scopes jsonb:='[]';begin
 perform private.org_require_admin();
 foreach ns in array array['public','bamco_process','bamco_quality'] loop
  execute format($query$select jsonb_build_object('schema_name',%1$L,
   'structure_version',coalesce((select structure_version from %2$I.organization_settings where singleton limit 1),1),
   'structure_updated_at',(select updated_at from %2$I.organization_settings where singleton limit 1),
   'people',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(display_name,full_name),'full_name',full_name,'display_name',display_name,'login_name',login_name,'email',email,'active',active,'role',role,'gender',gender,'mobile_phone',mobile_phone,'internal_extension',internal_extension,'salutation',salutation,'default_message_channel',default_message_channel,'must_change_password',must_change_password,'password_changed_at',password_changed_at,'avatar_path',avatar_path,'updated_at',updated_at) order by full_name),'[]') from %2$I.profiles),
   'roles',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'level_no',level_no) order by level_no desc),'[]') from %2$I.organization_roles where active),
   'positions',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from %2$I.organization_positions p where active),
   'assignments',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from %2$I.organization_position_assignments a where is_primary and valid_from<=current_date and (valid_to is null or valid_to>current_date)),
   'features',(select coalesce(jsonb_agg(jsonb_build_object('feature_key',feature_key,'title',title,'category',category) order by sort_order),'[]') from %2$I.app_features where active and feature_key<>'organizationAdmin'))$query$,ns,ns) into data;
  scopes:=scopes||jsonb_build_array(data);
 end loop;
 select jsonb_build_object('departments',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from private.org_departments d),'units',(select coalesce(jsonb_agg(to_jsonb(u) order by id),'[]') from private.org_units u),'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from private.org_members m),'packages',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from private.org_packages p),'package_grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from private.org_package_grants g),'bindings',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from private.org_bindings b),'unit_features',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from private.org_unit_features f),'workspaces',scopes) into result;
 return result;
end$$;
revoke all on function public.admin_org_snapshot() from public,anon;
grant execute on function public.admin_org_snapshot() to authenticated;
notify pgrst,'reload schema';

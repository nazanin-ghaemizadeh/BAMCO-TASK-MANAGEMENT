-- One login page resolves the authenticated account to its server-owned workspace.
create or replace function public.resolve_my_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 actor uuid:=auth.uid();
 matches integer;
 chosen_schema text;
 chosen_unit text;
 chosen_department text;
begin
 if actor is null then
  raise exception 'ابتدا وارد سامانه شوید.' using errcode='42501';
 end if;

 -- The global administrator opens the primary shell and manages every
 -- workspace from the central organization panel.
 if private.is_system_manager(actor) then
  return jsonb_build_object(
   'key','product','schema_name','public',
   'title','مدیریت جامع سازمان','is_system_manager',true
  );
 end if;

 select count(*),min(u.schema_name),min(u.title),min(d.title)
 into matches,chosen_schema,chosen_unit,chosen_department
 from private.org_members m
 join private.org_units u on u.id=m.unit_id and u.active
 join private.org_departments d on d.id=u.department_id and d.active
 where m.user_id=actor
 and case u.schema_name
  when 'public' then exists(select 1 from public.profiles p where p.id=actor and p.active)
  when 'bamco_process' then exists(select 1 from bamco_process.profiles p where p.id=actor and p.active)
  when 'bamco_quality' then exists(select 1 from bamco_quality.profiles p where p.id=actor and p.active)
  else false end;

 -- Compatibility for an account created before central membership existed.
 if matches=0 then
  with candidates(schema_name,title) as (
   select 'public','مهندسی توسعه و تکوین محصول' where exists(select 1 from public.profiles where id=actor and active)
   union all select 'bamco_process','مدیریت فرآیند' where exists(select 1 from bamco_process.profiles where id=actor and active)
   union all select 'bamco_quality','کنترل کیفیت' where exists(select 1 from bamco_quality.profiles where id=actor and active)
  ) select count(*),min(schema_name),min(title) into matches,chosen_schema,chosen_unit from candidates;
 end if;

 if matches=0 then raise exception 'برای این حساب، واحد فعالی تعریف نشده است.' using errcode='42501';end if;
 if matches>1 then raise exception 'این حساب به بیش از یک محیط متصل است؛ ادمین باید واحد اصلی را مشخص کند.' using errcode='22023';end if;

 return jsonb_build_object(
  'key',case chosen_schema when 'public' then 'product' when 'bamco_process' then 'process' else 'quality' end,
  'schema_name',chosen_schema,'title',chosen_unit,'department_title',chosen_department,
  'is_system_manager',false
 );
end$$;
revoke all on function public.resolve_my_workspace() from public,anon;
grant execute on function public.resolve_my_workspace() to authenticated;

do $$declare ns text;begin
 foreach ns in array array['bamco_process','bamco_quality'] loop
  execute format('create or replace function %I.resolve_my_workspace() returns jsonb language sql stable security invoker set search_path='''' as $fn$select public.resolve_my_workspace()$fn$',ns);
  execute format('revoke all on function %I.resolve_my_workspace() from public,anon',ns);
  execute format('grant execute on function %I.resolve_my_workspace() to authenticated',ns);
 end loop;
end$$;
notify pgrst,'reload schema';

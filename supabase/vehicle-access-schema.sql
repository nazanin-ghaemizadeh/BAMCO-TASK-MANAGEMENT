begin;
create table public.vehicle_access(
 user_id uuid references public.profiles(id) on delete cascade,
 scope text check(scope in ('permanent','temporary')),
 granted_by uuid references public.profiles(id) on delete set null,
 granted_at timestamptz not null default now(),primary key(user_id,scope)
);
alter table public.vehicle_access enable row level security;
revoke all on public.vehicle_access from anon,authenticated;
grant select,insert,delete on public.vehicle_access to authenticated;
grant all on public.vehicle_access to service_role;
create policy vehicle_access_read on public.vehicle_access for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager'));
create policy vehicle_access_insert on public.vehicle_access for insert to authenticated with check(granted_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager'));
create policy vehicle_access_delete on public.vehicle_access for delete to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager'));
create function public.can_access_vehicle(p_scope text) returns boolean language sql stable security invoker set search_path='' as $$
 select p_scope in ('permanent','temporary') and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='manager' or exists(select 1 from public.vehicle_access a where a.user_id=p.id and a.scope=p_scope)))
$$;
revoke all on function public.can_access_vehicle(text) from public,anon;
grant execute on function public.can_access_vehicle(text) to authenticated,service_role;
create function public.set_vehicle_access(p_scope text,p_user_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='manager') then raise exception 'فقط مدیر مجاز است.' using errcode='42501'; end if;
 if p_scope is null or p_scope not in ('permanent','temporary') or p_user_ids is null or exists(select 1 from unnest(p_user_ids) x where x is null or not exists(select 1 from public.profiles p where p.id=x and p.active and p.role<>'manager')) then raise exception 'دسترسی یا فهرست افراد معتبر نیست.'; end if;
 perform pg_advisory_xact_lock(734612909);
 delete from public.vehicle_access where scope=p_scope and not(user_id=any(p_user_ids));
 insert into public.vehicle_access(user_id,scope,granted_by) select distinct x,p_scope,auth.uid() from unnest(p_user_ids) x on conflict(user_id,scope) do nothing;
end $$;
revoke all on function public.set_vehicle_access(text,uuid[]) from public,anon;
grant execute on function public.set_vehicle_access(text,uuid[]) to authenticated;
create policy vehicle_permanent_granted on public.vehicle_permanent_records for all to authenticated using((select public.can_access_vehicle('permanent'))) with check((select public.can_access_vehicle('permanent')));
create policy vehicle_temporary_granted on public.vehicle_temporary_records for all to authenticated using((select public.can_access_vehicle('temporary'))) with check((select public.can_access_vehicle('temporary')));
create policy vehicle_templates_granted_read on public.vehicle_form_templates for select to authenticated using((select public.can_access_vehicle('permanent')));
create policy vehicle_templates_granted_update on public.vehicle_form_templates for update to authenticated using((select public.can_access_vehicle('permanent'))) with check((select public.can_access_vehicle('permanent')));
create policy vehicle_forms_granted on storage.objects for all to authenticated using(bucket_id='vehicle-forms' and (select public.can_access_vehicle('permanent'))) with check(bucket_id='vehicle-forms' and (select public.can_access_vehicle('permanent')));
commit;

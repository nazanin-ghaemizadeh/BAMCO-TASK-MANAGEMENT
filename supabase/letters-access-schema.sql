begin;
create table if not exists public.letter_access (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 granted_by uuid references public.profiles(id),
 granted_at timestamptz not null default now()
);
alter table public.letter_access enable row level security;
revoke all on public.letter_access from anon, authenticated;
grant select,insert,delete on public.letter_access to authenticated;
grant all on public.letter_access to service_role;
create policy letter_access_read on public.letter_access for select to authenticated using (
 user_id=(select auth.uid()) or exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager')
);
create policy letter_access_grant on public.letter_access for insert to authenticated with check (
 granted_by=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager')
);
create policy letter_access_revoke on public.letter_access for delete to authenticated using (
 exists(select 1 from public.profiles where id=(select auth.uid()) and active and role='manager')
);
create or replace function public.can_access_letters() returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and
 (p.role='manager' or exists(select 1 from public.letter_access a where a.user_id=p.id)))
$$;
revoke all on function public.can_access_letters() from public,anon;
grant execute on function public.can_access_letters() to authenticated,service_role;
drop policy if exists letters_active_read on public.letters;
create policy letters_active_read on public.letters for select to authenticated using ((select public.can_access_letters()));
create or replace function public.set_letters_access(p_user_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='manager') then
 raise exception 'فقط مدیر مجاز به تغییر دسترسی نامه‌ها است.' using errcode='42501'; end if;
 if p_user_ids is null or exists(select 1 from unnest(p_user_ids) x where x is null or not exists(select 1 from public.profiles p where p.id=x and p.active and p.role<>'manager')) then
 raise exception 'فهرست افراد معتبر نیست.'; end if;
 perform pg_advisory_xact_lock(734612908);
 delete from public.letter_access where not(user_id=any(p_user_ids));
 insert into public.letter_access(user_id,granted_by) select distinct x,auth.uid() from unnest(p_user_ids) x on conflict(user_id) do nothing;
end $$;
revoke all on function public.set_letters_access(uuid[]) from public,anon;
grant execute on function public.set_letters_access(uuid[]) to authenticated;
commit;

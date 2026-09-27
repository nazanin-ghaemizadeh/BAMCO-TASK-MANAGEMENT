-- Company directory contacts are shared only through the same feature-access
-- contract as every other visible workspace route.

create table if not exists public.contact_directory (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('office','factory','external')),
  full_name text not null check (length(btrim(full_name)) between 2 and 160),
  organization text,
  role_title text,
  phone text,
  mobile_phone text,
  internal_extension text,
  email text,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contact_directory_category_name_idx
  on public.contact_directory(category, full_name);

create or replace function private.contact_directory_write_guard()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'نشست کاربری معتبر نیست.' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    new.created_by:=auth.uid();
  else
    new.created_by:=old.created_by;
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end;
$$;

revoke all on function private.contact_directory_write_guard() from public, anon, authenticated;
drop trigger if exists contact_directory_write_guard on public.contact_directory;
create trigger contact_directory_write_guard
before insert or update on public.contact_directory
for each row execute function private.contact_directory_write_guard();

alter table public.contact_directory enable row level security;
revoke all on public.contact_directory from anon;
grant select, insert, update, delete on public.contact_directory to authenticated;

drop policy if exists contact_directory_view on public.contact_directory;
create policy contact_directory_view on public.contact_directory
  for select to authenticated
  using ((select public.can_access_feature('phonebook','view')));

drop policy if exists contact_directory_create on public.contact_directory;
create policy contact_directory_create on public.contact_directory
  for insert to authenticated
  with check ((select public.can_access_feature('phonebook','create')));

drop policy if exists contact_directory_edit on public.contact_directory;
create policy contact_directory_edit on public.contact_directory
  for update to authenticated
  using ((select public.can_access_feature('phonebook','edit')))
  with check ((select public.can_access_feature('phonebook','edit')));

drop policy if exists contact_directory_delete on public.contact_directory;
create policy contact_directory_delete on public.contact_directory
  for delete to authenticated
  using ((select public.can_access_feature('phonebook','delete')));

insert into public.app_features(feature_key,route_key,title,category,sort_order,active)
values ('phonebook','phoneBook','دفتر تلفن','resources',385,true)
on conflict(feature_key) do update
set route_key=excluded.route_key,
    title=excluded.title,
    category=excluded.category,
    sort_order=excluded.sort_order,
    active=true,
    updated_at=now();

insert into public.feature_access_grants(
  feature_key,subject_kind,user_id,effect,
  can_view,can_create,can_edit,can_delete,can_export,can_manage_access,can_bypass_approval,
  metadata
)
select 'phonebook','user',profile.id,'allow',
  true,true,true,true,false,false,false,
  jsonb_build_object('seed','phonebook_directory')
from public.profiles profile
where profile.active is distinct from false
  and not exists (
    select 1 from public.feature_access_grants grant_row
    where grant_row.feature_key='phonebook'
      and grant_row.subject_kind='user'
      and grant_row.user_id=profile.id
      and grant_row.revoked_at is null
  );
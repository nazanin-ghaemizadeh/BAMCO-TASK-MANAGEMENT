-- Phonebook entries are intentionally empty until an authorized user creates
-- an organisation unit and/or a contact in one of the three directory tabs.

create table if not exists public.phonebook_units (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('office','factory','external')),
  title text not null check (length(btrim(title)) between 2 and 160),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, title)
);

create index if not exists phonebook_units_category_title_idx
  on public.phonebook_units(category, title);

alter table public.contact_directory
  add column if not exists unit_id uuid references public.phonebook_units(id) on delete set null,
  add column if not exists address text;

create index if not exists contact_directory_unit_idx
  on public.contact_directory(unit_id);

create or replace function private.phonebook_units_write_guard()
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

revoke all on function private.phonebook_units_write_guard() from public, anon, authenticated;
drop trigger if exists phonebook_units_write_guard on public.phonebook_units;
create trigger phonebook_units_write_guard
before insert or update on public.phonebook_units
for each row execute function private.phonebook_units_write_guard();

alter table public.phonebook_units enable row level security;
revoke all on public.phonebook_units from anon;
grant select, insert, update, delete on public.phonebook_units to authenticated;

drop policy if exists phonebook_units_view on public.phonebook_units;
create policy phonebook_units_view on public.phonebook_units
  for select to authenticated
  using ((select public.can_access_feature('phonebook','view')));

drop policy if exists phonebook_units_create on public.phonebook_units;
create policy phonebook_units_create on public.phonebook_units
  for insert to authenticated
  with check ((select public.can_access_feature('phonebook','create')));

drop policy if exists phonebook_units_edit on public.phonebook_units;
create policy phonebook_units_edit on public.phonebook_units
  for update to authenticated
  using ((select public.can_access_feature('phonebook','edit')))
  with check ((select public.can_access_feature('phonebook','edit')));

drop policy if exists phonebook_units_delete on public.phonebook_units;
create policy phonebook_units_delete on public.phonebook_units
  for delete to authenticated
  using ((select public.can_access_feature('phonebook','delete')));

-- Keep personal notes with the signed-in account, including on other devices.
create table if not exists public.personal_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  color text not null default 'sun' check (color in ('sun','rose','mint','sky','lavender','peach')),
  inactive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_notes_owner_updated_idx
  on public.personal_notes (owner_id, updated_at desc);

alter table public.personal_notes enable row level security;
revoke all on public.personal_notes from anon;
grant select, insert, update, delete on public.personal_notes to authenticated;

create policy personal_notes_select_own on public.personal_notes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy personal_notes_insert_own on public.personal_notes
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy personal_notes_update_own on public.personal_notes
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy personal_notes_delete_own on public.personal_notes
  for delete to authenticated using (owner_id = (select auth.uid()));

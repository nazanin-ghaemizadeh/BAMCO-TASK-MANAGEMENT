create table if not exists public.petty_cash_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table if not exists public.petty_cash_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no bigint generated always as identity unique,
  event_date date not null,
  entry_type text not null check (entry_type in ('receipt','expense')),
  amount numeric(18,0) not null check (amount > 0),
  category text not null,
  counterparty text,
  responsible_id uuid not null references public.profiles(id),
  description text not null,
  document_no text,
  payment_method text,
  cost_center text,
  notes text,
  status text not null default 'active' check (status in ('active','void')),
  void_reason text,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table if not exists public.petty_cash_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.petty_cash_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.petty_cash_access(user_id) values
 ('2f4f8533-9775-4018-b0b3-647bb1b3a8a8'),
 ('251e1dc0-b712-4920-b6bd-06b9a5c704c5')
on conflict do nothing;

create or replace function public.can_access_petty_cash()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.petty_cash_access where user_id=auth.uid()) $$;

alter table public.petty_cash_access enable row level security;
alter table public.petty_cash_entries enable row level security;
alter table public.petty_cash_attachments enable row level security;

create policy petty_cash_access_self on public.petty_cash_access for select to authenticated using (user_id=(select auth.uid()));
create policy petty_cash_entries_read on public.petty_cash_entries for select to authenticated using ((select public.can_access_petty_cash()));
create policy petty_cash_entries_write on public.petty_cash_entries for insert to authenticated with check ((select public.can_access_petty_cash()) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy petty_cash_entries_update on public.petty_cash_entries for update to authenticated using ((select public.can_access_petty_cash())) with check ((select public.can_access_petty_cash()) and updated_by=(select auth.uid()));
create policy petty_cash_attachments_read on public.petty_cash_attachments for select to authenticated using ((select public.can_access_petty_cash()));
create policy petty_cash_attachments_write on public.petty_cash_attachments for insert to authenticated with check ((select public.can_access_petty_cash()) and uploaded_by=(select auth.uid()));
create policy petty_cash_attachments_delete on public.petty_cash_attachments for delete to authenticated using ((select public.can_access_petty_cash()));

grant select on public.petty_cash_access to authenticated;
grant select,insert,update on public.petty_cash_entries to authenticated;
grant usage,select on sequence public.petty_cash_entries_entry_no_seq to authenticated;
grant select,insert,delete on public.petty_cash_attachments to authenticated;
grant execute on function public.can_access_petty_cash() to authenticated;
revoke execute on function public.can_access_petty_cash() from public, anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('petty-cash-private','petty-cash-private',false,26214400,array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy petty_cash_storage_read on storage.objects for select to authenticated using (bucket_id='petty-cash-private' and (select public.can_access_petty_cash()));
create policy petty_cash_storage_insert on storage.objects for insert to authenticated with check (bucket_id='petty-cash-private' and (select public.can_access_petty_cash()));
create policy petty_cash_storage_delete on storage.objects for delete to authenticated using (bucket_id='petty-cash-private' and (select public.can_access_petty_cash()));

create index if not exists petty_cash_entries_event_idx on public.petty_cash_entries(event_date desc,entry_no desc);
create index if not exists petty_cash_attachments_entry_idx on public.petty_cash_attachments(entry_id);

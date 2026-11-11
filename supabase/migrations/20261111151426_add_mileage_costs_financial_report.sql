create table if not exists public.mileage_cost_entries (
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

create table if not exists public.mileage_cost_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.mileage_cost_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);


insert into public.app_features(feature_key,route_key,title,category,sort_order)
values ('mileageCosts','mileageCosts','هزینه‌های پیمایش','finance',275);
alter table public.mileage_cost_entries enable row level security;
alter table public.mileage_cost_attachments enable row level security;
grant select,insert,update,delete on public.mileage_cost_entries,public.mileage_cost_attachments to authenticated;
grant usage,select on sequence public.mileage_cost_entries_entry_no_seq to authenticated;
-- Preserve the existing financial report's action and workspace boundaries.
do $$ declare p record; stmt text; begin
 for p in select * from pg_policies where schemaname='public' and tablename in ('petty_cash_entries','petty_cash_attachments') loop
  stmt:=format('create policy %I on public.%I as %s for %s to authenticated',replace(p.policyname,'petty_cash','mileage_cost'),replace(p.tablename,'petty_cash','mileage_cost'),p.permissive,p.cmd);
  if p.qual is not null then stmt:=stmt||' using ('||replace(p.qual,'pettyCash','mileageCosts')||')';end if;
  if p.with_check is not null then stmt:=stmt||' with check ('||replace(p.with_check,'pettyCash','mileageCosts')||')';end if;
  execute stmt;
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
select 'mileage-cost-private','mileage-cost-private',false,file_size_limit,allowed_mime_types from storage.buckets where id='petty-cash-private';
do $$ declare p record; stmt text; begin
 for p in select * from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'petty_cash_storage_feature_%' loop
  stmt:=format('create policy %I on storage.objects as %s for %s to authenticated',replace(p.policyname,'petty_cash','mileage_cost'),p.permissive,p.cmd);
  if p.qual is not null then stmt:=stmt||' using ('||replace(replace(p.qual,'pettyCash','mileageCosts'),'petty-cash-private','mileage-cost-private')||')';end if;
  if p.with_check is not null then stmt:=stmt||' with check ('||replace(replace(p.with_check,'pettyCash','mileageCosts'),'petty-cash-private','mileage-cost-private')||')';end if;
  execute stmt;
 end loop;
end $$;
notify pgrst,'reload schema';

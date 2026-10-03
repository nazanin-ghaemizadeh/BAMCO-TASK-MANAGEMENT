-- STAGED REVIEW PROPOSAL ONLY. Not applied and not a migration-history entry.
-- Supabase CLI was unavailable when authored. Before activation, inspect the
-- target schema/advisors and generate a migration with `supabase migration new`.
-- No report years or report files are seeded by this proposal.
begin;

create schema if not exists private;
create table public.test_report_years (
  id uuid primary key,
  domain text not null check (domain in ('environment','standard')),
  report_type text not null check (report_type in ('research','production','type_engineering')),
  jalali_year integer not null check (jalali_year between 1200 and 1600),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(domain, report_type, jalali_year)
);
create table public.test_report_files (
  id uuid primary key, -- Caller-generated idempotency key, not a server retry UUID.
  year_id uuid not null references public.test_report_years(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 220),
  description text check (length(description) <= 4000),
  original_file_name text not null check (length(original_file_name) between 1 and 512),
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/csv',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','ready','deleting')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (storage_path ~ ('^years/' || year_id::text || '/' || id::text || '\.(pdf|png|jpe?g|webp|gif|txt|csv|xls|xlsx|docx)$'))
);
create index test_report_files_year_updated_idx on public.test_report_files(year_id, updated_at desc, id);
create index test_report_years_created_by_idx on public.test_report_years(created_by);
create index test_report_files_created_by_idx on public.test_report_files(created_by);

alter table public.test_report_years enable row level security;
alter table public.test_report_files enable row level security;
revoke all on public.test_report_years, public.test_report_files from public, anon, authenticated;
grant select on public.test_report_years, public.test_report_files to authenticated;
grant select, insert, update, delete on public.test_report_years, public.test_report_files to service_role;
create policy test_report_years_read on public.test_report_years for select to authenticated
  using ((select public.can_access_feature('documents','view')));
-- Pending and deleting metadata intentionally remain visible after reload.
create policy test_report_files_read on public.test_report_files for select to authenticated
  using ((select public.can_access_feature('documents','view')));

create or replace function private.test_report_year_timestamps()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  else
    if new.id is distinct from old.id or new.domain is distinct from old.domain
      or new.report_type is distinct from old.report_type
      or (new.created_by is distinct from old.created_by and new.created_by is not null)
    then raise exception 'Report year identity cannot be changed' using errcode='23514'; end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger test_report_year_timestamps before insert or update on public.test_report_years
  for each row execute function private.test_report_year_timestamps();
create or replace function private.test_report_file_timestamps()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    if new.status <> 'pending' then raise exception 'Files must be reserved pending' using errcode='23514'; end if;
  else
    if (new.id,new.year_id,new.storage_path,new.original_file_name,new.mime_type,new.file_size,new.sha256)
       is distinct from (old.id,old.year_id,old.storage_path,old.original_file_name,old.mime_type,old.file_size,old.sha256)
       or (new.created_by is distinct from old.created_by and new.created_by is not null)
    then raise exception 'Report file identity cannot be changed' using errcode='23514'; end if;
    if (old.status='ready' and new.status='pending') or (old.status='deleting' and new.status<>'deleting')
    then raise exception 'Invalid report file status transition' using errcode='23514'; end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger test_report_file_timestamps before insert or update on public.test_report_files
  for each row execute function private.test_report_file_timestamps();
create or replace function private.test_report_touch_year()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Runs inside the SAME transaction as every file change, including deletion.
  update public.test_report_years set updated_at=clock_timestamp()
    where id=case when tg_op='DELETE' then old.year_id else new.year_id end;
  return null;
end $$;
create trigger test_report_touch_year after insert or update or delete on public.test_report_files
  for each row execute function private.test_report_touch_year();
revoke all on function private.test_report_year_timestamps(), private.test_report_file_timestamps(), private.test_report_touch_year() from public, anon, authenticated;
grant execute on function private.test_report_year_timestamps(), private.test_report_file_timestamps(), private.test_report_touch_year() to service_role;

-- Durable operation exclusion across Edge instances. Never exposed to clients.
-- A request has a 90-second overall deadline; its lease lasts 180 seconds.
-- A failed/ambiguous mutation keeps the lease until expiry. Deleted-ID tombstones
-- prevent a stale retry from resurrecting or overwriting a newly uploaded file.
create table private.test_report_operations (
  id uuid primary key,
  token uuid,
  action text check (action in ('upload','update','delete')),
  expires_at timestamptz,
  deleted_at timestamptz
);
alter table private.test_report_operations enable row level security;
revoke all on private.test_report_operations from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.test_report_operations to service_role;
create or replace function public.test_report_claim_operation(p_id uuid,p_token uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare operation private.test_report_operations%rowtype;
begin
  if p_id is null or p_token is null or p_action not in ('upload','update','delete') or p_action is null
  then raise exception 'Invalid report operation' using errcode='22023'; end if;
  insert into private.test_report_operations(id) values(p_id) on conflict(id) do nothing;
  select * into operation from private.test_report_operations where id=p_id for update;
  if operation.deleted_at is not null then return jsonb_build_object('claimed',false,'deleted',true); end if;
  if operation.token is not null and operation.expires_at>clock_timestamp() then
    return jsonb_build_object('claimed',false,'retry_after',greatest(1,ceil(extract(epoch from operation.expires_at-clock_timestamp()))::integer));
  end if;
  update private.test_report_operations set token=p_token,action=p_action,expires_at=clock_timestamp()+interval '180 seconds' where id=p_id;
  return jsonb_build_object('claimed',true);
end $$;
create or replace function public.test_report_release_operation(p_id uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update private.test_report_operations set token=null,action=null,expires_at=null where id=p_id and token=p_token and deleted_at is null;
  return found;
end $$;
create or replace function public.test_report_finish_upload(p_id uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare operation private.test_report_operations%rowtype; result public.test_report_files%rowtype;
begin
  select * into operation from private.test_report_operations where id=p_id for update;
  if not found or operation.token is distinct from p_token or operation.action is distinct from 'upload'
    or operation.expires_at<=clock_timestamp() or operation.deleted_at is not null then return null; end if;
  update public.test_report_files set status='ready' where id=p_id and status='pending' returning * into result;
  if not found then return null; end if;
  update private.test_report_operations set token=null,action=null,expires_at=null where id=p_id;
  return to_jsonb(result);
end $$;
create or replace function public.test_report_finish_delete(p_id uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare operation private.test_report_operations%rowtype;
begin
  select * into operation from private.test_report_operations where id=p_id for update;
  if not found or operation.token is distinct from p_token or operation.action is distinct from 'delete'
    or operation.expires_at<=clock_timestamp() or operation.deleted_at is not null then return false; end if;
  if exists(select 1 from public.test_report_files where id=p_id and status<>'deleting') then return false; end if;
  delete from public.test_report_files where id=p_id and status='deleting';
  update private.test_report_operations set deleted_at=clock_timestamp(),token=null,action=null,expires_at=null where id=p_id;
  return true;
end $$;
revoke all on function public.test_report_claim_operation(uuid,uuid,text), public.test_report_release_operation(uuid,uuid), public.test_report_finish_delete(uuid,uuid), public.test_report_finish_upload(uuid,uuid) from public, anon, authenticated;
grant execute on function public.test_report_claim_operation(uuid,uuid,text), public.test_report_release_operation(uuid,uuid), public.test_report_finish_delete(uuid,uuid), public.test_report_finish_upload(uuid,uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('test-reports-private','test-reports-private',false,26214400,array[
  'application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/csv',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
create policy test_report_storage_ready_read on storage.objects for select to authenticated using (
  bucket_id='test-reports-private' and (select public.can_access_feature('documents','view'))
  and exists(select 1 from public.test_report_files f where f.storage_path=name and f.status='ready')
);
-- RESTRICTIVE policies also defend this bucket from unrelated broad policies.
create policy test_report_storage_read_guard on storage.objects as restrictive for select to authenticated using (
  bucket_id<>'test-reports-private' or (
    (select public.can_access_feature('documents','view'))
    and exists(select 1 from public.test_report_files f where f.storage_path=name and f.status='ready')
  )
);
create policy test_report_storage_anon_guard on storage.objects as restrictive for select to anon
  using(bucket_id<>'test-reports-private');
create policy test_report_storage_no_client_insert on storage.objects as restrictive for insert to public
  with check(bucket_id<>'test-reports-private');
create policy test_report_storage_no_client_update on storage.objects as restrictive for update to public
  using(bucket_id<>'test-reports-private') with check(bucket_id<>'test-reports-private');
create policy test_report_storage_no_client_delete on storage.objects as restrictive for delete to public
  using(bucket_id<>'test-reports-private');
commit;

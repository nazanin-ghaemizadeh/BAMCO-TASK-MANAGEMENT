begin;
create schema if not exists private;

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists excel_name text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.tasks add column if not exists legacy_id bigint unique;
alter table public.tasks add column if not exists row_version bigint not null default 1;
alter table public.tasks add column if not exists source text not null default 'web';
alter table public.tasks add column if not exists source_row_hash text;
create unique index if not exists tasks_source_hash_uq on public.tasks(source,source_row_hash) where source_row_hash is not null;
create index if not exists tasks_owner_archived_idx on public.tasks(owner_id,archived,id desc);
create index if not exists tasks_active_due_idx on public.tasks(due_date) where not archived and due_date is not null;

alter table public.change_requests add column if not exists before_data jsonb;
alter table public.change_requests drop constraint if exists change_requests_request_type_check;
alter table public.change_requests add constraint change_requests_request_type_check check(request_type in ('create','update','complete'));
create index if not exists change_requests_requester_idx on public.change_requests(requested_by,created_at desc);
create index if not exists change_requests_pending_idx on public.change_requests(created_at) where request_status='pending';

alter table public.task_history add column if not exists field_name text;
alter table public.task_history add column if not exists old_value jsonb;
alter table public.task_history add column if not exists new_value jsonb;
alter table public.task_history add column if not exists request_id bigint references public.change_requests(id);
create index if not exists task_history_task_idx on public.task_history(task_id,created_at desc);

create table if not exists public.task_statuses(key text primary key,label text not null unique,sort_order smallint not null unique,active boolean not null default true);
insert into public.task_statuses values ('registered','ثبت شده',1,true),('waiting','منتظر پاسخ',2,true),('doing','در حال انجام',3,true),('done','انجام شده',4,true) on conflict do nothing;
alter table public.task_statuses enable row level security;
drop policy if exists dictionaries_read_status on public.task_statuses;
create policy dictionaries_read_status on public.task_statuses for select to authenticated using(true);

create table if not exists public.priorities(key text primary key,label text not null unique,sort_order smallint not null unique,active boolean not null default true);
insert into public.priorities values ('low','کم',1,true),('medium','متوسط',2,true),('urgent','فوری',3,true) on conflict do nothing;
alter table public.priorities enable row level security;
drop policy if exists dictionaries_read_priority on public.priorities;
create policy dictionaries_read_priority on public.priorities for select to authenticated using(true);

alter table public.email_templates add column if not exists subject_template text not null default 'گزارش روزانه وضعیت امور | [تاریخ گزارش]';
alter table public.app_settings add column if not exists is_sensitive boolean not null default false;
alter table public.email_logs add column if not exists cc_emails text[] not null default '{}';
alter table public.email_logs add column if not exists conversation_id text;
alter table public.email_logs add column if not exists dispatch_id uuid;
alter table public.email_logs add column if not exists followup_of bigint references public.email_logs(id);
alter table public.email_logs add column if not exists error_message text;

create table if not exists public.email_dispatches(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('daily','followup','preview')),provider text not null default 'graph' check(provider in ('graph','bridge')),status text not null default 'queued',idempotency_key uuid not null unique,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),completed_at timestamptz,error_message text);
alter table public.email_logs add constraint email_logs_dispatch_fkey foreign key(dispatch_id) references public.email_dispatches(id);
create index if not exists email_logs_conversation_idx on public.email_logs(conversation_id) where conversation_id is not null;
create index if not exists email_logs_unanswered_idx on public.email_logs(sent_at desc) where replied_at is null and status='sent';

create table if not exists public.sticker_sets(id bigint generated always as identity primary key,name text not null unique,active boolean not null default false,system_set boolean not null default false,created_by uuid references public.profiles(id),created_at timestamptz not null default now());
create unique index if not exists sticker_sets_one_active on public.sticker_sets(active) where active;
create table if not exists public.stickers(id bigint generated always as identity primary key,set_id bigint not null references public.sticker_sets(id) on delete cascade,state_key text not null check(state_key in ('state1','state2','state3','state4','state5')),gender text not null check(gender in ('female','male')),storage_path text not null unique,mime_type text not null,size_bytes integer not null check(size_bytes between 1 and 5242880),sha256 text,unique(set_id,state_key,gender));

create table if not exists public.import_jobs(id uuid primary key default gen_random_uuid(),filename text not null,file_sha256 text not null,duplicate_mode text not null check(duplicate_mode in ('reject','update','create')),status text not null default 'preview' check(status in ('preview','running','completed','failed')),total_rows integer not null default 0,imported_rows integer not null default 0,error_rows integer not null default 0,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),completed_at timestamptz);
create table if not exists public.import_errors(id bigint generated always as identity primary key,job_id uuid not null references public.import_jobs(id) on delete cascade,row_number integer not null,row_data jsonb not null,error_message text not null);

create or replace function private.is_manager() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='manager')$$;
revoke all on function private.is_manager() from public,anon;
grant execute on function private.is_manager() to authenticated;

create or replace function private.guard_profile_update() returns trigger language plpgsql set search_path='' as $$begin
 if not (select private.is_manager()) and (old.role<>new.role or old.active<>new.active or old.email<>new.email or old.full_name<>new.full_name or old.must_change_password<>new.must_change_password and new.must_change_password) then raise exception 'تغییر این فیلدها مجاز نیست'; end if;
 new.updated_at=now(); return new;
end$$;
drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update before update on public.profiles for each row execute function private.guard_profile_update();

create or replace function private.touch_task() returns trigger language plpgsql set search_path='' as $$begin new.last_updated_at=now();new.row_version=old.row_version+1;if new.status='منتظر پاسخ' then new.due_date=null;end if;if new.status='انجام شده' and new.done_date is null then new.done_date=current_date;end if;if new.archived and new.archived_at is null then new.archived_at=now();end if;return new;end$$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function private.touch_task();

drop view if exists public.task_status_view;
create view public.task_status_view with(security_invoker=true) as select t.*,case when t.archived or t.status='انجام شده' then 'وظیفه به پایان رسیده است' when t.due_date<current_date then 'دیرکرد' when t.due_date is not null and current_date>=t.due_date-t.reminder_days then 'دوره هشدار' else 'فاقد شرایط دیرکرد' end due_state,case when t.archived and t.done_date>t.due_date then t.done_date-t.due_date else 0 end delay_days,case when t.archived and t.done_date<t.due_date then t.due_date-t.done_date else 0 end advance_days from public.tasks t;

drop policy if exists profiles_read on public.profiles;create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select private.is_manager()));
drop policy if exists profiles_update_self on public.profiles;create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid()) or (select private.is_manager())) with check(id=(select auth.uid()) or (select private.is_manager()));
drop policy if exists tasks_read on public.tasks;create policy tasks_read on public.tasks for select to authenticated using(owner_id=(select auth.uid()) or (select private.is_manager()));
drop policy if exists tasks_manager_insert on public.tasks;create policy tasks_manager_insert on public.tasks for insert to authenticated with check((select private.is_manager()));
drop policy if exists tasks_manager_update on public.tasks;create policy tasks_manager_update on public.tasks for update to authenticated using((select private.is_manager())) with check((select private.is_manager()));
drop policy if exists tasks_manager_delete on public.tasks;create policy tasks_manager_delete on public.tasks for delete to authenticated using((select private.is_manager()));
drop policy if exists requests_create on public.change_requests;create policy requests_create on public.change_requests for insert to authenticated with check(requested_by=(select auth.uid()) and request_status='pending' and ((request_type='create' and task_id is null and proposed_data->>'owner_id'=(select auth.uid())::text) or(request_type in('update','complete') and exists(select 1 from public.tasks t where t.id=task_id and t.owner_id=(select auth.uid())))));
drop policy if exists requests_read on public.change_requests;create policy requests_read on public.change_requests for select to authenticated using(requested_by=(select auth.uid()) or (select private.is_manager()));
drop policy if exists requests_manager_update on public.change_requests;create policy requests_manager_update on public.change_requests for update to authenticated using((select private.is_manager())) with check((select private.is_manager()));

alter table public.email_dispatches enable row level security;alter table public.sticker_sets enable row level security;alter table public.stickers enable row level security;alter table public.import_jobs enable row level security;alter table public.import_errors enable row level security;
create policy manager_dispatches on public.email_dispatches for all to authenticated using((select private.is_manager())) with check((select private.is_manager()));
create policy manager_sticker_sets on public.sticker_sets for all to authenticated using((select private.is_manager())) with check((select private.is_manager()));
create policy manager_stickers on public.stickers for all to authenticated using((select private.is_manager())) with check((select private.is_manager()));
create policy manager_import_jobs on public.import_jobs for all to authenticated using((select private.is_manager())) with check((select private.is_manager()));
create policy manager_import_errors on public.import_errors for all to authenticated using((select private.is_manager())) with check((select private.is_manager()));

grant select on public.task_status_view,public.task_statuses,public.priorities to authenticated;
grant select,insert,update,delete on public.email_dispatches,public.sticker_sets,public.stickers,public.import_jobs,public.import_errors to authenticated;
grant update on public.profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false;
update storage.buckets set public=false where id='stickers';
drop policy if exists avatar_read_own_or_manager on storage.objects;create policy avatar_read_own_or_manager on storage.objects for select to authenticated using(bucket_id='avatars' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select private.is_manager())));
drop policy if exists avatar_insert_own on storage.objects;create policy avatar_insert_own on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists avatar_update_own on storage.objects;create policy avatar_update_own on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists sticker_read_authenticated on storage.objects;create policy sticker_read_authenticated on storage.objects for select to authenticated using(bucket_id='stickers');
drop policy if exists stickers_manager_insert on storage.objects;create policy stickers_manager_insert on storage.objects for insert to authenticated with check(bucket_id='stickers' and (select private.is_manager()));
drop policy if exists stickers_manager_update on storage.objects;create policy stickers_manager_update on storage.objects for update to authenticated using(bucket_id='stickers' and (select private.is_manager())) with check(bucket_id='stickers' and (select private.is_manager()));
drop policy if exists stickers_manager_delete on storage.objects;create policy stickers_manager_delete on storage.objects for delete to authenticated using(bucket_id='stickers' and (select private.is_manager()));

revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.is_manager() from public,anon,authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
commit;

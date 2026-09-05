-- BAMCO Task Management - phase 3
-- Roles, approval-only owner workflow, security-invoker task view, and ID continuation.

-- Exact manager accounts requested for the web app.
update public.profiles
set role = case
  when lower(email::text) in ('tanhaiyan@bamco.ir','ghaemizadeh@bamco.ir') then 'manager'
  else 'owner'
end;

-- New auth users inherit the same role rule.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    case when lower(new.email) in ('tanhaiyan@bamco.ir','ghaemizadeh@bamco.ir') then 'manager' else 'owner' end
  )
  on conflict(id) do update set
    email=excluded.email,
    role=excluded.role;
  return new;
end;
$$;

-- Owners can read only their own canonical task rows; managers can read all.
alter table public.tasks enable row level security;
drop policy if exists tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated
using (owner_id=(select auth.uid()) or (select public.is_manager()));

-- Owners never write directly to tasks. Managers can create/update/archive for anyone.
drop policy if exists tasks_manager_insert on public.tasks;
create policy tasks_manager_insert on public.tasks for insert to authenticated
with check ((select public.is_manager()));

drop policy if exists tasks_manager_update on public.tasks;
create policy tasks_manager_update on public.tasks for update to authenticated
using ((select public.is_manager()))
with check ((select public.is_manager()));

-- Every owner-side create/update/archive action must be a pending request for self-owned data.
alter table public.change_requests enable row level security;
drop policy if exists requests_read on public.change_requests;
create policy requests_read on public.change_requests for select to authenticated
using (requested_by=(select auth.uid()) or (select public.is_manager()));

drop policy if exists requests_create on public.change_requests;
create policy requests_create on public.change_requests for insert to authenticated
with check (
  requested_by=(select auth.uid())
  and request_status='pending'
  and (
    (select public.is_manager())
    or (
      request_type='create'
      and task_id is null
      and coalesce(proposed_data->>'owner_id','')=(select auth.uid())::text
    )
    or (
      request_type in ('update','archive')
      and exists (
        select 1 from public.tasks t
        where t.id=task_id and t.owner_id=(select auth.uid())
      )
    )
  )
);

-- Keep the dashboard/KANBAN/Archive view under caller RLS, so owners cannot bypass tasks_read.
create or replace view public.task_status_view with (security_invoker=true) as
select t.*,
  case
    when t.status='انجام شده' then 'وظیفه به پایان رسیده است'
    when t.due_date < current_date then 'دیرکرد'
    when t.due_date is not null and current_date >= (t.due_date - t.reminder_days) then 'دوره هشدار'
    else 'فاقد شرایط دیرکرد'
  end as due_state,
  case when t.due_date is null then null else abs(t.due_date-current_date) end as day_delta
from public.tasks t;

grant select on public.task_status_view to authenticated;

-- Continue numbering after the highest migrated TM task ID.
select setval(
  'public.task_id_seq',
  greatest(1170,coalesce((select max(coalesce(legacy_id,id)) from public.tasks),1170)),
  true
);

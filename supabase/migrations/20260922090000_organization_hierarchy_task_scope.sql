-- The organizational position tree is the canonical authority boundary for
-- day-to-day task supervision.  A user can see and operate on their own work
-- and on every occupied position below their active position; platform
-- managers retain their existing whole-organization authority.

create or replace function private.organization_actor_can_manage_user(
  p_actor uuid,
  p_target_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_actor is not null
    and (
      exists(
        select 1
        from public.profiles profile
        where profile.id = p_actor
          and profile.active
          and profile.role = 'manager'
      )
      or p_target_user = p_actor
      or p_target_user in (
        select scoped.user_id
        from public.organization_scope_user_ids(p_actor) scoped
      )
    ),
    false
  );
$$;

create or replace function public.organization_can_assign_task(p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and (
      p_target_user is null
      or private.organization_actor_can_manage_user(auth.uid(), p_target_user)
    );
$$;

create or replace function public.organization_can_manage_task(p_task_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.tasks task
    where task.id = p_task_id
      and (
        private.organization_actor_can_manage_user(auth.uid(), task.owner_id)
        or private.organization_actor_can_manage_user(auth.uid(), task.created_by)
      )
  );
$$;

-- This is the only client-readable directory for a non-manager.  It exposes
-- the current user's reporting branch (including vacant positions), while a
-- system manager receives the entire active tree.
create or replace function public.organization_scope_directory()
returns table(
  position_id bigint,
  parent_position_id bigint,
  position_title text,
  role_id bigint,
  role_key text,
  role_title text,
  role_level_no integer,
  occupant_id uuid,
  occupant_display_name text,
  occupant_full_name text,
  occupant_email text,
  occupant_active boolean,
  is_current_position boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive
  current_positions as (
    select assignment.position_id
    from public.organization_position_assignments assignment
    where assignment.user_id = auth.uid()
      and assignment.is_primary
      and assignment.valid_from <= current_date
      and (assignment.valid_to is null or assignment.valid_to >= current_date)
  ),
  seeds as (
    select position.id, position.parent_position_id
    from public.organization_positions position
    where position.active
      and (
        private.is_manager()
        or position.id in (select current_positions.position_id from current_positions)
      )
  ),
  tree(position_id, parent_position_id) as (
    select seed.id, seed.parent_position_id
    from seeds seed
    union
    select child.id, child.parent_position_id
    from public.organization_positions child
    join tree parent on parent.position_id = child.parent_position_id
    where child.active
  )
  select
    position.id,
    position.parent_position_id,
    position.title,
    role.id,
    role.role_key,
    role.title,
    role.level_no,
    assignment.user_id,
    profile.display_name,
    profile.full_name,
    profile.email,
    profile.active,
    position.id in (select current_positions.position_id from current_positions)
  from tree
  join public.organization_positions position on position.id = tree.position_id
  join public.organization_roles role on role.id = position.role_id and role.active
  left join lateral (
    select active_assignment.user_id
    from public.organization_position_assignments active_assignment
    where active_assignment.position_id = position.id
      and active_assignment.is_primary
      and active_assignment.valid_from <= current_date
      and (active_assignment.valid_to is null or active_assignment.valid_to >= current_date)
    order by active_assignment.id desc
    limit 1
  ) assignment on true
  left join public.profiles profile on profile.id = assignment.user_id
  order by role.level_no desc, position.title, position.id;
$$;

-- A direct write must respect the same boundary even if a caller bypasses the
-- visible controls.  Display-ID resequencing, account deletion and approved
-- requests keep their established internal paths.
create or replace function private.enforce_task_hierarchy_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if current_setting('bamco.resequencing', true) = '1'
     or nullif(current_setting('bamco.deleting_person', true), '') is not null
     or auth.role() = 'service_role'
     or v_actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.created_by is distinct from v_actor then
    raise exception 'ثبت‌کنندهٔ وظیفه باید کاربر جاری باشد.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'ثبت‌کنندهٔ وظیفه قابل تغییر نیست.' using errcode = '42501';
    end if;
    if not public.organization_can_manage_task(old.id) then
      raise exception 'این وظیفه در محدودهٔ سازمانی شما نیست.' using errcode = '42501';
    end if;
  end if;

  if not public.organization_can_assign_task(new.owner_id) then
    raise exception 'متولی باید خود شما یا یکی از زیردستان فعال شما در ساختار سازمانی باشد.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists task_hierarchy_scope on public.tasks;
create trigger task_hierarchy_scope
before insert or update on public.tasks
for each row execute function private.enforce_task_hierarchy_scope();

-- Replace the task table's legacy manager/owner rules with the hierarchy rule.
-- Deletion intentionally remains RPC-only so visible task IDs are resequenced
-- atomically.
alter table public.tasks enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'tasks'
  loop
    execute format('drop policy if exists %I on public.tasks', policy_row.policyname);
  end loop;
end;
$$;

create policy tasks_hierarchy_read
  on public.tasks for select to authenticated
  using (public.organization_can_manage_task(id));
create policy tasks_hierarchy_insert
  on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.organization_can_assign_task(owner_id)
  );
create policy tasks_hierarchy_update
  on public.tasks for update to authenticated
  using (public.organization_can_manage_task(id))
  with check (public.organization_can_assign_task(owner_id));

-- Position and assignment records use the same reporting-branch read rule.
-- Management writes remain restricted to the organizational administrator.
drop policy if exists organization_positions_authenticated_read on public.organization_positions;
create policy organization_positions_hierarchy_read
  on public.organization_positions for select to authenticated
  using (
    private.is_manager()
    or id in (select directory.position_id from public.organization_scope_directory() directory)
  );

drop policy if exists organization_position_assignments_authenticated_read on public.organization_position_assignments;
create policy organization_position_assignments_hierarchy_read
  on public.organization_position_assignments for select to authenticated
  using (
    private.is_manager()
    or position_id in (select directory.position_id from public.organization_scope_directory() directory)
  );

-- The public functions never accept an arbitrary actor ID; server functions
-- can still use the private helper above under their own definer context.
revoke all on function public.organization_scope_user_ids(uuid) from public, anon, authenticated;
revoke all on function private.organization_actor_can_manage_user(uuid, uuid) from public, anon, authenticated;
revoke all on function private.enforce_task_hierarchy_scope() from public, anon, authenticated;
revoke all on function public.organization_can_assign_task(uuid) from public, anon;
revoke all on function public.organization_can_manage_task(bigint) from public, anon;
revoke all on function public.organization_scope_directory() from public, anon;
grant execute on function public.organization_can_assign_task(uuid) to authenticated;
grant execute on function public.organization_can_manage_task(bigint) to authenticated;
grant execute on function public.organization_scope_directory() to authenticated;

create or replace function public.submit_change_request(
  p_request_type text,
  p_task_id bigint,
  p_proposed_data jsonb,
  p_note text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid bigint;
  before_snapshot jsonb;
  requested_owner uuid;
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles profile where profile.id = auth.uid() and profile.active) then
    raise exception 'نشست فعال لازم است' using errcode = '42501';
  end if;
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then
    raise exception 'اطلاعات درخواست نامعتبر است';
  end if;
  if p_request_type not in ('create','update','status','priority','description','complete','delete','due_date') then
    raise exception 'نوع درخواست نامعتبر است';
  end if;

  if p_request_type = 'create' then
    if nullif(btrim(p_proposed_data->>'title'), '') is null then
      raise exception 'عنوان فعالیت الزامی است';
    end if;
    requested_owner := nullif(p_proposed_data->>'owner_id', '')::uuid;
    if not public.organization_can_assign_task(requested_owner) then
      raise exception 'متولی باید در محدودهٔ سازمانی شما باشد.' using errcode = '42501';
    end if;
    p_proposed_data = coalesce(p_proposed_data, '{}'::jsonb)
      || jsonb_build_object(
        'status', coalesce(p_proposed_data->'status', '"ثبت شده"'::jsonb),
        'start_date', coalesce(p_proposed_data->'start_date', 'null'::jsonb),
        'due_date', coalesce(p_proposed_data->'due_date', 'null'::jsonb),
        'done_date', coalesce(p_proposed_data->'done_date', 'null'::jsonb)
      );
  else
    if not public.organization_can_manage_task(p_task_id) then
      raise exception 'این وظیفه در محدودهٔ سازمانی شما نیست' using errcode = '42501';
    end if;
    select to_jsonb(task) into before_snapshot
    from public.tasks task
    where task.id = p_task_id;
  end if;

  insert into public.change_requests(
    task_id, request_type, before_data, proposed_data, requested_by, request_status, requester_note
  ) values (
    p_task_id, p_request_type, before_snapshot,
    coalesce(p_proposed_data, '{}'::jsonb), auth.uid(), 'pending', p_note
  ) returning id into rid;

  perform private.route_change_request(rid);
  return rid;
end;
$$;

create or replace function public.delete_tasks_and_resequence(p_task_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer;
  v_authorized integer;
  v_count integer;
  v_start bigint;
begin
  select count(distinct selected.id)
  into v_requested
  from unnest(coalesce(p_task_ids, array[]::bigint[])) as selected(id)
  where selected.id is not null;
  if v_requested = 0 then
    raise exception 'هیچ وظیفه‌ای انتخاب نشده است';
  end if;

  select count(*) into v_authorized
  from public.tasks task
  where task.id = any(p_task_ids)
    and public.organization_can_manage_task(task.id);
  if v_authorized <> v_requested then
    raise exception 'حذف فقط برای وظایف خود یا زیردستان شما مجاز است.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bamco-task-display-id-resequence', 0));
  lock table public.tasks in share row exclusive mode;
  perform private.ensure_task_display_ids_contiguous();
  select min(task.legacy_id) into v_start from public.tasks task where task.id = any(p_task_ids);
  delete from public.tasks where id = any(p_task_ids);
  get diagnostics v_count = row_count;
  if v_count <> v_requested then
    raise exception 'تعداد وظایف حذف‌شده با انتخاب شما یکسان نیست.';
  end if;
  if v_start is not null then
    perform private.resequence_task_display_ids_from(v_start);
  end if;
  return v_count;
end;
$$;

create or replace function public.restore_tasks_to_kanban_and_resequence(p_task_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer;
  v_authorized integer;
  v_count integer;
begin
  select count(distinct selected.id)
  into v_requested
  from unnest(coalesce(p_task_ids, array[]::bigint[])) as selected(id)
  where selected.id is not null;
  if v_requested = 0 then
    raise exception 'هیچ وظیفه‌ای انتخاب نشده است';
  end if;

  select count(*) into v_authorized
  from public.tasks task
  where task.id = any(p_task_ids)
    and task.archived
    and public.organization_can_manage_task(task.id);
  if v_authorized <> v_requested then
    raise exception 'بازگردانی فقط برای وظایف آرشیوی خود یا زیردستان شما مجاز است.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.tasks task
    where task.id = any(p_task_ids)
      and task.archived
      and (task.owner_id is null or task.start_date is null or task.due_date is null)
  ) then
    raise exception 'برای بازگشت به کانبان، متولی و تاریخ شروع و پایان باید کامل باشد';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bamco-task-display-id-resequence', 0));
  lock table public.tasks in share row exclusive mode;
  update public.tasks
  set archived = false, archived_at = null, status = 'در حال انجام', done_date = null
  where id = any(p_task_ids) and archived;
  get diagnostics v_count = row_count;
  if v_count <> v_requested then
    raise exception 'تعداد وظایف بازگردانی‌شده با انتخاب شما یکسان نیست.';
  end if;
  perform private.ensure_task_display_ids_contiguous();
  return v_count;
end;
$$;

revoke all on function public.delete_tasks_and_resequence(bigint[]) from public, anon;
revoke all on function public.restore_tasks_to_kanban_and_resequence(bigint[]) from public, anon;
grant execute on function public.delete_tasks_and_resequence(bigint[]) to authenticated, service_role;
grant execute on function public.restore_tasks_to_kanban_and_resequence(bigint[]) to authenticated, service_role;

notify pgrst, 'reload schema';

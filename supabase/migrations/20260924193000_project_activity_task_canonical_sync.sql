-- Activities are canonical task-engine records as well as project WBS rows.
-- Phases and milestones remain project-planning nodes; only activities appear
-- in Kanban.  The trigger depth guard prevents reciprocal updates looping.

update public.project_items
set priority = 'urgent'
where priority = 'high';

create or replace function private.project_item_task_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'in_progress' then 'در حال انجام'
    when 'waiting' then 'منتظر پاسخ'
    when 'completed' then 'انجام شده'
    else 'ثبت شده'
  end;
$$;

create or replace function private.task_project_item_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'در حال انجام' then 'in_progress'
    when 'منتظر پاسخ' then 'waiting'
    when 'انجام شده' then 'completed'
    when 'انجام‌شده' then 'completed'
    else 'planned'
  end;
$$;

create or replace function private.project_item_task_priority(p_priority text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_priority when 'urgent' then 'فوری' when 'low' then 'کم' else 'متوسط' end;
$$;

create or replace function private.task_project_item_priority(p_priority text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_priority when 'فوری' then 'urgent' when 'کم' then 'low' else 'medium' end;
$$;

create or replace function private.sync_project_activity_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id bigint;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.item_type = 'activity' and old.task_id is not null then
      delete from public.tasks where id = old.task_id;
    end if;
    return old;
  end if;

  if new.item_type <> 'activity' then
    if new.task_id is not null then
      update public.tasks set archived = true, archived_at = now() where id = new.task_id;
    end if;
    return new;
  end if;

  if new.task_id is null then
    insert into public.tasks(title, description, owner_id, status, priority, start_date, due_date, created_by, source)
    values (new.title, new.description, new.owner_id, private.project_item_task_status(new.status), private.project_item_task_priority(new.priority), new.planned_start, new.planned_end, new.created_by, 'project')
    returning id into v_task_id;
    update public.project_items set task_id = v_task_id where id = new.id;
  else
    update public.tasks
    set title = new.title,
        description = new.description,
        owner_id = new.owner_id,
        status = private.project_item_task_status(new.status),
        priority = private.project_item_task_priority(new.priority),
        start_date = new.planned_start,
        due_date = new.planned_end,
        archived = false,
        archived_at = null
    where id = new.task_id;
  end if;
  return new;
end;
$$;

create or replace function private.sync_task_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  update public.project_items
  set title = new.title,
      description = new.description,
      owner_id = new.owner_id,
      status = private.task_project_item_status(new.status),
      priority = private.task_project_item_priority(new.priority),
      planned_start = new.start_date,
      planned_end = new.due_date,
      progress = case when new.archived or private.task_project_item_status(new.status) = 'completed' then 100 else progress end,
      updated_at = now()
  where task_id = new.id and item_type = 'activity';
  return new;
end;
$$;

create or replace function private.rollup_project_phase_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id bigint := coalesce(new.project_id, old.project_id);
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  update public.project_items phase
  set progress = coalesce((
    select round(sum(child.progress * coalesce(nullif(child.weight, 0), 1)) / nullif(sum(coalesce(nullif(child.weight, 0), 1)), 0), 2)
    from public.project_items child
    where child.parent_item_id = phase.id
  ), 0), updated_at = now()
  where phase.project_id = v_project_id and phase.item_type = 'phase';
  return coalesce(new, old);
end;
$$;

drop trigger if exists project_item_activity_task_sync on public.project_items;
create trigger project_item_activity_task_sync
after insert or update or delete on public.project_items
for each row execute function private.sync_project_activity_task();

drop trigger if exists task_project_activity_sync on public.tasks;
create trigger task_project_activity_sync
after update of title, description, owner_id, status, priority, start_date, due_date, archived on public.tasks
for each row execute function private.sync_task_project_activity();

drop trigger if exists project_phase_progress_rollup on public.project_items;
create trigger project_phase_progress_rollup
after insert or update or delete on public.project_items
for each row execute function private.rollup_project_phase_progress();

-- Backfill existing activities without a Kanban task through the same contract.
update public.project_items
set updated_at = now()
where item_type = 'activity' and task_id is null;

-- Keep requester cancellation metadata separate from the manager's review note.
alter table public.change_requests
  add column if not exists cancellation_note text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

comment on column public.change_requests.manager_note is
  'A note written by the manager/approver during review; never a requester cancellation reason.';
comment on column public.change_requests.cancellation_note is
  'The requester cancellation reason, if the request was cancelled by its submitter.';

update public.change_requests request
set cancellation_note = coalesce(request.cancellation_note, request.manager_note, 'لغو توسط ثبت‌کننده'),
    cancelled_by = coalesce(request.cancelled_by, request.reviewed_by, request.requested_by),
    manager_note = (
      select nullif(btrim(event.note), '')
      from public.change_request_events event
      where event.request_id = request.id
        and event.actor_id is distinct from request.requested_by
        and event.event_type in ('needs_revision', 'rejected', 'approved')
        and nullif(btrim(event.note), '') is not null
      order by event.id desc
      limit 1
    ),
    reviewed_by = null
where request.request_status = 'cancelled'
  and request.reviewed_by is not distinct from request.requested_by;

create or replace function public.cancel_change_request(
  p_request_id bigint,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.change_requests%rowtype;
  v_note text := coalesce(nullif(btrim(p_note), ''), 'لغو توسط ثبت‌کننده');
begin
  if auth.uid() is null
     or not private.feature_can_access_for(auth.uid(), 'kanban', 'edit') then
    raise exception 'مجوز لغو درخواست را ندارید.' using errcode = '42501';
  end if;

  select * into v_request
  from public.change_requests
  where id = p_request_id
    and requested_by = auth.uid()
    and request_status in ('pending', 'in_review', 'needs_revision')
  for update;
  if not found then
    raise exception 'درخواست قابل لغو پیدا نشد.' using errcode = '42501';
  end if;

  if v_request.organization_workflow_id is not null then
    update public.organization_workflows
    set status = 'cancelled', updated_at = now()
    where id = v_request.organization_workflow_id;
  end if;

  update public.change_requests
  set request_status = 'cancelled',
      cancellation_note = v_note,
      cancelled_by = auth.uid(),
      reviewed_by = null,
      reviewed_at = now(),
      completed_at = now()
  where id = v_request.id;

  insert into public.change_request_events(request_id, actor_id, event_type, note, snapshot)
  values(p_request_id, auth.uid(), 'cancelled', v_note, jsonb_build_object('cancelled_by_requester', true));
end;
$$;

revoke all on function public.cancel_change_request(bigint, text) from public, anon;
grant execute on function public.cancel_change_request(bigint, text) to authenticated;

-- Project and Kanban now store and display the exact same canonical status
-- label. Legacy project-only keys remain accepted as input during transition.
create or replace function private.project_item_task_status(p_status text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (private.task_status_option(p_status)).label,
    (private.task_status_option(case p_status
      when 'draft' then 'registered'
      when 'planned' then 'registered'
      when 'in_progress' then 'doing'
      when 'waiting' then 'waiting'
      when 'completed' then 'done'
      else p_status
    end)).label,
    p_status
  );
$$;

create or replace function private.task_project_item_status(p_status text)
returns text
language sql
stable
set search_path = ''
as $$
  select private.project_item_task_status(p_status);
$$;

create or replace function private.canonicalize_project_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status := private.project_item_task_status(new.status);
  return new;
end;
$$;

revoke all on function private.project_item_task_status(text),
  private.task_project_item_status(text),
  private.canonicalize_project_status() from public, anon, authenticated;

drop trigger if exists projects_canonical_status on public.projects;
create trigger projects_canonical_status
before insert or update of status on public.projects
for each row execute function private.canonicalize_project_status();

drop trigger if exists project_items_canonical_status on public.project_items;
create trigger project_items_canonical_status
before insert or update of status on public.project_items
for each row execute function private.canonicalize_project_status();

create or replace function private.sync_project_activity_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id bigint;
  v_task_status text;
  v_status_kind text;
  v_completed boolean;
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

  v_task_status := private.project_item_task_status(new.status);
  select status_option.kind into v_status_kind
  from private.task_status_option(v_task_status) status_option;
  v_completed := coalesce(v_status_kind = 'completed', false);

  if new.task_id is null then
    insert into public.tasks(
      title, description, owner_id, status, priority, start_date, due_date,
      done_date, archived, archived_at, created_by, source
    ) values (
      new.title, new.description, new.owner_id, v_task_status,
      private.project_item_task_priority(new.priority), new.planned_start, new.planned_end,
      case when v_completed then current_date else null end,
      v_completed, case when v_completed then now() else null end,
      new.created_by, 'project'
    ) returning id into v_task_id;
    update public.project_items set task_id = v_task_id where id = new.id;
  else
    update public.tasks
    set title = new.title,
        description = new.description,
        owner_id = new.owner_id,
        status = v_task_status,
        priority = private.project_item_task_priority(new.priority),
        start_date = new.planned_start,
        due_date = new.planned_end,
        done_date = case when v_completed then coalesce(done_date, current_date) else null end,
        archived = v_completed,
        archived_at = case when v_completed then coalesce(archived_at, now()) else null end
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
      progress = case
        when new.archived or coalesce((private.task_status_option(new.status)).kind = 'completed', false) then 100
        else progress
      end,
      updated_at = now()
  where task_id = new.id and item_type = 'activity';
  return new;
end;
$$;

revoke all on function private.sync_project_activity_task(),
  private.sync_task_project_activity() from public, anon, authenticated;

update public.projects
set status = private.project_item_task_status(status)
where status is distinct from private.project_item_task_status(status);

update public.project_items
set status = private.project_item_task_status(status), updated_at = now()
where status is distinct from private.project_item_task_status(status);

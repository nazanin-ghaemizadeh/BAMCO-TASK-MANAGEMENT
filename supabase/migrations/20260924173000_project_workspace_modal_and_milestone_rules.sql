-- Project workspace: unweighted progress, point milestones and cycle-safe WBS.
-- Existing milestones are normalized before the point-in-time constraint is added.
update public.project_items
set planned_start = coalesce(planned_start, planned_end),
    planned_end = coalesce(planned_start, planned_end)
where item_type = 'milestone'
  and planned_start is distinct from planned_end;

alter table public.project_items
  drop constraint if exists project_items_milestone_single_date;
alter table public.project_items
  add constraint project_items_milestone_single_date
  check (item_type <> 'milestone' or ((planned_start is null and planned_end is null) or planned_end = planned_start));

-- Weight is retained only for backward compatibility with existing rows; new
-- project progress is the plain average of executable work items.
create or replace function public.project_calculated_progress(p_project_id bigint)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(round(avg(i.progress), 2), 0)
  from public.project_items i
  where i.project_id = p_project_id
    and i.item_type in ('activity', 'task', 'subtask', 'milestone');
$$;

create or replace function private.prevent_project_item_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_item_id is null then
    return new;
  end if;

  if new.parent_item_id = new.id then
    raise exception 'یک آیتم نمی‌تواند بالادست خودش باشد';
  end if;

  if not exists (
    select 1 from public.project_items p
    where p.id = new.parent_item_id and p.project_id = new.project_id
  ) then
    raise exception 'آیتم بالادست باید متعلق به همین پروژه باشد';
  end if;

  if exists (
    with recursive ancestors(id, parent_item_id) as (
      select p.id, p.parent_item_id
      from public.project_items p
      where p.id = new.parent_item_id
      union all
      select p.id, p.parent_item_id
      from public.project_items p
      join ancestors a on a.parent_item_id = p.id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'ساختار شکست نمی‌تواند حلقوی باشد';
  end if;

  return new;
end;
$$;

drop trigger if exists project_item_parent_cycle_guard on public.project_items;
create trigger project_item_parent_cycle_guard
before insert or update of parent_item_id, project_id on public.project_items
for each row execute function private.prevent_project_item_cycle();

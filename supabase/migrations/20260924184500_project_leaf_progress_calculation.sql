-- Project progress is derived from the actual executable leaves of the WBS.
-- A phase without children is itself a leaf, so entering its progress updates
-- the project immediately; otherwise only its underlying activities/milestones
-- are counted and there is no double counting.
create or replace function public.project_calculated_progress(p_project_id bigint)
returns numeric
language sql
stable
set search_path = ''
as $$
  with project_rows as (
    select i.id, i.parent_item_id, i.progress
    from public.project_items i
    where i.project_id = p_project_id
      and i.item_type in ('phase', 'activity', 'milestone')
  ), leaf_rows as (
    select p.progress
    from project_rows p
    where not exists (
      select 1 from project_rows child where child.parent_item_id = p.id
    )
  )
  select coalesce(round(avg(progress), 2), 0) from leaf_rows;
$$;

update public.projects p
set progress = public.project_calculated_progress(p.id),
    updated_at = now()
where p.progress_override is null;

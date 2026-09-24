-- Every parent in the WBS follows the progress of its direct children.
-- The loop settles from the leaves upward, so a nested activity updates its
-- activity parent, phase and project in the same transaction.
create or replace function private.rollup_project_phase_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id bigint := coalesce(new.project_id, old.project_id);
  v_changed integer := 0;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  loop
    with rollup as (
      select parent.id,
             round(sum(child.progress * coalesce(nullif(child.weight, 0), 1)) / nullif(sum(coalesce(nullif(child.weight, 0), 1)), 0), 2) as progress
      from public.project_items parent
      join public.project_items child on child.parent_item_id = parent.id
      where parent.project_id = v_project_id
      group by parent.id
    )
    update public.project_items parent
    set progress = rollup.progress, updated_at = now()
    from rollup
    where parent.id = rollup.id
      and parent.progress is distinct from rollup.progress;
    get diagnostics v_changed = row_count;
    exit when v_changed = 0;
  end loop;
  return coalesce(new, old);
end;
$$;

-- Recalculate existing project rows once with the new hierarchy rule.
update public.project_items set updated_at = now();

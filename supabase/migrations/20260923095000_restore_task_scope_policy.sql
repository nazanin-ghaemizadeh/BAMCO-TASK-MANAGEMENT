-- The accelerated policy must call the authenticated public manager predicate;
-- private.is_system_manager is intentionally not executable by browser roles.
drop policy if exists tasks_scope_read on public.tasks;
create policy tasks_scope_read
  on public.tasks for select to authenticated
  using (
    (
      (not archived and (
        (select public.can_access_feature('kanban','view'))
        or (select public.can_access_feature('taskTimeline','view'))
      ))
      or (archived and (select public.can_access_feature('archive','view')))
    )
    and (
      (owner_id is null and (select public.bamco_is_system_manager()))
      or (owner_id is not null and (select public.bamco_is_system_manager()))
      or owner_id in (
        select scoped.user_id
        from public.organization_scope_user_ids((select auth.uid())) scoped
      )
    )
  );

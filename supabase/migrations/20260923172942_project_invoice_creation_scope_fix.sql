begin;

alter table public.projects enable row level security;
alter table public.invoices enable row level security;

drop policy if exists projects_feature_insert on public.projects;
create policy projects_feature_insert on public.projects
  for insert to authenticated
  with check (
    public.can_access_feature('projects','create')
    and created_by = (select auth.uid())
    and owner_id = manager_id
    and (
      owner_id = (select auth.uid())
      or owner_id in (
        select descendant.user_id
        from public.bamco_strict_descendant_user_ids() as descendant(user_id)
      )
    )
  );

drop policy if exists invoices_feature_insert on public.invoices;
create policy invoices_feature_insert on public.invoices
  for insert to authenticated
  with check (
    public.can_access_feature('invoices','create')
    and created_by = (select auth.uid())
    and coalesce(follow_up_owner_id, created_by) = (select auth.uid())
  );

commit;

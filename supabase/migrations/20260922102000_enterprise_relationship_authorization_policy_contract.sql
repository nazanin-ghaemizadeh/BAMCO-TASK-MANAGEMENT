-- Canonical auth-bound policy helpers.
--
-- The enterprise consolidation deliberately keeps implementation helpers in
-- `private`.  RLS executes as the authenticated role, however, so a policy
-- must never call a revoked helper directly.  These zero-actor wrappers bind
-- every decision to auth.uid() and avoid exposing arbitrary-actor predicates.

create or replace function public.bamco_is_system_manager()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null and private.is_system_manager(auth.uid());
$$;

create or replace function public.bamco_can_access_request(p_request_id bigint)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and private.request_user_is_participant(p_request_id,auth.uid());
$$;

create or replace function public.bamco_can_direct_manage_organization_user(p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null
    and private.organization_actor_can_direct_manage_user(auth.uid(),p_target_user);
$$;

create or replace function public.bamco_strict_descendant_user_ids()
returns table(user_id uuid)
language sql
stable
security definer
set search_path=''
as $$
  select descendant.user_id
  from private.organization_strict_descendant_user_ids(auth.uid()) descendant
  where auth.uid() is not null;
$$;

revoke all on function public.bamco_is_system_manager() from public,anon;
revoke all on function public.bamco_can_access_request(bigint) from public,anon;
revoke all on function public.bamco_can_direct_manage_organization_user(uuid) from public,anon;
revoke all on function public.bamco_strict_descendant_user_ids() from public,anon;
grant execute on function public.bamco_is_system_manager() to authenticated;
grant execute on function public.bamco_can_access_request(bigint) to authenticated;
grant execute on function public.bamco_can_direct_manage_organization_user(uuid) to authenticated;
grant execute on function public.bamco_strict_descendant_user_ids() to authenticated;

-- Direct policies now call only public auth-bound contracts or the already
-- auth-bound `can_access_feature` RPC.  This also makes their authorization
-- source legible in the policy itself.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using(
    id=auth.uid()
    or public.bamco_is_system_manager()
    or (
      public.can_access_feature('organization','view')
      and id in (select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped)
    )
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using(
    id=auth.uid() or public.bamco_is_system_manager()
  ) with check(
    id=auth.uid() or public.bamco_is_system_manager()
  );

drop policy if exists organization_positions_scope_read on public.organization_positions;
create policy organization_positions_scope_read on public.organization_positions
  for select to authenticated using(
    public.bamco_is_system_manager()
    or (
      public.can_access_feature('organization','view')
      and id in (
        select directory.position_id
        from public.organization_scope_directory() directory
      )
    )
  );

drop policy if exists organization_position_assignments_scope_read on public.organization_position_assignments;
create policy organization_position_assignments_scope_read on public.organization_position_assignments
  for select to authenticated using(
    public.bamco_is_system_manager()
    or (
      public.can_access_feature('organization','view')
      and position_id in (
        select directory.position_id
        from public.organization_scope_directory() directory
      )
    )
  );

drop policy if exists feature_access_grants_read on public.feature_access_grants;
create policy feature_access_grants_read on public.feature_access_grants
  for select to authenticated using(
    user_id=auth.uid()
    or public.bamco_is_system_manager()
    or public.can_access_feature('settings','manage_access')
    or (
      subject_kind='organization_role'
      and exists(
        select 1
        from public.organization_position_assignments assignment
        join public.organization_positions position
          on position.id=assignment.position_id and position.active
        where assignment.user_id=auth.uid()
          and assignment.is_primary
          and assignment.valid_from<=current_date
          and (assignment.valid_to is null or assignment.valid_to>current_date)
          and position.role_id=feature_access_grants.role_id
      )
    )
  );

drop policy if exists organization_role_permissions_feature_read on public.organization_role_permissions;
create policy organization_role_permissions_feature_read on public.organization_role_permissions
  for select to authenticated using(public.can_access_feature('organization','edit'));

drop policy if exists permission_catalog_feature_read on public.permission_catalog;
create policy permission_catalog_feature_read on public.permission_catalog
  for select to authenticated using(public.can_access_feature('organization','edit'));

drop policy if exists change_requests_participant_read on public.change_requests;
create policy change_requests_participant_read on public.change_requests
  for select to authenticated using(
    public.can_access_feature('approvals','view')
    and public.bamco_can_access_request(id)
  );

drop policy if exists change_request_events_participant_read on public.change_request_events;
create policy change_request_events_participant_read on public.change_request_events
  for select to authenticated using(
    public.can_access_feature('approvals','view')
    and public.bamco_can_access_request(request_id)
  );

drop policy if exists organization_workflows_participant_read on public.organization_workflows;
create policy organization_workflows_participant_read on public.organization_workflows
  for select to authenticated using(
    public.can_access_feature('approvals','view')
    and public.bamco_can_access_request(request_id)
  );

drop policy if exists organization_workflow_steps_participant_read on public.organization_workflow_steps;
create policy organization_workflow_steps_participant_read on public.organization_workflow_steps
  for select to authenticated using(
    public.can_access_feature('approvals','view')
    and exists(
      select 1
      from public.organization_workflows workflow
      where workflow.id=organization_workflow_steps.workflow_id
        and public.bamco_can_access_request(workflow.request_id)
    )
  );

drop policy if exists projects_feature_insert on public.projects;
create policy projects_feature_insert on public.projects
  for insert to authenticated with check(
    public.can_access_feature('projects','create')
    and created_by=auth.uid()
    and (
      owner_id=auth.uid()
      or owner_id in (select descendant.user_id from public.bamco_strict_descendant_user_ids() descendant)
    )
  );

drop policy if exists tasks_direct_update on public.tasks;
create policy tasks_direct_update on public.tasks
  for update to authenticated using(public.organization_can_manage_task(id))
  with check(
    public.bamco_can_direct_manage_organization_user(coalesce(owner_id,created_by))
    and public.can_access_feature('kanban','edit')
  );

drop policy if exists invoices_feature_update on public.invoices;
create policy invoices_feature_update on public.invoices
  for update to authenticated using(
    public.can_access_feature('invoices','edit')
    and (created_by=auth.uid() or follow_up_owner_id=auth.uid() or public.bamco_is_system_manager())
  ) with check(public.can_access_feature('invoices','edit'));

drop policy if exists invoices_feature_delete on public.invoices;
create policy invoices_feature_delete on public.invoices
  for delete to authenticated using(
    public.can_access_feature('invoices','delete')
    and (created_by=auth.uid() or public.bamco_is_system_manager())
  );

drop policy if exists site_definitions_feature_insert on public.site_definitions;
create policy site_definitions_feature_insert on public.site_definitions
  for insert to authenticated with check(
    created_by=auth.uid()
    and (
      (kind='personal' and owner_user_id=auth.uid() and scope='owner' and active
       and public.can_access_feature('sitesAccess','create'))
      or (kind='organization' and owner_user_id is null
          and public.can_access_feature('sitesAccess','manage_access'))
    )
  );

drop policy if exists site_definitions_feature_update on public.site_definitions;
create policy site_definitions_feature_update on public.site_definitions
  for update to authenticated using(
    (kind='personal' and owner_user_id=auth.uid() and public.can_access_feature('sitesAccess','edit'))
    or (kind='organization' and public.can_access_feature('sitesAccess','manage_access'))
  ) with check(
    (kind='personal' and owner_user_id=auth.uid() and scope='owner'
     and public.can_access_feature('sitesAccess','edit'))
    or (kind='organization' and owner_user_id is null
        and public.can_access_feature('sitesAccess','manage_access'))
  );

drop policy if exists site_definitions_feature_delete on public.site_definitions;
create policy site_definitions_feature_delete on public.site_definitions
  for delete to authenticated using(
    (kind='personal' and owner_user_id=auth.uid() and public.can_access_feature('sitesAccess','delete'))
    or (kind='organization' and public.can_access_feature('sitesAccess','manage_access'))
  );

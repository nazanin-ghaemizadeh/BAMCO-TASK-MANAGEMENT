-- Harden the organizational platform policies after production rollout.
-- Read and write policies are intentionally separated so RLS remains predictable.

create policy permission_catalog_authenticated_read
  on public.permission_catalog for select to authenticated using (true);
create policy organization_settings_authenticated_read
  on public.organization_settings for select to authenticated using (true);

drop policy if exists organization_manage_write on public.organization_positions;
create policy organization_positions_manage_insert on public.organization_positions
  for insert to authenticated with check (private.platform_can_manage_org());
create policy organization_positions_manage_update on public.organization_positions
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy organization_positions_manage_delete on public.organization_positions
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists organization_assignments_manage_write on public.organization_position_assignments;
create policy organization_assignments_manage_insert on public.organization_position_assignments
  for insert to authenticated with check (private.platform_can_manage_org());
create policy organization_assignments_manage_update on public.organization_position_assignments
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy organization_assignments_manage_delete on public.organization_position_assignments
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists organization_units_manage_write on public.organization_units;
create policy organization_units_manage_insert on public.organization_units
  for insert to authenticated with check (private.platform_can_manage_org());
create policy organization_units_manage_update on public.organization_units
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy organization_units_manage_delete on public.organization_units
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists organization_roles_manage_write on public.organization_roles;
create policy organization_roles_manage_insert on public.organization_roles
  for insert to authenticated with check (private.platform_can_manage_org());
create policy organization_roles_manage_update on public.organization_roles
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy organization_roles_manage_delete on public.organization_roles
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists organization_permissions_manage_write on public.organization_role_permissions;
create policy organization_permissions_manage_insert on public.organization_role_permissions
  for insert to authenticated with check (private.platform_can_manage_org());
create policy organization_permissions_manage_update on public.organization_role_permissions
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy organization_permissions_manage_delete on public.organization_role_permissions
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists approval_policies_manage_write on public.approval_policies;
create policy approval_policies_manage_insert on public.approval_policies
  for insert to authenticated with check (private.platform_can_manage_org());
create policy approval_policies_manage_update on public.approval_policies
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy approval_policies_manage_delete on public.approval_policies
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists approval_policy_steps_manage_write on public.approval_policy_steps;
create policy approval_policy_steps_manage_insert on public.approval_policy_steps
  for insert to authenticated with check (private.platform_can_manage_org());
create policy approval_policy_steps_manage_update on public.approval_policy_steps
  for update to authenticated using (private.platform_can_manage_org()) with check (private.platform_can_manage_org());
create policy approval_policy_steps_manage_delete on public.approval_policy_steps
  for delete to authenticated using (private.platform_can_manage_org());

drop policy if exists project_scoped_write on public.projects;
create policy projects_scoped_insert on public.projects
  for insert to authenticated
  with check (created_by=auth.uid() or owner_id=auth.uid() or public.organization_has_permission('project.create',owner_id));
create policy projects_scoped_update on public.projects
  for update to authenticated
  using (created_by=auth.uid() or owner_id=auth.uid() or public.organization_has_permission('project.edit',owner_id))
  with check (created_by=auth.uid() or owner_id=auth.uid() or public.organization_has_permission('project.edit',owner_id));
create policy projects_scoped_delete on public.projects
  for delete to authenticated
  using (created_by=auth.uid() or owner_id=auth.uid() or public.organization_has_permission('project.delete',owner_id));

drop policy if exists part_scoped_write on public.parts;
create policy parts_scoped_insert on public.parts
  for insert to authenticated
  with check (created_by=auth.uid() or public.organization_has_permission('part.create',null));
create policy parts_scoped_update on public.parts
  for update to authenticated
  using (created_by=auth.uid() or public.organization_has_permission('part.edit',null))
  with check (created_by=auth.uid() or public.organization_has_permission('part.edit',null));
create policy parts_scoped_delete on public.parts
  for delete to authenticated
  using (created_by=auth.uid() or public.organization_has_permission('part.edit',null));

drop policy if exists invoice_scoped_write on public.invoices;
create policy invoices_scoped_insert on public.invoices
  for insert to authenticated
  with check (created_by=auth.uid() or public.organization_has_permission('invoice.create',null));
create policy invoices_scoped_update on public.invoices
  for update to authenticated
  using (created_by=auth.uid() or follow_up_owner_id=auth.uid() or public.organization_has_permission('invoice.approve',null))
  with check (created_by=auth.uid() or follow_up_owner_id=auth.uid() or public.organization_has_permission('invoice.approve',null));
create policy invoices_scoped_delete on public.invoices
  for delete to authenticated
  using (created_by=auth.uid() or public.organization_has_permission('invoice.approve',null));

drop policy if exists project_members_scoped on public.project_members;
create policy project_members_scoped_read on public.project_members for select to authenticated using (public.platform_can_access_project(project_id));
create policy project_members_scoped_insert on public.project_members for insert to authenticated with check (public.platform_can_access_project(project_id));
create policy project_members_scoped_update on public.project_members for update to authenticated using (public.platform_can_access_project(project_id)) with check (public.platform_can_access_project(project_id));
create policy project_members_scoped_delete on public.project_members for delete to authenticated using (public.platform_can_access_project(project_id));

drop policy if exists project_items_scoped on public.project_items;
create policy project_items_scoped_read on public.project_items for select to authenticated using (public.platform_can_access_project(project_id));
create policy project_items_scoped_insert on public.project_items for insert to authenticated with check (public.platform_can_access_project(project_id));
create policy project_items_scoped_update on public.project_items for update to authenticated using (public.platform_can_access_project(project_id)) with check (public.platform_can_access_project(project_id));
create policy project_items_scoped_delete on public.project_items for delete to authenticated using (public.platform_can_access_project(project_id));

drop policy if exists project_dependencies_scoped on public.project_dependencies;
create policy project_dependencies_scoped_read on public.project_dependencies for select to authenticated using (exists(select 1 from public.project_items i where i.id=predecessor_item_id and public.platform_can_access_project(i.project_id)));
create policy project_dependencies_scoped_insert on public.project_dependencies for insert to authenticated with check (exists(select 1 from public.project_items p join public.project_items s on s.project_id=p.project_id where p.id=predecessor_item_id and s.id=successor_item_id and public.platform_can_access_project(p.project_id)));
create policy project_dependencies_scoped_update on public.project_dependencies for update to authenticated using (exists(select 1 from public.project_items i where i.id=predecessor_item_id and public.platform_can_access_project(i.project_id))) with check (exists(select 1 from public.project_items p join public.project_items s on s.project_id=p.project_id where p.id=predecessor_item_id and s.id=successor_item_id and public.platform_can_access_project(p.project_id)));
create policy project_dependencies_scoped_delete on public.project_dependencies for delete to authenticated using (exists(select 1 from public.project_items i where i.id=predecessor_item_id and public.platform_can_access_project(i.project_id)));

drop policy if exists part_bom_scoped on public.part_bom;
create policy part_bom_scoped_read on public.part_bom for select to authenticated using (public.platform_can_access_part(parent_part_id) or public.platform_can_access_part(child_part_id));
create policy part_bom_scoped_insert on public.part_bom for insert to authenticated with check (public.platform_can_access_part(parent_part_id));
create policy part_bom_scoped_update on public.part_bom for update to authenticated using (public.platform_can_access_part(parent_part_id)) with check (public.platform_can_access_part(parent_part_id));
create policy part_bom_scoped_delete on public.part_bom for delete to authenticated using (public.platform_can_access_part(parent_part_id));

drop policy if exists part_vehicle_links_scoped on public.part_vehicle_links;
create policy part_vehicle_links_scoped_read on public.part_vehicle_links for select to authenticated using (public.platform_can_access_part(part_id));
create policy part_vehicle_links_scoped_insert on public.part_vehicle_links for insert to authenticated with check (public.platform_can_access_part(part_id));
create policy part_vehicle_links_scoped_update on public.part_vehicle_links for update to authenticated using (public.platform_can_access_part(part_id)) with check (public.platform_can_access_part(part_id));
create policy part_vehicle_links_scoped_delete on public.part_vehicle_links for delete to authenticated using (public.platform_can_access_part(part_id));

drop policy if exists part_project_links_scoped on public.part_project_links;
create policy part_project_links_scoped_read on public.part_project_links for select to authenticated using (public.platform_can_access_part(part_id) or public.platform_can_access_project(project_id));
create policy part_project_links_scoped_insert on public.part_project_links for insert to authenticated with check (public.platform_can_access_part(part_id) or public.platform_can_access_project(project_id));
create policy part_project_links_scoped_update on public.part_project_links for update to authenticated using (public.platform_can_access_part(part_id) or public.platform_can_access_project(project_id)) with check (public.platform_can_access_part(part_id) or public.platform_can_access_project(project_id));
create policy part_project_links_scoped_delete on public.part_project_links for delete to authenticated using (public.platform_can_access_part(part_id) or public.platform_can_access_project(project_id));

drop policy if exists part_test_links_scoped on public.part_test_links;
create policy part_test_links_scoped_read on public.part_test_links for select to authenticated using (public.platform_can_access_part(part_id));
create policy part_test_links_scoped_insert on public.part_test_links for insert to authenticated with check (public.platform_can_access_part(part_id));
create policy part_test_links_scoped_update on public.part_test_links for update to authenticated using (public.platform_can_access_part(part_id)) with check (public.platform_can_access_part(part_id));
create policy part_test_links_scoped_delete on public.part_test_links for delete to authenticated using (public.platform_can_access_part(part_id));

drop policy if exists invoice_payments_scoped on public.invoice_payments;
create policy invoice_payments_scoped_read on public.invoice_payments for select to authenticated using (public.platform_can_access_invoice(invoice_id));
create policy invoice_payments_scoped_insert on public.invoice_payments for insert to authenticated with check (public.platform_can_access_invoice(invoice_id));
create policy invoice_payments_scoped_update on public.invoice_payments for update to authenticated using (public.platform_can_access_invoice(invoice_id)) with check (public.platform_can_access_invoice(invoice_id));
create policy invoice_payments_scoped_delete on public.invoice_payments for delete to authenticated using (public.platform_can_access_invoice(invoice_id));

drop policy if exists invoice_files_scoped on public.invoice_files;
create policy invoice_files_scoped_read on public.invoice_files for select to authenticated using (public.platform_can_access_invoice(invoice_id));
create policy invoice_files_scoped_insert on public.invoice_files for insert to authenticated with check (public.platform_can_access_invoice(invoice_id));
create policy invoice_files_scoped_update on public.invoice_files for update to authenticated using (public.platform_can_access_invoice(invoice_id)) with check (public.platform_can_access_invoice(invoice_id));
create policy invoice_files_scoped_delete on public.invoice_files for delete to authenticated using (public.platform_can_access_invoice(invoice_id));

revoke execute on function public.organization_scope_user_ids(uuid) from anon;
revoke execute on function public.organization_has_permission(text,uuid) from anon;
revoke execute on function public.platform_can_access_project(bigint) from anon;
revoke execute on function public.platform_can_access_part(bigint) from anon;
revoke execute on function public.platform_can_access_invoice(bigint) from anon;

notify pgrst,'reload schema';

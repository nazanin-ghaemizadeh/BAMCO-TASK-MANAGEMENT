-- The reviewer RPC uses an exception block (a PostgreSQL subtransaction), so
-- xmin is not necessarily the top-level txid. Match the live approved step
-- and the scoped approval markers, as the canonical task guard already does.
create or replace function private.project_delete_approval_active(p_project_id bigint)
returns boolean language sql volatile security definer set search_path='' as $$
  select coalesce(exists(
    select 1 from public.change_requests request
    join public.organization_workflows workflow
      on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id and step.step_no=workflow.current_step
    where request.id=case
        when coalesce(current_setting('bamco.request_id',true),'')~'^[0-9]+$'
        then current_setting('bamco.request_id',true)::bigint else null end
      and coalesce(current_setting('bamco.approval_apply',true),'')='1'
      and coalesce(current_setting('bamco.source_path',true),'')='approval_workflow'
      and request.request_type='delete' and request.task_id is null
      and request.proposed_data->>'request_context'='project_delete'
      and request.proposed_data->>'project_id'=p_project_id::text
      and request.proposed_data->>'project_owner_id'=request.before_data->>'owner_id'
      and not exists(
        select 1 from public.projects project where project.id=p_project_id
          and project.owner_id::text is distinct from request.proposed_data->>'project_owner_id'
      )
      and request.request_status in ('pending','in_review','approved')
      and workflow.status='in_review' and step.decision='approved'
      and (step.approver_id=auth.uid() or private.is_system_manager(auth.uid()))
  ),false);
$$;
revoke all on function private.project_delete_approval_active(bigint)
  from public,anon,authenticated;

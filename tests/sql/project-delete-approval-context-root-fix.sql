-- Covers both the normal superior approval and the direct-manager path.
-- Execute transactionally against a provisioned BAMCO database.
begin;

create or replace function pg_temp.approve_project_delete_context_probe(p_request_id bigint)
returns void language plpgsql as $$
declare v_approver uuid;
begin
  select step.approver_id into v_approver
  from public.change_requests request
  join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step on step.workflow_id=workflow.id
    and step.step_no=workflow.current_step and step.decision='pending'
  where request.id=p_request_id;
  if v_approver is null then raise exception 'approval route unavailable'; end if;
  perform set_config('request.jwt.claim.sub',v_approver::text,true);
  perform public.review_request_stage(p_request_id,'approved','transactional probe',null);
end;
$$;

do $$
declare
  v_owner uuid; v_manager uuid; v_project bigint; v_request bigint;
begin
  select profile.id into v_owner
  from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'projects','create')
    and private.feature_can_access_for(profile.id,'projects','delete')
    and not private.organization_actor_can_direct_manage_user(profile.id,profile.id)
    and exists(
      select 1
      from private.organization_active_primary_positions(profile.id) position
      join public.organization_positions child on child.id=position.position_id
      join public.organization_positions parent on parent.id=child.parent_position_id
      join public.organization_position_assignments assignment on assignment.position_id=parent.id and assignment.is_primary
      join public.profiles approver on approver.id=assignment.user_id and approver.active
      where private.feature_can_access_for(approver.id,'approvals','edit')
    )
  order by profile.id limit 1;
  if v_owner is null then raise exception 'no routed project owner available'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.projects(project_code,title,owner_id,manager_id,status,priority,created_by,updated_by)
  values('__QA_CONTEXT_PROJECT_DELETE_'||txid_current()::text,'__QA_CONTEXT_PROJECT_DELETE__',v_owner,v_owner,'ثبت شده','medium',v_owner,v_owner)
  returning id into v_project;
  v_request:=public.request_project_deletion(v_project);
  perform pg_temp.approve_project_delete_context_probe(v_request);
  if exists(select 1 from public.projects where id=v_project)
     or (select request_status from public.change_requests where id=v_request)<>'approved' then
    raise exception 'routed project deletion did not complete';
  end if;

  select profile.id into v_manager
  from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'projects','create')
    and private.feature_can_access_for(profile.id,'projects','delete')
    and private.organization_actor_can_direct_manage_user(profile.id,profile.id)
  order by profile.id limit 1;
  if v_manager is null then raise exception 'no direct manager available'; end if;

  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  insert into public.projects(project_code,title,owner_id,manager_id,status,priority,created_by,updated_by)
  values('__QA_DIRECT_PROJECT_DELETE_'||txid_current()::text,'__QA_DIRECT_PROJECT_DELETE__',v_manager,v_manager,'ثبت شده','medium',v_manager,v_manager)
  returning id into v_project;
  v_request:=public.request_project_deletion(v_project);
  if exists(select 1 from public.projects where id=v_project)
     or (select request_status from public.change_requests where id=v_request)<>'approved'
     or not exists(select 1 from public.change_request_events where request_id=v_request and event_type='applied_directly') then
    raise exception 'direct manager project deletion did not complete';
  end if;
end;
$$;

rollback;

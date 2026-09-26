-- Transactional integration test. No project, task or request survives ROLLBACK.
begin;

create or replace function pg_temp.approve_project_qa(p_request_id bigint)
returns void language plpgsql as $$
declare v_approver uuid; v_step integer:=0;
begin
  while (select request_status from public.change_requests where id=p_request_id)<>'approved' loop
    select step.approver_id into v_approver
    from public.change_requests request
    join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step on step.workflow_id=workflow.id
      and step.step_no=workflow.current_step and step.decision='pending'
    where request.id=p_request_id;
    if v_approver is null or v_step>12 then raise exception 'QA approval route unavailable'; end if;
    perform set_config('request.jwt.claim.sub',v_approver::text,true);
    perform public.review_request_stage(p_request_id,'approved','QA approval',null);
    v_step:=v_step+1;
  end loop;
end;
$$;

do $$
declare
  v_owner uuid; v_project bigint; v_phase bigint; v_item bigint; v_task bigint;
  v_create bigint; v_pending bigint; v_delete bigint; v_result jsonb;
  v_guarded boolean:=false;
begin
  select profile.id into v_owner from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'projects','create')
    and private.feature_can_access_for(profile.id,'projects','delete')
    and private.feature_can_access_for(profile.id,'kanban','create')
    and not private.organization_actor_can_direct_manage_user(profile.id,profile.id)
    and exists(
      select 1 from private.organization_active_primary_positions(profile.id) pos
      join public.organization_positions child on child.id=pos.position_id
      join public.organization_positions parent on parent.id=child.parent_position_id
      join public.organization_position_assignments a on a.position_id=parent.id and a.is_primary
      join public.profiles manager on manager.id=a.user_id and manager.active
      where private.feature_can_access_for(manager.id,'approvals','edit')
    ) order by profile.id limit 1;
  if v_owner is null then raise exception 'QA needs an owner with an approver'; end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.projects(project_code,title,owner_id,manager_id,status,priority,created_by,updated_by)
  values('__QA_PROJECT_DELETE_'||txid_current()::text,'__QA_PROJECT_DELETE__',v_owner,v_owner,
    'ثبت شده','medium',v_owner,v_owner) returning id into v_project;
  insert into public.project_items(project_id,item_type,title,owner_id,status,priority,created_by)
  values(v_project,'phase','__QA_PHASE__',v_owner,'ثبت شده','medium',v_owner)
  returning id into v_phase;

  begin
    delete from public.projects where id=v_project;
  exception when insufficient_privilege then v_guarded:=true;
  end;
  if not v_guarded or not exists(select 1 from public.projects where id=v_project) then
    raise exception 'direct project deletion bypassed approval';
  end if;

  v_result:=public.save_project_activity(null,v_project,jsonb_build_object(
    'title','__QA_ACTIVITY__','owner_id',v_owner,'parent_item_id',v_phase,
    'status','در حال انجام','priority','medium','progress',0,
    'planned_start',current_date,'planned_end',current_date+5));
  v_create:=(v_result->>'request_id')::bigint;
  if v_create is null or (v_result->>'applied_directly')::boolean then
    raise exception 'QA activity did not enter approval';
  end if;
  perform pg_temp.approve_project_qa(v_create);
  select id,task_id into v_item,v_task from public.project_items
  where project_id=v_project and item_type='activity';
  if v_item is null or v_task is null then raise exception 'QA activity lacks Kanban task'; end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_result:=public.save_project_activity(null,v_project,jsonb_build_object(
    'title','__QA_PENDING_ACTIVITY__','owner_id',v_owner,'parent_item_id',v_phase,
    'status','در حال انجام','priority','medium','progress',0,
    'planned_start',current_date,'planned_end',current_date+5));
  v_pending:=(v_result->>'request_id')::bigint;
  v_delete:=public.request_project_deletion(v_project);
  if v_delete is null or not exists(select 1 from public.projects where id=v_project)
     or not exists(select 1 from public.tasks where id=v_task) then
    raise exception 'request deleted project or task before approval';
  end if;
  begin
    perform public.request_project_deletion(v_project);
    raise exception 'duplicate project deletion was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  perform pg_temp.approve_project_qa(v_delete);
  if exists(select 1 from public.projects where id=v_project)
     or exists(select 1 from public.project_items where project_id=v_project)
     or exists(select 1 from public.tasks where id=v_task)
     or (select request_status from public.change_requests where id=v_delete)<>'approved'
     or (select request_status from public.change_requests where id=v_pending)<>'cancelled' then
    raise exception 'approved project deletion did not clean the whole project atomically';
  end if;
end;
$$;

rollback;

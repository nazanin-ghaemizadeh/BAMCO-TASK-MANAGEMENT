-- Run inside one transaction: verifies that a revision note reaches both the
-- request payload and the task's visible «توضیحات مدیر» field.
begin;
do $$
declare
  qa_owner uuid;
  approver uuid;
  qa_request_id bigint;
  qa_task_id bigint;
  qa_result text;
  qa_rounds integer:=0;
  qa_note text:='__BAMCO_QA_REVISION_NOTE__';
begin
  select profile.id into qa_owner
  from public.profiles profile
  where profile.active and profile.role='owner'
    and exists(select 1 from public.organization_position_assignments assignment where assignment.user_id=profile.id and assignment.is_primary)
  order by profile.id
  limit 1;
  if qa_owner is null then raise exception 'No active positioned owner for revision-note test'; end if;

  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  execute 'set local role authenticated';
  qa_request_id:=public.submit_change_request('create',null,jsonb_build_object(
    'title','__BAMCO_QA_REVISION_NOTE_TASK__','owner_id',qa_owner,'status','ثبت شده','priority','متوسط'
  ),null);
  execute 'reset role';

  loop
    select workflow_step.approver_id into approver
    from public.change_requests request
    join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps workflow_step on workflow_step.workflow_id=workflow.id and workflow_step.step_no=workflow.current_step
    join public.profiles profile on profile.id=workflow_step.approver_id and profile.active
    where request.id=qa_request_id and workflow_step.decision='pending';
    if approver is null then raise exception 'No active approver for create request'; end if;
    perform set_config('request.jwt.claim.sub',approver::text,true);
    execute 'set local role authenticated';
    qa_result:=public.review_request_stage(qa_request_id,'approved','__QA_ROLLBACK__',null);
    execute 'reset role';
    qa_rounds:=qa_rounds+1;
    if qa_rounds>10 then raise exception 'Create request did not finish'; end if;
    exit when qa_result='approved';
  end loop;
  select applied_task_id into qa_task_id from public.change_requests where id=qa_request_id;
  if qa_task_id is null then raise exception 'Approved task was not created'; end if;

  perform set_config('request.jwt.claim.sub',qa_owner::text,true);
  execute 'set local role authenticated';
  qa_request_id:=public.submit_change_request('update',qa_task_id,jsonb_build_object('description','در انتظار اصلاح'),null);
  execute 'reset role';
  select workflow_step.approver_id into approver
  from public.change_requests request
  join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps workflow_step on workflow_step.workflow_id=workflow.id and workflow_step.step_no=workflow.current_step
  join public.profiles profile on profile.id=workflow_step.approver_id and profile.active
  where request.id=qa_request_id and workflow_step.decision='pending';
  if approver is null then raise exception 'No active approver for update request'; end if;
  perform set_config('request.jwt.claim.sub',approver::text,true);
  execute 'set local role authenticated';
  qa_result:=public.review_request_stage(qa_request_id,'needs_revision',qa_note,null);
  execute 'reset role';
  if qa_result<>'needs_revision' then raise exception 'Expected needs_revision, got %',qa_result; end if;
  if not exists(select 1 from public.tasks task where task.id=qa_task_id and task.manager_notes like '%'||qa_note||'%') then
    raise exception 'Revision note is not visible on the task';
  end if;
  if not exists(select 1 from public.change_requests request where request.id=qa_request_id and request.proposed_data->>'manager_notes' like '%'||qa_note||'%') then
    raise exception 'Revision note is not retained in the request payload';
  end if;
end $$;
rollback;
select 'PASS: revision comment is visible in task manager notes and request payload; transaction rolled back' result;

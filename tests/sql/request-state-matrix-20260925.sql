-- Run against a populated staging/production-compatible database. Every
-- mutation is rolled back; the block validates each state transition.
begin;
select set_config(
  'request.jwt.claim.sub',
  (select requested_by::text from public.change_requests where request_status='needs_revision' order by id desc limit 1),
  true
);
set local role authenticated;

do $qa$
declare
  v_request public.change_requests%rowtype;
  v_owner uuid;
  v_approver uuid;
  v_result text;
  v_status text;
  v_owner_payload text;
  v_note text;
  v_guard integer;
begin
  select * into v_request
  from public.change_requests
  where request_status='needs_revision'
  order by id desc
  limit 1;
  if not found then
    raise exception 'QA requires one needs_revision request';
  end if;
  v_owner:=v_request.requested_by;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.resubmit_change_request(v_request.id,v_request.proposed_data-'owner_id');
  select request_status,proposed_data->>'owner_id'
    into v_status,v_owner_payload
  from public.change_requests where id=v_request.id;
  if v_status not in ('pending','in_review') then
    raise exception 'resubmit did not return request to approval: %',v_status;
  end if;
  if v_owner_payload is distinct from v_owner::text then
    raise exception 'resubmit did not restore canonical owner';
  end if;

  -- The requester cannot review their own request.
  begin
    perform public.review_request_stage(v_request.id,'approved','QA unauthorized review',null);
    raise exception 'requester reviewed own request';
  exception when insufficient_privilege then
    null;
  end;

  -- Needs revision, including manager-note propagation. This subtransaction
  -- deliberately rolls back so the same routed request can test other paths.
  begin
    select step.approver_id into v_approver
    from public.change_requests request
    join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id and step.step_no=workflow.current_step
    where request.id=v_request.id;
    perform set_config('request.jwt.claim.sub',v_approver::text,true);
    v_result:=public.review_request_stage(v_request.id,'needs_revision','QA revision note',null);
    select request_status,manager_note into v_status,v_note
    from public.change_requests where id=v_request.id;
    if v_result<>'needs_revision' or v_status<>'needs_revision' or v_note<>'QA revision note' then
      raise exception 'needs_revision transition failed';
    end if;
    raise no_data_found;
  exception when no_data_found then null;
  end;

  -- Rejection.
  begin
    select step.approver_id into v_approver
    from public.change_requests request
    join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id and step.step_no=workflow.current_step
    where request.id=v_request.id;
    perform set_config('request.jwt.claim.sub',v_approver::text,true);
    v_result:=public.review_request_stage(v_request.id,'rejected','QA rejection note',null);
    select request_status,manager_note into v_status,v_note
    from public.change_requests where id=v_request.id;
    if v_result<>'rejected' or v_status<>'rejected' or v_note<>'QA rejection note' then
      raise exception 'rejected transition failed';
    end if;
    raise no_data_found;
  exception when no_data_found then null;
  end;

  -- Full one- or multi-stage approval.
  begin
    v_guard:=0;
    loop
      v_guard:=v_guard+1;
      if v_guard>10 then raise exception 'approval chain did not terminate'; end if;
      select step.approver_id into v_approver
      from public.change_requests request
      join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
      join public.organization_workflow_steps step
        on step.workflow_id=workflow.id and step.step_no=workflow.current_step
      where request.id=v_request.id;
      perform set_config('request.jwt.claim.sub',v_approver::text,true);
      v_result:=public.review_request_stage(v_request.id,'approved','QA approval note',null);
      exit when v_result='approved';
      if v_result<>'next_stage' then raise exception 'unexpected approval result: %',v_result; end if;
    end loop;
    select request_status into v_status from public.change_requests where id=v_request.id;
    if v_status<>'approved' then raise exception 'approved transition failed'; end if;
    raise no_data_found;
  exception when no_data_found then null;
  end;

  -- Requester amendment re-routes instead of bypassing approval.
  begin
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform public.amend_change_request(v_request.id,v_request.proposed_data);
    select request_status into v_status from public.change_requests where id=v_request.id;
    if v_status not in ('pending','in_review') then raise exception 'amend transition failed'; end if;
    raise no_data_found;
  exception when no_data_found then null;
  end;

  -- Requester cancellation is terminal and does not overwrite manager_note.
  begin
    perform set_config('request.jwt.claim.sub',v_owner::text,true);
    perform public.cancel_change_request(v_request.id,'QA requester cancellation');
    select request_status,cancellation_note into v_status,v_note
    from public.change_requests where id=v_request.id;
    if v_status<>'cancelled' or v_note<>'QA requester cancellation' then
      raise exception 'cancel transition failed';
    end if;
    raise no_data_found;
  exception when no_data_found then null;
  end;
end;
$qa$;

rollback;

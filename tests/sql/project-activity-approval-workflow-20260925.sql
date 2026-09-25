-- Transactional role/state matrix for project activity <-> task approvals.
-- Run only after 20260925014953_project_activity_approval_workflow.sql.
-- Every mutation is rolled back.

begin;

create or replace function pg_temp.approve_request(
  p_request_id bigint,
  p_final_data jsonb default null
)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_approver uuid;
  v_has_next boolean;
  v_round integer:=0;
begin
  loop
    select request_status into v_status
    from public.change_requests where id=p_request_id;
    exit when v_status='approved';
    if v_status not in ('pending','in_review') then
      raise exception 'QA request % cannot be approved from state %',p_request_id,v_status;
    end if;
    select step.approver_id into v_approver
    from public.change_requests request
    join public.organization_workflows workflow
      on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id
     and step.step_no=workflow.current_step
     and step.decision='pending'
    where request.id=p_request_id
    order by step.id
    limit 1;
    if v_approver is null then
      raise exception 'QA request % has no active approver',p_request_id;
    end if;
    select exists(
      select 1
      from public.change_requests request
      join public.organization_workflow_steps later
        on later.workflow_id=request.organization_workflow_id
       and later.step_no>request.current_stage
      where request.id=p_request_id
    ) into v_has_next;
    perform set_config('request.jwt.claim.sub',v_approver::text,true);
    perform public.review_request_stage(
      p_request_id,'approved','تأیید QA',
      case when v_has_next then null else p_final_data end
    );
    v_round:=v_round+1;
    if v_round>12 then
      raise exception 'QA approval loop did not terminate for request %',p_request_id;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_owner uuid;
  v_first_approver uuid;
  v_project_id bigint;
  v_phase_id bigint;
  v_phase_two_id bigint;
  v_item_id bigint;
  v_task_id bigint;
  v_request_id bigint;
  v_update_request_id bigint;
  v_revision_request_id bigint;
  v_delete_request_id bigint;
  v_lifecycle_request_id bigint;
  v_result jsonb;
  v_before_title text;
  v_context jsonb;
  v_guarded boolean:=false;
  v_code text:='__QA_PROJECT_ACTIVITY_'||txid_current()::text||'__';
begin
  select profile.id into v_owner
  from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'projects','create')
    and private.feature_can_access_for(profile.id,'projects','edit')
    and private.feature_can_access_for(profile.id,'projects','delete')
    and private.feature_can_access_for(profile.id,'kanban','create')
    and private.feature_can_access_for(profile.id,'kanban','edit')
    and private.feature_can_access_for(profile.id,'kanban','delete')
    and not private.organization_actor_can_direct_manage_user(profile.id,profile.id)
    and exists(
      select 1
      from public.organization_position_assignments own_assignment
      join public.organization_positions own_position
        on own_position.id=own_assignment.position_id and own_position.active
      join public.organization_positions parent_position
        on parent_position.id=own_position.parent_position_id and parent_position.active
      join public.organization_position_assignments parent_assignment
        on parent_assignment.position_id=parent_position.id
       and parent_assignment.is_primary
       and parent_assignment.valid_from<=current_date
       and (parent_assignment.valid_to is null or parent_assignment.valid_to>current_date)
      join public.profiles parent_profile
        on parent_profile.id=parent_assignment.user_id and parent_profile.active
      where own_assignment.user_id=profile.id
        and own_assignment.is_primary
        and own_assignment.valid_from<=current_date
        and (own_assignment.valid_to is null or own_assignment.valid_to>current_date)
    )
  order by profile.id
  limit 1;
  if v_owner is null then
    raise exception 'QA requires an active normal user with project/task access and an occupied parent position';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  insert into public.projects(
    project_code,title,description,owner_id,manager_id,planned_start,planned_end,
    status,priority,created_by,updated_by
  ) values(
    v_code,'__QA_PROJECT_ACTIVITY__',null,v_owner,v_owner,current_date,current_date+20,
    'ثبت شده','medium',v_owner,v_owner
  ) returning id into v_project_id;

  insert into public.project_items(
    project_id,item_type,title,owner_id,status,priority,planned_start,planned_end,
    progress,created_by
  ) values(
    v_project_id,'phase','__QA_PHASE__',v_owner,'ثبت شده','medium',
    current_date,current_date+20,0,v_owner
  ) returning id into v_phase_id;

  insert into public.project_items(
    project_id,item_type,title,owner_id,status,priority,planned_start,planned_end,
    progress,created_by
  ) values(
    v_project_id,'phase','__QA_PHASE_TWO__',v_owner,'ثبت شده','medium',
    current_date,current_date+20,0,v_owner
  ) returning id into v_phase_two_id;

  -- Browser callers cannot forge the reserved project context through the
  -- generic Kanban submission RPC.
  begin
    perform public.submit_change_request(
      'create',null,jsonb_build_object(
        'title','__QA_FORGED_PROJECT_CONTEXT__','owner_id',v_owner,
        'request_context','project_activity','request_label','جعل',
        'project_id',v_project_id,'item_type','activity','source','project'
      ),null
    );
  exception when insufficient_privilege then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'generic submit accepted forged project activity context';
  end if;

  v_result:=public.save_project_activity(
    null,v_project_id,jsonb_build_object(
      'title','__QA_ACTIVITY_CREATE__','description','ایجاد آزمایشی',
      'owner_id',v_owner,'parent_item_id',v_phase_id,
      'planned_start',current_date,'planned_end',current_date+5,
      'status','در حال انجام','priority','urgent','progress',25
    )
  );
  v_request_id:=nullif(v_result->>'request_id','')::bigint;
  if coalesce((v_result->>'applied_directly')::boolean,true)
     or v_request_id is null
     or v_result->'project_item_id'<>'null'::jsonb then
    raise exception 'normal self creation did not return an approval-only result: %',v_result;
  end if;
  if exists(
    select 1 from public.project_items
    where project_id=v_project_id and title='__QA_ACTIVITY_CREATE__'
  ) then
    raise exception 'unapproved activity was materialized in WBS';
  end if;
  if not exists(
    select 1 from public.change_requests request
    where request.id=v_request_id
      and request.request_type='create'
      and request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'request_label'='تعریف فعالیت در پروژه'
      and (request.proposed_data->>'project_id')::bigint=v_project_id
      and (request.proposed_data->>'parent_item_id')::bigint=v_phase_id
      and request.proposed_data->>'item_type'='activity'
      and request.proposed_data->>'owner_id'=v_owner::text
      and request.applied_task_id is null
  ) then
    raise exception 'project activity create request contract is incomplete';
  end if;
  if (select count(*) from public.change_requests request
      where request.id=v_request_id and request.request_type='create')<>1 then
    raise exception 'project activity definition is not countable as exactly one create request';
  end if;

  select step.approver_id into v_first_approver
  from public.change_requests request
  join public.organization_workflows workflow
    on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step
    on step.workflow_id=workflow.id and step.step_no=workflow.current_step
  where request.id=v_request_id
  order by step.id limit 1;
  if v_first_approver is null then
    raise exception 'project activity request was not routed to a superior';
  end if;
  if not exists(
    select 1 from public.portal_messages message
    where message.entity_type='change_request'
      and message.entity_id=v_request_id::text
      and message.subject='تعریف فعالیت در پروژه'
      and message.body like '%تعریف فعالیت در پروژه%'
  ) then
    raise exception 'context-aware approval portal message was not created';
  end if;

  perform set_config('request.jwt.claim.sub',v_first_approver::text,true);
  if not public.platform_can_access_project(v_project_id) then
    raise exception 'direct superior cannot see subordinate project';
  end if;
  perform pg_temp.approve_request(v_request_id);

  select item.id,item.task_id into v_item_id,v_task_id
  from public.project_items item
  where item.approval_request_id=v_request_id;
  if v_item_id is null or v_task_id is null then
    raise exception 'approval did not atomically materialize and link WBS/task';
  end if;
  if not exists(
    select 1 from public.tasks task
    where task.id=v_task_id
      and task.source='project'
      and task.owner_id=v_owner
      and task.title='__QA_ACTIVITY_CREATE__'
  ) then
    raise exception 'approved project task is missing or inconsistent';
  end if;
  if not exists(
    select 1 from public.change_requests request
    where request.id=v_request_id
      and request.applied_task_id=v_task_id
      and (request.proposed_data->>'project_item_id')::bigint=v_item_id
  ) then
    raise exception 'request/task/item linkage required for dedupe is missing';
  end if;

  -- Once the WBS exists, changing only the project owner must be rejected.
  v_guarded:=false;
  begin
    update public.projects set manager_id=null where id=v_project_id;
  exception when check_violation or insufficient_privilege then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'project owner consistency guard did not reject a partial reassignment';
  end if;

  -- A direct task delete may not orphan the WBS or create a replacement task.
  v_guarded:=false;
  begin
    delete from public.tasks where id=v_task_id;
  exception when insufficient_privilege then
    v_guarded:=true;
  end;
  if not v_guarded or not exists(select 1 from public.tasks where id=v_task_id) then
    raise exception 'project-linked task delete guard failed';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select title into v_before_title from public.project_items where id=v_item_id;
  v_result:=public.save_project_activity(
    v_item_id,v_project_id,jsonb_build_object(
      'title','__QA_ACTIVITY_UPDATED__','description','ویرایش آزمایشی',
      'owner_id',v_owner,'parent_item_id',v_phase_two_id,
      'planned_start',current_date+1,'planned_end',current_date+7,
      'status','در حال انجام','priority','low','progress',40
    )
  );
  v_update_request_id:=nullif(v_result->>'request_id','')::bigint;
  if coalesce((v_result->>'applied_directly')::boolean,true)
     or v_update_request_id is null then
    raise exception 'normal self edit bypassed approval: %',v_result;
  end if;
  if (select title from public.project_items where id=v_item_id) is distinct from v_before_title then
    raise exception 'unapproved project edit changed the WBS';
  end if;
  perform pg_temp.approve_request(v_update_request_id);
  if not exists(
    select 1 from public.project_items item
    join public.tasks task on task.id=item.task_id
    where item.id=v_item_id
      and item.title='__QA_ACTIVITY_UPDATED__'
      and task.title=item.title
      and item.progress=40
      and item.parent_item_id=v_phase_two_id
  ) then
    raise exception 'approved project edit did not update task and WBS atomically';
  end if;
  if (select progress from public.project_items where id=v_phase_two_id)<>40
     or (select progress from public.projects where id=v_project_id)
        is distinct from public.project_calculated_progress(v_project_id) then
    raise exception 'phase/project progress rollup was not refreshed after approval';
  end if;

  -- Generic Kanban completion derives WBS progress=100. A final reviewer
  -- cannot inject a different project progress through final_data. Reopening
  -- uses the explicit policy of resetting the executable leaf to zero.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_lifecycle_request_id:=public.submit_change_request(
    'complete',v_task_id,jsonb_build_object(
      'done_date',current_date,'progress',7
    ),null
  );
  select proposed_data into v_context
  from public.change_requests where id=v_lifecycle_request_id;
  select step.approver_id into v_first_approver
  from public.change_requests request
  join public.organization_workflows workflow
    on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step
    on step.workflow_id=workflow.id and step.step_no=workflow.current_step
  where request.id=v_lifecycle_request_id
  order by step.id limit 1;
  perform set_config('request.jwt.claim.sub',v_first_approver::text,true);
  perform public.review_request_stage(
    v_lifecycle_request_id,'needs_revision','بازآزمایی تکمیل',null
  );
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.resubmit_change_request(
    v_lifecycle_request_id,
    jsonb_build_object('done_date',current_date,'progress',17)
  );
  select proposed_data into v_context
  from public.change_requests where id=v_lifecycle_request_id;
  if v_context?'progress' then
    raise exception 'generic complete amendment introduced project progress: %',v_context;
  end if;
  perform pg_temp.approve_request(
    v_lifecycle_request_id,v_context||jsonb_build_object('progress',7)
  );
  if (select progress from public.project_items where id=v_item_id)<>100 then
    raise exception 'completed project task did not derive 100 percent WBS progress';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_lifecycle_request_id:=public.submit_change_request(
    'status',v_task_id,jsonb_build_object(
      'status','در حال انجام','archived',false,'owner_id',v_owner,
      'start_date',current_date+1,'due_date',current_date+7
    ),null
  );
  perform pg_temp.approve_request(v_lifecycle_request_id);
  if (select progress from public.project_items where id=v_item_id)<>0 then
    raise exception 'reopened project task did not reset WBS progress';
  end if;

  -- Revision preserves all immutable project binding metadata even when the
  -- generic editor submits only task fields.
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  v_result:=public.save_project_activity(
    v_item_id,v_project_id,jsonb_build_object(
      'title','__QA_ACTIVITY_REVISION__','description','قبل از اصلاح',
      'owner_id',v_owner,'parent_item_id',v_phase_two_id,
      'planned_start',current_date+2,'planned_end',current_date+8,
      'status','در حال انجام','priority','medium','progress',55
    )
  );
  v_revision_request_id:=nullif(v_result->>'request_id','')::bigint;
  select step.approver_id into v_first_approver
  from public.change_requests request
  join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step
    on step.workflow_id=workflow.id and step.step_no=workflow.current_step
  where request.id=v_revision_request_id
  order by step.id limit 1;
  perform set_config('request.jwt.claim.sub',v_first_approver::text,true);
  perform public.review_request_stage(
    v_revision_request_id,'needs_revision','عنوان اصلاح شود',null
  );
  if (select approval_state from public.project_items where id=v_item_id)<>'needs_revision' then
    raise exception 'needs_revision state was not reflected on project activity';
  end if;
  if not exists(
    select 1 from public.tasks task
    where task.id=v_task_id
      and task.manager_notes like '%یادداشت مدیر: عنوان اصلاح شود%'
  ) then
    raise exception 'needs_revision manager note was not appended to the task';
  end if;
  if coalesce(current_setting('bamco.request_id',true),'')<>''
     or coalesce(current_setting('bamco.source_path',true),'')<>''
     or coalesce(current_setting('bamco.approval_apply',true),'')<>'' then
    raise exception 'revision-note approval context leaked after review';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform public.resubmit_change_request(
    v_revision_request_id,
    jsonb_build_object(
      'title','__QA_ACTIVITY_REVISED__','description','پس از اصلاح','owner_id',v_owner
    )
  );
  select proposed_data into v_context
  from public.change_requests where id=v_revision_request_id;
  if v_context->>'request_context'<>'project_activity'
     or (v_context->>'project_id')::bigint<>v_project_id
     or (v_context->>'project_item_id')::bigint<>v_item_id
     or (v_context->>'parent_item_id')::bigint<>v_phase_two_id
     or v_context->>'item_type'<>'activity'
     or v_context->>'owner_id'<>v_owner::text then
    raise exception 'project request context was lost during resubmit: %',v_context;
  end if;
  perform pg_temp.approve_request(
    v_revision_request_id,jsonb_build_object('title','__QA_ACTIVITY_FINAL_REVIEW__')
  );
  if not exists(
    select 1 from public.project_items item
    join public.tasks task on task.id=item.task_id
    where item.id=v_item_id
      and item.title='__QA_ACTIVITY_FINAL_REVIEW__'
      and task.title=item.title
      and item.description=task.description
      and item.description<>'پس از اصلاح'
  ) then
    raise exception 'partial final review diverged the project item from its task';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  if not exists(
    select 1 from public.change_requests request
    where request.request_status='approved'
      and request.proposed_data->>'request_context'='project_activity'
      and request.applied_task_id=v_task_id
  ) then
    raise exception 'QA delete requires approved historical project requests linked to the task';
  end if;
  v_result:=public.delete_project_activity(v_item_id);
  v_delete_request_id:=nullif(v_result->>'request_id','')::bigint;
  if coalesce((v_result->>'applied_directly')::boolean,true)
     or v_delete_request_id is null
     or not exists(select 1 from public.project_items where id=v_item_id) then
    raise exception 'normal self delete did not wait for approval';
  end if;
  perform pg_temp.approve_request(v_delete_request_id);
  if exists(select 1 from public.project_items where id=v_item_id)
     or exists(select 1 from public.tasks where id=v_task_id)
     or exists(select 1 from public.tasks where title='__QA_ACTIVITY_FINAL_REVIEW__') then
    raise exception 'approved project delete left or recreated an activity/task';
  end if;
  if exists(
    select 1 from public.change_requests request
    where request.proposed_data->>'request_context'='project_activity'
      and (request.task_id=v_task_id or request.applied_task_id=v_task_id)
  ) then
    raise exception 'task deletion left historical project request foreign-key links';
  end if;
  if not exists(
    select 1
    from public.portal_messages message
    where message.entity_type='change_request'
      and message.entity_id=v_delete_request_id::text
      and message.template_key='request_result'
      and message.body like '%__QA_ACTIVITY_FINAL_REVIEW__%'
      and message.body not like '%«—»%'
  ) then
    raise exception 'project delete result notification lost the deleted activity title';
  end if;
  if coalesce(current_setting('bamco.request_id',true),'')<>''
     or coalesce(current_setting('bamco.source_path',true),'')<>''
     or coalesce(current_setting('bamco.approval_apply',true),'')<>'' then
    raise exception 'approved project delete leaked approval execution context';
  end if;
end;
$$;

-- A generic CREATE request must start without a task binding. Supplying an
-- existing task ID must fail before the request, workflow events, messages or
-- task catalog can change.
do $$
declare
  v_actor uuid;
  v_seed_task_id bigint;
  v_rejected boolean:=false;
  v_requests_before bigint;
  v_events_before bigint;
  v_messages_before bigint;
  v_tasks_before bigint;
  v_code text:='__QA_CREATE_BINDING_'||txid_current()::text||'__';
begin
  select profile.id into v_actor
  from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'kanban','create')
  order by private.is_system_manager(profile.id),profile.id
  limit 1;
  if v_actor is null then
    raise exception 'QA requires an active actor with Kanban create access';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by
  ) values(
    v_code||'_EXISTING','',v_actor,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor
  ) returning id into v_seed_task_id;
  select count(*) into v_requests_before from public.change_requests;
  select count(*) into v_events_before from public.change_request_events;
  select count(*) into v_messages_before from public.portal_messages;
  select count(*) into v_tasks_before from public.tasks;

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  begin
    perform public.submit_change_request(
      'create',v_seed_task_id,
      jsonb_build_object(
        'title',v_code||'_FORGED','owner_id',v_actor,
        'priority','متوسط'
      ),null
    );
  exception when check_violation then
    v_rejected:=true;
  end;
  execute 'reset role';

  if not v_rejected then
    raise exception 'generic CREATE accepted an existing task binding';
  end if;
  if (select count(*) from public.change_requests)<>v_requests_before
     or (select count(*) from public.change_request_events)<>v_events_before
     or (select count(*) from public.portal_messages)<>v_messages_before
     or (select count(*) from public.tasks)<>v_tasks_before
     or not exists(select 1 from public.tasks where id=v_seed_task_id) then
    raise exception 'rejected bound CREATE left request/event/message/task side effects';
  end if;
end;
$$;

-- Historical malformed CREATE requests may already carry a task_id even
-- though new inserts are now rejected. A revision comment on such a row must
-- remain request history and must not mutate the pre-existing task.
do $$
declare
  v_actor uuid;
  v_approver uuid;
  v_task_id bigint;
  v_request_id bigint;
  v_notes_before text;
  v_code text:='__QA_LEGACY_BOUND_CREATE_'||txid_current()::text||'__';
begin
  select profile.id into v_actor
  from public.profiles profile
  where profile.active
    and private.feature_can_access_for(profile.id,'kanban','create')
    and exists(
      select 1
      from public.organization_position_assignments own_assignment
      join public.organization_positions own_position
        on own_position.id=own_assignment.position_id and own_position.active
      join public.organization_positions parent_position
        on parent_position.id=own_position.parent_position_id
       and parent_position.active
      join public.organization_position_assignments parent_assignment
        on parent_assignment.position_id=parent_position.id
       and parent_assignment.is_primary
       and parent_assignment.valid_from<=current_date
       and (
         parent_assignment.valid_to is null
         or parent_assignment.valid_to>current_date
       )
      where own_assignment.user_id=profile.id
        and own_assignment.is_primary
        and own_assignment.valid_from<=current_date
        and (
          own_assignment.valid_to is null
          or own_assignment.valid_to>current_date
        )
    )
  order by profile.id
  limit 1;
  if v_actor is null then
    raise exception 'QA requires a create actor with an occupied parent';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,
    manager_notes,created_by
  ) values(
    v_code||'_TASK','',v_actor,'در حال انجام','متوسط',
    current_date,current_date+1,'یادداشت قبلی',v_actor
  ) returning id,manager_notes into v_task_id,v_notes_before;

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  v_request_id:=public.submit_change_request(
    'create',null,
    jsonb_build_object(
      'title',v_code||'_REQUEST','owner_id',v_actor,
      'priority','متوسط'
    ),null
  );
  execute 'reset role';

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  update public.change_requests
  set task_id=v_task_id
  where id=v_request_id;
  select step.approver_id into v_approver
  from public.change_requests request
  join public.organization_workflows workflow
    on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step
    on step.workflow_id=workflow.id
   and step.step_no=workflow.current_step
   and step.decision='pending'
  where request.id=v_request_id
  order by step.id
  limit 1;
  if v_approver is null then
    raise exception 'legacy bound CREATE fixture has no approver';
  end if;

  perform set_config('request.jwt.claim.sub',v_approver::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  perform public.review_request_stage(
    v_request_id,'needs_revision','یادداشت نباید روی وظیفه بنشیند',null
  );
  execute 'reset role';

  if (select manager_notes from public.tasks where id=v_task_id)
       is distinct from v_notes_before then
    raise exception 'legacy bound CREATE revision mutated an existing task';
  end if;
  if (select request_status from public.change_requests where id=v_request_id)
       is distinct from 'needs_revision' then
    raise exception 'legacy bound CREATE did not retain its revision history';
  end if;
  if coalesce(current_setting('bamco.request_id',true),'')<>''
     or coalesce(current_setting('bamco.source_path',true),'')<>''
     or coalesce(current_setting('bamco.approval_apply',true),'')<>'' then
    raise exception 'legacy bound CREATE review leaked approval context';
  end if;
end;
$$;

-- Superior -> strict-descendant creation keeps the established direct-authority
-- path, while the subordinate can still see the resulting project.
do $$
declare
  v_superior uuid;
  v_subordinate uuid;
  v_project_id bigint;
  v_item_id bigint;
  v_task_id bigint;
  v_phase_id bigint;
  v_child_item_id bigint;
  v_child_task_id bigint;
  v_result jsonb;
  v_guarded boolean:=false;
  v_code text:='__QA_SUBORDINATE_PROJECT_'||txid_current()::text||'__';
begin
  select actor.id,descendant.user_id into v_superior,v_subordinate
  from public.profiles actor
  cross join lateral private.organization_strict_descendant_user_ids(actor.id) descendant
  join public.profiles target on target.id=descendant.user_id and target.active
  where actor.active
    and private.feature_can_access_for(actor.id,'projects','create')
    and private.feature_can_access_for(actor.id,'projects','edit')
    and private.feature_can_access_for(actor.id,'projects','delete')
    and private.feature_can_access_for(actor.id,'kanban','create')
    and private.feature_can_access_for(actor.id,'kanban','edit')
    and private.feature_can_access_for(actor.id,'kanban','delete')
    and private.organization_actor_can_direct_manage_user(actor.id,descendant.user_id)
  order by actor.id,descendant.user_id
  limit 1;
  if v_superior is null then
    raise exception 'QA requires a superior with one active strict descendant';
  end if;

  perform set_config('request.jwt.claim.sub',v_superior::text,true);
  insert into public.projects(
    project_code,title,owner_id,manager_id,status,priority,created_by,updated_by
  ) values(
    v_code,'__QA_SUBORDINATE_PROJECT__',v_subordinate,v_subordinate,
    'ثبت شده','medium',v_superior,v_superior
  ) returning id into v_project_id;
  v_result:=public.save_project_activity(
    null,v_project_id,jsonb_build_object(
      'title','__QA_DIRECT_SUBORDINATE_ACTIVITY__','owner_id',v_subordinate,
      'status','در حال انجام','priority','medium','progress',10,
      'planned_start',current_date,'planned_end',current_date+1
    )
  );
  v_item_id:=nullif(v_result->>'project_item_id','')::bigint;
  if not coalesce((v_result->>'applied_directly')::boolean,false)
     or v_item_id is null or v_result->'request_id'<>'null'::jsonb then
    raise exception 'superior-to-subordinate activity was not applied directly: %',v_result;
  end if;
  select task_id into v_task_id from public.project_items where id=v_item_id;
  if v_task_id is null
     or not exists(
       select 1 from public.tasks
       where id=v_task_id and owner_id=v_subordinate and source='project'
     ) then
    raise exception 'direct subordinate activity/task linkage is incomplete';
  end if;

  perform set_config('request.jwt.claim.sub',v_subordinate::text,true);
  if not public.platform_can_access_project(v_project_id) then
    raise exception 'subordinate cannot see their assigned project';
  end if;

  perform set_config('request.jwt.claim.sub',v_superior::text,true);
  v_result:=public.delete_project_activity(v_item_id);
  if not coalesce((v_result->>'applied_directly')::boolean,false)
     or exists(select 1 from public.project_items where id=v_item_id)
     or exists(select 1 from public.tasks where id=v_task_id) then
    raise exception 'direct superior delete did not remove task and WBS atomically';
  end if;

  insert into public.project_items(
    project_id,item_type,title,owner_id,status,priority,created_by
  ) values(
    v_project_id,'phase','__QA_CASCADE_PHASE__',v_subordinate,
    'ثبت شده','medium',v_superior
  ) returning id into v_phase_id;
  v_result:=public.save_project_activity(
    null,v_project_id,jsonb_build_object(
      'title','__QA_CASCADE_ACTIVITY__','owner_id',v_subordinate,
      'parent_item_id',v_phase_id,'status','در حال انجام',
      'priority','medium','progress',15,
      'planned_start',current_date,'planned_end',current_date+1
    )
  );
  v_child_item_id:=(v_result->>'project_item_id')::bigint;
  select task_id into v_child_task_id
  from public.project_items where id=v_child_item_id;
  begin
    delete from public.project_items where id=v_phase_id;
  exception when object_not_in_prerequisite_state then
    v_guarded:=true;
  end;
  if not v_guarded
     or not exists(select 1 from public.project_items where id=v_child_item_id)
     or not exists(select 1 from public.tasks where id=v_child_task_id) then
    raise exception 'container delete bypassed leaf activity authorization';
  end if;
  v_result:=public.delete_project_activity(v_child_item_id);
  if not coalesce((v_result->>'applied_directly')::boolean,false) then
    raise exception 'superior leaf delete unexpectedly required approval';
  end if;
  delete from public.project_items where id=v_phase_id;
  if exists(select 1 from public.project_items where id=v_child_item_id)
     or exists(select 1 from public.tasks where id=v_child_task_id)
     or exists(select 1 from public.project_items where id=v_phase_id) then
    raise exception 'leaf-first project deletion left residual rows';
  end if;
  if exists(
    select 1
    from (
      select task.legacy_id,
             row_number() over(order by task.legacy_id,task.id)::bigint as expected_id
      from public.tasks task
      where task.legacy_id is not null
    ) numbered
    where numbered.legacy_id<>numbered.expected_id
  ) then
    raise exception 'direct/cascade project deletion did not resequence task display IDs';
  end if;
end;
$$;

-- Canonical account deletion preserves tasks/WBS rows while clearing nullable
-- profile references. Cover both the sequential owner->NULL/creator->NULL path
-- and the created_by-only path on a task linked to a project activity.
do $$
declare
  v_project_owner uuid;
  v_delete_target uuid;
  v_project_id bigint;
  v_legacy_project_id bigint;
  v_phase_id bigint;
  v_activity_id bigint;
  v_project_task_id bigint;
  v_standalone_task_id bigint;
  v_project_task_before jsonb;
  v_legacy_map_before jsonb;
  v_guarded boolean:=false;
  v_code text:='__QA_PERSON_CLEANUP_'||txid_current()::text||'__';
begin
  select profile.id into v_project_owner
  from public.profiles profile
  where profile.active
  order by profile.id
  limit 1;
  select profile.id into v_delete_target
  from public.profiles profile
  where profile.active and profile.id<>v_project_owner
  order by profile.id
  limit 1;
  if v_project_owner is null or v_delete_target is null then
    raise exception 'QA requires two active profiles for person-reference cleanup';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('bamco.deleting_person','',true);
  insert into public.projects(
    project_code,title,owner_id,manager_id,planned_start,planned_end,
    status,priority,created_by,updated_by
  ) values(
    v_code,'__QA_PERSON_CLEANUP__',v_project_owner,v_project_owner,
    current_date,current_date+1,'ثبت شده','medium',v_project_owner,v_project_owner
  ) returning id into v_project_id;
  -- Legacy data could retain a manager reference different from the owner.
  -- Account deletion must normalize that nullable reference back to the owner.
  insert into public.projects(
    project_code,title,owner_id,manager_id,planned_start,planned_end,
    status,priority,created_by,updated_by
  ) values(
    v_code||'_LEGACY','__QA_LEGACY_MANAGER__',v_project_owner,v_delete_target,
    current_date,current_date+1,'ثبت شده','medium',v_project_owner,v_project_owner
  ) returning id into v_legacy_project_id;
  insert into public.project_items(
    project_id,item_type,title,owner_id,status,priority,planned_start,planned_end,
    progress,created_by
  ) values(
    v_project_id,'phase','__QA_PERSON_CLEANUP_PHASE__',v_project_owner,
    'ثبت شده','medium',current_date,current_date+1,0,v_delete_target
  ) returning id into v_phase_id;
  insert into public.project_items(
    project_id,parent_item_id,item_type,title,owner_id,status,priority,
    planned_start,planned_end,progress,created_by,approval_state
  ) values(
    v_project_id,v_phase_id,'activity','__QA_PERSON_CLEANUP_ACTIVITY__',
    v_project_owner,'ثبت شده','medium',current_date,current_date+1,0,
    v_delete_target,'approved'
  ) returning id into v_activity_id;
  select item.task_id into v_project_task_id
  from public.project_items item where item.id=v_activity_id;
  if v_project_task_id is null then
    raise exception 'QA project activity did not materialize its linked task';
  end if;

  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by
  ) values(
    '__QA_PERSON_CLEANUP_TASK__','',v_delete_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_delete_target
  ) returning id into v_standalone_task_id;

  -- Even a privileged API actor cannot PATCH the presentation identifier.
  -- Rejection must happen before any global resequencing side effect.
  select jsonb_agg(
    jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
    order by task.id
  ) into v_legacy_map_before
  from public.tasks task;
  perform set_config('request.jwt.claim.sub',v_project_owner::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('bamco.resequencing','',true);
  v_guarded:=false;
  begin
    update public.tasks
    set legacy_id=coalesce(legacy_id,id)+1000000
    where id=v_project_task_id;
  exception when insufficient_privilege then
    v_guarded:=true;
  end;
  if not v_guarded then
    raise exception 'direct task legacy_id PATCH bypassed the system guard';
  end if;
  if (
    select jsonb_agg(
      jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
      order by task.id
    ) from public.tasks task
  ) is distinct from v_legacy_map_before then
    raise exception 'rejected legacy_id PATCH changed one or more display IDs';
  end if;

  -- A missing JWT role makes auth.role() NULL. It must fail closed instead of
  -- turning `changed AND NOT verifier` into NULL and skipping the identity guard.
  perform set_config('request.jwt.claim.sub',v_project_owner::text,true);
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('bamco.deleting_person',v_delete_target::text,true);
  begin
    update public.project_items set created_by=null where id=v_phase_id;
  exception when check_violation then
    v_guarded:=true;
  end;
  if not v_guarded
     or (select created_by from public.project_items where id=v_phase_id) is null then
    raise exception 'NULL auth.role allowed a forged project-item creator cleanup';
  end if;

  perform set_config('request.jwt.claim.sub',v_project_owner::text,true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('bamco.deleting_person',v_delete_target::text,true);
  select to_jsonb(task) into v_project_task_before
  from public.tasks task where task.id=v_project_task_id;

  update public.projects set manager_id=null where id=v_legacy_project_id;
  if (select manager_id from public.projects where id=v_legacy_project_id)
       is distinct from v_project_owner then
    raise exception 'legacy project manager cleanup did not normalize to owner';
  end if;

  -- delete_person_account clears owners first, then its generic FK loop clears
  -- created_by. Both trigger passes must preserve every other task field.
  update public.tasks set owner_id=null where id=v_standalone_task_id;
  update public.tasks set created_by=null where id=v_standalone_task_id;
  if not exists(
    select 1 from public.tasks task
    where task.id=v_standalone_task_id
      and task.owner_id is null
      and task.created_by is null
      and task.title='__QA_PERSON_CLEANUP_TASK__'
  ) then
    raise exception 'sequential task owner/creator cleanup was rejected or corrupted';
  end if;

  update public.project_items set created_by=null where id=v_phase_id;
  if not exists(
    select 1 from public.project_items item
    where item.id=v_phase_id and item.created_by is null
      and item.title='__QA_PERSON_CLEANUP_PHASE__'
  ) then
    raise exception 'project item creator cleanup was rejected or corrupted';
  end if;

  update public.project_items set created_by=null where id=v_activity_id;
  if not exists(
    select 1 from public.project_items item
    where item.id=v_activity_id and item.created_by is null
      and item.title='__QA_PERSON_CLEANUP_ACTIVITY__'
  ) then
    raise exception 'project activity creator cleanup was rejected or corrupted';
  end if;
  if (select to_jsonb(task) from public.tasks task where task.id=v_project_task_id)
       is distinct from v_project_task_before then
    raise exception 'project activity creator cleanup mutated its linked task';
  end if;

  update public.tasks set created_by=null where id=v_project_task_id;
  if not exists(
    select 1 from public.tasks task
    where task.id=v_project_task_id and task.created_by is null
      and task.title='__QA_PERSON_CLEANUP_ACTIVITY__'
  ) then
    raise exception 'project-linked task creator cleanup was rejected or corrupted';
  end if;

  perform set_config('bamco.deleting_person','',true);
end;
$$;

-- Effective task writes must have one coherent policy per operation. A stale
-- permissive hierarchy policy would OR with the feature-aware policy.
do $$
declare
  v_insert_check text;
  v_update_using text;
  v_update_check text;
begin
  if exists(
    select 1 from pg_policies policy
    where policy.schemaname='public' and policy.tablename='tasks'
      and policy.policyname in ('tasks_hierarchy_insert','tasks_hierarchy_update')
  ) then
    raise exception 'stale permissive task hierarchy write policy survived';
  end if;
  if (
    select count(*) from pg_policies policy
    where policy.schemaname='public' and policy.tablename='tasks'
      and policy.cmd='INSERT'
  )<>1 or (
    select count(*) from pg_policies policy
    where policy.schemaname='public' and policy.tablename='tasks'
      and policy.cmd='UPDATE'
  )<>1 then
    raise exception 'task write policies are not canonical singletons';
  end if;
  select policy.with_check into v_insert_check
  from pg_policies policy
  where policy.schemaname='public' and policy.tablename='tasks'
    and policy.policyname='tasks_direct_insert';
  select policy.qual,policy.with_check into v_update_using,v_update_check
  from pg_policies policy
  where policy.schemaname='public' and policy.tablename='tasks'
    and policy.policyname='tasks_direct_update';
  if coalesce(v_insert_check,'') not like '%can_access_feature%kanban%create%'
     or coalesce(v_insert_check,'') like '%organization_can_assign_task%'
     or coalesce(v_insert_check,'') not like '%bamco_can_direct_manage_organization_user%'
     or coalesce(v_update_using,'') not like '%can_access_feature%kanban%edit%'
     or coalesce(v_update_check,'') not like '%can_access_feature%kanban%edit%' then
    raise exception 'task write policies lost their Kanban feature gates';
  end if;
end;
$$;

-- Create-authorized Excel imports may append an explicit display ID, but may
-- not insert a negative/existing/low ID that would reorder the global catalog.
do $$
declare
  v_actor uuid;
  v_target uuid;
  v_append_id bigint;
  v_inserted_id bigint;
  v_denied_count integer:=0;
  v_legacy_map_before jsonb;
  v_legacy_map_after jsonb;
  v_code text:='__QA_TASK_IMPORT_'||txid_current()::text||'__';
begin
  select actor.id,target.id into v_actor,v_target
  from public.profiles actor
  cross join public.profiles target
  where actor.active and target.active
    and private.feature_can_access_for(actor.id,'kanban','create')
    and private.organization_actor_can_direct_manage_user(actor.id,target.id)
  order by (actor.id=target.id),actor.id,target.id
  limit 1;
  if v_actor is null or v_target is null then
    raise exception 'QA requires a create-authorized direct-manage actor/target pair';
  end if;

  select coalesce(max(task.legacy_id),0)+1 into v_append_id
  from public.tasks task;
  select coalesce(jsonb_agg(
    jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
    order by task.id
  ),'[]'::jsonb) into v_legacy_map_before
  from public.tasks task;

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  begin
    insert into public.tasks(
      legacy_id,title,description,owner_id,status,priority,
      start_date,due_date,created_by
    ) values(
      -1,v_code||'_NEGATIVE','',v_target,'در حال انجام','متوسط',
      current_date,current_date+1,v_actor
    );
  exception when check_violation then
    v_denied_count:=v_denied_count+1;
  end;
  begin
    insert into public.tasks(
      legacy_id,title,description,owner_id,status,priority,
      start_date,due_date,created_by
    ) values(
      greatest(v_append_id-1,0),v_code||'_LOW','',v_target,
      'در حال انجام','متوسط',current_date,current_date+1,v_actor
    );
  exception when check_violation then
    v_denied_count:=v_denied_count+1;
  end;
  insert into public.tasks(
    legacy_id,title,description,owner_id,status,priority,
    start_date,due_date,created_by
  ) values(
    v_append_id,v_code||'_APPEND','',v_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor
  ) returning id into v_inserted_id;
  execute 'reset role';

  if v_denied_count<>2 then
    raise exception 'negative/low task display ID import was not rejected';
  end if;
  if (select legacy_id from public.tasks where id=v_inserted_id)
       is distinct from v_append_id then
    raise exception 'append-safe task display ID import was not preserved';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
    order by task.id
  ),'[]'::jsonb) into v_legacy_map_after
  from public.tasks task
  where task.id<>v_inserted_id;
  if v_legacy_map_after is distinct from v_legacy_map_before then
    raise exception 'append-safe/denied import reordered existing task display IDs';
  end if;
end;
$$;

-- SECURITY DEFINER lifecycle RPCs must enforce their operation-specific
-- feature capability instead of relying on RLS or migration ordering. Prove
-- delete is rejected while edit remains allowed, then prove restore is
-- rejected while delete remains allowed.
do $$
declare
  v_actor uuid;
  v_target uuid;
  v_delete_task_id bigint;
  v_restore_allowed_task_id bigint;
  v_restore_denied_task_id bigint;
  v_restored integer;
  v_delete_denied boolean:=false;
  v_restore_denied boolean:=false;
  v_delete_definition text;
  v_restore_definition text;
  v_code text:='__QA_TASK_RPC_'||txid_current()::text||'__';
begin
  select actor.id,target.id into v_actor,v_target
  from public.profiles actor
  cross join public.profiles target
  where actor.active and target.active
    and not private.is_system_manager(actor.id)
    and private.organization_actor_can_direct_manage_user(actor.id,target.id)
  order by (actor.id=target.id),actor.id,target.id
  limit 1;
  if v_actor is null or v_target is null then
    raise exception 'QA requires a non-system direct-manage actor/target pair';
  end if;

  delete from public.feature_access_grants grant_row
  where grant_row.feature_key='kanban'
    and grant_row.revoked_at is null
    and (
      (grant_row.subject_kind='user' and grant_row.user_id=v_actor)
      or (
        grant_row.subject_kind='organization_role'
        and grant_row.role_id in (
          select position.role_id
          from public.organization_position_assignments assignment
          join public.organization_positions position
            on position.id=assignment.position_id
          where assignment.user_id=v_actor
            and assignment.is_primary
            and assignment.valid_from<=current_date
            and (
              assignment.valid_to is null
              or assignment.valid_to>current_date
            )
            and position.active
        )
      )
    );
  insert into public.feature_access_grants(
    feature_key,subject_kind,user_id,effect,can_view,can_create,can_edit,
    can_delete,can_export,can_manage_access,can_bypass_approval,metadata
  ) values(
    'kanban','user',v_actor,'allow',true,false,true,false,
    false,false,false,jsonb_build_object('source','project_activity_rpc_qa')
  );
  if not private.feature_can_access_for(v_actor,'kanban','edit')
     or private.feature_can_access_for(v_actor,'kanban','delete') then
    raise exception 'QA could not establish edit-allowed/delete-denied access';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by
  ) values(
    v_code||'_DELETE','',v_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor
  ) returning id into v_delete_task_id;
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by,
    archived,archived_at
  ) values(
    v_code||'_RESTORE_ALLOWED','',v_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor,true,now()
  ) returning id into v_restore_allowed_task_id;
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by,
    archived,archived_at
  ) values(
    v_code||'_RESTORE_DENIED','',v_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor,true,now()
  ) returning id into v_restore_denied_task_id;

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  begin
    perform public.delete_tasks_and_resequence(array[v_delete_task_id]);
  exception when insufficient_privilege then
    v_delete_denied:=true;
  end;
  execute 'reset role';
  if not v_delete_denied
     or not exists(select 1 from public.tasks where id=v_delete_task_id) then
    raise exception 'delete RPC bypassed the explicit Kanban delete capability';
  end if;

  select public.restore_tasks_to_kanban_and_resequence(
    array[v_restore_allowed_task_id]
  ) into v_restored;
  if v_restored<>1 or coalesce((
    select task.archived from public.tasks task
    where task.id=v_restore_allowed_task_id
  ),true) then
    raise exception 'authorized archived-task restore did not complete';
  end if;
  if exists(
    select 1 from public.portal_messages message
    where message.entity_type='task'
      and (
        message.body is null
        or message.body~'^وظیفه -[0-9]+'
      )
  ) or exists(
    select 1
    from public.chat_messages chat_message
    join public.portal_messages message
      on message.id=chat_message.source_portal_message_id
    where message.entity_type='task'
      and (
        chat_message.body is null
        or chat_message.body~'^وظیفه -[0-9]+'
      )
  ) or exists(
    select 1 from public.chat_threads thread
    where thread.task_id is not null
      and thread.thread_type='direct'
      and (
        thread.title is null
        or thread.title~'^وظیفه -[0-9]+'
      )
  ) or exists(
    select 1
    from public.message_snapshots snapshot
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(snapshot.tasks)='array' then snapshot.tasks
        else '[]'::jsonb
      end
    ) entry(item)
    where entry.item->>'legacy_id'~'^-[0-9]+$'
  ) then
    raise exception 'archived restore/resequence leaked a null or negative task display reference';
  end if;

  update public.feature_access_grants grant_row
  set can_edit=false,can_delete=true
  where grant_row.feature_key='kanban'
    and grant_row.subject_kind='user'
    and grant_row.user_id=v_actor
    and grant_row.effect='allow'
    and grant_row.revoked_at is null;
  if private.feature_can_access_for(v_actor,'kanban','edit')
     or not private.feature_can_access_for(v_actor,'kanban','delete') then
    raise exception 'QA could not establish edit-denied/delete-allowed access';
  end if;

  execute 'set local role authenticated';
  begin
    perform public.restore_tasks_to_kanban_and_resequence(
      array[v_restore_denied_task_id]
    );
  exception when insufficient_privilege then
    v_restore_denied:=true;
  end;
  execute 'reset role';
  if not v_restore_denied
     or not coalesce((
       select task.archived from public.tasks task
       where task.id=v_restore_denied_task_id
     ),false) then
    raise exception 'restore RPC bypassed the explicit Kanban edit capability';
  end if;

  select pg_get_functiondef(
    'public.delete_tasks_and_resequence(bigint[])'::regprocedure
  ) into v_delete_definition;
  select pg_get_functiondef(
    'public.restore_tasks_to_kanban_and_resequence(bigint[])'::regprocedure
  ) into v_restore_definition;
  if coalesce(v_delete_definition,'')
       not like '%feature_can_access_for(auth.uid(),%kanban%delete%'
     or coalesce(v_restore_definition,'')
       not like '%feature_can_access_for(auth.uid(),%kanban%edit%' then
    raise exception 'task lifecycle RPC definitions lost explicit feature gates';
  end if;
end;
$$;

-- A direct-manage actor with an explicit Kanban deny must still be rejected by
-- INSERT and UPDATE RLS. A rejected import-style legacy_id must not resequence
-- unrelated tasks.
do $$
declare
  v_actor uuid;
  v_target uuid;
  v_seed_task_id bigint;
  v_changed bigint:=0;
  v_denied boolean:=false;
  v_legacy_map_before jsonb;
  v_code text:='__QA_TASK_POLICY_'||txid_current()::text||'__';
begin
  select actor.id,target.id into v_actor,v_target
  from public.profiles actor
  cross join public.profiles target
  where actor.active and target.active
    and not private.is_system_manager(actor.id)
    and private.organization_actor_can_direct_manage_user(actor.id,target.id)
  order by (actor.id=target.id),actor.id,target.id
  limit 1;
  if v_actor is null or v_target is null then
    raise exception 'QA requires a non-system direct-manage actor/target pair';
  end if;

  delete from public.feature_access_grants grant_row
  where grant_row.feature_key='kanban'
    and grant_row.subject_kind='user'
    and grant_row.user_id=v_actor
    and grant_row.resource_type is null
    and grant_row.revoked_at is null;
  insert into public.feature_access_grants(
    feature_key,subject_kind,user_id,effect,can_view,can_create,can_edit,
    can_delete,can_export,can_manage_access,can_bypass_approval,metadata
  ) values(
    'kanban','user',v_actor,'deny',true,true,true,false,false,false,false,
    jsonb_build_object('source','project_activity_policy_qa')
  );
  if private.feature_can_access_for(v_actor,'kanban','create')
     or private.feature_can_access_for(v_actor,'kanban','edit') then
    raise exception 'QA direct Kanban deny was not effective';
  end if;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.tasks(
    title,description,owner_id,status,priority,start_date,due_date,created_by
  ) values(
    v_code||'_SEED','',v_target,'در حال انجام','متوسط',
    current_date,current_date+1,v_actor
  ) returning id into v_seed_task_id;
  select jsonb_agg(
    jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
    order by task.id
  ) into v_legacy_map_before
  from public.tasks task;

  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  begin
    insert into public.tasks(
      legacy_id,title,description,owner_id,status,priority,
      start_date,due_date,created_by
    ) values(
      999999999,v_code||'_DENIED_IMPORT','',v_target,'در حال انجام','متوسط',
      current_date,current_date+1,v_actor
    );
  exception when insufficient_privilege then
    v_denied:=true;
  end;
  update public.tasks
  set title=v_code||'_DENIED_UPDATE'
  where id=v_seed_task_id;
  get diagnostics v_changed=row_count;
  execute 'reset role';

  if not v_denied or v_changed<>0 then
    raise exception 'Kanban feature deny did not block direct task insert/update';
  end if;
  if exists(select 1 from public.tasks where title like v_code||'_DENIED%') then
    raise exception 'denied direct task write persisted a row';
  end if;
  if (
    select jsonb_agg(
      jsonb_build_object('id',task.id,'legacy_id',task.legacy_id)
      order by task.id
    ) from public.tasks task
  ) is distinct from v_legacy_map_before then
    raise exception 'denied import-style task insert resequenced display IDs';
  end if;
end;
$$;

rollback;

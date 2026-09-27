-- One request has one actionable organisational approver.  The position tree
-- remains the sole source of truth: vacant boxes are skipped, policies cannot
-- add a second approver, and a manager's own changes are applied directly.

create or replace function private.route_change_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.change_requests%rowtype;
  v_requester_position bigint;
  v_structure_version bigint;
  v_workflow_id bigint;
  v_run_no integer;
  v_superior_id bigint;
  v_superior_title text;
  v_superior_role_key text;
  v_superior_user_id uuid;
  v_direct boolean:=false;
begin
  select * into v_request from public.change_requests where id=p_request_id for update;
  if not found then raise exception 'درخواست پیدا نشد.' using errcode='P0002'; end if;

  select position_id into v_requester_position
  from private.organization_active_primary_positions(v_request.requested_by)
  order by position_id desc limit 1;
  select structure_version into v_structure_version from public.organization_settings where singleton;
  select coalesce(max(run_no),0)+1 into v_run_no from public.organization_workflows where request_id=v_request.id;

  -- System managers, organisational managers and an explicitly authorised
  -- bypass user are direct actors.  Keep a one-step, already-approved
  -- workflow as the audit record and as the verified execution context for
  -- guarded operations such as project deletion; the change is still applied
  -- in this transaction without waiting for a superior.
  v_direct:=private.organization_actor_can_direct_manage_user(v_request.requested_by,v_request.requested_by);
  if v_direct then
    insert into public.organization_workflows(request_id,run_no,requester_position_id,structure_version,status,current_step,structure_snapshot)
    values(
      v_request.id,v_run_no,v_requester_position,coalesce(v_structure_version,1),'in_review',1,
      jsonb_build_array(jsonb_build_object(
        'step_no',1,'position_id',v_requester_position,'position_title','اقدام مستقیم مدیر',
        'role_key','manager_direct','approver_id',v_request.requested_by
      ))
    ) returning id into v_workflow_id;
    insert into public.organization_workflow_steps(
      workflow_id,step_no,position_id,approver_id,role_key,position_title,decision,note,decided_at
    ) values(
      v_workflow_id,1,v_requester_position,v_request.requested_by,'manager_direct',
      'اقدام مستقیم مدیر','approved','اقدام مستقیم مدیر',now()
    );
    update public.change_requests
       set organization_workflow_id=v_workflow_id,requester_position_id=v_requester_position,
           approval_chain_id=null,request_status='in_review',current_stage=1
     where id=v_request.id;
    perform private.apply_change_request(v_request.id,v_request.requested_by,v_request.proposed_data);
    update public.organization_workflows set status='approved',updated_at=now() where id=v_workflow_id;
    insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
    values(v_request.id,v_request.requested_by,'applied_directly','درخواست مدیر بدون ارجاع به بالادست اعمال شد.',jsonb_build_object('request_id',v_request.id,'workflow_id',v_workflow_id,'routing','direct_manager'));
    perform private.emit_relationship_event(v_request.requested_by,'approval_approved','درخواست شماره '||v_request.id||' اعمال شد','درخواست مدیر بدون نیاز به تأیید بالادست اعمال شد.','change_request',v_request.id::text,jsonb_build_object('request_id',v_request.id,'workflow_id',v_workflow_id,'routing','direct_manager'));
    return;
  end if;

  insert into public.organization_workflows(request_id,run_no,requester_position_id,structure_version,status,current_step,structure_snapshot)
  values(v_request.id,v_run_no,v_requester_position,coalesce(v_structure_version,1),'in_review',1,'{}'::jsonb)
  returning id into v_workflow_id;

  -- The first occupied ancestor is the only approver.  An empty immediate
  -- parent is deliberately ignored; no policy may append later levels.
  select ancestor.id,ancestor.title,ancestor.role_key,occupant.user_id
    into v_superior_id,v_superior_title,v_superior_role_key,v_superior_user_id
  from (
    with recursive ancestors(id,parent_position_id,title,role_key,depth_no) as (
      select parent.id,parent.parent_position_id,parent.title,role.role_key,1
      from public.organization_positions requester
      join public.organization_positions parent on parent.id=requester.parent_position_id and parent.active
      join public.organization_roles role on role.id=parent.role_id and role.active
      where requester.id=v_requester_position
      union all
      select parent.id,parent.parent_position_id,parent.title,role.role_key,child.depth_no+1
      from public.organization_positions parent
      join ancestors child on child.parent_position_id=parent.id
      join public.organization_roles role on role.id=parent.role_id and role.active
      where parent.active
    ) select * from ancestors order by depth_no
  ) ancestor
  join lateral (
    select coalesce(acting.acting_user_id,assignment.user_id) as user_id
    from public.organization_positions position
    left join lateral (
      select row.user_id from public.organization_position_assignments row
      join public.profiles profile on profile.id=row.user_id and profile.active
      where row.position_id=position.id and row.is_primary and row.valid_from<=current_date
        and (row.valid_to is null or row.valid_to>current_date)
      order by row.id desc limit 1
    ) assignment on true
    left join lateral (
      select row.acting_user_id from public.organization_position_acting row
      join public.profiles profile on profile.id=row.acting_user_id and profile.active
      where row.position_id=position.id and row.valid_from<=current_date and row.valid_to>=current_date
      order by row.id desc limit 1
    ) acting on true
    where position.id=ancestor.id
  ) occupant on occupant.user_id is not null and occupant.user_id is distinct from v_request.requested_by
  order by ancestor.depth_no
  limit 1;

  if v_superior_id is null then
    update public.organization_workflows
       set status='blocked',blocked_reason=case when v_requester_position is null then 'برای ثبت‌کننده سمت سازمانی فعال تعیین نشده است.' else 'هیچ بالادست فعال و دارای متصدی پیدا نشد.' end,
           structure_snapshot='[]'::jsonb,updated_at=now()
     where id=v_workflow_id;
    update public.change_requests set organization_workflow_id=v_workflow_id,requester_position_id=v_requester_position,request_status='pending',current_stage=1 where id=v_request.id;
    insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
    values(v_request.id,v_request.requested_by,'routed','گردش سازمانی متوقف شد؛ بالادست دارای متصدی یافت نشد.',jsonb_build_object('request_id',v_request.id,'workflow_id',v_workflow_id));
    return;
  end if;

  insert into public.organization_workflow_steps(workflow_id,step_no,position_id,approver_id,role_key,position_title)
  values(v_workflow_id,1,v_superior_id,v_superior_user_id,v_superior_role_key,v_superior_title);
  update public.organization_workflows
     set structure_snapshot=jsonb_build_array(jsonb_build_object('step_no',1,'position_id',v_superior_id,'position_title',v_superior_title,'role_key',v_superior_role_key,'approver_id',v_superior_user_id)),updated_at=now()
   where id=v_workflow_id;
  update public.change_requests
     set organization_workflow_id=v_workflow_id,requester_position_id=v_requester_position,request_status='in_review',current_stage=1,approval_chain_id=null
   where id=v_request.id;
  perform private.emit_relationship_event(v_superior_user_id,'approval_assigned','درخواست شماره '||v_request.id||' برای تأیید','درخواست شماره '||v_request.id||' در کارتابل شما قرار گرفت.','change_request',v_request.id::text,jsonb_build_object('request_id',v_request.id,'workflow_id',v_workflow_id,'step_no',1));
  begin
    perform private.create_portal_event(v_superior_user_id,'درخواست شماره '||v_request.id||' برای تأیید','درخواست شماره '||v_request.id||' در کارتابل شما قرار گرفت.','approval_request','change_request',v_request.id::text);
  exception when others then null;
  end;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(v_request.id,v_request.requested_by,'routed','درخواست شماره '||v_request.id||' فقط به نزدیک‌ترین بالادستِ دارای متصدی ارجاع شد.',jsonb_build_object('request_id',v_request.id,'workflow_id',v_workflow_id,'run_no',v_run_no,'structure_version',v_structure_version,'steps',1));
end;
$$;

-- Active requests created under the old multi-step policy must not continue
-- to an obsolete approver.  Keep their old workflow as cancelled audit
-- history, clear the legacy chain pointer, and create one fresh route through
-- the canonical function above.  A manager's still-open request is applied
-- immediately by that same function.
do $$
declare
  v_open_request record;
begin
  for v_open_request in
    select id,organization_workflow_id
    from public.change_requests
    where request_status in ('pending','in_review')
    for update
  loop
    update public.organization_workflows
       set status='cancelled',blocked_reason='گردش قبلی با سیاست تأیید تک‌مرحله‌ای جایگزین شد.',updated_at=now()
     where id=v_open_request.organization_workflow_id
       and status in ('in_review','blocked');
    update public.change_requests
       set request_status='pending',organization_workflow_id=null,
           requester_position_id=null,approval_chain_id=null,current_stage=1
     where id=v_open_request.id;
    perform private.route_change_request(v_open_request.id);
  end loop;
end;
$$;

-- The request identifier is part of every rendered notification, not an
-- inferred task identifier.  New workflows have one step; this also prevents
-- a stale multi-step workflow from moving to a new approver after this policy.
create or replace function public.review_request_stage(p_request_id bigint,p_decision text,p_note text default null,p_final_data jsonb default null)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.change_requests%rowtype;
  w public.organization_workflows%rowtype;
  s public.organization_workflow_steps%rowtype;
  payload jsonb;
  is_system_manager boolean:=private.is_system_manager(auth.uid());
  revision_note text:=nullif(btrim(coalesce(p_note,'')),'');
  manager_note text;
  previous_request_id text:=coalesce(current_setting('bamco.request_id',true),'');
  previous_source_path text:=coalesce(current_setting('bamco.source_path',true),'');
  previous_approval_apply text:=coalesce(current_setting('bamco.approval_apply',true),'');
begin
  if not private.feature_can_access_for(auth.uid(),'approvals','edit') then raise exception 'مجوز اقدام روی درخواست ندارید.' using errcode='42501'; end if;
  if p_decision not in ('approved','rejected','needs_revision') then raise exception 'تصمیم نامعتبر است.' using errcode='22023'; end if;
  select * into r from public.change_requests where id=p_request_id and request_status in ('pending','in_review','needs_revision') for update;
  if not found then raise exception 'درخواست باز پیدا نشد.' using errcode='P0002'; end if;
  select * into w from public.organization_workflows where id=r.organization_workflow_id for update;
  if not found then raise exception 'این درخواست در گردش سازمانی نیست.' using errcode='42501'; end if;
  select * into s from public.organization_workflow_steps where workflow_id=w.id and step_no=w.current_step and decision='pending' and (approver_id=auth.uid() or is_system_manager) for update;
  if not found then raise exception 'این درخواست در کارتابل شما نیست.' using errcode='42501'; end if;
  update public.organization_workflow_steps set decision=p_decision,note=p_note,decided_at=now() where id=s.id;
  -- Retire any historical later stages so no request can ever need a second approval.
  update public.organization_workflow_steps set decision='rejected',note='مرحلهٔ اضافی طبق سیاست تأیید تک‌مرحله‌ای لغو شد.',decided_at=now()
   where workflow_id=w.id and step_no>w.current_step and decision='pending';
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(r.id,auth.uid(),p_decision,p_note,jsonb_build_object('request_id',r.id,'workflow_id',w.id,'step_no',w.current_step,'manager_override',is_system_manager and s.approver_id is distinct from auth.uid()));
  if p_decision='rejected' then
    update public.organization_workflows set status='rejected',updated_at=now() where id=w.id;
    update public.change_requests set request_status='rejected',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=r.id;
    perform private.emit_relationship_event(r.requested_by,'approval_rejected','درخواست شماره '||r.id||' رد شد',coalesce(p_note,'درخواست شما رد شد.'),'change_request',r.id::text,jsonb_build_object('request_id',r.id,'workflow_id',w.id));
    return 'rejected';
  end if;
  if p_decision='needs_revision' then
    manager_note:=case when revision_note is null then null else 'یادداشت مدیر: '||revision_note end;
    update public.organization_workflows set status='needs_revision',updated_at=now() where id=w.id;
    update public.change_requests
       set request_status='needs_revision',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),
           proposed_data=case when manager_note is null then proposed_data else jsonb_set(
             coalesce(proposed_data,'{}'::jsonb),'{manager_notes}',to_jsonb(concat_ws(E'\n\n',nullif(btrim(proposed_data->>'manager_notes'),''),manager_note)),true
           ) end
     where id=r.id;
    -- A CREATE request has no task to annotate.  For every other request,
    -- keep the correction reason visible to the requester and restore the
    -- execution context afterwards so a later write cannot inherit it.
    if r.request_type<>'create' and r.task_id is not null and manager_note is not null then
      perform set_config('bamco.request_id',r.id::text,true);
      perform set_config('bamco.approval_apply','1',true);
      perform set_config('bamco.source_path','approval_revision_note',true);
      begin
        update public.tasks set manager_notes=concat_ws(E'\n\n',nullif(btrim(manager_notes),''),manager_note) where id=r.task_id;
      exception when others then
        perform set_config('bamco.request_id',previous_request_id,true);
        perform set_config('bamco.source_path',previous_source_path,true);
        perform set_config('bamco.approval_apply',previous_approval_apply,true);
        raise;
      end;
      perform set_config('bamco.request_id',previous_request_id,true);
      perform set_config('bamco.source_path',previous_source_path,true);
      perform set_config('bamco.approval_apply',previous_approval_apply,true);
    end if;
    perform private.emit_relationship_event(r.requested_by,'approval_needs_revision','درخواست شماره '||r.id||' برای اصلاح برگشت داده شد',coalesce(p_note,'لطفاً درخواست را اصلاح کنید.'),'change_request',r.id::text,jsonb_build_object('request_id',r.id,'workflow_id',w.id));
    return 'needs_revision';
  end if;
  payload:=coalesce(p_final_data,r.proposed_data);
  if payload ? 'owner_id' and nullif(payload->>'owner_id','')::uuid is distinct from r.requested_by then raise exception 'تأییدکننده نمی‌تواند متولی درخواست شخصی را به شخص دیگری تغییر دهد.' using errcode='42501'; end if;
  begin
    perform private.apply_change_request(r.id,auth.uid(),payload);
  exception when others then
    perform set_config('bamco.request_id',previous_request_id,true);
    perform set_config('bamco.source_path',previous_source_path,true);
    perform set_config('bamco.approval_apply',previous_approval_apply,true);
    raise;
  end;
  perform set_config('bamco.request_id',previous_request_id,true);
  perform set_config('bamco.source_path',previous_source_path,true);
  perform set_config('bamco.approval_apply',previous_approval_apply,true);
  update public.organization_workflows set status='approved',updated_at=now() where id=w.id;
  perform private.emit_relationship_event(r.requested_by,'approval_approved','درخواست شماره '||r.id||' تأیید و اعمال شد','تغییر درخواست شما اعمال شد.','change_request',r.id::text,jsonb_build_object('request_id',r.id,'workflow_id',w.id));
  return 'approved';
end;
$$;

grant execute on function public.review_request_stage(bigint,text,text,jsonb) to authenticated;

-- Request cancellation and approval status updates must not fan out through
-- task/WBS/progress synchronizers when their only effect is `approval_state`.
-- Those broad update triggers were the source of statement timeouts on busy
-- projects.  Keep task and roll-up synchronization for the business fields
-- that actually affect a project, and keep the approval marker lightweight.
drop trigger if exists project_item_activity_task_sync on public.project_items;
create trigger project_item_activity_task_sync
after insert or delete or update of task_id,title,description,owner_id,status,priority,planned_start,planned_end,progress
on public.project_items
for each row execute function private.sync_project_activity_task();

drop trigger if exists project_phase_progress_rollup on public.project_items;
create trigger project_phase_progress_rollup
after insert or delete or update of progress,weight,parent_item_id,project_id,item_type
on public.project_items
for each row execute function private.rollup_project_phase_progress();

drop trigger if exists project_items_progress on public.project_items;
create trigger project_items_progress
after insert or delete or update of progress,weight,project_id,item_type
on public.project_items
for each row execute function private.sync_project_progress();

-- Snapshot reads run after every review/cancellation.  These indexes match
-- their terminal/current request filters and prevent a per-row workflow scan.
create index if not exists change_requests_terminal_requester_idx
  on public.change_requests(requested_by,completed_at desc,id desc)
  where request_status in ('approved','rejected','cancelled');
create index if not exists organization_workflow_steps_approver_idx
  on public.organization_workflow_steps(approver_id,workflow_id,step_no);

create or replace function public.request_workflow_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current jsonb;
  v_history jsonb;
  v_routes jsonb;
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not private.feature_can_access_for(v_actor,'approvals','view') then
    raise exception 'دسترسی کارتابل تأیید ندارید.' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(request) order by request.created_at desc,request.id desc),'[]'::jsonb)
    into v_current
  from public.change_requests request
  left join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
  where request.request_status in ('pending','in_review','needs_revision')
    and (
      request.requested_by=v_actor
      or exists(
        select 1 from public.organization_workflow_steps step
        where step.workflow_id=workflow.id and step.step_no=workflow.current_step
          and step.approver_id=v_actor and step.decision='pending'
      )
      or private.is_system_manager(v_actor)
    );
  select coalesce(jsonb_agg(to_jsonb(request) order by coalesce(request.reviewed_at,request.completed_at,request.created_at) desc,request.id desc),'[]'::jsonb)
    into v_history
  from public.change_requests request
  where request.request_status in ('approved','rejected','cancelled')
    and (
      request.requested_by=v_actor
      or private.is_system_manager(v_actor)
      or exists(
        select 1
        from public.organization_workflows workflow
        join public.organization_workflow_steps step on step.workflow_id=workflow.id
        where workflow.request_id=request.id and step.approver_id=v_actor
      )
    );
  select coalesce(jsonb_agg(to_jsonb(route)),'[]'::jsonb) into v_routes
  from public.request_routing_status() route;
  return jsonb_build_object(
    'schema','bamco.workflow.v2',
    'current_requests',v_current,
    'history_requests',v_history,
    'routes',v_routes
  );
end;
$$;

grant execute on function public.request_workflow_snapshot() to authenticated;

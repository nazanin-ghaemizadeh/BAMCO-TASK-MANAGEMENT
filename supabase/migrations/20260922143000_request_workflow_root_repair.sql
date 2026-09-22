-- A vacant immediate position must not strand a request.  The request is
-- routed to the nearest occupied ancestor, while later approval levels still
-- follow the active policy.  This keeps the reporting tree authoritative
-- without making a vacant organisational box a dead end.
create or replace function private.route_change_request(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.change_requests%rowtype;
  v_policy public.approval_policies%rowtype;
  v_workflow_id bigint;
  v_requester_position bigint;
  v_structure_version bigint;
  v_run_no integer;
  v_max_levels integer:=1;
  v_step_no integer:=0;
  v_parent record;
  v_approver uuid;
  v_snapshot jsonb:='[]'::jsonb;
  v_allowed boolean;
begin
  select * into r from public.change_requests where id=p_request_id for update;
  if not found then raise exception 'درخواست پیدا نشد.' using errcode='P0002'; end if;

  select * into v_policy
  from public.approval_policies policy
  where policy.policy_key in (r.request_type,'task') and policy.active
  order by (policy.policy_key=r.request_type) desc,policy.id
  limit 1;
  v_max_levels:=greatest(coalesce(v_policy.max_levels,1),1);

  select position_id into v_requester_position
  from private.organization_active_primary_positions(r.requested_by)
  order by position_id desc limit 1;
  select structure_version into v_structure_version from public.organization_settings where singleton;
  select coalesce(max(run_no),0)+1 into v_run_no
  from public.organization_workflows where request_id=r.id;

  insert into public.organization_workflows(
    request_id,run_no,policy_id,requester_position_id,structure_version,status,current_step,structure_snapshot
  ) values(
    r.id,v_run_no,v_policy.id,v_requester_position,coalesce(v_structure_version,1),'in_review',1,'{}'::jsonb
  ) returning id into v_workflow_id;

  -- Find the first occupied superior.  For the first stage, an unoccupied
  -- direct parent is skipped; each following stage observes the policy.
  for v_parent in
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
    )
    select * from ancestors order by depth_no
  loop
    select coalesce(acting.acting_user_id,assignment.user_id) into v_approver
    from public.organization_positions position
    left join lateral (
      select active_assignment.user_id
      from public.organization_position_assignments active_assignment
      join public.profiles profile on profile.id=active_assignment.user_id and profile.active
      where active_assignment.position_id=position.id and active_assignment.is_primary
        and active_assignment.valid_from<=current_date
        and (active_assignment.valid_to is null or active_assignment.valid_to>current_date)
      order by active_assignment.id desc limit 1
    ) assignment on true
    left join lateral (
      select acting_row.acting_user_id
      from public.organization_position_acting acting_row
      join public.profiles profile on profile.id=acting_row.acting_user_id and profile.active
      where acting_row.position_id=position.id
        and acting_row.valid_from<=current_date and acting_row.valid_to>=current_date
      order by acting_row.id desc limit 1
    ) acting on true
    where position.id=v_parent.id;

    if v_approver is null or v_approver=r.requested_by then continue; end if;
    if v_step_no>0 then
      exit when v_step_no>=v_max_levels;
      v_allowed:=
        (not exists(select 1 from public.approval_policy_steps step_rule where step_rule.policy_id=v_policy.id)
          or exists(
            select 1 from public.approval_policy_steps step_rule
            where step_rule.policy_id=v_policy.id and step_rule.step_no=v_step_no+1
              and (step_rule.role_key is null or step_rule.role_key=v_parent.role_key)
          ))
        and (
          coalesce(array_length(v_policy.required_role_keys,1),0)=0
          or v_parent.role_key=any(v_policy.required_role_keys)
        );
      if not v_allowed then continue; end if;
    end if;

    v_step_no:=v_step_no+1;
    insert into public.organization_workflow_steps(workflow_id,step_no,position_id,approver_id,role_key,position_title)
    values(v_workflow_id,v_step_no,v_parent.id,v_approver,v_parent.role_key,v_parent.title);
    v_snapshot:=v_snapshot||jsonb_build_array(jsonb_build_object(
      'step_no',v_step_no,'position_id',v_parent.id,'position_title',v_parent.title,
      'role_key',v_parent.role_key,'approver_id',v_approver,'required_direct_parent',v_step_no=1
    ));
  end loop;

  if v_step_no=0 then
    update public.organization_workflows
       set status='blocked',
           blocked_reason=case when v_requester_position is null then 'برای ثبت‌کننده سمت سازمانی فعال تعیین نشده است.' else 'هیچ بالادست فعال و دارای متصدی پیدا نشد.' end,
           structure_snapshot=v_snapshot,updated_at=now()
     where id=v_workflow_id;
    update public.change_requests
       set organization_workflow_id=v_workflow_id,requester_position_id=v_requester_position,
           request_status='pending',current_stage=1
     where id=r.id;
  else
    update public.organization_workflows set structure_snapshot=v_snapshot,updated_at=now() where id=v_workflow_id;
    update public.change_requests
       set organization_workflow_id=v_workflow_id,requester_position_id=v_requester_position,
           request_status='in_review',current_stage=1,approval_chain_id=null
     where id=r.id;
    select approver_id into v_approver from public.organization_workflow_steps where workflow_id=v_workflow_id and step_no=1;
    perform private.emit_relationship_event(
      v_approver,'approval_assigned','درخواست جدید برای تأیید','یک درخواست در کارتابل شما قرار گرفت.',
      'change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow_id,'run_no',v_run_no,'step_no',1)
    );
    begin
      perform private.create_portal_event(v_approver,'درخواست جدید برای تأیید','یک درخواست در کارتابل شما قرار گرفت.','approval_request','change_request',r.id::text);
    exception when others then null;
    end;
  end if;

  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(
    r.id,auth.uid(),'routed',
    case when v_step_no=0 then 'گردش سازمانی متوقف شد؛ ساختار سازمانی نیازمند تکمیل است.' else 'درخواست به نزدیک‌ترین بالادستِ دارای متصدی ارجاع شد.' end,
    jsonb_build_object('workflow_id',v_workflow_id,'run_no',v_run_no,'structure_version',v_structure_version,'steps',v_snapshot)
  );
end;
$$;

-- The system manager can inspect and decide a current stage when necessary.
-- The event actor preserves the audit trail even if that actor is not the
-- designated organisational approver.
create or replace function public.review_request_stage(
  p_request_id bigint,
  p_decision text,
  p_note text default null,
  p_final_data jsonb default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.change_requests%rowtype;
  v_workflow public.organization_workflows%rowtype;
  v_step public.organization_workflow_steps%rowtype;
  v_next_step integer;
  v_payload jsonb;
  v_next_approver uuid;
  v_manager boolean:=private.is_system_manager(auth.uid());
begin
  if not private.feature_can_access_for(auth.uid(),'approvals','edit') then
    raise exception 'مجوز اقدام روی درخواست ندارید.' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected','needs_revision') then
    raise exception 'تصمیم نامعتبر است.' using errcode='22023';
  end if;
  select * into r from public.change_requests
  where id=p_request_id and request_status in ('pending','in_review','needs_revision') for update;
  if not found then raise exception 'درخواست باز پیدا نشد.' using errcode='P0002'; end if;
  if r.organization_workflow_id is null then raise exception 'این درخواست در گردش سازمانی نیست.' using errcode='42501'; end if;
  select * into v_workflow from public.organization_workflows where id=r.organization_workflow_id for update;
  select * into v_step from public.organization_workflow_steps
  where workflow_id=v_workflow.id and step_no=v_workflow.current_step
    and decision='pending' and (v_manager or approver_id=auth.uid())
  for update;
  if not found then raise exception 'این درخواست در کارتابل شما نیست.' using errcode='42501'; end if;
  update public.organization_workflow_steps set decision=p_decision,note=p_note,decided_at=now() where id=v_step.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(r.id,auth.uid(),p_decision,p_note,jsonb_build_object('workflow_id',v_workflow.id,'run_no',v_workflow.run_no,'step_no',v_workflow.current_step,'manager_override',v_manager and v_step.approver_id is distinct from auth.uid()));

  if p_decision='rejected' then
    update public.organization_workflows set status='rejected',updated_at=now() where id=v_workflow.id;
    update public.change_requests set request_status='rejected',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=r.id;
    perform private.emit_relationship_event(r.requested_by,'approval_rejected','درخواست رد شد',coalesce(p_note,'درخواست شما رد شد.'),'change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id));
    return 'rejected';
  end if;
  if p_decision='needs_revision' then
    update public.organization_workflows set status='needs_revision',updated_at=now() where id=v_workflow.id;
    update public.change_requests set request_status='needs_revision',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
    perform private.emit_relationship_event(r.requested_by,'approval_needs_revision','درخواست برای اصلاح برگشت داده شد',coalesce(p_note,'لطفاً درخواست را اصلاح کنید.'),'change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id));
    return 'needs_revision';
  end if;
  select min(step_no) into v_next_step from public.organization_workflow_steps where workflow_id=v_workflow.id and step_no>v_workflow.current_step;
  if v_next_step is not null then
    update public.organization_workflows set current_step=v_next_step,updated_at=now() where id=v_workflow.id;
    update public.change_requests set current_stage=v_next_step where id=r.id;
    select approver_id into v_next_approver from public.organization_workflow_steps where workflow_id=v_workflow.id and step_no=v_next_step;
    perform private.emit_relationship_event(v_next_approver,'approval_assigned','درخواست جدید برای تأیید','درخواست به مرحله بعدی گردش رسید.','change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id,'step_no',v_next_step));
    begin
      perform private.create_portal_event(v_next_approver,'درخواست جدید برای تأیید','درخواست به مرحله بعدی گردش رسید.','approval_request','change_request',r.id::text);
    exception when others then null;
    end;
    return 'next_stage';
  end if;
  v_payload:=coalesce(p_final_data,r.proposed_data);
  if v_payload ? 'owner_id' and nullif(v_payload->>'owner_id','')::uuid is distinct from r.requested_by then
    raise exception 'تأییدکننده نمی‌تواند متولی درخواست شخصی را به شخص دیگری تغییر دهد.' using errcode='42501';
  end if;
  perform private.apply_change_request(r.id,auth.uid(),v_payload);
  update public.organization_workflows set status='approved',updated_at=now() where id=v_workflow.id;
  perform private.emit_relationship_event(r.requested_by,'approval_approved','درخواست تأیید شد','تغییر درخواست شما اعمال شد.','change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id));
  return 'approved';
end;
$$;

create or replace function public.request_routing_status()
returns table(request_id bigint,stage_no smallint,stage_title text,approver_names text,actionable boolean)
language sql
stable
security definer
set search_path=''
as $$
  select request.id,workflow.current_step::smallint,
    coalesce(string_agg(distinct step.position_title,'، ' order by step.position_title),'بدون بالادست'),
    string_agg(distinct coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text),'، ' order by coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text)),
    coalesce(bool_or((step.approver_id=auth.uid() or private.is_system_manager(auth.uid())) and step.decision='pending'),false)
  from public.change_requests request
  join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step on step.workflow_id=workflow.id and step.step_no=workflow.current_step
  left join public.profiles profile on profile.id=step.approver_id
  where request.request_status in ('pending','in_review','needs_revision')
    and (request.requested_by=auth.uid() or step.approver_id=auth.uid() or private.is_system_manager(auth.uid()))
  group by request.id,workflow.current_step;
$$;

create or replace function public.amend_change_request(p_request_id bigint,p_proposed_data jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.change_requests%rowtype;
  v_owner uuid;
begin
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then raise exception 'اطلاعات درخواست نامعتبر است.' using errcode='22023'; end if;
  if auth.uid() is null or not private.feature_can_access_for(auth.uid(),'kanban','edit') then raise exception 'مجوز ویرایش درخواست را ندارید.' using errcode='42501'; end if;
  select * into v_request from public.change_requests
  where id=p_request_id and requested_by=auth.uid() and request_status in ('pending','in_review') for update;
  if not found then raise exception 'درخواست قابل ویرایش پیدا نشد.' using errcode='42501'; end if;
  v_owner:=nullif(p_proposed_data->>'owner_id','')::uuid;
  if v_owner is not null and v_owner is distinct from auth.uid() then raise exception 'درخواست شخصی فقط می‌تواند متولی خود کاربر را داشته باشد.' using errcode='42501'; end if;
  if p_proposed_data ? 'owner_id' then p_proposed_data:=jsonb_set(p_proposed_data,'{owner_id}',to_jsonb(auth.uid()::text),true); end if;
  if v_request.organization_workflow_id is not null then update public.organization_workflows set status='cancelled',updated_at=now() where id=v_request.organization_workflow_id; end if;
  update public.change_requests set proposed_data=coalesce(p_proposed_data,'{}'::jsonb),request_status='pending',revision_count=revision_count+1,resubmitted_at=now(),reviewed_by=null,reviewed_at=null,manager_note=null,current_stage=1,completed_at=null,final_data=null,applied_task_id=null,organization_workflow_id=null where id=v_request.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot) values(p_request_id,auth.uid(),'amended','ثبت‌کننده درخواست را ویرایش و دوباره ارسال کرد.',p_proposed_data);
  perform private.route_change_request(p_request_id);
end;
$$;

create or replace function public.cancel_change_request(p_request_id bigint,p_note text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_request public.change_requests%rowtype;
begin
  if auth.uid() is null or not private.feature_can_access_for(auth.uid(),'kanban','edit') then raise exception 'مجوز لغو درخواست را ندارید.' using errcode='42501'; end if;
  select * into v_request from public.change_requests where id=p_request_id and requested_by=auth.uid() and request_status in ('pending','in_review','needs_revision') for update;
  if not found then raise exception 'درخواست قابل لغو پیدا نشد.' using errcode='42501'; end if;
  if v_request.organization_workflow_id is not null then update public.organization_workflows set status='cancelled',updated_at=now() where id=v_request.organization_workflow_id; end if;
  update public.change_requests set request_status='cancelled',manager_note=coalesce(nullif(btrim(p_note),''),'لغو توسط ثبت‌کننده'),reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=v_request.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot) values(p_request_id,auth.uid(),'cancelled',coalesce(nullif(btrim(p_note),''),'لغو توسط ثبت‌کننده'),'{}'::jsonb);
end;
$$;

-- Unassigned intake work is visible and manageable only by the system manager.
create or replace function public.organization_can_view_task(p_task_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and (public.can_access_feature('kanban','view') or public.can_access_feature('archive','view'))
    and exists(select 1 from public.tasks task where task.id=p_task_id and (
      (task.owner_id is null and private.is_system_manager(auth.uid()))
      or (task.owner_id is not null and private.organization_actor_can_view_user(auth.uid(),coalesce(task.owner_id,task.created_by)))
    ));
$$;

create or replace function public.organization_can_manage_task(p_task_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and private.feature_can_access_for(auth.uid(),'kanban','edit')
    and exists(select 1 from public.tasks task where task.id=p_task_id and (
      (task.owner_id is null and private.is_system_manager(auth.uid()))
      or (task.owner_id is not null and private.organization_actor_can_direct_manage_user(auth.uid(),coalesce(task.owner_id,task.created_by)))
    ));
$$;

revoke all on function public.amend_change_request(bigint,jsonb) from public,anon;
revoke all on function public.cancel_change_request(bigint,text) from public,anon;
grant execute on function public.amend_change_request(bigint,jsonb) to authenticated;
grant execute on function public.cancel_change_request(bigint,text) to authenticated;

-- Repair current requests that were blocked only because their immediate
-- parent position was vacant; their immutable old workflow remains auditable.
do $$
declare v_request_id bigint;
begin
  for v_request_id in
    select request.id
    from public.change_requests request
    left join public.organization_workflows workflow on workflow.id=request.organization_workflow_id
    where request.request_status='pending'
      and (workflow.id is null or workflow.status='blocked')
  loop
    perform private.route_change_request(v_request_id);
  end loop;
end;
$$;

notify pgrst,'reload schema';

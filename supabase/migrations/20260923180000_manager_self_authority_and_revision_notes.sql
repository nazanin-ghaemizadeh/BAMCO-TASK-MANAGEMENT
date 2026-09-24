-- A person in the organizational «مدیر» role may directly manage only their
-- own tasks (and, as before, every strict descendant).  This is deliberately
-- narrower than a system-manager bypass.
create or replace function private.organization_actor_can_direct_manage_user(p_actor uuid,p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    p_actor is not null and p_target_user is not null and (
      private.is_system_manager(p_actor)
      or p_target_user in (
        select descendant.user_id
        from private.organization_strict_descendant_user_ids(p_actor) descendant
      )
      or (
        p_actor=p_target_user
        and (
          private.feature_can_access_for(p_actor,'approvals','bypass_approval')
          or exists(
            select 1
            from public.organization_position_assignments assignment
            join public.organization_positions position on position.id=assignment.position_id and position.active
            join public.organization_roles organization_role on organization_role.id=position.role_id and organization_role.active
            where assignment.user_id=p_actor
              and assignment.is_primary
              and assignment.valid_from<=current_date
              and (assignment.valid_to is null or assignment.valid_to>current_date)
              and organization_role.role_key='manager'
          )
        )
      )
    ),false
  );
$$;

-- Keep the review comment visible where the requester works: on the original
-- task's «توضیحات مدیر».  For a not-yet-created task, keep the same note in
-- the requested payload so it is persisted when the request is later applied.
create or replace function public.review_request_stage(p_request_id bigint,p_decision text,p_note text default null,p_final_data jsonb default null)
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
  v_note text:=nullif(btrim(coalesce(p_note,'')), '');
  v_manager_note text;
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

  update public.organization_workflow_steps
  set decision=p_decision,note=p_note,decided_at=now()
  where id=v_step.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(r.id,auth.uid(),p_decision,p_note,jsonb_build_object('workflow_id',v_workflow.id,'run_no',v_workflow.run_no,'step_no',v_workflow.current_step,'manager_override',v_manager and v_step.approver_id is distinct from auth.uid()));

  if p_decision='rejected' then
    update public.organization_workflows set status='rejected',updated_at=now() where id=v_workflow.id;
    update public.change_requests set request_status='rejected',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=r.id;
    perform private.emit_relationship_event(r.requested_by,'approval_rejected','درخواست رد شد',coalesce(p_note,'درخواست شما رد شد.'),'change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id));
    return 'rejected';
  end if;

  if p_decision='needs_revision' then
    v_manager_note:=case when v_note is null then null else 'یادداشت مدیر: '||v_note end;
    update public.organization_workflows set status='needs_revision',updated_at=now() where id=v_workflow.id;
    update public.change_requests
    set request_status='needs_revision',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),
        proposed_data=case when v_manager_note is null then proposed_data else jsonb_set(
          coalesce(proposed_data,'{}'::jsonb),'{manager_notes}',to_jsonb(concat_ws(E'\n\n',nullif(btrim(proposed_data->>'manager_notes'),''),v_manager_note)),true
        ) end
    where id=r.id;
    if r.task_id is not null and v_manager_note is not null then
      perform set_config('bamco.approval_apply','1',true);
      perform set_config('bamco.source_path','approval_revision_note',true);
      update public.tasks
      set manager_notes=concat_ws(E'\n\n',nullif(btrim(manager_notes),''),v_manager_note)
      where id=r.task_id;
    end if;
    perform private.emit_relationship_event(r.requested_by,'approval_needs_revision','درخواست برای اصلاح برگشت داده شد',coalesce(p_note,'لطفاً درخواست را اصلاح کنید.'),'change_request',r.id::text,jsonb_build_object('workflow_id',v_workflow.id));
    return 'needs_revision';
  end if;

  select min(step_no) into v_next_step
  from public.organization_workflow_steps
  where workflow_id=v_workflow.id and step_no>v_workflow.current_step;
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

revoke all on function private.organization_actor_can_direct_manage_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.review_request_stage(bigint,text,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.review_request_stage(p_request_id bigint, p_decision text, p_note text DEFAULT NULL::text, p_final_data jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.change_requests%rowtype;
  w public.organization_workflows%rowtype;
  s public.organization_workflow_steps%rowtype;
  payload jsonb;
  is_system_manager boolean:=private.is_system_manager(auth.uid());
  revision_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_manager_note text;
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
    v_manager_note:=case when revision_note is null then null else 'یادداشت مدیر: '||revision_note end;
    update public.organization_workflows set status='needs_revision',updated_at=now() where id=w.id;
    update public.change_requests
       set request_status='needs_revision',manager_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),
           proposed_data=case when v_manager_note is null then proposed_data else jsonb_set(
             coalesce(proposed_data,'{}'::jsonb),'{manager_notes}',to_jsonb(concat_ws(E'\n\n',nullif(btrim(proposed_data->>'manager_notes'),''),v_manager_note)),true
           ) end
     where id=r.id;
    -- A CREATE request has no task to annotate.  For every other request,
    -- keep the correction reason visible to the requester and restore the
    -- execution context afterwards so a later write cannot inherit it.
    if r.request_type<>'create' and r.task_id is not null and v_manager_note is not null then
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
$function$
;

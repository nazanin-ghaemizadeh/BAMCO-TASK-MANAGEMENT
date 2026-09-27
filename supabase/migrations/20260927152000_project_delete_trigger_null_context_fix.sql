-- Only a request explicitly marked as a project deletion may enter this
-- trigger. In PL/pgSQL, `NULL <> 'project_delete'` evaluates to NULL, and an
-- `if` condition with NULL does not take the return branch. Legacy task
-- requests have no request_context, so they previously fell through and were
-- incorrectly rejected as malformed project deletions.
create or replace function private.apply_approved_project_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_project_id bigint;
  v_project_owner uuid;
begin
  if new.request_status is distinct from 'approved'
     or old.request_status = 'approved'
     or coalesce(new.proposed_data->>'request_context','') <> 'project_delete' then
    return new;
  end if;

  v_project_id:=nullif(new.proposed_data->>'project_id','')::bigint;
  if v_project_id is null then
    raise exception 'شناسهٔ پروژه در درخواست حذف معتبر نیست.' using errcode='23514';
  end if;

  select project.owner_id into v_project_owner
  from public.projects project
  where project.id=v_project_id
  for update;
  if not found then
    raise exception 'پروژه برای حذف تأییدشده پیدا نشد.' using errcode='P0002';
  end if;
  if v_project_owner::text is distinct from new.proposed_data->>'project_owner_id' then
    raise exception 'مالک پروژه پس از ثبت درخواست تغییر کرده است؛ درخواست حذف باید دوباره ثبت شود.' using errcode='23514';
  end if;
  if not private.project_delete_approval_active(v_project_id) then
    raise exception 'مسیر تأیید حذف پروژه معتبر نیست.' using errcode='42501';
  end if;

  update public.organization_workflows workflow
  set status='cancelled',updated_at=now()
  from public.change_requests request
  where request.organization_workflow_id=workflow.id
    and request.id<>new.id
    and request.proposed_data->>'request_context'='project_activity'
    and request.proposed_data->>'project_id'=v_project_id::text
    and request.request_status in ('pending','in_review','needs_revision');

  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  select request.id,auth.uid(),'cancelled','پروژه پس از تأیید حذف شد.',
    jsonb_build_object('project_id',v_project_id,'approved_request_id',new.id)
  from public.change_requests request
  where request.id<>new.id
    and request.proposed_data->>'request_context'='project_activity'
    and request.proposed_data->>'project_id'=v_project_id::text
    and request.request_status in ('pending','in_review','needs_revision');

  update public.change_requests request
  set request_status='cancelled',manager_note='پروژه پس از تأیید حذف شد.',
      reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now()
  where request.id<>new.id
    and request.proposed_data->>'request_context'='project_activity'
    and request.proposed_data->>'project_id'=v_project_id::text
    and request.request_status in ('pending','in_review','needs_revision');

  delete from public.projects where id=v_project_id;

  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(new.id,auth.uid(),'applied','پروژه و فعالیت‌های وابسته پس از تأیید حذف شدند.',
    jsonb_build_object('project_id',v_project_id));
  return new;
end;
$$;
revoke all on function private.apply_approved_project_delete()
  from public,anon,authenticated;

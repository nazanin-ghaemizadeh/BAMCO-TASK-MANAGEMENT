-- A project is deleted as one organization-routed request. The WBS and its
-- linked Kanban tasks are removed only in the final approval transaction.
create unique index if not exists change_requests_one_open_project_delete_idx
  on public.change_requests ((proposed_data->>'project_id'))
  where proposed_data->>'request_context'='project_delete'
    and request_status in ('pending','in_review','needs_revision');

create or replace function private.guard_project_delete_request_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.proposed_data->>'request_context'='project_delete' and (
      coalesce(current_setting('bamco.project_delete_submit',true),'')<>'1'
      or new.requested_by is distinct from auth.uid()
      or new.request_type<>'delete' or new.task_id is not null
    ) then
      raise exception 'درخواست حذف پروژه فقط از مسیر پروژه مجاز است.' using errcode='42501';
    end if;
  elsif old.proposed_data->>'request_context'='project_delete'
     or new.proposed_data->>'request_context'='project_delete' then
    if old.proposed_data->>'request_context' is distinct from 'project_delete'
       or new.proposed_data->>'request_context' is distinct from 'project_delete'
       or new.request_type is distinct from old.request_type
       or new.task_id is not null or new.requested_by is distinct from old.requested_by
       or new.proposed_data->>'project_id' is distinct from old.proposed_data->>'project_id'
       or new.proposed_data->>'project_owner_id' is distinct from old.proposed_data->>'project_owner_id'
       or new.proposed_data->>'title' is distinct from old.proposed_data->>'title' then
      raise exception 'هویت درخواست حذف پروژه قابل تغییر نیست.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_project_delete_request_identity() from public,anon,authenticated;
drop trigger if exists change_request_project_delete_identity on public.change_requests;
create trigger change_request_project_delete_identity
before insert or update on public.change_requests
for each row execute function private.guard_project_delete_request_identity();

create or replace function public.request_project_deletion(p_project_id bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_project public.projects%rowtype;
  v_request_id bigint;
  v_previous text:=coalesce(current_setting('bamco.project_delete_submit',true),'');
begin
  if v_actor is null or not exists(
    select 1 from public.profiles profile where profile.id=v_actor and profile.active
  ) or not private.feature_can_access_for(v_actor,'projects','delete') then
    raise exception 'مجوز درخواست حذف پروژه را ندارید.' using errcode='42501';
  end if;
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or not public.platform_can_access_project(p_project_id) then
    raise exception 'پروژه در محدوده دسترسی شما پیدا نشد.' using errcode='42501';
  end if;
  if exists(
    select 1 from public.change_requests request
    where request.proposed_data->>'request_context'='project_delete'
      and request.proposed_data->>'project_id'=p_project_id::text
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'درخواست حذف این پروژه از قبل در جریان است.' using errcode='55000';
  end if;
  perform set_config('bamco.project_delete_submit','1',true);
  begin
    insert into public.change_requests(
      task_id,request_type,before_data,proposed_data,requested_by,
      request_status,requester_note
    ) values(
      null,'delete',to_jsonb(v_project),jsonb_build_object(
        'request_context','project_delete','request_label','حذف پروژه',
        'project_id',v_project.id,'project_owner_id',v_project.owner_id,
        'title',v_project.title
      ),v_actor,'pending',null
    ) returning id into v_request_id;
  exception when others then
    perform set_config('bamco.project_delete_submit',v_previous,true);
    raise;
  end;
  perform set_config('bamco.project_delete_submit',v_previous,true);
  perform private.route_change_request(v_request_id);
  return v_request_id;
end;
$$;
revoke all on function public.request_project_deletion(bigint) from public,anon;
grant execute on function public.request_project_deletion(bigint) to authenticated;

create or replace function public.resubmit_project_deletion(p_request_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.change_requests%rowtype;
begin
  select * into v_request from public.change_requests
  where id=p_request_id and requested_by=auth.uid()
    and request_type='delete' and proposed_data->>'request_context'='project_delete'
    and request_status='needs_revision' for update;
  if not found or not private.feature_can_access_for(auth.uid(),'projects','delete')
     or not exists(
       select 1 from public.projects project
       where project.id=(v_request.proposed_data->>'project_id')::bigint
         and project.owner_id::text=v_request.proposed_data->>'project_owner_id'
     ) then
    raise exception 'درخواست حذف پروژه برای ارسال مجدد در دسترس نیست.' using errcode='42501';
  end if;
  update public.organization_workflows set status='cancelled',updated_at=now()
  where id=v_request.organization_workflow_id;
  update public.change_requests set request_status='pending',
    revision_count=revision_count+1,resubmitted_at=now(),reviewed_by=null,
    reviewed_at=null,manager_note=null,current_stage=1,completed_at=null,
    final_data=null,applied_task_id=null,organization_workflow_id=null
  where id=v_request.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(v_request.id,auth.uid(),'resubmitted','درخواست حذف پروژه دوباره ارسال شد',v_request.proposed_data);
  perform private.route_change_request(v_request.id);
end;
$$;
revoke all on function public.resubmit_project_deletion(bigint) from public,anon;
grant execute on function public.resubmit_project_deletion(bigint) to authenticated;

create or replace function public.cancel_project_deletion(p_request_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.change_requests%rowtype;
begin
  select * into v_request from public.change_requests
  where id=p_request_id and requested_by=auth.uid()
    and request_type='delete' and proposed_data->>'request_context'='project_delete'
    and request_status in ('pending','in_review','needs_revision') for update;
  if not found or not private.feature_can_access_for(auth.uid(),'projects','delete') then
    raise exception 'درخواست حذف پروژه برای لغو در دسترس نیست.' using errcode='42501';
  end if;
  update public.organization_workflows set status='cancelled',updated_at=now()
  where id=v_request.organization_workflow_id;
  update public.change_requests set request_status='cancelled',
    cancellation_note='لغو توسط ثبت‌کننده',cancelled_by=auth.uid(),
    reviewed_by=null,reviewed_at=now(),completed_at=now()
  where id=v_request.id;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(v_request.id,auth.uid(),'cancelled','درخواست حذف پروژه لغو شد',
    jsonb_build_object('cancelled_by_requester',true));
end;
$$;
revoke all on function public.cancel_project_deletion(bigint) from public,anon;
grant execute on function public.cancel_project_deletion(bigint) to authenticated;

-- The request marker is a hint, never an authorization decision by itself.
create or replace function private.project_delete_approval_active(p_project_id bigint)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(exists(
    select 1 from public.change_requests request
    join public.organization_workflows workflow
      on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id and step.step_no=workflow.current_step
    where request.id=case
        when coalesce(current_setting('bamco.request_id',true),'')~'^[0-9]+$'
        then current_setting('bamco.request_id',true)::bigint else null end
      and coalesce(current_setting('bamco.approval_apply',true),'')='1'
      and coalesce(current_setting('bamco.source_path',true),'')='approval_workflow'
      and request.request_type='delete' and request.task_id is null
      and request.proposed_data->>'request_context'='project_delete'
      and request.proposed_data->>'project_id'=p_project_id::text
      and request.proposed_data->>'project_owner_id'=request.before_data->>'owner_id'
      and not exists(
        select 1 from public.projects project where project.id=p_project_id
          and project.owner_id::text is distinct from request.proposed_data->>'project_owner_id'
      )
      and request.request_status='approved' and request.reviewed_by=auth.uid()
      and request.xmin::text::bigint=txid_current()
      and workflow.status='in_review' and step.decision='approved'
      and (step.approver_id=auth.uid() or private.is_system_manager(auth.uid()))
  ),false);
$$;
revoke all on function private.project_delete_approval_active(bigint) from public,anon,authenticated;

-- The existing per-item guards continue to protect independent item deletion.
create or replace function private.guard_project_item_open_request_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if private.project_delete_approval_active(old.project_id) then return old; end if;
  perform 1 from public.projects project where project.id=old.project_id for update;
  if exists(
    with recursive subtree(id,item_type) as (
      select old.id,old.item_type
      union all select child.id,child.item_type from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree where id<>old.id and item_type='activity'
  ) then
    raise exception 'ابتدا فعالیت‌های زیرمجموعه را جداگانه حذف کنید.' using errcode='55000';
  end if;
  if exists(
    with recursive subtree(id) as (
      select old.id union all select child.id from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree join public.change_requests request
      on request.proposed_data->>'parent_item_id'=subtree.id::text
    where request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'project_id'=old.project_id::text
      and request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'این گره، بالادست یک درخواست فعالیت باز است.' using errcode='55000';
  end if;
  if exists(
    with recursive subtree(id) as (
      select old.id union all select child.id from public.project_items child
      join subtree parent on child.parent_item_id=parent.id
    ) select 1 from subtree join public.project_items item on item.id=subtree.id
      join public.change_requests request on request.id=item.approval_request_id
    where request.request_status in ('pending','in_review','needs_revision')
  ) then
    raise exception 'ابتدا درخواست باز فعالیت‌های زیرمجموعه را تعیین تکلیف کنید.' using errcode='55000';
  end if;
  return old;
end;
$$;

create or replace function private.guard_project_open_request_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not private.project_delete_approval_active(old.id) then
    raise exception 'حذف پروژه باید برای تأیید بالادست ارسال شود.' using errcode='42501';
  end if;
  return old;
end;
$$;

create or replace function private.apply_approved_project_delete()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_project_id bigint;
begin
  if new.request_status<>'approved' or old.request_status='approved'
     or new.proposed_data->>'request_context'<>'project_delete' then
    return new;
  end if;
  v_project_id:=(new.proposed_data->>'project_id')::bigint;
  if not private.project_delete_approval_active(v_project_id) then
    raise exception 'مسیر تأیید حذف پروژه معتبر نیست.' using errcode='42501';
  end if;
  -- Open activity requests cannot outlive the project. Keep their history.
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
  if not found then
    raise exception 'پروژه برای حذف تأییدشده پیدا نشد.' using errcode='P0002';
  end if;
  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(new.id,auth.uid(),'applied','پروژه و فعالیت‌های وابسته پس از تأیید حذف شدند.',
    jsonb_build_object('project_id',v_project_id));
  return new;
end;
$$;
revoke all on function private.apply_approved_project_delete() from public,anon,authenticated;
drop trigger if exists change_request_project_delete_apply on public.change_requests;
create trigger change_request_project_delete_apply
after update of request_status on public.change_requests
for each row execute function private.apply_approved_project_delete();

-- Reuse the established request notification formatter for the new context.
create or replace function private.trusted_project_activity_request_label(p_request_id bigint)
returns text language sql stable security definer set search_path='' as $$
  select case
    when request.request_type='delete'
      and request.proposed_data->>'request_context'='project_delete'
      and request.task_id is null
      and request.before_data->>'owner_id'=request.proposed_data->>'project_owner_id'
      then 'حذف پروژه'
    when request.proposed_data->>'request_context'='project_activity'
      and request.proposed_data->>'item_type'='activity'
      and request.proposed_data->>'source'='project'
      and request.proposed_data->>'owner_id'=request.requested_by::text
      and exists(select 1 from public.projects project
        where project.id=nullif(request.proposed_data->>'project_id','')::bigint
          and project.owner_id=request.requested_by)
      then case request.request_type
        when 'create' then 'تعریف فعالیت در پروژه'
        when 'delete' then 'حذف فعالیت از پروژه'
        when 'complete' then 'تکمیل فعالیت پروژه'
        when 'status' then 'تغییر وضعیت فعالیت پروژه'
        when 'priority' then 'تغییر اولویت فعالیت پروژه'
        when 'description' then 'تغییر توضیحات فعالیت پروژه'
        when 'due_date' then 'تغییر تاریخ فعالیت پروژه'
        else 'ویرایش فعالیت در پروژه' end
    else null end
  from public.change_requests request where request.id=p_request_id;
$$;
revoke all on function private.trusted_project_activity_request_label(bigint)
  from public,anon,authenticated;

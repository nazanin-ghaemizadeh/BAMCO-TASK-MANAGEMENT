create table private.task_delete_resequence_context(
 backend_pid integer not null,transaction_id bigint not null,
 primary key(backend_pid,transaction_id)
);
alter table private.task_delete_resequence_context enable row level security;
revoke all on private.task_delete_resequence_context from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_task_hierarchy_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_verified_approval boolean;
  v_revision_note boolean:=false;
  v_verified_resequence boolean:=false;
  v_verified_person_delete boolean:=false;
  v_deleting_person text:=nullif(
    current_setting('bamco.deleting_person',true),'');
begin
  v_verified_approval:=private.is_verified_task_approval_path(
       case when tg_op='UPDATE' then old.id else null end,
       case when tg_op='UPDATE' then old.created_by else new.created_by end
     );
  if tg_op='UPDATE' then
    v_revision_note:=private.is_verified_revision_note_path(old.id)
      and row(
        new.title,new.description,new.owner_id,new.status,new.priority,
        new.start_date,new.done_date,new.due_date,new.reminder_days,
        new.archived,new.source,new.created_by
      ) is not distinct from row(
        old.title,old.description,old.owner_id,old.status,old.priority,
        old.start_date,old.done_date,old.due_date,old.reminder_days,
        old.archived,old.source,old.created_by
      );
    v_verified_resequence:=coalesce(current_setting('bamco.resequencing',true),'')='1'
      and exists(select 1 from private.task_delete_resequence_context c
        where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current())
      and (to_jsonb(new)-'legacy_id') is not distinct from (to_jsonb(old)-'legacy_id')
      and row(
        new.title,new.description,new.owner_id,new.status,new.priority,
        new.start_date,new.done_date,new.due_date,new.reminder_days,
        new.manager_notes,new.archived,new.source,new.created_by
      ) is not distinct from row(
        old.title,old.description,old.owner_id,old.status,old.priority,
        old.start_date,old.done_date,old.due_date,old.reminder_days,
        old.manager_notes,old.archived,old.source,old.created_by
      );
    -- delete_person_account first clears ownership and its FK cleanup can then
    -- clear created_by in a separate UPDATE. Permit either/both references to
    -- become NULL, but only when every changed reference belongs to the exact
    -- deletion target and no other task field is touched. The ordinary task
    -- rules trigger independently requires the trusted postgres deletion path,
    -- so a caller-supplied custom GUC cannot use this exception by itself.
    v_verified_person_delete:=current_user='postgres'
      and auth.role()='service_role'
      and v_deleting_person is not null
      and (
        new.owner_id is distinct from old.owner_id
        or new.created_by is distinct from old.created_by
      )
      and (
        new.owner_id is not distinct from old.owner_id
        or (new.owner_id is null and old.owner_id::text=v_deleting_person)
      )
      and (
        new.created_by is not distinct from old.created_by
        or (new.created_by is null and old.created_by::text=v_deleting_person)
      )
      and (to_jsonb(new)-array['owner_id','created_by'])
          is not distinct from
          (to_jsonb(old)-array['owner_id','created_by']);
  end if;
  -- A supervision-only writer has no task-resequencing capability. Do not
  -- let the inherited maintenance GUC skip its column/lifecycle checks or
  -- suppress row_version increments. Existing verified approval, revision,
  -- deletion and ordinary task-management paths remain unchanged.
  if tg_op='UPDATE'
     and v_actor is not null and auth.role()<>'service_role'
     and not v_verified_approval and not v_revision_note
     and not v_verified_person_delete and not v_verified_resequence
     and not public.organization_can_manage_task(old.id)
     and private.kanban_supervisor_can_access_task(v_actor,old)
     and coalesce(current_setting('bamco.resequencing',true),'')='1' then
    raise exception 'دسترسی نظارتی کانبان مجوز عبور از کنترل محتوا و چرخهٔ وظیفه را ندارد.'
      using errcode='42501';
  end if;
  if v_verified_approval or v_revision_note
     or v_verified_resequence or v_verified_person_delete
     or auth.role()='service_role'
     or v_actor is null then
    return new;
  end if;
  if tg_op='INSERT' then
    if new.created_by is distinct from v_actor then
      raise exception 'ثبت‌کنندهٔ وظیفه باید کاربر جاری باشد.' using errcode='42501';
    end if;
    if not public.organization_can_assign_task(new.owner_id) then
      raise exception 'ثبت مستقیم فقط برای زیردست سازمانی یا مجوز عبور از تأیید مجاز است.'
        using errcode='42501';
    end if;
  else
    if new.created_by is distinct from old.created_by then
      raise exception 'ثبت‌کنندهٔ وظیفه قابل تغییر نیست.' using errcode='42501';
    end if;
    if not public.organization_can_manage_task(old.id)
       and private.kanban_supervisor_can_access_task(v_actor,old) then
      -- Allow content and bounded ownership changes, never creator/source or
      -- system fields. The unchanged project guard independently validates
      -- pending approvals, project permission, source and owner binding.
      if (to_jsonb(new)-array[
          'title','description','owner_id','status','priority','start_date','due_date',
          'reminder_days','manager_notes','last_update_note','change_reason'
        ]) is distinct from (to_jsonb(old)-array[
          'title','description','owner_id','status','priority','start_date','due_date',
          'reminder_days','manager_notes','last_update_note','change_reason'
        ]) then
        raise exception 'دسترسی نظارتی کانبان فقط برای ویرایش محتوا و تخصیص در محدودهٔ مجاز است؛ آرشیو یا اطلاعات سیستمی قابل تغییر نیست.'
          using errcode='42501';
      end if;
      if new.owner_id is null then
        -- Existing intake may remain unassigned while its content is edited.
        -- An owned task cannot be released back to intake by this capability.
        if old.owner_id is not null
           or (private.task_status_option(new.status)).kind is distinct from 'registered' then
          raise exception 'دسترسی نظارتی فقط برای وظیفهٔ ثبت‌شدهٔ بدون متولی یا متولی فعال در محدودهٔ مجاز است.'
            using errcode='42501';
        end if;
      elsif not private.kanban_supervisor_can_access_owner(v_actor,new.owner_id)
         or coalesce((private.task_status_option(new.status)).kind not in ('active','waiting'),true) then
        -- Registered status clears owner in the lifecycle trigger. Requiring
        -- active/waiting here prevents reporting a successful lost assignment.
        raise exception 'تخصیص نظارتی به زیردست فعال و وضعیت در حال انجام یا منتظر پاسخ نیاز دارد.'
          using errcode='42501';
      end if;
      return new;
    end if;
    if not public.organization_can_manage_task(old.id) then
      raise exception 'ویرایش مستقیم فقط برای وظیفهٔ زیردست سازمانی مجاز است.'
        using errcode='42501';
    end if;
    if not private.organization_actor_can_direct_manage_user(
      v_actor,coalesce(new.owner_id,new.created_by)
    ) then
      raise exception 'متولی جدید در محدودهٔ مدیریت مستقیم شما نیست.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_tasks_and_resequence(p_task_ids bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_requested integer;
  v_authorized integer;
  v_count integer;
  v_start bigint;
begin
  select count(distinct selected.id) into v_requested
  from unnest(coalesce(p_task_ids,array[]::bigint[])) selected(id)
  where selected.id is not null;
  if v_requested=0 then
    raise exception 'هیچ وظیفه‌ای انتخاب نشده است.' using errcode='22023';
  end if;

  select count(*) into v_authorized
  from public.tasks task
  where task.id=any(p_task_ids)
    and public.organization_can_manage_task(task.id)
    and private.feature_can_access_for(auth.uid(),'kanban','delete');
  if v_authorized<>v_requested then
    raise exception 'حذف مستقیم فقط برای وظایف زیردستان و با مجوز حذف مجاز است.'
      using errcode='42501';
  end if;

  insert into private.task_delete_resequence_context(backend_pid,transaction_id)
  values(pg_backend_pid(),txid_current());
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('bamco-task-display-id-resequence',0)
  );
  lock table public.tasks in share row exclusive mode;
  perform private.ensure_task_display_ids_contiguous();
  select min(task.legacy_id) into v_start
  from public.tasks task
  where task.id=any(p_task_ids);
  delete from public.tasks where id=any(p_task_ids);
  get diagnostics v_count=row_count;
  if v_count<>v_requested then
    raise exception 'تعداد وظایف حذف‌شده با انتخاب برابر نیست.';
  end if;
  if v_start is not null then
    perform private.resequence_task_display_ids_from(v_start);
  end if;
  delete from private.task_delete_resequence_context
  where backend_pid=pg_backend_pid() and transaction_id=txid_current();
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.notify_task_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor text;
  v_id text;
  v_changes text;
  v_body text;
begin
  -- Display-id maintenance changes no task content and must not emit events.
  if tg_op='UPDATE' and current_setting('bamco.resequencing',true)='1' then return new; end if;
  if tg_op='UPDATE' then
  if row(new.title,new.description,new.owner_id,new.status,new.priority,new.start_date,new.done_date,new.due_date,new.reminder_days,new.manager_notes,new.archived)
     is not distinct from
     row(old.title,old.description,old.owner_id,old.status,old.priority,old.start_date,old.done_date,old.due_date,old.reminder_days,old.manager_notes,old.archived) then
    return new;
  end if;

  end if;
  select coalesce(display_name,full_name,email,'سامانه') into v_actor from public.profiles where id=auth.uid();
  v_actor:=coalesce(v_actor,'سامانه');

  if tg_op='DELETE' then
    v_id:=coalesce(old.legacy_id,old.id)::text;
    if old.owner_id is not null then
      perform private.create_portal_event(
        old.owner_id,'حذف وظیفه',
        'وظیفه '||v_id||' «'||coalesce(old.title,'')||'» حذف شد. انجام‌دهنده تغییر: '||v_actor||'.',
        'task_deleted','task',old.id::text
      );
    end if;
    return old;
  end if;

  v_id:=private.task_display_id_for_order(new.id,new.legacy_id)::text;

  if tg_op='INSERT' then
    if new.owner_id is not null then
      perform private.create_portal_event(
        new.owner_id,'وظیفه جدید برای شما',
        'وظیفه '||v_id||' «'||coalesce(new.title,'')||'» برای شما تعریف شد. ثبت‌کننده: '||v_actor||'.',
        'task_created','task',new.id::text
      );
    end if;
    return new;
  end if;

  v_changes:=concat_ws('، ',
    case when new.title is distinct from old.title then 'عنوان' end,
    case when new.description is distinct from old.description then 'توضیحات' end,
    case when new.status is distinct from old.status then 'وضعیت' end,
    case when new.priority is distinct from old.priority then 'اولویت' end,
    case when new.start_date is distinct from old.start_date then 'تاریخ شروع' end,
    case when new.done_date is distinct from old.done_date then 'تاریخ انجام' end,
    case when new.due_date is distinct from old.due_date then 'تاریخ پایان' end,
    case when new.reminder_days is distinct from old.reminder_days then 'یادآور' end,
    case when new.manager_notes is distinct from old.manager_notes then 'توضیحات مدیر' end,
    case when new.archived is distinct from old.archived then 'آرشیو' end,
    case when new.owner_id is distinct from old.owner_id then 'متولی' end
  );

  if new.owner_id is distinct from old.owner_id then
    if old.owner_id is not null then
      perform private.create_portal_event(
        old.owner_id,'انتقال وظیفه',
        'وظیفه '||v_id||' «'||coalesce(new.title,'')||'» از شما منتقل شد. انجام‌دهنده تغییر: '||v_actor||'.',
        'task_transferred','task',new.id::text
      );
    end if;
    if new.owner_id is not null then
      v_body:='وظیفه '||v_id||' «'||coalesce(new.title,'')||'» به شما منتقل شد. انجام‌دهنده تغییر: '||v_actor||'.';
      if nullif(v_changes,'') is not null then v_body:=v_body||' موارد تغییر: '||v_changes||'.'; end if;
      perform private.create_portal_event(new.owner_id,'وظیفه به شما منتقل شد',v_body,'task_transferred','task',new.id::text);
    end if;
  elsif new.owner_id is not null then
    v_body:='وظیفه '||v_id||' «'||coalesce(new.title,'')||'» به‌روزرسانی شد. انجام‌دهنده تغییر: '||v_actor||'.';
    if nullif(v_changes,'') is not null then v_body:=v_body||' موارد تغییر: '||v_changes||'.'; end if;
    perform private.create_portal_event(new.owner_id,'به‌روزرسانی وظیفه',v_body,'task_updated','task',new.id::text);
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.guard_task_legacy_id_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_max bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('bamco-task-display-id-resequence',0)
  );
  select coalesce(max(task.legacy_id),0) into v_max
  from public.tasks task;
  if new.legacy_id is null then
    new.legacy_id:=v_max+1;
    return new;
  end if;
  if new.legacy_id<=0 or new.legacy_id<=v_max then
    raise exception 'شناسهٔ ورودی باید مثبت و پس از آخرین شناسهٔ وظیفه باشد.'
      using errcode='23514';
  end if;
  return new;
end;
$function$
;

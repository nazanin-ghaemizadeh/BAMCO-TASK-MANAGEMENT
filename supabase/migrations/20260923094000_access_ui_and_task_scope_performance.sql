-- Keep task reads below the authenticated API timeout. The old policy called
-- a task lookup and organization traversal once for every row of the view.
-- This policy evaluates the caller scope once and keeps the same visibility
-- rules: only the system manager can see work without an owner.
drop policy if exists tasks_scope_read on public.tasks;
create policy tasks_scope_read
  on public.tasks for select to authenticated
  using (
    (
      (not archived and (
        (select public.can_access_feature('kanban','view'))
        or (select public.can_access_feature('taskTimeline','view'))
      ))
      or (archived and (select public.can_access_feature('archive','view')))
    )
    and (
      (owner_id is null and (select public.bamco_is_system_manager()))
      or (owner_id is not null and (select public.bamco_is_system_manager()))
      or owner_id in (
        select scoped.user_id
        from public.organization_scope_user_ids((select auth.uid())) scoped
      )
    )
  );

-- Include unassigned, registered intake items in the system manager's own
-- automatic report. They remain absent from every other recipient's report.
create or replace function public.prepare_workflow_messages(
  p_recipient_ids uuid[],
  p_channels jsonb,
  p_subject text,
  p_template_text text default null,
  p_kind text default 'daily',
  p_report_date text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch_id uuid;
  v_recipient_id uuid;
  v_recipient public.profiles%rowtype;
  v_active_count integer;
  v_warning_count integer;
  v_overdue_count integer;
  v_waiting_count integer;
  v_registered_count integer;
  v_sticker_state smallint;
  v_template_key text;
  v_template_body text;
  v_final_body text;
  v_template_subject text;
  v_title_text text;
  v_sticker_path text;
  v_report_date text;
  v_snapshot_id bigint;
  v_channel text;
  v_task_json jsonb;
  v_task_ids bigint[];
  v_warning_ids bigint[];
  v_overdue_ids bigint[];
  v_waiting_ids bigint[];
  v_warning_text text;
  v_overdue_text text;
  v_waiting_text text;
  v_registered_text text;
  v_last_sent text;
  v_replacement record;
  v_today_tehran date:=(now() at time zone 'Asia/Tehran')::date;
begin
  if auth.uid() is null
     or not public.can_access_feature('messageCenter','view')
     or not public.can_access_feature('messageCenter','create')
     or not exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.active) then
    raise exception 'اجازهٔ آماده‌سازی پیام را ندارید.' using errcode='42501';
  end if;
  if coalesce(cardinality(p_recipient_ids),0)=0 then
    raise exception 'گیرنده انتخاب نشده است' using errcode='22023';
  end if;
  if exists(
    select 1
    from unnest(p_recipient_ids) selected(recipient_id)
    where selected.recipient_id is null
       or not exists(
         select 1 from public.organization_scope_user_ids(auth.uid()) scoped
         where scoped.user_id=selected.recipient_id
       )
  ) then
    raise exception 'گیرنده باید خود کاربر یا یکی از زیردستان سازمانی او باشد.' using errcode='42501';
  end if;
  if p_kind not in ('daily','manual') then
    raise exception 'نوع پیام نامعتبر است' using errcode='22023';
  end if;
  if length(coalesce(p_template_text,''))>30000 then
    raise exception 'متن پیام بیش از حد طولانی است' using errcode='22023';
  end if;
  v_report_date:=private.normalize_persian_report_date(
    coalesce(nullif(btrim(p_report_date),''),private.message_persian_date(v_today_tehran))
  );

  insert into public.message_batches(kind,subject,created_by,status)
  values(p_kind,coalesce(nullif(btrim(p_subject),''),'گزارش وضعیت امور'),auth.uid(),'draft')
  returning id into v_batch_id;

  for v_recipient_id in select distinct unnest(p_recipient_ids) loop
    select * into v_recipient from public.profiles
    where id=v_recipient_id and active;
    if not found then
      raise exception 'گیرنده غیرفعال یا نامعتبر است' using errcode='22023';
    end if;
    v_channel:=coalesce(p_channels->>v_recipient_id::text,v_recipient.default_message_channel,'portal');
    if v_channel not in ('portal','email','both') then
      raise exception 'کانال ارسال نامعتبر است' using errcode='22023';
    end if;
    if v_channel in ('email','both') and nullif(btrim(v_recipient.email::text),'') is null then
      raise exception 'برای % ایمیل ثبت نشده است؛ ارسال داخل سامانه را انتخاب کنید',
        coalesce(nullif(v_recipient.display_name,''),v_recipient.full_name,v_recipient_id::text)
        using errcode='22023';
    end if;

    select
      count(*)::integer,
      count(*) filter(where message_due_state='warning')::integer,
      count(*) filter(where message_due_state='overdue')::integer,
      count(*) filter(where status_kind='waiting')::integer,
      count(*) filter(where status_kind='registered')::integer,
      coalesce(array_agg(id order by id),'{}'::bigint[]),
      coalesce(array_agg(id order by id) filter(where message_due_state='warning'),'{}'::bigint[]),
      coalesce(array_agg(id order by id) filter(where message_due_state='overdue'),'{}'::bigint[]),
      coalesce(array_agg(id order by id) filter(where status_kind='waiting'),'{}'::bigint[]),
      coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'legacy_id',legacy_id,'title',title,'description',description,
        'status',status,'status_key',status_key,'status_kind',status_kind,'status_color',status_color,
        'priority',priority,'priority_key',priority_key,'priority_color',priority_color,
        'start_date',start_date,'due_date',due_date,'due_state',message_due_state
      ) order by id),'[]'::jsonb)
    into
      v_active_count,v_warning_count,v_overdue_count,v_waiting_count,v_registered_count,
      v_task_ids,v_warning_ids,v_overdue_ids,v_waiting_ids,v_task_json
    from (
      select
        task.id,task.legacy_id,task.title,task.description,
        coalesce(status_option.label,task.status) as status,
        status_option.key as status_key,
        coalesce(status_option.kind,'') as status_kind,
        status_option.color as status_color,
        coalesce(priority_option.label,task.priority) as priority,
        priority_option.key as priority_key,
        priority_option.color as priority_color,
        task.start_date,task.due_date,
        case
          when coalesce(status_option.kind,'')='waiting' then 'none'
          when not coalesce(status_option.tracks_deadline,false) then 'none'
          when task.due_date<v_today_tehran then 'overdue'
          when task.due_date is not null
             and task.due_date<=v_today_tehran+greatest(coalesce(task.reminder_days,0),0) then 'warning'
          else 'none'
        end as message_due_state
      from public.tasks task
      left join lateral private.task_status_option(task.status) status_option on true
      left join lateral private.task_priority_option(task.priority) priority_option on true
      where not task.archived
        and coalesce(status_option.kind,'') not in ('completed','cancelled')
        and (
          (task.owner_id=v_recipient_id and coalesce(status_option.kind,'')<>'registered')
          or (
            task.owner_id is null
            and coalesce(status_option.kind,'')='registered'
            and private.is_system_manager(v_recipient_id)
          )
        )
    ) task_state;

    v_sticker_state:=case
      when v_overdue_count>=5 then 5
      when v_overdue_count>=3 then 4
      when v_overdue_count>=1 then 3
      when v_warning_count>=1 then 2
      else 1
    end;
    v_template_key:='state'||v_sticker_state;
    select template.body_html,template.subject_template
      into v_template_body,v_template_subject
      from public.email_templates template
      where template.template_key=v_template_key;
    v_template_body:=coalesce(nullif(btrim(p_template_text),''),nullif(v_template_body,''));
    if v_template_body is null then
      raise exception 'متن پیش‌فرض % تعریف نشده است',v_template_key using errcode='22023';
    end if;
    if nullif(btrim(p_template_text),'') is null then
      v_template_body:=regexp_replace(regexp_replace(regexp_replace(v_template_body,'<br\s*/?>',E'\n','gi'),'</p>',E'\n\n','gi'),'<[^>]*>','','g');
      v_template_body:=replace(replace(replace(replace(replace(replace(v_template_body,'&nbsp;',' '),'&lt;','<'),'&gt;','>'),'&quot;','"'),'&#39;',''''),'&amp;','&');
    end if;
    v_template_subject:=coalesce(nullif(btrim(p_subject),''),nullif(v_template_subject,''),'گزارش وضعیت امور');
    v_title_text:=private.message_salutation(
      v_recipient.salutation,
      coalesce(nullif(v_recipient.display_name,''),v_recipient.full_name,v_recipient.email::text),
      v_recipient.gender
    );
    select max(delivery.sent_at)::date::text into v_last_sent
    from public.message_deliveries delivery
    where delivery.recipient_id=v_recipient_id and delivery.status in ('sent','delivered');

    for v_replacement in select * from (values
      ('[عنوان و نام مخاطب]',v_title_text),
      ('[عنوان مخاطب]',v_title_text),
      ('[نام مخاطب]',coalesce(nullif(v_recipient.display_name,''),v_recipient.full_name,v_recipient.email::text)),
      ('[نام]',coalesce(nullif(v_recipient.display_name,''),v_recipient.full_name,v_recipient.email::text)),
      ('[تعداد امور هشداری]',v_warning_count::text),
      ('[تعداد هشدار]',v_warning_count::text),
      ('[تعداد امور دیرکردی]',v_overdue_count::text),
      ('[تعداد دیرکرد]',v_overdue_count::text),
      ('[تعداد امور منتظر پاسخ]',v_waiting_count::text),
      ('[تعداد منتظر پاسخ]',v_waiting_count::text),
      ('[تعداد امور ثبت‌شده]',v_registered_count::text),
      ('[تعداد امور بدون متولی]',v_registered_count::text),
      ('[تعداد کار فعال]',v_active_count::text),
      ('[تاریخ کامل شمسی]',v_report_date),
      ('[تاریخ گزارش]',v_report_date),
      ('[تاریخ آخرین ارسال]',coalesce(v_last_sent,'—'))
    ) placeholders(token,replacement_text) loop
      v_template_body:=replace(v_template_body,v_replacement.token,v_replacement.replacement_text);
      v_template_subject:=replace(v_template_subject,v_replacement.token,v_replacement.replacement_text);
    end loop;

    if v_waiting_count>0 and position('[جدول امور منتظر پاسخ]' in v_template_body)=0 then
      v_template_body:=v_template_body||E'\n\n[جدول امور منتظر پاسخ]';
    end if;
    if v_registered_count>0 and position('[جدول امور ثبت‌شده]' in v_template_body)=0 then
      v_template_body:=v_template_body||E'\n\n[جدول امور ثبت‌شده]';
    end if;
    select
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'status')||' | پایان: '||coalesce(task_item->>'due_date','—'),E'\n') filter(where task_item->>'due_state'='warning'),
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'status')||' | پایان: '||coalesce(task_item->>'due_date','—'),E'\n') filter(where task_item->>'due_state'='overdue'),
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'priority')||' | شروع: '||coalesce(task_item->>'start_date','—'),E'\n') filter(where task_item->>'status_kind'='waiting'),
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'priority')||' | ثبت: '||coalesce(task_item->>'start_date','—'),E'\n') filter(where task_item->>'status_kind'='registered')
    into v_warning_text,v_overdue_text,v_waiting_text,v_registered_text
    from jsonb_array_elements(v_task_json) task_item;

    v_final_body:=replace(replace(replace(replace(replace(
      v_template_body,
      '[جدول امور هشداری]',E'امور هشداری:\n'||coalesce(v_warning_text,'موردی وجود ندارد.')),
      '[جدول امور دیرکردی]',E'امور دیرکردی:\n'||coalesce(v_overdue_text,'موردی وجود ندارد.')),
      '[جدول امور منتظر پاسخ]',E'امور منتظر پاسخ:\n'||coalesce(v_waiting_text,'موردی در انتظار پاسخ نیست.')),
      '[جدول امور ثبت‌شده]',E'امور ثبت‌شده و بدون متولی:\n'||coalesce(v_registered_text,'موردی وجود ندارد.')),
      '[استیکر]','');

    select sticker.storage_path into v_sticker_path
    from public.stickers sticker
    join public.sticker_sets sticker_set on sticker_set.id=sticker.set_id
    where sticker_set.active
      and sticker.state_key='state'||v_sticker_state
      and sticker.gender=case when v_recipient.gender='خانم' then 'female' else 'male' end
    order by sticker_set.id desc
    limit 1;

    insert into public.message_snapshots(
      batch_id,recipient_id,recipient_name,recipient_email,cc_emails,
      active_count,warning_count,overdue_count,waiting_count,sticker_state,template_key,subject,final_text,
      task_ids,warning_task_ids,overdue_task_ids,waiting_task_ids,tasks,body_template,sticker_path
    ) values(
      v_batch_id,v_recipient_id,
      coalesce(nullif(v_recipient.display_name,''),nullif(v_recipient.full_name,''),v_recipient.email::text,v_recipient_id::text),
      v_recipient.email,v_recipient.cc_emails,
      v_active_count,v_warning_count,v_overdue_count,v_waiting_count,v_sticker_state,v_template_key,v_template_subject,v_final_body,
      v_task_ids,v_warning_ids,v_overdue_ids,v_waiting_ids,v_task_json,v_template_body,v_sticker_path
    ) returning id into v_snapshot_id;

    if v_channel in ('portal','both') then
      insert into public.message_deliveries(batch_id,snapshot_id,recipient_id,channel,idempotency_key,thread_key)
      values(v_batch_id,v_snapshot_id,v_recipient_id,'portal',v_batch_id||':'||v_recipient_id||':portal','BAMCO-'||replace(v_batch_id::text,'-','')||'-'||left(replace(v_recipient_id::text,'-',''),8));
    end if;
    if v_channel in ('email','both') then
      insert into public.message_deliveries(batch_id,snapshot_id,recipient_id,channel,idempotency_key,thread_key)
      values(v_batch_id,v_snapshot_id,v_recipient_id,'email',v_batch_id||':'||v_recipient_id||':email','BAMCO-'||replace(v_batch_id::text,'-','')||'-'||left(replace(v_recipient_id::text,'-',''),8)||'-E');
    end if;
  end loop;

  update public.message_batches set status='ready' where id=v_batch_id;
  return v_batch_id;
end;
$$;

revoke all on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) from public,anon;
grant execute on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) to authenticated;

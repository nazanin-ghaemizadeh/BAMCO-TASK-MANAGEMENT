-- Keep the public task identifier (legacy_id) coherent everywhere it is shown.
-- Internal tasks.id remains the immutable relational key and must never leak into
-- user-facing task notifications or generated task tables.

alter table public.portal_messages
  add column if not exists entity_type text,
  add column if not exists entity_id text;

create index if not exists portal_messages_entity_idx
  on public.portal_messages(entity_type,entity_id)
  where entity_type is not null and entity_id is not null;

create or replace function private.task_display_id_for_order(p_id bigint,p_legacy_id bigint)
returns bigint
language sql
stable
security definer
set search_path to ''
as $function$
  select count(*)::bigint
  from public.tasks t
  where row(coalesce(t.legacy_id,t.id),t.id)
        <= row(coalesce(p_legacy_id,p_id),p_id)
$function$;

revoke all on function private.task_display_id_for_order(bigint,bigint) from public,anon,authenticated;

create or replace function private.sync_task_display_references()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Portal task events keep the immutable task PK as their link, while the
  -- visible number is always refreshed from the current public display ID.
  update public.portal_messages pm
     set body=regexp_replace(pm.body,'^(وظیفه )[0-9]+',E'\\1'||t.legacy_id::text)
    from public.tasks t
   where pm.entity_type='task'
     and pm.entity_id=t.id::text
     and pm.template_key in ('task_created','task_updated','task_transferred')
     and pm.body ~ '^وظیفه [0-9]+'
     and pm.body is distinct from regexp_replace(pm.body,'^(وظیفه )[0-9]+',E'\\1'||t.legacy_id::text);

  -- The notification card is the visible copy of a lifecycle event. Match the
  -- exact system-chat event timestamp so unrelated notifications in that thread
  -- are never rewritten.
  update public.notifications n
     set body=pm.body
    from public.chat_messages cm
    join public.portal_messages pm on pm.id=cm.source_portal_message_id
   where n.entity_type='chat_thread'
     and n.entity_id=cm.thread_id::text
     and n.created_at=cm.created_at
     and pm.entity_type='task'
     and n.body is distinct from pm.body;

  -- Workflow snapshots carry both the immutable task PK and a presentation copy
  -- of legacy_id. Refresh only the presentation copy.
  with rebuilt as (
    select s.id,
           coalesce(jsonb_agg(
             case when t.id is null then e.item
                  else jsonb_set(e.item,'{legacy_id}',to_jsonb(t.legacy_id),true)
             end order by e.ord
           ),'[]'::jsonb) as tasks
      from public.message_snapshots s
      cross join lateral jsonb_array_elements(s.tasks) with ordinality as e(item,ord)
      left join public.tasks t
        on t.id=case when e.item->>'id' ~ '^[0-9]+$' then (e.item->>'id')::bigint end
     where jsonb_typeof(s.tasks)='array'
     group by s.id
  )
  update public.message_snapshots s
     set tasks=r.tasks
    from rebuilt r
   where s.id=r.id
     and s.tasks is distinct from r.tasks;
end
$function$;

revoke all on function private.sync_task_display_references() from public,anon,authenticated;

create or replace function private.create_portal_event(
  p_user uuid,p_title text,p_body text,p_type text,p_entity_type text,p_entity_id text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  mid bigint;
  v_sender uuid:=auth.uid();
  v_sender_name text;
begin
  if p_user is null or not exists(select 1 from public.profiles where id=p_user and active) then return; end if;
  select coalesce(nullif(display_name,''),nullif(full_name,''),email::text,'سامانه')
    into v_sender_name from public.profiles where id=v_sender;
  v_sender_name:=coalesce(v_sender_name,'سامانه');

  insert into public.portal_messages(
    sender_id,subject,body,importance,allow_reply,require_ack,template_key,sender_name_snapshot,entity_type,entity_id
  ) values(
    v_sender,left(coalesce(p_title,'پیام سامانه'),240),coalesce(p_body,''),'normal',false,false,
    coalesce(nullif(p_type,''),'system_event'),v_sender_name,nullif(p_entity_type,''),nullif(p_entity_id,'')
  ) returning id into mid;

  -- The recipient INSERT trigger creates the system-chat copy and notification.
  -- For task lifecycle events that notification is the single canonical inbox
  -- surface, so hide the portal-recipient duplicate immediately afterwards.
  insert into public.portal_message_recipients(message_id,recipient_id)
  values(mid,p_user) on conflict do nothing;

  if p_entity_type='task' then
    update public.portal_message_recipients
       set read_at=coalesce(read_at,now()),
           dismissed_at=coalesce(dismissed_at,now())
     where message_id=mid and recipient_id=p_user;
  end if;
end
$function$;

create or replace function private.notify_task_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor text;
  v_id text;
  v_changes text;
  v_body text;
begin
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

  -- AFTER ROW runs before the statement-level display-ID resequencer. Rank the
  -- row with the exact resequencer ordering so the event already contains the
  -- final public identifier, including Excel-imported rows.
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

  if row(new.title,new.description,new.owner_id,new.status,new.priority,new.start_date,new.done_date,new.due_date,new.reminder_days,new.manager_notes,new.archived)
     is not distinct from
     row(old.title,old.description,old.owner_id,old.status,old.priority,old.start_date,old.done_date,old.due_date,old.reminder_days,old.manager_notes,old.archived) then
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
$function$;

-- Backfill existing events safely. An immutable PK match is unambiguous.
update public.portal_messages pm
   set entity_type='task',entity_id=t.id::text
  from public.tasks t
 where pm.entity_id is null
   and pm.template_key in ('task_created','task_updated','task_transferred')
   and pm.body ~ '^وظیفه [0-9]+ '
   and substring(pm.body from '^وظیفه ([0-9]+) ')::bigint=t.id;

-- Older rows that already used the public number are linked only when the title
-- also matches, avoiding accidental collisions with another task's immutable PK.
update public.portal_messages pm
   set entity_type='task',entity_id=t.id::text
  from public.tasks t
 where pm.entity_id is null
   and pm.template_key in ('task_created','task_updated','task_transferred')
   and pm.body ~ '^وظیفه [0-9]+ '
   and substring(pm.body from '^وظیفه ([0-9]+) ')::bigint=t.legacy_id
   and position('«'||coalesce(t.title,'')||'»' in pm.body)>0;

-- Existing lifecycle rows may currently appear twice in "پیام‌های من": once as
-- a portal recipient and once as the notification generated from its system chat.
-- Keep the notification and dismiss only the duplicate portal-recipient surface.
update public.portal_message_recipients r
   set read_at=coalesce(r.read_at,pm.created_at,now()),
       dismissed_at=coalesce(r.dismissed_at,pm.created_at,now())
  from public.portal_messages pm
 where pm.id=r.message_id
   and pm.entity_type='task'
   and pm.template_key in ('task_created','task_updated','task_transferred','task_deleted');

create or replace function private.resequence_task_display_ids()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));
  perform set_config('bamco.resequencing','1',true);

  with ordered as (
    select id,row_number() over(order by coalesce(legacy_id,id),id)::bigint as seq
    from public.tasks
  )
  update public.tasks t set legacy_id=-ordered.seq
  from ordered where t.id=ordered.id;

  with ordered as (
    select id,row_number() over(order by -legacy_id,id)::bigint as seq
    from public.tasks
  )
  update public.tasks t set legacy_id=ordered.seq
  from ordered where t.id=ordered.id;

  perform set_config('bamco.resequencing','',true);
  perform private.sync_task_display_references();
end
$function$;

-- Plain-text workflow tables must also use the public ID, not tasks.id.
do $migration$
declare
  v_oid oid;
  v_def text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='prepare_workflow_messages'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'prepare_workflow_messages not found'; end if;
  v_def:=pg_get_functiondef(v_oid);
  v_next:=replace(v_def,'(t->>''id'')||'' | ''','coalesce(t->>''legacy_id'',t->>''id'')||'' | ''');
  if v_next=v_def then raise exception 'workflow task-id fragment not found'; end if;
  execute v_next;
end
$migration$;

select private.sync_task_display_references();

notify pgrst,'reload schema';

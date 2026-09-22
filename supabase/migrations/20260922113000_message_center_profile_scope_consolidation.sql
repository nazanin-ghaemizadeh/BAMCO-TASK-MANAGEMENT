-- Canonical message-center authorization and current-profile projections.
--
-- Depends on the enterprise feature registry and the auth-bound `bamco_*`
-- policy contracts.  Message snapshots remain historical records; all live
-- recipient/directory views resolve identity from public.profiles by user_id.

-- Message and response features use the same recursive organizational scope
-- contract as Kanban.  This deliberately does not grant task access: the
-- message RPCs below use their own definer-scoped task projections.
create or replace function public.organization_scope_user_ids(p_actor uuid default auth.uid())
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then return; end if;
  if not (
    public.can_access_feature('organization','view')
    or public.can_access_feature('kanban','view')
    or public.can_access_feature('archive','view')
    or public.can_access_feature('messageCenter','view')
    or public.can_access_feature('sentMessages','view')
    or public.can_access_feature('responseTracking','view')
  ) then
    raise exception 'مجوز مشاهدهٔ دامنهٔ سازمانی ندارید.' using errcode='42501';
  end if;
  if p_actor is distinct from auth.uid() and not public.bamco_is_system_manager() then
    raise exception 'دامنهٔ سازمانی فقط برای کاربر جاری قابل محاسبه است.' using errcode='42501';
  end if;
  if private.is_system_manager(p_actor) then
    return query select profile.id from public.profiles profile where profile.active;
    return;
  end if;
  return query
    with roots as (
      select position_id from private.organization_active_primary_positions(p_actor)
    ), tree as (
      select branch.position_id
      from roots root
      cross join lateral private.organization_descendant_position_ids(root.position_id) branch
    )
    select distinct assignment.user_id
    from public.organization_position_assignments assignment
    join tree on tree.position_id=assignment.position_id
    join public.profiles profile on profile.id=assignment.user_id and profile.active
    where assignment.is_primary
      and assignment.valid_from<=current_date
      and (assignment.valid_to is null or assignment.valid_to>current_date)
    union
    select p_actor;
end;
$$;
revoke all on function public.organization_scope_user_ids(uuid) from public,anon;
grant execute on function public.organization_scope_user_ids(uuid) to authenticated;

-- A people:edit grant authorizes an immediate manager only over strict
-- descendants.  The pre-existing profile triggers remain the field-level
-- safeguard for role, active-state, login and sensitive identity changes.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using(
    id=auth.uid()
    or public.bamco_is_system_manager()
    or (
      public.can_access_feature('people','edit')
      and id in (select descendant.user_id from public.bamco_strict_descendant_user_ids() descendant)
    )
  )
  with check(
    id=auth.uid()
    or public.bamco_is_system_manager()
    or (
      public.can_access_feature('people','edit')
      and id in (select descendant.user_id from public.bamco_strict_descendant_user_ids() descendant)
    )
  );

-- Current recipient directory.  `recipient_name` is kept as the display
-- column for legacy callers, but is now display_name-first and accompanied by
-- the canonical profile fields/revision used by BamcoProfiles.  PostgreSQL
-- cannot add the new identity columns in the middle of a CREATE OR REPLACE
-- VIEW column list, so recreate these UI-only projections explicitly.
drop view if exists public.message_recipient_live_state;
create or replace view public.message_recipient_live_state
with (security_invoker=false)
as
select
  profile.id as recipient_id,
  coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text,profile.id::text) as recipient_name,
  profile.display_name,
  profile.full_name,
  profile.email::text as email,
  profile.avatar_path,
  profile.updated_at,
  profile.active,
  profile.cc_emails,
  profile.default_message_channel,
  count(task.id) filter(
    where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
  ) as active_count,
  count(task.id) filter(
    where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
      and coalesce(status_option.tracks_deadline,false)
      and task.due_date is not null
      and task.due_date>=current_date
      and task.due_date<=current_date+greatest(coalesce(task.reminder_days,0),0)
  ) as warning_count,
  count(task.id) filter(
    where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
      and coalesce(status_option.tracks_deadline,false)
      and task.due_date is not null
      and task.due_date<current_date
  ) as overdue_count,
  (
    case
      when count(task.id) filter(
        where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
          and coalesce(status_option.tracks_deadline,false)
          and task.due_date is not null and task.due_date<current_date
      )>=5 then 5
      when count(task.id) filter(
        where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
          and coalesce(status_option.tracks_deadline,false)
          and task.due_date is not null and task.due_date<current_date
      )>=3 then 4
      when count(task.id) filter(
        where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
          and coalesce(status_option.tracks_deadline,false)
          and task.due_date is not null and task.due_date<current_date
      )>=1 then 3
      when count(task.id) filter(
        where coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
          and coalesce(status_option.tracks_deadline,false)
          and task.due_date is not null
          and task.due_date>=current_date
          and task.due_date<=current_date+greatest(coalesce(task.reminder_days,0),0)
      )>=1 then 2
      else 1
    end
  )::smallint as sticker_state,
  (
    select max(delivery.sent_at)
    from public.message_deliveries delivery
    where delivery.recipient_id=profile.id and delivery.status in ('sent','delivered')
  ) as last_sent_at
from public.profiles profile
left join public.tasks task
  on task.owner_id=profile.id and not task.archived
left join lateral private.task_status_option(task.status) status_option on true
where profile.active
  and public.can_access_feature('messageCenter','view')
  and profile.id in (
    select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
  )
group by
  profile.id,profile.display_name,profile.full_name,profile.email,
  profile.avatar_path,profile.updated_at,profile.active,
  profile.cc_emails,profile.default_message_channel;

-- A sent log is a current display projection over immutable deliveries.  The
-- original snapshot still exists on message_snapshots for audit/history.
drop view if exists public.sent_message_log;
create or replace view public.sent_message_log
with (security_invoker=false)
as
select
  'delivery:'||delivery.id::text as log_key,
  'delivery'::text as source_type,
  delivery.id::text as source_id,
  delivery.recipient_id,
  coalesce(nullif(recipient.display_name,''),nullif(recipient.full_name,''),snapshot.recipient_name,snapshot.recipient_email,delivery.recipient_id::text) as recipient_name,
  recipient.display_name as recipient_display_name,
  recipient.full_name as recipient_full_name,
  recipient.avatar_path as recipient_avatar_path,
  recipient.updated_at as recipient_updated_at,
  snapshot.subject,
  delivery.channel,
  delivery.status as delivery_status,
  coalesce(delivery.sent_at,delivery.created_at) as sent_at,
  delivery.attempt_count,
  delivery.error_message,
  delivery.thread_key,
  batch.created_by as sender_id,
  coalesce(nullif(sender.display_name,''),nullif(sender.full_name,''),sender.email::text,'سامانه') as sender_name,
  delivery.snapshot_id,
  delivery.portal_message_id
from public.message_deliveries delivery
join public.message_snapshots snapshot on snapshot.id=delivery.snapshot_id
join public.message_batches batch on batch.id=delivery.batch_id
left join public.profiles recipient on recipient.id=delivery.recipient_id
left join public.profiles sender on sender.id=batch.created_by
where batch.kind in ('daily','reminder')
  and public.can_access_feature('sentMessages','view')
  and delivery.recipient_id in (
    select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
  );

-- Response tracking also projects the current canonical identity, while the
-- delivery/snapshot values retain the historical message text and addresses.
drop view if exists public.message_response_tracking;
create or replace view public.message_response_tracking
with (security_invoker=false)
as
select
  delivery.id as delivery_id,
  delivery.batch_id,
  delivery.recipient_id,
  coalesce(nullif(recipient.display_name,''),nullif(recipient.full_name,''),snapshot.recipient_name,snapshot.recipient_email,delivery.recipient_id::text) as recipient_name,
  recipient.display_name as recipient_display_name,
  recipient.full_name as recipient_full_name,
  recipient.avatar_path as recipient_avatar_path,
  recipient.updated_at as recipient_updated_at,
  coalesce(recipient.email::text,snapshot.recipient_email) as recipient_email,
  delivery.channel,
  delivery.status as delivery_status,
  snapshot.subject,
  delivery.thread_key,
  delivery.sent_at,
  coalesce(delivery.replied_at,portal_recipient.replied_at) as replied_at,
  coalesce(delivery.reply_channel,case when portal_recipient.replied_at is not null then 'portal' end) as reply_channel,
  coalesce(delivery.reply_text,portal_recipient.reply_text) as reply_text,
  delivery.reminder_count,
  delivery.last_reminded_at,
  case
    when delivery.status='failed' then 'failed'
    when coalesce(delivery.replied_at,portal_recipient.replied_at) is not null then 'replied'
    when delivery.sent_at is not null and delivery.sent_at<now()-interval '2 days' then 'reminder_needed'
    else 'awaiting'
  end as response_status
from public.message_deliveries delivery
join public.message_snapshots snapshot on snapshot.id=delivery.snapshot_id
left join public.profiles recipient on recipient.id=delivery.recipient_id
left join public.portal_message_recipients portal_recipient
  on portal_recipient.message_id=delivery.portal_message_id
 and portal_recipient.recipient_id=delivery.recipient_id
where public.can_access_feature('responseTracking','view')
  and delivery.recipient_id in (
    select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
  );

grant select on public.message_recipient_live_state,public.sent_message_log,public.message_response_tracking to authenticated;

-- Direct table access is constrained to current actor/scope.  Creation and
-- delivery state transitions are RPC-only so callers cannot forge a snapshot,
-- delivery result, or recipient outside the organizational tree.
alter table public.email_templates enable row level security;
alter table public.message_batches enable row level security;
alter table public.message_snapshots enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.message_reminder_sources enable row level security;

do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('email_templates','message_batches','message_snapshots','message_deliveries','message_reminder_sources')
  loop
    execute format('drop policy if exists %I on %I.%I',policy_row.policyname,policy_row.schemaname,policy_row.tablename);
  end loop;
end;
$$;

-- RLS policies for message tables must not query one another: batches have
-- deliveries and deliveries have a batch.  This auth-bound definer helper
-- evaluates that relationship beneath RLS while still binding every decision
-- to the caller's JWT and feature/organization scope.
create or replace function public.bamco_can_read_message_batch(p_batch_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or p_batch_id is null then
    return false;
  end if;
  return exists(
    select 1
    from public.message_batches batch
    where batch.id=p_batch_id
      and (
        (
          public.can_access_feature('messageCenter','view')
          and batch.created_by=v_actor
        )
        or (
          (
            public.can_access_feature('sentMessages','view')
            or public.can_access_feature('responseTracking','view')
          )
          and exists(
            select 1
            from public.message_deliveries delivery
            where delivery.batch_id=batch.id
              and delivery.recipient_id in (
                select scoped.user_id
                from public.organization_scope_user_ids(v_actor) scoped
              )
          )
        )
      )
  );
end;
$$;
revoke all on function public.bamco_can_read_message_batch(uuid) from public,anon;
grant execute on function public.bamco_can_read_message_batch(uuid) to authenticated;

create policy email_templates_feature_read on public.email_templates
  for select to authenticated using(public.can_access_feature('templates','view'));
create policy email_templates_feature_insert on public.email_templates
  for insert to authenticated with check(public.can_access_feature('templates','create'));
create policy email_templates_feature_update on public.email_templates
  for update to authenticated using(public.can_access_feature('templates','edit'))
  with check(public.can_access_feature('templates','edit'));
create policy email_templates_feature_delete on public.email_templates
  for delete to authenticated using(public.can_access_feature('templates','delete'));

create policy message_batches_feature_read on public.message_batches
  for select to authenticated using(public.bamco_can_read_message_batch(id));

create policy message_snapshots_feature_read on public.message_snapshots
  for select to authenticated using(
    (public.can_access_feature('messages','view') and recipient_id=auth.uid())
    or public.bamco_can_read_message_batch(batch_id)
  );

create policy message_deliveries_feature_read on public.message_deliveries
  for select to authenticated using(
    (public.can_access_feature('messages','view') and recipient_id=auth.uid())
    or public.bamco_can_read_message_batch(batch_id)
  );

create policy message_reminder_sources_feature_read on public.message_reminder_sources
  for select to authenticated using(
    (public.can_access_feature('messages','view') and recipient_id=auth.uid())
    or (
      public.can_access_feature('responseTracking','view')
      and recipient_id in (
        select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
      )
    )
  );

revoke all on table public.message_batches,public.message_snapshots,public.message_deliveries,public.message_reminder_sources from anon;
grant select on table public.message_batches,public.message_snapshots,public.message_deliveries,public.message_reminder_sources to authenticated;
revoke insert,update,delete on table public.message_batches,public.message_snapshots,public.message_deliveries,public.message_reminder_sources from authenticated;
revoke all on table public.email_templates from anon;
grant select,insert,update,delete on table public.email_templates to authenticated;

-- Prepare a daily/manual message batch.  The recipient relationship is
-- validated against the sender's recursive organizational scope before any
-- snapshot is written.
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
      v_active_count,v_warning_count,v_overdue_count,v_waiting_count,
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
      where task.owner_id=v_recipient_id
        and not task.archived
        and coalesce(status_option.kind,'') not in ('registered','completed','cancelled')
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
    select
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'status')||' | پایان: '||coalesce(task_item->>'due_date','—'),E'\n') filter(where task_item->>'due_state'='warning'),
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'status')||' | پایان: '||coalesce(task_item->>'due_date','—'),E'\n') filter(where task_item->>'due_state'='overdue'),
      string_agg((task_item->>'id')||' | '||(task_item->>'title')||' | '||(task_item->>'priority')||' | شروع: '||coalesce(task_item->>'start_date','—'),E'\n') filter(where task_item->>'status_kind'='waiting')
    into v_warning_text,v_overdue_text,v_waiting_text
    from jsonb_array_elements(v_task_json) task_item;

    v_final_body:=replace(replace(replace(replace(
      v_template_body,
      '[جدول امور هشداری]',E'امور هشداری:\n'||coalesce(v_warning_text,'موردی وجود ندارد.')),
      '[جدول امور دیرکردی]',E'امور دیرکردی:\n'||coalesce(v_overdue_text,'موردی وجود ندارد.')),
      '[جدول امور منتظر پاسخ]',E'امور منتظر پاسخ:\n'||coalesce(v_waiting_text,'موردی در انتظار پاسخ نیست.')),
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

-- Queueing uses the feature that owns the batch type.  A user may queue only
-- their own batch unless they also have that feature's edit action, and every
-- delivery must remain inside the current recursive organization scope.
create or replace function public.queue_message_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery public.message_deliveries%rowtype;
  v_snapshot public.message_snapshots%rowtype;
  v_batch public.message_batches%rowtype;
  v_portal_message_id bigint;
  v_queued_count integer:=0;
  v_chat_thread_id uuid;
  v_sender_name text;
  v_feature_key text;
begin
  if auth.uid() is null then
    raise exception 'نشست کاربری معتبر نیست.' using errcode='42501';
  end if;
  select * into v_batch from public.message_batches where id=p_batch_id for update;
  if not found then
    raise exception 'بستهٔ پیام پیدا نشد.' using errcode='P0002';
  end if;
  v_feature_key:=case when v_batch.kind='reminder' then 'responseTracking' else 'messageCenter' end;
  if not public.can_access_feature(v_feature_key,'view')
     or not public.can_access_feature(v_feature_key,'create') then
    raise exception 'اجازهٔ ارسال این بستهٔ پیام را ندارید.' using errcode='42501';
  end if;
  if v_batch.created_by is distinct from auth.uid()
     and not public.can_access_feature(v_feature_key,'edit') then
    raise exception 'اجازهٔ ارسال بستهٔ پیامِ ایجادشده توسط کاربر دیگر را ندارید.' using errcode='42501';
  end if;
  if exists(
    select 1 from public.message_deliveries scoped_delivery
    where scoped_delivery.batch_id=v_batch.id
      and not exists(
        select 1 from public.organization_scope_user_ids(auth.uid()) scoped
        where scoped.user_id=scoped_delivery.recipient_id
      )
  ) then
    raise exception 'بسته شامل گیرنده‌ای خارج از دامنهٔ سازمانی فعلی است.' using errcode='42501';
  end if;

  select coalesce(nullif(display_name,''),nullif(full_name,''),email::text,'سامانه')
    into v_sender_name
    from public.profiles where id=auth.uid() and active;
  if v_sender_name is null then
    raise exception 'حساب کاربری فعال نیست.' using errcode='42501';
  end if;

  for v_delivery in
    select * from public.message_deliveries
    where batch_id=p_batch_id and status='ready'
    for update
  loop
    select * into v_snapshot from public.message_snapshots where id=v_delivery.snapshot_id;
    if v_delivery.channel='portal' then
      insert into public.portal_messages(
        sender_id,subject,body,importance,allow_reply,require_ack,template_key,sender_name_snapshot
      ) values(
        auth.uid(),v_snapshot.subject,v_snapshot.final_text,'normal',false,false,v_snapshot.template_key,v_sender_name
      ) returning id into v_portal_message_id;
      insert into public.portal_message_recipients(message_id,recipient_id,sticker_state)
      values(v_portal_message_id,v_delivery.recipient_id,'state'||v_snapshot.sticker_state)
      on conflict do nothing;
      select id into v_chat_thread_id
      from public.chat_threads
      where system_recipient_id=v_delivery.recipient_id
      limit 1;
      update public.message_deliveries
      set status='sent',portal_message_id=v_portal_message_id,chat_thread_id=v_chat_thread_id,
          attempt_count=1,last_attempt_at=now(),sent_at=now()
      where id=v_delivery.id;
    else
      update public.message_deliveries set status='queued' where id=v_delivery.id;
    end if;
    v_queued_count:=v_queued_count+1;
  end loop;
  update public.message_batches
  set status=case when exists(
        select 1 from public.message_deliveries delivery
        where delivery.batch_id=p_batch_id and delivery.status='queued'
      ) then 'queued' else 'sent' end,
      queued_at=now(),
      completed_at=case when not exists(
        select 1 from public.message_deliveries delivery
        where delivery.batch_id=p_batch_id and delivery.status in ('ready','queued','processing')
      ) then now() end
  where id=p_batch_id;
  return v_queued_count;
end;
$$;

-- Response-tracking reminders are intentionally a separate feature from the
-- message center.  The private implementation is not executable by clients;
-- the public auth-bound wrapper below is the only entry point.
create or replace function private.prepare_delivery_reminders(
  p_delivery_ids bigint[],
  p_channel text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch_id uuid;
  v_snapshot_id bigint;
  v_recipient record;
  v_reminder_context jsonb;
  v_body_text text;
  v_template_body text;
  v_template_subject text;
  v_subject_text text;
  v_context_text text;
  v_last_sent text;
  v_report_date text;
  v_greeting text;
  v_channel text;
  v_delivery_ids bigint[];
  v_scoped_count integer;
begin
  if auth.uid() is null
     or not public.can_access_feature('responseTracking','view')
     or not public.can_access_feature('responseTracking','create')
     or not exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.active) then
    raise exception 'اجازهٔ آماده‌سازی یادآوری را ندارید.' using errcode='42501';
  end if;
  if p_channel not in ('portal','email','both') or p_request_id is null then
    raise exception 'کانال یا شناسهٔ درخواست نامعتبر است' using errcode='22023';
  end if;
  select array_agg(distinct selected.id order by selected.id)
    into v_delivery_ids
    from unnest(p_delivery_ids) selected(id);
  if coalesce(cardinality(v_delivery_ids),0)=0 or cardinality(v_delivery_ids)>200 then
    raise exception 'بین ۱ تا ۲۰۰ پیام انتخاب کنید' using errcode='22023';
  end if;
  select count(*)::integer into v_scoped_count
  from public.message_deliveries delivery
  where delivery.id=any(v_delivery_ids)
    and delivery.recipient_id in (
      select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
    );
  if v_scoped_count<>cardinality(v_delivery_ids) then
    raise exception 'همهٔ پیام‌های انتخابی باید در دامنهٔ سازمانی شما باشند.' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select id into v_batch_id
  from public.message_batches
  where batch_key=p_request_id and created_by=auth.uid() and kind='reminder';
  if v_batch_id is not null then
    if v_delivery_ids is distinct from (
      select array_agg(source.delivery_id order by source.delivery_id)
      from public.message_reminder_sources source where source.batch_id=v_batch_id
    )
    or exists(
      select 1 from public.message_deliveries delivery
      where delivery.batch_id=v_batch_id and delivery.channel<>p_channel and p_channel<>'both'
    )
    or (p_channel='both' and (
      select count(distinct delivery.channel)
      from public.message_deliveries delivery where delivery.batch_id=v_batch_id
    )<>2) then
      raise exception 'شناسهٔ درخواست با انتخاب قبلی یکسان نیست' using errcode='22023';
    end if;
    return v_batch_id;
  end if;

  perform id from public.message_deliveries where id=any(v_delivery_ids) order by id for update;
  if (
    select count(*)
    from public.message_deliveries delivery
    join public.profiles profile on profile.id=delivery.recipient_id and profile.active
    left join public.portal_message_recipients portal_recipient
      on portal_recipient.message_id=delivery.portal_message_id
     and portal_recipient.recipient_id=delivery.recipient_id
    where delivery.id=any(v_delivery_ids)
      and coalesce(delivery.replied_at,portal_recipient.replied_at) is null
      and delivery.status<>'cancelled'
  )<>cardinality(v_delivery_ids) then
    raise exception 'بعضی پیام‌ها پاسخ داده شده، لغو شده یا گیرنده نامعتبر دارند؛ جدول را تازه‌سازی کنید'
      using errcode='22023';
  end if;
  if p_channel in ('email','both') then
    select coalesce(nullif(profile.display_name,''),profile.full_name,profile.id::text)
      into v_body_text
      from public.profiles profile
      join public.message_deliveries delivery on delivery.recipient_id=profile.id
      where delivery.id=any(v_delivery_ids)
        and nullif(btrim(profile.email::text),'') is null
      limit 1;
    if found then
      raise exception 'برای % ایمیل ثبت نشده است؛ داخل سامانه را انتخاب کنید',v_body_text using errcode='22023';
    end if;
  end if;
  if exists(
    select 1
    from public.message_reminder_sources source
    join public.message_batches source_batch on source_batch.id=source.batch_id
    where source.delivery_id=any(v_delivery_ids)
      and (
        source_batch.created_at>now()-interval '1 minute'
        or exists(
          select 1 from public.message_deliveries reminder_delivery
          where reminder_delivery.snapshot_id=source.snapshot_id
            and reminder_delivery.status in ('queued','processing')
        )
      )
  ) then
    raise exception 'یادآوری این پیام به‌تازگی ساخته شده یا در حال ارسال است؛ وضعیت قبلی را بررسی کنید'
      using errcode='22023';
  end if;

  select body_html,subject_template into v_template_body,v_template_subject
  from public.email_templates where template_key='followup';
  if nullif(btrim(v_template_body),'') is null then
    raise exception 'قالب یادآوری تعریف نشده است' using errcode='22023';
  end if;
  v_report_date:=private.message_persian_date((now() at time zone 'Asia/Tehran')::date);
  insert into public.message_batches(batch_key,kind,subject,created_by,status)
  values(
    p_request_id,'reminder',replace(v_template_subject,'[تاریخ کامل شمسی]',v_report_date),auth.uid(),'draft'
  ) returning id into v_batch_id;

  for v_recipient in
    select distinct
      profile.id,profile.full_name,profile.display_name,profile.email,profile.salutation,profile.gender
    from public.profiles profile
    join public.message_deliveries delivery on delivery.recipient_id=profile.id
    where delivery.id=any(v_delivery_ids)
  loop
    select
      jsonb_agg(jsonb_build_object(
        'delivery_id',delivery.id,'snapshot_id',delivery.snapshot_id,'batch_id',delivery.batch_id,
        'recipient_id',delivery.recipient_id,'recipient_name',snapshot.recipient_name,
        'original_subject',snapshot.subject,'sent_at',delivery.sent_at,
        'response_status',case
          when delivery.status='failed' then 'failed'
          when coalesce(delivery.replied_at,portal_recipient.replied_at) is not null then 'replied'
          when delivery.sent_at is not null and delivery.sent_at<now()-interval '2 days' then 'reminder_needed'
          else 'awaiting'
        end,
        'reminder_count',delivery.reminder_count,'thread_key',delivery.thread_key
      ) order by delivery.id),
      string_agg(
        format(
          E'موضوع پیام اصلی: %s\nشناسه ارسال: %s\nتاریخ ارسال: %s\nشناسه پیگیری: %s',
          snapshot.subject,delivery.id,
          private.message_persian_date((delivery.sent_at at time zone 'Asia/Tehran')::date),delivery.thread_key
        ),
        E'\n\n' order by delivery.id
      )
    into v_reminder_context,v_body_text
    from public.message_deliveries delivery
    join public.message_snapshots snapshot on snapshot.id=delivery.snapshot_id
    left join public.portal_message_recipients portal_recipient
      on portal_recipient.message_id=delivery.portal_message_id
     and portal_recipient.recipient_id=delivery.recipient_id
    where delivery.id=any(v_delivery_ids) and delivery.recipient_id=v_recipient.id;
    v_context_text:=v_body_text;
    select private.message_persian_date(max(delivery.sent_at at time zone 'Asia/Tehran')::date)
      into v_last_sent
      from public.message_deliveries delivery
      where delivery.id=any(v_delivery_ids) and delivery.recipient_id=v_recipient.id;
    v_greeting:=private.message_salutation(
      v_recipient.salutation,
      coalesce(nullif(v_recipient.display_name,''),v_recipient.full_name,v_recipient.email::text),
      v_recipient.gender
    );
    v_body_text:=replace(replace(replace(
      v_template_body,
      '[عنوان و نام مخاطب]',v_greeting),
      '[تاریخ آخرین ارسال]',v_last_sent),
      '[تاریخ کامل شمسی]',v_report_date);
    if p_channel='portal' then v_body_text:=replace(v_body_text,'همین ایمیل','همین پیام'); end if;
    v_body_text:=v_body_text||E'\n\nپیام‌های اصلی مرتبط با این یادآوری:\n\n'||coalesce(v_context_text,'');
    v_subject_text:=replace(replace(v_template_subject,'[عنوان و نام مخاطب]',v_greeting),'[تاریخ کامل شمسی]',v_report_date);
    insert into public.message_snapshots(
      batch_id,recipient_id,recipient_name,recipient_email,sticker_state,
      template_key,subject,final_text,body_template,reminder_context
    ) values(
      v_batch_id,v_recipient.id,
      coalesce(nullif(v_recipient.display_name,''),nullif(v_recipient.full_name,''),v_recipient.email::text,v_recipient.id::text),
      v_recipient.email,1,'followup',v_subject_text,v_body_text,v_body_text,v_reminder_context
    ) returning id into v_snapshot_id;
    insert into public.message_reminder_sources(batch_id,delivery_id,snapshot_id,recipient_id)
      select v_batch_id,delivery.id,v_snapshot_id,v_recipient.id
      from public.message_deliveries delivery
      where delivery.id=any(v_delivery_ids) and delivery.recipient_id=v_recipient.id;
    foreach v_channel in array case when p_channel='both' then array['portal','email'] else array[p_channel] end loop
      insert into public.message_deliveries(batch_id,snapshot_id,recipient_id,channel,idempotency_key,thread_key)
      values(
        v_batch_id,v_snapshot_id,v_recipient.id,v_channel,
        v_batch_id||':'||v_recipient.id||':'||v_channel,
        'BAMCO-'||replace(v_batch_id::text,'-','')||'-'||replace(v_recipient.id::text,'-','')||'-'||v_channel
      );
    end loop;
  end loop;
  update public.message_batches set status='ready' where id=v_batch_id;
  return v_batch_id;
end;
$$;

create or replace function public.prepare_message_reminders(
  p_delivery_ids bigint[],
  p_channel text,
  p_request_id uuid
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select private.prepare_delivery_reminders(p_delivery_ids,p_channel,p_request_id);
$$;

create or replace function public.mark_message_reminders(p_delivery_ids bigint[])
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare delivery_ids bigint[];
begin
  if auth.uid() is null
     or not public.can_access_feature('responseTracking','create') then
    raise exception 'اجازهٔ ثبت یادآوری را ندارید.' using errcode='42501';
  end if;
  select array_agg(distinct selected.id order by selected.id)
    into delivery_ids from unnest(p_delivery_ids) selected(id);
  if exists(
    select 1
    from unnest(coalesce(delivery_ids,'{}'::bigint[])) selected(id)
    where not exists(
      select 1
      from public.message_deliveries delivery
      where delivery.id=selected.id
        and delivery.recipient_id in (
          select scoped.user_id from public.organization_scope_user_ids(auth.uid()) scoped
        )
    )
  ) then
    raise exception 'پیام خارج از دامنهٔ سازمانی است.' using errcode='42501';
  end if;
  -- Completion is recorded by the delivery trigger, never by the browser.
  return (
    select count(*)::integer
    from public.message_reminder_sources source
    where source.delivery_id=any(coalesce(delivery_ids,'{}'::bigint[]))
      and source.counted_at is not null
  );
end;
$$;

revoke all on function public.prepare_message_batch(uuid[],jsonb,text,text,text) from public,anon,authenticated;
revoke all on function private.prepare_delivery_reminders(bigint[],text,uuid) from public,anon,authenticated;
revoke all on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) from public,anon;
revoke all on function public.queue_message_batch(uuid) from public,anon;
revoke all on function public.prepare_message_reminders(bigint[],text,uuid) from public,anon;
revoke all on function public.mark_message_reminders(bigint[]) from public,anon;
grant execute on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) to authenticated;
grant execute on function public.queue_message_batch(uuid) to authenticated;
grant execute on function public.prepare_message_reminders(bigint[],text,uuid) to authenticated;
grant execute on function public.mark_message_reminders(bigint[]) to authenticated;

-- The UI exposes access management when the actor has manage_access on the
-- feature being edited.  Keep the RPC contract identical: settings-level and
-- system managers remain global managers, while a feature manager is limited
-- to that exact feature key.
create or replace function public.feature_access_manage_snapshot(p_feature_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_feature public.app_features%rowtype;
begin
  select * into v_feature
  from public.app_features
  where feature_key=p_feature_key and active;
  if not found then
    raise exception 'قابلیت سامانه معتبر نیست.' using errcode='P0002';
  end if;
  if v_actor is null
     or not (
       private.is_system_manager(v_actor)
       or private.feature_can_access_for(v_actor,'settings','manage_access')
       or private.feature_can_access_for(v_actor,v_feature.feature_key,'manage_access')
     ) then
    raise exception 'دسترسی مدیریت دسترسی لازم است.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'schema','bamco.feature-access.v1',
    'feature',to_jsonb(v_feature),
    'users',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',profile.id,
        'display_name',profile.display_name,
        'full_name',profile.full_name,
        'email',profile.email,
        'avatar_path',profile.avatar_path,
        'updated_at',profile.updated_at,
        'active',profile.active,
        'effective_access',jsonb_build_object(
          'can_view',private.feature_can_access_for(profile.id,v_feature.feature_key,'view'),
          'can_create',private.feature_can_access_for(profile.id,v_feature.feature_key,'create'),
          'can_edit',private.feature_can_access_for(profile.id,v_feature.feature_key,'edit'),
          'can_delete',private.feature_can_access_for(profile.id,v_feature.feature_key,'delete'),
          'can_export',private.feature_can_access_for(profile.id,v_feature.feature_key,'export'),
          'can_manage_access',private.feature_can_access_for(profile.id,v_feature.feature_key,'manage_access'),
          'can_bypass_approval',private.feature_can_access_for(profile.id,v_feature.feature_key,'bypass_approval')
        )
      ) order by coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text),profile.id)
      from public.profiles profile
      where profile.active
    ),'[]'::jsonb),
    'effective_grants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',profile.id,
        'can_view',private.feature_can_access_for(profile.id,v_feature.feature_key,'view'),
        'can_create',private.feature_can_access_for(profile.id,v_feature.feature_key,'create'),
        'can_edit',private.feature_can_access_for(profile.id,v_feature.feature_key,'edit'),
        'can_delete',private.feature_can_access_for(profile.id,v_feature.feature_key,'delete'),
        'can_export',private.feature_can_access_for(profile.id,v_feature.feature_key,'export'),
        'can_manage_access',private.feature_can_access_for(profile.id,v_feature.feature_key,'manage_access'),
        'can_bypass_approval',private.feature_can_access_for(profile.id,v_feature.feature_key,'bypass_approval')
      ) order by profile.id)
      from public.profiles profile
      where profile.active
    ),'[]'::jsonb),
    'grants',coalesce((
      select jsonb_agg(to_jsonb(grant_row) order by grant_row.user_id,grant_row.id)
      from public.feature_access_grants grant_row
      where grant_row.feature_key=v_feature.feature_key
        and grant_row.subject_kind='user'
        and grant_row.revoked_at is null
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.set_feature_access(
  p_feature_key text,
  p_grants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_grant jsonb;
  v_user uuid;
  v_effect text;
  v_changed integer:=0;
begin
  if not exists(select 1 from public.app_features where feature_key=p_feature_key and active) then
    raise exception 'قابلیت سامانه معتبر نیست.' using errcode='22023';
  end if;
  if v_actor is null or not (
    private.is_system_manager(v_actor)
    or private.feature_can_access_for(v_actor,'settings','manage_access')
    or private.feature_can_access_for(v_actor,p_feature_key,'manage_access')
  ) then
    raise exception 'دسترسی مدیریت دسترسی لازم است.' using errcode='42501';
  end if;
  if jsonb_typeof(p_grants) is distinct from 'array' then
    raise exception 'فهرست دسترسی نامعتبر است.' using errcode='22023';
  end if;
  for v_grant in select value from jsonb_array_elements(p_grants)
  loop
    begin
      v_user:=nullif(v_grant->>'user_id','')::uuid;
    exception when invalid_text_representation then
      raise exception 'شناسه کاربر نامعتبر است.' using errcode='22023';
    end;
    if v_user is null or not exists(select 1 from public.profiles where id=v_user and active) then
      raise exception 'کاربر فعال برای دسترسی پیدا نشد.' using errcode='22023';
    end if;
    if v_user=v_actor and private.is_system_manager(v_actor) then
      continue;
    end if;
    v_effect:=case lower(coalesce(v_grant->>'effect','allow')) when 'deny' then 'deny' else 'allow' end;
    delete from public.feature_access_grants
    where feature_key=p_feature_key
      and subject_kind='user'
      and user_id=v_user
      and resource_type is null
      and resource_id is null
      and revoked_at is null;
    insert into public.feature_access_grants(
      feature_key,subject_kind,user_id,effect,
      can_view,can_create,can_edit,can_delete,can_export,can_manage_access,can_bypass_approval,
      granted_by,metadata
    ) values(
      p_feature_key,'user',v_user,v_effect,
      coalesce((v_grant->>'can_view')::boolean,false),
      coalesce((v_grant->>'can_create')::boolean,false),
      coalesce((v_grant->>'can_edit')::boolean,false),
      coalesce((v_grant->>'can_delete')::boolean,false),
      coalesce((v_grant->>'can_export')::boolean,false),
      coalesce((v_grant->>'can_manage_access')::boolean,false),
      coalesce((v_grant->>'can_bypass_approval')::boolean,false),
      v_actor,jsonb_build_object('source','feature_access_editor')
    );
    v_changed:=v_changed+1;
    insert into public.audit_trail(actor_id,action,target_type,target_id,new_data,metadata)
    values(
      v_actor,'feature_access_set','feature_access_grant',p_feature_key||':'||v_user::text,
      v_grant,jsonb_build_object('feature_key',p_feature_key,'effect',v_effect)
    );
  end loop;
  return jsonb_build_object('schema','bamco.feature-access.v1','feature_key',p_feature_key,'changed',v_changed);
end;
$$;

create or replace function public.set_site_assignments(p_site_id bigint,p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_site public.site_definitions%rowtype;
begin
  if v_actor is null or not (
    private.is_system_manager(v_actor)
    or private.feature_can_access_for(v_actor,'sitesAccess','manage_access')
  ) then
    raise exception 'دسترسی مدیریت سایت سازمانی لازم است.' using errcode='42501';
  end if;
  select * into v_site from public.site_definitions
  where id=p_site_id and kind='organization'
  for update;
  if not found then
    raise exception 'سایت سازمانی پیدا نشد.' using errcode='P0002';
  end if;
  delete from public.feature_access_grants
  where feature_key='sitesAccess'
    and resource_type='site'
    and resource_id=v_site.id::text
    and revoked_at is null;
  if v_site.scope='selected' then
    insert into public.feature_access_grants(
      feature_key,subject_kind,user_id,resource_type,resource_id,effect,can_view,granted_by,metadata
    )
    select
      'sitesAccess','user',selected.user_id,'site',v_site.id::text,'allow',true,v_actor,
      jsonb_build_object('source','site_assignment')
    from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) as user_id) selected
    join public.profiles profile on profile.id=selected.user_id and profile.active
    on conflict do nothing;
  end if;
  delete from public.site_assignments where site_id=v_site.id;
  insert into public.audit_trail(actor_id,action,target_type,target_id,new_data,metadata)
  values(
    v_actor,'site_access_set','site_access',v_site.id::text,
    jsonb_build_object('user_ids',coalesce(p_user_ids,'{}'::uuid[])),
    jsonb_build_object('feature_key','sitesAccess')
  );
end;
$$;

-- Position structure mutations can change authority even when an assignment
-- row is unchanged.  Notify affected occupants (the changed branch and its
-- old/new direct parent) and retain an auditable old/new structure record.
create or replace function private.emit_position_structure_relationship_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  affected_user uuid;
  changed_fields jsonb;
begin
  if old.parent_position_id is not distinct from new.parent_position_id
     and old.role_id is not distinct from new.role_id
     and old.title is not distinct from new.title
     and old.active is not distinct from new.active then
    return new;
  end if;
  changed_fields:=to_jsonb(array_remove(array[
    case when old.parent_position_id is distinct from new.parent_position_id then 'parent_position_id' end,
    case when old.role_id is distinct from new.role_id then 'role_id' end,
    case when old.title is distinct from new.title then 'title' end,
    case when old.active is distinct from new.active then 'active' end
  ],null));
  for affected_user in
    with recursive branch(position_id) as (
      select new.id
      union
      select child.id
      from public.organization_positions child
      join branch parent on parent.position_id=child.parent_position_id
    ), affected_positions(position_id) as (
      select position_id from branch
      union
      select old.parent_position_id where old.parent_position_id is not null
      union
      select new.parent_position_id where new.parent_position_id is not null
    )
    select distinct assignment.user_id
    from public.organization_position_assignments assignment
    join affected_positions position on position.position_id=assignment.position_id
    join public.profiles profile on profile.id=assignment.user_id and profile.active
    where assignment.is_primary
      and assignment.valid_from<=current_date
      and (assignment.valid_to is null or assignment.valid_to>current_date)
  loop
    perform private.emit_relationship_event(
      affected_user,
      'organization_position_changed',
      'ساختار سازمانی تغییر کرد',
      'جایگاه سازمانی یا زنجیرهٔ نظارت شما به‌روزرسانی شد.',
      'organization_position',new.id::text,
      jsonb_build_object(
        'position_id',new.id,
        'actor_id',auth.uid(),
        'changed_fields',changed_fields
      )
    );
  end loop;
  insert into public.audit_trail(actor_id,action,target_type,target_id,old_data,new_data,metadata)
  values(
    auth.uid(),
    'organization_position_structure_changed',
    'organization_position',
    new.id::text,
    jsonb_build_object(
      'parent_position_id',old.parent_position_id,
      'role_id',old.role_id,
      'title',old.title,
      'active',old.active
    ),
    jsonb_build_object(
      'parent_position_id',new.parent_position_id,
      'role_id',new.role_id,
      'title',new.title,
      'active',new.active
    ),
    jsonb_build_object('changed_fields',changed_fields)
  );
  return new;
end;
$$;

drop trigger if exists organization_position_structure_relationship_change on public.organization_positions;
create trigger organization_position_structure_relationship_change
after update of parent_position_id,role_id,title,active on public.organization_positions
for each row execute function private.emit_position_structure_relationship_change();
revoke all on function private.emit_position_structure_relationship_change() from public,anon,authenticated;

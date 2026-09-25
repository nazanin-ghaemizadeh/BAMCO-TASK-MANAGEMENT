-- Live integration checks. All writes are rolled back.
begin;

do $qa$
declare
  v_sender uuid;
  v_recipient uuid;
  v_batch uuid;
  v_registered integer;
  v_has_token boolean;
  v_has_section boolean;
begin
  select profile.id into v_sender
  from public.profiles profile
  where profile.active and private.is_system_manager(profile.id)
  order by profile.created_at
  limit 1;

  select assignment.user_id into v_recipient
  from public.organization_position_assignments assignment
  join public.organization_positions position on position.id=assignment.position_id and position.active
  join public.organization_roles role_row on role_row.id=position.role_id and role_row.active
  join public.profiles profile on profile.id=assignment.user_id and profile.active
  where assignment.is_primary
    and assignment.valid_from<=current_date
    and (assignment.valid_to is null or assignment.valid_to>current_date)
    and role_row.role_key='manager'
    and not private.is_system_manager(assignment.user_id)
  order by assignment.id
  limit 1;

  if v_sender is null or v_recipient is null then
    raise exception 'QA requires a system manager and an organization manager';
  end if;
  perform set_config('request.jwt.claim.sub',v_sender::text,true);
  v_batch:=public.prepare_workflow_messages(
    array[v_recipient],
    jsonb_build_object(v_recipient::text,'portal'),
    'QA جدول امور ثبت‌شده مدیر',
    E'مدیر محترم\n\n[جدول امور ثبت‌شده]',
    'manual',
    '۱۴۰۵/۰۷/۰۳'
  );

  select
    count(*) filter(where item->>'status_kind'='registered')::integer,
    bool_or(snapshot.body_template like '%[جدول امور ثبت‌شده]%'),
    bool_or(snapshot.final_text like '%امور ثبت‌شده و بدون متولی:%')
  into v_registered,v_has_token,v_has_section
  from public.message_snapshots snapshot
  cross join lateral jsonb_array_elements(snapshot.tasks) item
  where snapshot.batch_id=v_batch;

  if coalesce(v_registered,0)=0 then
    raise exception 'manager snapshot is missing registered tasks';
  end if;
  if not coalesce(v_has_token,false) or not coalesce(v_has_section,false) then
    raise exception 'manager snapshot is missing the registered-task table contract';
  end if;
end;
$qa$;

do $qa$
declare
  v_user uuid;
  v_thread uuid;
  v_rows jsonb;
  v_read_at timestamptz;
begin
  select profile.id into v_user
  from public.profiles profile
  where profile.active and private.is_system_manager(profile.id)
  order by profile.created_at
  limit 1;
  select thread.id into v_thread
  from public.chat_threads thread
  where thread.thread_type='public' and thread.is_active
  order by thread.created_at
  limit 1;
  if v_user is null or v_thread is null then
    raise exception 'QA requires an active system manager and public chat';
  end if;

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  v_rows:=public.chat_conversation_list();
  if not exists(
    select 1
    from jsonb_array_elements(v_rows) row_data
    where row_data->>'id'=v_thread::text and row_data ? 'last_read_at'
  ) then
    raise exception 'conversation list does not expose last_read_at';
  end if;

  perform public.chat_mark_read(v_thread);
  select member.last_read_at into v_read_at
  from public.chat_members member
  where member.thread_id=v_thread and member.user_id=v_user;
  if v_read_at is null then
    raise exception 'chat_mark_read did not persist the member watermark';
  end if;
end;
$qa$;

rollback;

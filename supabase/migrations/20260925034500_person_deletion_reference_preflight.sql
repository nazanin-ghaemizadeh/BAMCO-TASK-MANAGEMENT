-- Account deletion must never discover an undeletable historical reference
-- halfway through its cleanup loop. Resolve the two declared operational
-- ownership cases, but fail before every mutation when a NOT NULL historical
-- or domain-owner reference still requires an explicit product decision.

create or replace function public.delete_person_account(
  p_user_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r record;
  v_reference record;
  n integer;
  v_reference_count bigint;
  v_blockers jsonb:='[]'::jsonb;
  photo_paths jsonb;
  affected_requests bigint[];
  person_name text;
  active_ids bigint[];
  active_tasks jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('bamco-delete-person',0));
  if p_actor_id is null or not exists(
    select 1 from public.profiles profile
    where profile.id=p_actor_id and profile.role='manager' and profile.active
  ) then
    raise exception 'دسترسی مدیر لازم است.' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id=p_actor_id then
    raise exception 'حساب در حال استفاده را نمی‌توان حذف کرد.';
  end if;

  perform 1 from auth.users account where account.id=p_user_id for update;
  if not found then
    return jsonb_build_object(
      'ok',true,'already_deleted',true,'tasks_retained',0,
      'avatar_paths','[]'::jsonb
    );
  end if;

  -- These two NOT NULL references are operational assignments rather than
  -- authorship: they are transferred to the deleting manager below. Reminder
  -- sources are ephemeral and are deleted. Every other populated NOT NULL FK
  -- is a blocker so creator/audit history is never silently reassigned.
  for v_reference in
    select constraint_row.conrelid::regclass relation_name,
           namespace.nspname schema_name,
           relation.relname table_name,
           attribute.attname column_name
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_attribute attribute
      on attribute.attrelid=constraint_row.conrelid
     and attribute.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f'
      and constraint_row.confrelid='public.profiles'::regclass
      and constraint_row.confdeltype<>'c'
      and array_length(constraint_row.conkey,1)=1
      and attribute.attnotnull
      and not (
        namespace.nspname='public'
        and relation.relname='petty_cash_entries'
        and attribute.attname='responsible_id'
      )
      and not (
        namespace.nspname='public'
        and relation.relname='message_reminder_sources'
        and attribute.attname='recipient_id'
      )
      and not (
        namespace.nspname='public'
        and relation.relname='portal_message_recipients'
        and attribute.attname='recipient_id'
      )
    order by namespace.nspname,relation.relname,attribute.attname
  loop
    execute format(
      'select count(*) from %s where %I=$1',
      v_reference.relation_name,v_reference.column_name
    ) into v_reference_count using p_user_id;
    if v_reference_count>0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'relation',v_reference.schema_name||'.'||v_reference.table_name,
        'column',v_reference.column_name,
        'count',v_reference_count
      ));
    end if;
  end loop;

  -- A WBS owner is nullable in the legacy schema, but clearing it violates the
  -- project/task owner invariant. Require the explicit project transfer flow.
  select count(*) into v_reference_count
  from public.project_items item
  where item.owner_id=p_user_id;
  if v_reference_count>0 then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
      'relation','public.project_items','column','owner_id',
      'count',v_reference_count
    ));
  end if;

  if jsonb_array_length(v_blockers)>0 then
    raise exception 'حذف حساب امکان‌پذیر نیست؛ ابتدا مالکیت یا سوابق الزامی فهرست‌شده را تعیین تکلیف کنید.'
      using errcode='55000',
            detail=jsonb_build_object('blocking_references',v_blockers)::text,
            hint='انتقال مالکیت باید پیش از حذف نهایی انجام شود.';
  end if;

  perform set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform set_config('bamco.deleting_person',p_user_id::text,true);
  select profile.full_name into person_name
  from public.profiles profile where profile.id=p_user_id;

  update public.chat_messages
  set sender_name_snapshot=person_name
  where sender_id=p_user_id;
  update public.portal_messages
  set sender_name_snapshot=person_name
  where sender_id=p_user_id;
  update public.chat_threads thread
  set is_active=false,
      deleted_participant_name=person_name,
      participant_deleted_at=now()
  where thread.thread_type='direct'
    and exists(
      select 1 from public.chat_members member
      where member.thread_id=thread.id and member.user_id=p_user_id
    );
  update public.change_requests
  set requester_name_snapshot=person_name
  where requested_by=p_user_id;
  update public.task_history
  set actor_name_snapshot=person_name
  where actor_id=p_user_id;
  update public.change_request_events
  set actor_name_snapshot=person_name
  where actor_id=p_user_id;

  select coalesce(jsonb_agg(object_row.name),'[]'::jsonb)
  into photo_paths
  from storage.objects object_row
  where object_row.bucket_id='avatars'
    and split_part(object_row.name,'/',1)=p_user_id::text;
  update storage.objects
  set owner=p_actor_id,owner_id=p_actor_id::text
  where owner=p_user_id or owner_id=p_user_id::text;

  -- Preserve personal sites and active petty-cash ownership instead of letting
  -- profile deletion cascade into a site or leave an unusable ledger entry.
  update public.site_definitions
  set owner_user_id=p_actor_id,updated_at=now()
  where owner_user_id=p_user_id;
  update public.petty_cash_entries
  set responsible_id=p_actor_id,updated_at=now(),version=version+1
  where responsible_id=p_user_id;
  delete from public.message_reminder_sources
  where recipient_id=p_user_id;

  select coalesce(array_agg(task.id),array[]::bigint[])
  into active_ids
  from public.tasks task
  where task.owner_id=p_user_id
    and not task.archived
    and task.status not in ('انجام شده','متوقف');
  update public.tasks set owner_id=null where owner_id=p_user_id;
  get diagnostics n=row_count;

  update public.message_deliveries
  set status='cancelled',
      error_message='حساب گیرنده حذف شده است.'
  where recipient_id=p_user_id
    and status in ('ready','queued','failed');
  select coalesce(array_agg(distinct step.request_id),array[]::bigint[])
  into affected_requests
  from public.request_approval_steps step
  join public.change_requests request on request.id=step.request_id
  where step.approver_id=p_user_id
    and step.decision='pending'
    and request.request_status in ('pending','in_review');
  update public.change_requests
  set request_status='needs_revision',
      manager_note='تأییدکننده حذف شده است؛ زنجیره را اصلاح و درخواست را دوباره ارسال کنید.'
  where id=any(affected_requests);
  update public.request_approval_steps
  set decision='needs_revision',
      note='حساب تأییدکننده حذف شده است.',
      decided_at=now()
  where approver_id=p_user_id and decision='pending';
  update public.change_requests
  set manager_note=concat_ws(
    E'\n',nullif(manager_note,''),
    'حساب درخواست‌دهنده حذف شده است؛ درخواست برای تصمیم‌گیری و تعیین متولی باقی مانده است.'
  )
  where requested_by=p_user_id
    and request_status in ('draft','pending','in_review','needs_revision');
  delete from public.portal_message_recipients
  where recipient_id=p_user_id;

  -- Only nullable, non-cascading historical links remain at this point. The
  -- preflight above proved that no populated NOT NULL column reaches this loop.
  for r in
    select constraint_row.conrelid::regclass tab,attribute.attname col
    from pg_constraint constraint_row
    join pg_attribute attribute
      on attribute.attrelid=constraint_row.conrelid
     and attribute.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f'
      and constraint_row.confrelid='public.profiles'::regclass
      and constraint_row.confdeltype<>'c'
      and array_length(constraint_row.conkey,1)=1
  loop
    execute format(
      'update %s set %I=null where %I=$1',r.tab,r.col,r.col
    ) using p_user_id;
  end loop;

  delete from auth.users where id=p_user_id;
  if exists(select 1 from auth.users where id=p_user_id)
     or exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'حذف حساب تأیید نشده است.';
  end if;
  perform set_config('bamco.deleting_person','',true);
  select coalesce(
    jsonb_agg(to_jsonb(task_view) order by task_view.id),'[]'::jsonb
  ) into active_tasks
  from public.task_status_view task_view
  where task_view.id=any(active_ids);
  return jsonb_build_object(
    'ok',true,'tasks_retained',n,'avatar_paths',photo_paths,
    'active_tasks',active_tasks
  );
end;
$$;

revoke all on function public.delete_person_account(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.delete_person_account(uuid,uuid)
  to service_role;

notify pgrst,'reload schema';

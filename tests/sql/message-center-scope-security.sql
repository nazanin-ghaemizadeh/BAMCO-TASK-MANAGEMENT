-- Message-center/RLS contract.  This is safe to run against a production
-- database because every write is contained in, and rolled back with, the
-- surrounding transaction.  It exercises the same JWT-bound permissions
-- used by the browser rather than calling a private helper with an actor ID.
begin;

do $$
declare
  v_actor uuid;
  v_batch uuid;
  v_delivery_id bigint;
  v_reminder_batch uuid;
  v_visible integer;
  v_raw_write_denied boolean:=false;
begin
  select profile.id into v_actor
  from public.profiles profile
  where profile.active
    and private.is_system_manager(profile.id)
    and private.feature_can_access_for(profile.id,'messageCenter','view')
    and private.feature_can_access_for(profile.id,'messageCenter','create')
  order by profile.id
  limit 1;
  if v_actor is null then
    raise exception 'an active message-center administrator fixture is required';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub',v_actor,'role','authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  if not public.can_access_feature('messageCenter','view')
     or not public.can_access_feature('messageCenter','create') then
    raise exception 'JWT-bound message-center feature grant was not available';
  end if;

  select count(*) into v_visible from public.message_recipient_live_state;
  if v_visible=0 then
    raise exception 'scoped recipient projection did not expose an active user';
  end if;

  begin
    insert into public.message_batches(kind,subject,created_by,status)
    values('manual','__BAMCO_RAW_WRITE_DENY__',v_actor,'draft');
  exception when insufficient_privilege then
    v_raw_write_denied:=true;
  end;
  if not v_raw_write_denied then
    raise exception 'direct message batch write bypassed the RPC-only policy';
  end if;

  v_batch:=public.prepare_workflow_messages(
    array[v_actor],
    jsonb_build_object(v_actor::text,'portal'),
    '__BAMCO_SCOPE_QUEUE__',
    'QA',
    'manual',
    null
  );
  if public.queue_message_batch(v_batch)<>1 then
    raise exception 'the scoped portal batch did not queue exactly one delivery';
  end if;
  if not exists(
    select 1
    from public.message_deliveries delivery
    where delivery.batch_id=v_batch
      and delivery.recipient_id=v_actor
      and delivery.status='sent'
      and delivery.portal_message_id is not null
  ) then
    raise exception 'portal delivery was not created by the scoped queue';
  end if;
  if not exists(select 1 from public.message_batches batch where batch.id=v_batch) then
    raise exception 'nonrecursive message-batch read policy denied the creator';
  end if;
  if not exists(
    select 1
    from public.message_snapshots snapshot
    where snapshot.batch_id=v_batch and snapshot.recipient_id=v_actor
  ) then
    raise exception 'nonrecursive message-snapshot read policy denied the creator';
  end if;

  select delivery.id into v_delivery_id
  from public.message_deliveries delivery
  where delivery.batch_id=v_batch
    and delivery.recipient_id=v_actor
    and delivery.status='sent'
  limit 1;
  if v_delivery_id is null then
    raise exception 'a sent delivery fixture is required for the reminder contract';
  end if;
  v_reminder_batch:=public.prepare_message_reminders(
    array[v_delivery_id],
    'portal',
    'c0a80123-0000-4000-8000-000000000001'::uuid
  );
  if v_reminder_batch is null or public.queue_message_batch(v_reminder_batch)<>1 then
    raise exception 'the scoped reminder batch did not queue exactly one delivery';
  end if;
  if not exists(
    select 1
    from public.message_reminder_sources source
    join public.message_deliveries delivery on delivery.batch_id=v_reminder_batch
    where source.batch_id=v_reminder_batch
      and source.delivery_id=v_delivery_id
      and delivery.recipient_id=v_actor
      and delivery.status='sent'
  ) then
    raise exception 'reminder sources or portal delivery were not created by the canonical reminder RPC';
  end if;

  execute 'reset role';
end;
$$;

rollback;

select 'PASS: message-center scope, RPC-only writes, portal queue and reminder RPC contracts; transaction rolled back' as result;

-- Correct the queue executor's PL/pgSQL record/table-alias ambiguity.
-- 20260922115500 corrected batch preparation; this separately corrects the
-- already-applied queue function without changing its authorization contract.

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

revoke all on function public.queue_message_batch(uuid) from public,anon;
grant execute on function public.queue_message_batch(uuid) to authenticated;

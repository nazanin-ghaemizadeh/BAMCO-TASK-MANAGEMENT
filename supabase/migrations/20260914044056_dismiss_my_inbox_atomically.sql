create or replace function public.dismiss_my_inbox()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_notifications integer := 0;
  v_messages integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  update public.notifications
  set dismissed_at = v_now,
      read_at = coalesce(read_at, v_now)
  where user_id = v_user_id
    and dismissed_at is null;
  get diagnostics v_notifications = row_count;

  update public.portal_message_recipients as recipient
  set dismissed_at = v_now,
      read_at = coalesce(recipient.read_at, v_now)
  where recipient.recipient_id = v_user_id
    and recipient.dismissed_at is null
    and not exists (
      select 1
      from public.message_deliveries as delivery
      where delivery.portal_message_id = recipient.message_id
        and delivery.chat_thread_id is not null
    );
  get diagnostics v_messages = row_count;

  return jsonb_build_object('notifications', v_notifications, 'messages', v_messages);
end;
$function$;

revoke all on function public.dismiss_my_inbox() from public, anon;
grant execute on function public.dismiss_my_inbox() to authenticated;

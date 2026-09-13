create or replace function public.sent_message_dataset_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select concat_ws(':',
    (select count(*) from public.message_deliveries),
    (select coalesce(max(id), 0) from public.message_deliveries),
    (select coalesce(max(extract(epoch from coalesce(sent_at, last_attempt_at, created_at)))::bigint, 0) from public.message_deliveries),
    (select count(*) from public.portal_message_recipients),
    (select coalesce(max(message_id), 0) from public.portal_message_recipients),
    (select count(*) from public.chat_messages where is_system and deleted_at is null),
    (select coalesce(max(id), 0) from public.chat_messages where is_system and deleted_at is null)
  );
$$;

revoke all on function public.sent_message_dataset_version() from public, anon;
grant execute on function public.sent_message_dataset_version() to authenticated, service_role;

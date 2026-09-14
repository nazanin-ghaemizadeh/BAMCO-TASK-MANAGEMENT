create or replace view public.sent_message_log
with (security_invoker = true)
as
select
  'delivery:' || d.id::text as log_key,
  'delivery'::text as source_type,
  d.id::text as source_id,
  d.recipient_id,
  s.recipient_name,
  s.subject,
  d.channel,
  d.status as delivery_status,
  coalesce(d.sent_at, d.created_at) as sent_at,
  d.attempt_count,
  d.error_message,
  d.thread_key,
  b.created_by as sender_id,
  coalesce(nullif(p.display_name, ''), nullif(p.full_name, ''), p.email::text, 'سامانه') as sender_name,
  d.snapshot_id,
  d.portal_message_id
from public.message_deliveries d
join public.message_snapshots s on s.id = d.snapshot_id
join public.message_batches b on b.id = d.batch_id
left join public.profiles p on p.id = b.created_by
where b.kind in ('daily', 'reminder');

grant select on public.sent_message_log to authenticated;

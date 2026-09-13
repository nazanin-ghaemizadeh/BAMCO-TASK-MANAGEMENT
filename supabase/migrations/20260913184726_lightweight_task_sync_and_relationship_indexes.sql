create or replace function public.task_dataset_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select concat(
    count(*), ':',
    coalesce(max(t.last_updated_at)::text, ''), ':',
    coalesce(sum(t.row_version), 0)::text, ':',
    coalesce(max(t.id), 0)::text
  )
  from public.tasks t
$$;

revoke all on function public.task_dataset_version() from public, anon;
grant execute on function public.task_dataset_version() to authenticated, service_role;

create index if not exists web_push_jobs_subscription_id_idx on private.web_push_jobs(subscription_id);
create index if not exists web_push_subscriptions_user_id_idx on private.web_push_subscriptions(user_id);
create index if not exists approval_chains_created_by_idx on public.approval_chains(created_by);
create index if not exists letter_access_granted_by_idx on public.letter_access(granted_by);
create index if not exists letters_created_by_idx on public.letters(created_by);
create index if not exists letters_updated_by_idx on public.letters(updated_by);
create index if not exists message_reminder_sources_snapshot_id_idx on public.message_reminder_sources(snapshot_id);
create index if not exists message_reminder_sources_recipient_id_idx on public.message_reminder_sources(recipient_id);
create index if not exists vehicle_access_granted_by_idx on public.vehicle_access(granted_by);

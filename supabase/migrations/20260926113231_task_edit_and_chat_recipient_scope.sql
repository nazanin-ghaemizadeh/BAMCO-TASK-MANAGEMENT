-- Let an authorized editor move a task into the registered state, whose
-- trigger deliberately clears its owner. Keep ownership changes scoped.
drop policy if exists tasks_direct_update on public.tasks;
create policy tasks_direct_update on public.tasks for update to authenticated
using (
  public.can_access_feature('kanban','edit')
  and public.organization_can_manage_task(id)
)
with check (
  public.can_access_feature('kanban','edit')
  and (
    (owner_id is not null and public.bamco_can_direct_manage_organization_user(owner_id))
    or (owner_id is null and status='ثبت شده')
  )
);

-- Return only eligible recipient IDs; directory names still come from the
-- existing authenticated directory. This uses the same predicate as creation.
create or replace function public.chat_task_recipient_ids(p_task_id bigint)
returns table(user_id uuid)
language sql stable security definer set search_path=''
as $$
  select profile.id
  from public.profiles profile
  where auth.uid() is not null
    and private.organization_actor_can_access_task_chat(auth.uid(),p_task_id,'view')
    and profile.id<>auth.uid()
    and profile.active
    and profile.messaging_enabled
    and private.organization_actor_can_access_task_chat(profile.id,p_task_id,'view');
$$;
revoke all on function public.chat_task_recipient_ids(bigint) from public,anon;
grant execute on function public.chat_task_recipient_ids(bigint) to authenticated;

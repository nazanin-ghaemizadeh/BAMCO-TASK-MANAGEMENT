-- Midnight of 15 Shahrivar 1405 in Tehran is 2026-09-05 20:30 UTC.
update public.app_settings
set value=jsonb_build_object('value','2026-09-05T20:30:00Z')
where key='performance_monitoring_started_at';

-- A task's visibility authorizes choosing the task. Once the actor invites
-- another active person, only the invited members can read or write that
-- conversation, even when the invitee cannot see the task in Kanban.
create or replace function public.chat_task_recipient_ids(p_task_id bigint)
returns table(user_id uuid)
language sql stable security definer set search_path=''
as $$
  select profile.id
  from public.profiles profile
  where auth.uid() is not null
    and private.organization_actor_can_access_task_chat(auth.uid(),p_task_id,'view')
    and profile.id<>auth.uid()
    and profile.active and profile.messaging_enabled;
$$;
revoke all on function public.chat_task_recipient_ids(bigint) from public,anon;
grant execute on function public.chat_task_recipient_ids(bigint) to authenticated;

create or replace function private._bamco_impl_chat_ensure_task_direct(p_task_id bigint,p_other_user uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_title text;
  v_display_id bigint;
  v_key text;
  v_thread_id uuid;
begin
  if v_actor is null or p_other_user is null or p_other_user=v_actor
     or not private.organization_actor_can_access_task_chat(v_actor,p_task_id,'view')
     or not exists(select 1 from public.profiles profile
                   where profile.id=p_other_user and profile.active and profile.messaging_enabled) then
    raise exception 'invalid_recipient' using errcode='42501';
  end if;
  select task.title,task.legacy_id into v_title,v_display_id
  from public.tasks task where task.id=p_task_id;
  if not found then raise exception 'task_not_found' using errcode='P0002'; end if;
  v_key:='task:'||p_task_id::text||':'||case
    when v_actor::text<p_other_user::text then v_actor::text||':'||p_other_user::text
    else p_other_user::text||':'||v_actor::text end;
  select thread.id into v_thread_id from public.chat_threads thread where thread.direct_key=v_key limit 1;
  if v_thread_id is null then
    if not private.organization_actor_can_access_task_chat(v_actor,p_task_id,'create') then
      raise exception 'forbidden' using errcode='42501';
    end if;
    begin
      insert into public.chat_threads(thread_type,title,task_id,direct_key,created_by)
      values('direct','وظیفه '||coalesce(v_display_id,p_task_id)::text||' — '||left(coalesce(v_title,''),90),p_task_id,v_key,v_actor)
      returning id into v_thread_id;
    exception when unique_violation then
      select thread.id into v_thread_id from public.chat_threads thread where thread.direct_key=v_key limit 1;
    end;
  end if;
  insert into public.chat_members(thread_id,user_id) values(v_thread_id,v_actor),(v_thread_id,p_other_user)
  on conflict do nothing;
  return v_thread_id;
end;
$$;

create or replace function private.can_access_chat_action(p_thread_id uuid,p_action text default 'view')
returns boolean language sql stable security definer set search_path=''
as $$
  select coalesce(
    auth.uid() is not null
    and exists(select 1 from public.profiles profile where profile.id=auth.uid() and profile.active)
    and exists(
      select 1 from public.chat_threads thread
      where thread.id=p_thread_id
        and (lower(coalesce(nullif(p_action,''),'view'))='view' or thread.is_active)
        and (
          (thread.system_recipient_id=auth.uid()
           and private.feature_can_access_for(auth.uid(),'messages',lower(coalesce(nullif(p_action,''),'view'))))
          or (thread.system_recipient_id is null and thread.task_id is not null
              and exists(select 1 from public.chat_members member
                         where member.thread_id=thread.id and member.user_id=auth.uid()))
          or (thread.system_recipient_id is null and thread.task_id is null
              and thread.thread_type in ('public','group')
              and private.feature_can_access_for(auth.uid(),'groupChat',lower(coalesce(nullif(p_action,''),'view')))
              and (thread.thread_type='public' or private.is_system_manager(auth.uid())
                   or exists(select 1 from public.chat_members member where member.thread_id=thread.id and member.user_id=auth.uid())))
          or (thread.system_recipient_id is null and thread.task_id is null
              and thread.thread_type='direct'
              and private.feature_can_access_for(auth.uid(),'directMessages',lower(coalesce(nullif(p_action,''),'view')))
              and (private.is_system_manager(auth.uid())
                   or exists(select 1 from public.chat_members member where member.thread_id=thread.id and member.user_id=auth.uid())))
        )
    ),false);
$$;

-- Keep revision routing, unread chat state and manager reports canonical.

create or replace function public.resubmit_change_request(
  p_request_id bigint,
  p_proposed_data jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.change_requests%rowtype;
  v_owner uuid;
begin
  if jsonb_typeof(p_proposed_data) is distinct from 'object' then
    raise exception 'اطلاعات درخواست نامعتبر است.' using errcode='22023';
  end if;
  if auth.uid() is null or not private.feature_can_access_for(auth.uid(),'kanban','edit') then
    raise exception 'مجوز ارسال مجدد درخواست را ندارید.' using errcode='42501';
  end if;

  select * into v_request
  from public.change_requests
  where id=p_request_id
    and requested_by=auth.uid()
    and request_status='needs_revision'
  for update;
  if not found then
    raise exception 'درخواست قابل اصلاح پیدا نشد.' using errcode='42501';
  end if;

  -- The owner control is intentionally locked in the revision dialog. Older
  -- clients therefore omitted it from FormData. Restore the invariant at the
  -- trust boundary as well as in the browser.
  if v_request.request_type in ('create','update','status','priority','description','due_date') then
    v_owner:=nullif(p_proposed_data->>'owner_id','')::uuid;
    if v_owner is not null and v_owner is distinct from v_request.requested_by then
      raise exception 'درخواست شخصی فقط می‌تواند متولی ثبت‌کننده را داشته باشد.' using errcode='42501';
    end if;
    p_proposed_data:=jsonb_set(
      coalesce(p_proposed_data,'{}'::jsonb),
      '{owner_id}',
      to_jsonb(v_request.requested_by::text),
      true
    );
  end if;

  if v_request.organization_workflow_id is not null then
    update public.organization_workflows
    set status='cancelled',updated_at=now()
    where id=v_request.organization_workflow_id;
  end if;

  update public.change_requests
  set proposed_data=coalesce(p_proposed_data,'{}'::jsonb),
      request_status='pending',
      revision_count=revision_count+1,
      resubmitted_at=now(),
      reviewed_by=null,
      reviewed_at=null,
      manager_note=null,
      current_stage=1,
      completed_at=null,
      final_data=null,
      applied_task_id=null,
      organization_workflow_id=null
  where id=v_request.id;

  insert into public.change_request_events(request_id,actor_id,event_type,note,snapshot)
  values(
    p_request_id,
    auth.uid(),
    'resubmitted',
    'درخواست پس از اصلاح دوباره ارسال شد',
    p_proposed_data
  );
  perform private.route_change_request(p_request_id);
end;
$$;

create or replace function public.request_routing_status()
returns table(
  request_id bigint,
  stage_no smallint,
  stage_title text,
  approver_names text,
  actionable boolean
)
language sql
stable
security definer
set search_path=''
as $$
  select
    request.id,
    workflow.current_step::smallint,
    case
      when request.request_status='needs_revision' then 'اصلاح توسط متولی'
      else coalesce(string_agg(distinct step.position_title,'، ' order by step.position_title),'بدون بالادست')
    end,
    case
      when request.request_status='needs_revision' then null
      else string_agg(
        distinct coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text),
        '، ' order by coalesce(nullif(profile.display_name,''),nullif(profile.full_name,''),profile.email::text)
      )
    end,
    case
      when request.request_status='needs_revision' then false
      else coalesce(bool_or(
        (step.approver_id=auth.uid() or private.is_system_manager(auth.uid()))
        and step.decision='pending'
      ),false)
    end
  from public.change_requests request
  join public.organization_workflows workflow
    on workflow.id=request.organization_workflow_id
  join public.organization_workflow_steps step
    on step.workflow_id=workflow.id
   and step.step_no=workflow.current_step
  left join public.profiles profile on profile.id=step.approver_id
  where request.request_status in ('pending','in_review','needs_revision')
    and (
      request.requested_by=auth.uid()
      or step.approver_id=auth.uid()
      or private.is_system_manager(auth.uid())
    )
  group by request.id,request.request_status,workflow.current_step;
$$;

-- Expose the member watermark with each thread so the client can anchor the
-- first unread message before acknowledging it.
create or replace function private._bamco_impl_chat_conversation_list()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    jsonb_agg(row_data order by (row_data.system_recipient_id is not null) desc,row_data.updated_at desc),
    '[]'::jsonb
  )
  from (
    select
      thread.id,
      thread.thread_type,
      thread.task_id,
      thread.avatar_path,
      thread.system_recipient_id,
      thread.is_active,
      thread.participant_deleted_at,
      case
        when thread.system_recipient_id is not null then 'پیام‌های خودکار سامانه'
        when thread.thread_type='direct' then coalesce(
          nullif(peer.display_name,''),nullif(peer.full_name,''),peer.email::text,
          thread.deleted_participant_name,thread.title
        )
        else thread.title
      end as title,
      peer.id as person_id,
      thread.updated_at,
      (
        select member.last_read_at
        from public.chat_members member
        where member.thread_id=thread.id and member.user_id=auth.uid()
        limit 1
      ) as last_read_at,
      (
        select case
          when message.body like 'BAMCO_PORTAL_MESSAGE_V1:%' then coalesce(
            (select portal.subject from public.portal_messages portal where portal.id=message.source_portal_message_id),
            'پیام سامانه'
          )
          else left(message.body,160)
        end
        from public.chat_messages message
        where message.thread_id=thread.id and message.deleted_at is null
        order by message.created_at desc
        limit 1
      ) as last_message,
      (
        select count(*)
        from public.notifications notification
        where notification.user_id=auth.uid()
          and notification.entity_type='chat_thread'
          and notification.entity_id=thread.id::text
          and notification.read_at is null
          and notification.dismissed_at is null
      ) as unread_count
    from public.chat_threads thread
    left join lateral (
      select profile.id,profile.display_name,profile.full_name,profile.email
      from public.chat_members member
      join public.profiles profile on profile.id=member.user_id
      where member.thread_id=thread.id
        and member.user_id<>auth.uid()
        and profile.id is distinct from thread.system_recipient_id
      order by member.joined_at
      limit 1
    ) peer on true
    where auth.uid() is not null
      and (thread.is_active or thread.participant_deleted_at is not null or thread.system_recipient_id=auth.uid())
      and private.can_access_chat(thread.id)
  ) row_data;
$$;

create or replace function private.message_recipient_receives_registered(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(
    private.is_system_manager(p_user)
    or exists(
      select 1
      from public.organization_position_assignments assignment
      join public.organization_positions position
        on position.id=assignment.position_id and position.active
      join public.organization_roles role_row
        on role_row.id=position.role_id and role_row.active
      where assignment.user_id=p_user
        and assignment.is_primary
        and assignment.valid_from<=current_date
        and (assignment.valid_to is null or assignment.valid_to>=current_date)
        and role_row.role_key='manager'
    ),
    false
  );
$$;

-- Preserve the single canonical message builder and replace only its audience
-- predicate. Abort loudly if a future migration changes that contract.
do $$
declare
  v_definition text;
  v_old constant text:='private.is_system_manager(v_recipient_id)';
  v_new constant text:='private.message_recipient_receives_registered(v_recipient_id)';
begin
  select pg_get_functiondef(
    'public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text)'::regprocedure
  ) into v_definition;
  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'prepare_workflow_messages registered-task predicate was not found';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$$;

revoke all on function private.message_recipient_receives_registered(uuid) from public,anon,authenticated;
revoke all on function private._bamco_impl_chat_conversation_list() from public,anon,authenticated;
revoke all on function public.resubmit_change_request(bigint,jsonb) from public,anon;
revoke all on function public.request_routing_status() from public,anon;
revoke all on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) from public,anon;
grant execute on function private._bamco_impl_chat_conversation_list() to authenticated;
grant execute on function public.resubmit_change_request(bigint,jsonb) to authenticated;
grant execute on function public.request_routing_status() to authenticated;
grant execute on function public.prepare_workflow_messages(uuid[],jsonb,text,text,text,text) to authenticated;

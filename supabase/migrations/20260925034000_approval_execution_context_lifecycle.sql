-- Approval execution markers are transaction-local, so every function that
-- sets them must restore the caller's prior values before returning. Without
-- this scope, an approved project deletion can suppress materialization of a
-- later, unrelated project activity created in the same transaction.

create or replace function private.is_verified_revision_note_path(
  p_task_id bigint
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  with setting as (
    select case
      when coalesce(current_setting('bamco.request_id',true),'')~'^[0-9]+$'
      then current_setting('bamco.request_id',true)::bigint
      else null
    end request_id
  )
  select coalesce(exists(
    select 1
    from setting
    join public.change_requests request on request.id=setting.request_id
    join public.organization_workflows workflow
      on workflow.id=request.organization_workflow_id
    join public.organization_workflow_steps step
      on step.workflow_id=workflow.id
     and step.step_no=workflow.current_step
    where coalesce(current_setting('bamco.approval_apply',true),'')='1'
      and coalesce(current_setting('bamco.source_path',true),'')
          ='approval_revision_note'
      and request.task_id=p_task_id
      and request.request_status='needs_revision'
      and request.reviewed_by=auth.uid()
      and request.xmin::text::bigint=txid_current()
      and workflow.status='needs_revision'
      and step.decision='needs_revision'
      and (
        step.approver_id=auth.uid()
        or private.is_system_manager(auth.uid())
      )
  ),false);
$$;

revoke all on function private.is_verified_revision_note_path(bigint)
  from public,anon,authenticated;

create or replace function private.apply_change_request(
  p_request_id bigint,
  p_actor uuid,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.change_requests%rowtype;
  tid bigint;
  v_previous_request_id text:=coalesce(
    current_setting('bamco.request_id',true),'');
  v_previous_source_path text:=coalesce(
    current_setting('bamco.source_path',true),'');
  v_previous_approval_apply text:=coalesce(
    current_setting('bamco.approval_apply',true),'');
begin
  select * into r
  from public.change_requests
  where id=p_request_id
  for update;
  if not found then
    raise exception 'درخواست پیدا نشد.' using errcode='P0002';
  end if;

  perform set_config('bamco.request_id',r.id::text,true);
  perform set_config('bamco.source_path','approval_workflow',true);
  perform set_config('bamco.approval_apply','1',true);

  if r.request_type='create' then
    insert into public.tasks(
      title,description,owner_id,status,priority,start_date,due_date,done_date,
      reminder_days,manager_notes,created_by,change_reason
    ) values(
      p_payload->>'title',coalesce(p_payload->>'description',''),
      coalesce(nullif(p_payload->>'owner_id','')::uuid,r.requested_by),
      coalesce(p_payload->>'status','ثبت شده'),
      coalesce(p_payload->>'priority','متوسط'),
      nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'due_date','')::date,
      nullif(p_payload->>'done_date','')::date,
      coalesce(nullif(p_payload->>'reminder_days','')::integer,0),
      coalesce(p_payload->>'manager_notes',''),r.requested_by,
      'درخواست شماره '||r.id
    ) returning id into tid;
  else
    tid:=r.task_id;
    if r.request_type='delete' then
      lock table public.tasks in share row exclusive mode;
      delete from public.tasks where id=tid;
      perform private.resequence_task_display_ids();
    elsif r.request_type='complete' then
      update public.tasks
      set status='انجام شده',
          due_date=case
            when p_payload?'due_date'
            then nullif(p_payload->>'due_date','')::date
            else due_date
          end,
          done_date=coalesce(
            nullif(p_payload->>'done_date','')::date,current_date),
          archived=true,
          archived_at=now(),
          change_reason='درخواست شماره '||r.id
      where id=tid;
    else
      update public.tasks
      set title=coalesce(p_payload->>'title',title),
          description=coalesce(p_payload->>'description',description),
          status=coalesce(p_payload->>'status',status),
          priority=coalesce(p_payload->>'priority',priority),
          owner_id=case
            when p_payload?'owner_id'
            then nullif(p_payload->>'owner_id','')::uuid
            else owner_id
          end,
          done_date=case
            when p_payload?'done_date'
            then nullif(p_payload->>'done_date','')::date
            else done_date
          end,
          archived=case
            when p_payload?'archived'
            then (p_payload->>'archived')::boolean
            else archived
          end,
          archived_at=case
            when p_payload->>'archived'='true' then now()
            else archived_at
          end,
          start_date=case
            when p_payload?'start_date'
            then nullif(p_payload->>'start_date','')::date
            else start_date
          end,
          due_date=case
            when p_payload?'due_date'
            then nullif(p_payload->>'due_date','')::date
            else due_date
          end,
          reminder_days=case
            when p_payload?'reminder_days'
            then coalesce(nullif(p_payload->>'reminder_days','')::integer,0)
            else reminder_days
          end,
          manager_notes=coalesce(p_payload->>'manager_notes',manager_notes),
          change_reason='درخواست شماره '||r.id
      where id=tid;
    end if;
  end if;

  update public.change_requests
  set task_id=case
        when r.request_type='delete' then null
        else coalesce(task_id,tid)
      end,
      applied_task_id=case
        when r.request_type='delete' then null
        else tid
      end,
      request_status='approved',
      final_data=p_payload,
      completed_at=now(),
      reviewed_by=p_actor,
      reviewed_at=now()
  where id=r.id;
  insert into public.change_request_events(
    request_id,actor_id,event_type,note,snapshot
  ) values(
    r.id,p_actor,'applied','تغییر روی وظیفه اعمال شد',
    jsonb_build_object('task_id',tid)
  );

  perform set_config('bamco.request_id',v_previous_request_id,true);
  perform set_config('bamco.source_path',v_previous_source_path,true);
  perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
  return tid;
exception when others then
  perform set_config('bamco.request_id',v_previous_request_id,true);
  perform set_config('bamco.source_path',v_previous_source_path,true);
  perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
  raise;
end;
$$;

revoke all on function private.apply_change_request(bigint,uuid,jsonb)
  from public,anon,authenticated;

create or replace function public.review_request_stage(
  p_request_id bigint,
  p_decision text,
  p_note text default null,
  p_final_data jsonb default null
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.change_requests%rowtype;
  v_workflow public.organization_workflows%rowtype;
  v_step public.organization_workflow_steps%rowtype;
  v_next_step integer;
  v_payload jsonb;
  v_next_approver uuid;
  v_manager boolean:=private.is_system_manager(auth.uid());
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_manager_note text;
  v_previous_request_id text:=coalesce(
    current_setting('bamco.request_id',true),'');
  v_previous_source_path text:=coalesce(
    current_setting('bamco.source_path',true),'');
  v_previous_approval_apply text:=coalesce(
    current_setting('bamco.approval_apply',true),'');
begin
  if not private.feature_can_access_for(auth.uid(),'approvals','edit') then
    raise exception 'مجوز اقدام روی درخواست ندارید.' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected','needs_revision') then
    raise exception 'تصمیم نامعتبر است.' using errcode='22023';
  end if;

  select * into r
  from public.change_requests
  where id=p_request_id
    and request_status in ('pending','in_review','needs_revision')
  for update;
  if not found then
    raise exception 'درخواست باز پیدا نشد.' using errcode='P0002';
  end if;
  if r.organization_workflow_id is null then
    raise exception 'این درخواست در گردش سازمانی نیست.' using errcode='42501';
  end if;

  select * into v_workflow
  from public.organization_workflows
  where id=r.organization_workflow_id
  for update;
  select * into v_step
  from public.organization_workflow_steps
  where workflow_id=v_workflow.id
    and step_no=v_workflow.current_step
    and decision='pending'
    and (v_manager or approver_id=auth.uid())
  for update;
  if not found then
    raise exception 'این درخواست در کارتابل شما نیست.' using errcode='42501';
  end if;

  update public.organization_workflow_steps
  set decision=p_decision,note=p_note,decided_at=now()
  where id=v_step.id;
  insert into public.change_request_events(
    request_id,actor_id,event_type,note,snapshot
  ) values(
    r.id,auth.uid(),p_decision,p_note,
    jsonb_build_object(
      'workflow_id',v_workflow.id,'run_no',v_workflow.run_no,
      'step_no',v_workflow.current_step,
      'manager_override',v_manager
        and v_step.approver_id is distinct from auth.uid()
    )
  );

  if p_decision='rejected' then
    update public.organization_workflows
    set status='rejected',updated_at=now()
    where id=v_workflow.id;
    update public.change_requests
    set request_status='rejected',manager_note=p_note,
        reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now()
    where id=r.id;
    perform private.emit_relationship_event(
      r.requested_by,'approval_rejected','درخواست رد شد',
      coalesce(p_note,'درخواست شما رد شد.'),
      'change_request',r.id::text,
      jsonb_build_object('workflow_id',v_workflow.id)
    );
    return 'rejected';
  end if;

  if p_decision='needs_revision' then
    v_manager_note:=case
      when v_note is null then null
      else 'یادداشت مدیر: '||v_note
    end;
    update public.organization_workflows
    set status='needs_revision',updated_at=now()
    where id=v_workflow.id;
    update public.change_requests
    set request_status='needs_revision',manager_note=p_note,
        reviewed_by=auth.uid(),reviewed_at=now(),
        proposed_data=case
          when v_manager_note is null then proposed_data
          else jsonb_set(
            coalesce(proposed_data,'{}'::jsonb),'{manager_notes}',
            to_jsonb(concat_ws(
              E'\n\n',nullif(btrim(proposed_data->>'manager_notes'),''),
              v_manager_note
            )),true
          )
        end
    where id=r.id;

    -- An open CREATE request has no legitimate task yet. Historical malformed
    -- rows that carried a task_id must never use revision comments to mutate
    -- that pre-existing task.
    if r.request_type<>'create'
       and r.task_id is not null
       and v_manager_note is not null then
      perform set_config('bamco.request_id',r.id::text,true);
      perform set_config('bamco.approval_apply','1',true);
      perform set_config('bamco.source_path','approval_revision_note',true);
      begin
        update public.tasks
        set manager_notes=concat_ws(
          E'\n\n',nullif(btrim(manager_notes),''),v_manager_note
        )
        where id=r.task_id;
      exception when others then
        perform set_config(
          'bamco.request_id',v_previous_request_id,true);
        perform set_config(
          'bamco.source_path',v_previous_source_path,true);
        perform set_config(
          'bamco.approval_apply',v_previous_approval_apply,true);
        raise;
      end;
      perform set_config('bamco.request_id',v_previous_request_id,true);
      perform set_config('bamco.source_path',v_previous_source_path,true);
      perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
    end if;

    perform private.emit_relationship_event(
      r.requested_by,'approval_needs_revision',
      'درخواست برای اصلاح برگشت داده شد',
      coalesce(p_note,'لطفاً درخواست را اصلاح کنید.'),
      'change_request',r.id::text,
      jsonb_build_object('workflow_id',v_workflow.id)
    );
    return 'needs_revision';
  end if;

  select min(step_no) into v_next_step
  from public.organization_workflow_steps
  where workflow_id=v_workflow.id
    and step_no>v_workflow.current_step;
  if v_next_step is not null then
    update public.organization_workflows
    set current_step=v_next_step,updated_at=now()
    where id=v_workflow.id;
    update public.change_requests
    set current_stage=v_next_step
    where id=r.id;
    select approver_id into v_next_approver
    from public.organization_workflow_steps
    where workflow_id=v_workflow.id and step_no=v_next_step;
    perform private.emit_relationship_event(
      v_next_approver,'approval_assigned','درخواست جدید برای تأیید',
      'درخواست به مرحله بعدی گردش رسید.',
      'change_request',r.id::text,
      jsonb_build_object(
        'workflow_id',v_workflow.id,'step_no',v_next_step
      )
    );
    begin
      perform private.create_portal_event(
        v_next_approver,'درخواست جدید برای تأیید',
        'درخواست به مرحله بعدی گردش رسید.',
        'approval_request','change_request',r.id::text
      );
    exception when others then
      null;
    end;
    return 'next_stage';
  end if;

  v_payload:=coalesce(p_final_data,r.proposed_data);
  if v_payload?'owner_id'
     and nullif(v_payload->>'owner_id','')::uuid
         is distinct from r.requested_by then
    raise exception 'تأییدکننده نمی‌تواند متولی درخواست شخصی را به شخص دیگری تغییر دهد.'
      using errcode='42501';
  end if;
  begin
    perform private.apply_change_request(r.id,auth.uid(),v_payload);
  exception when others then
    perform set_config('bamco.request_id',v_previous_request_id,true);
    perform set_config('bamco.source_path',v_previous_source_path,true);
    perform set_config('bamco.approval_apply',v_previous_approval_apply,true);
    raise;
  end;
  perform set_config('bamco.request_id',v_previous_request_id,true);
  perform set_config('bamco.source_path',v_previous_source_path,true);
  perform set_config('bamco.approval_apply',v_previous_approval_apply,true);

  update public.organization_workflows
  set status='approved',updated_at=now()
  where id=v_workflow.id;
  perform private.emit_relationship_event(
    r.requested_by,'approval_approved','درخواست تأیید شد',
    'تغییر درخواست شما اعمال شد.',
    'change_request',r.id::text,
    jsonb_build_object('workflow_id',v_workflow.id)
  );
  return 'approved';
end;
$$;

revoke all on function public.review_request_stage(bigint,text,text,jsonb)
  from public,anon;
grant execute on function public.review_request_stage(bigint,text,text,jsonb)
  to authenticated;

-- Resequencing uses a transient NULL/negative display ID. Presentation copies
-- must never be rewritten from that intermediate value: portal/chat columns
-- are NOT NULL and snapshots should retain their previous visible number until
-- the task has a stable legacy_id again.
create or replace function private.sync_task_display_references()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.portal_messages message
  set body=regexp_replace(
    message.body,'^(وظیفه )[0-9]+',E'\\1'||task.legacy_id::text
  )
  from public.tasks task
  where message.entity_type='task'
    and message.entity_id=task.id::text
    and message.template_key in (
      'task_created','task_updated','task_transferred'
    )
    and task.legacy_id is not null
    and task.legacy_id>0
    and message.body ~ '^وظیفه [0-9]+'
    and message.body is distinct from regexp_replace(
      message.body,'^(وظیفه )[0-9]+',E'\\1'||task.legacy_id::text
    );

  update public.chat_messages chat_message
  set body=message.body
  from public.portal_messages message
  where chat_message.source_portal_message_id=message.id
    and message.entity_type='task'
    and message.body is not null
    and chat_message.body is distinct from message.body;

  update public.notifications notification
  set body=message.body
  from public.chat_messages chat_message
  join public.portal_messages message
    on message.id=chat_message.source_portal_message_id
  where notification.entity_type='chat_thread'
    and notification.entity_id=chat_message.thread_id::text
    and notification.created_at=chat_message.created_at
    and message.entity_type='task'
    and message.body is not null
    and notification.body is distinct from message.body;

  update public.chat_threads thread
  set title='وظیفه '||task.legacy_id::text||' — '
      ||left(coalesce(task.title,''),90)
  from public.tasks task
  where thread.task_id=task.id
    and thread.thread_type='direct'
    and thread.direct_key like 'task:%'
    and task.legacy_id is not null
    and task.legacy_id>0
    and thread.title ~ '^وظیفه [0-9]+ — '
    and thread.title is distinct from
        'وظیفه '||task.legacy_id::text||' — '
        ||left(coalesce(task.title,''),90);

  with rebuilt as (
    select snapshot.id,
           coalesce(jsonb_agg(
             case
               when task.id is null
                 or task.legacy_id is null
                 or task.legacy_id<=0 then entry.item
               else jsonb_set(
                 entry.item,'{legacy_id}',to_jsonb(task.legacy_id),true
               )
             end
             order by entry.ord
           ),'[]'::jsonb) tasks
    from public.message_snapshots snapshot
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(snapshot.tasks)='array' then snapshot.tasks
        else '[]'::jsonb
      end
    ) with ordinality as entry(item,ord)
    left join public.tasks task
      on task.id=case
        when entry.item->>'id'~'^[0-9]+$'
        then (entry.item->>'id')::bigint
      end
    where jsonb_typeof(snapshot.tasks)='array'
    group by snapshot.id
  )
  update public.message_snapshots snapshot
  set tasks=rebuilt.tasks
  from rebuilt
  where snapshot.id=rebuilt.id
    and snapshot.tasks is distinct from rebuilt.tasks;
end;
$$;

revoke all on function private.sync_task_display_references()
  from public,anon,authenticated;

-- A signed JWT can outlive physical account deletion. Catalog/directory reads
-- must therefore require a current active profile, not merely the JWT's
-- `authenticated` role. Active users retain the same catalog visibility.
create or replace function private.has_account()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.profiles profile
    where profile.id=(select auth.uid()) and profile.active
  );
$$;

revoke all on function private.has_account() from public,anon;
grant execute on function private.has_account() to authenticated;

drop policy if exists organization_roles_authenticated_read
  on public.organization_roles;
create policy organization_roles_authenticated_read
on public.organization_roles for select to authenticated
using((select private.has_account()));

drop policy if exists organization_units_authenticated_read
  on public.organization_units;
create policy organization_units_authenticated_read
on public.organization_units for select to authenticated
using((select private.has_account()));

drop policy if exists organization_position_acting_authenticated_read
  on public.organization_position_acting;
create policy organization_position_acting_authenticated_read
on public.organization_position_acting for select to authenticated
using((select private.has_account()));

drop policy if exists app_features_authenticated_read
  on public.app_features;
create policy app_features_authenticated_read
on public.app_features for select to authenticated
using(active and (select private.has_account()));

drop policy if exists avatar_read_directory on storage.objects;
create policy avatar_read_directory
on storage.objects for select to authenticated
using(
  bucket_id='avatars'
  and (select private.has_account())
  and private.is_directory_photo(name)
);

notify pgrst,'reload schema';

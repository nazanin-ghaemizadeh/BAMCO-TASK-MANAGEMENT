-- Keep every user-facing task number synchronized after every resequencing path.
-- Internal public.tasks.id remains the immutable relational key.

create or replace function private.resequence_task_display_ids_from(p_start bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_start bigint:=greatest(coalesce(p_start,1),1);
begin
  perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));
  perform set_config('bamco.resequencing','1',true);
  if not exists(select 1 from public.tasks where legacy_id>=v_start) then
    perform set_config('bamco.resequencing','',true);
    return;
  end if;

  update public.tasks set legacy_id=-legacy_id where legacy_id>=v_start;
  with ordered as (
    select id,row_number() over(order by -legacy_id,id)::bigint+v_start-1 as seq
    from public.tasks
    where legacy_id<0
  )
  update public.tasks t set legacy_id=ordered.seq
  from ordered where t.id=ordered.id;

  perform set_config('bamco.resequencing','',true);
  perform private.sync_task_display_references();
end;
$function$;

create or replace function private.resequence_archived_task_display_ids()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  mapping jsonb;
  previous_setting text;
begin
  if current_setting('bamco.resequencing',true)='1' then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('bamco-task-display-id-resequence',0));

  with ranked as (
    select id,legacy_id,row_number() over(order by done_date asc nulls first,id) as seq
    from public.tasks where archived
  ),slots as (
    select legacy_id,row_number() over(order by legacy_id,id) as seq
    from public.tasks where archived
  )
  select jsonb_agg(jsonb_build_object('id',r.id,'new_number',s.legacy_id)) into mapping
  from ranked r join slots s using(seq)
  where r.legacy_id is distinct from s.legacy_id;

  if mapping is null then return; end if;
  previous_setting:=current_setting('bamco.resequencing',true);
  perform set_config('bamco.resequencing','1',true);

  update public.tasks t
     set legacy_id=-t.legacy_id
    from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint)
   where t.id=m.id;
  update public.tasks t
     set legacy_id=m.new_number
    from jsonb_to_recordset(mapping) as m(id bigint,new_number bigint)
   where t.id=m.id;

  perform set_config('bamco.resequencing',coalesce(previous_setting,''),true);
  perform private.sync_task_display_references();
end;
$function$;

create or replace function private.create_portal_event(
  p_user uuid,p_title text,p_body text,p_type text,p_entity_type text,p_entity_id text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  mid bigint;
  v_sender uuid:=auth.uid();
  v_sender_name text;
begin
  if p_user is null or not exists(select 1 from public.profiles where id=p_user and active) then return; end if;
  select coalesce(nullif(display_name,''),nullif(full_name,''),email::text,'سامانه')
    into v_sender_name from public.profiles where id=v_sender;
  v_sender_name:=coalesce(v_sender_name,'سامانه');

  insert into public.portal_messages(
    sender_id,subject,body,importance,allow_reply,require_ack,template_key,sender_name_snapshot,entity_type,entity_id
  ) values(
    v_sender,left(coalesce(p_title,'پیام سامانه'),240),coalesce(p_body,''),'normal',false,false,
    coalesce(nullif(p_type,''),'system_event'),v_sender_name,nullif(p_entity_type,''),nullif(p_entity_id,'')
  ) returning id into mid;

  insert into public.portal_message_recipients(message_id,recipient_id)
  values(mid,p_user) on conflict do nothing;

  if p_entity_type='task' then
    -- The recipient trigger first creates the immutable system-chat link. Task
    -- lifecycle chats must show the readable task body, not the internal marker.
    update public.chat_messages
       set body=coalesce(p_body,'')
     where source_portal_message_id=mid
       and body like 'BAMCO_PORTAL_MESSAGE_V1:%';

    update public.portal_message_recipients
       set read_at=coalesce(read_at,now()),
           dismissed_at=coalesce(dismissed_at,now())
     where message_id=mid and recipient_id=p_user;
  end if;
end;
$function$;

-- Link legacy task lifecycle events only when their quoted title identifies one
-- and only one current task. Ambiguous history is deliberately left untouched.
with candidates as (
  select pm.id,min(t.id) as task_id
  from public.portal_messages pm
  join public.tasks t on t.title=substring(pm.body from '«([^»]+)»')
  where pm.entity_type is null
    and pm.template_key in ('task_created','task_updated','task_transferred')
    and pm.body ~ '^وظیفه [0-9]+ '
  group by pm.id
  having count(*)=1
)
update public.portal_messages pm
   set entity_type='task',entity_id=c.task_id::text
  from candidates c
 where pm.id=c.id;

select private.sync_task_display_references();

-- Once a legacy event has been linked, keep only the canonical notification in
-- «پیام‌های من» when the matching notification is proven to exist.
update public.portal_message_recipients r
   set read_at=coalesce(r.read_at,pm.created_at,now()),
       dismissed_at=coalesce(r.dismissed_at,pm.created_at,now())
  from public.portal_messages pm
 where pm.id=r.message_id
   and pm.entity_type='task'
   and pm.template_key in ('task_created','task_updated','task_transferred','task_deleted')
   and r.dismissed_at is null
   and exists(
     select 1
       from public.chat_messages cm
       join public.notifications n
         on n.entity_type='chat_thread'
        and n.entity_id=cm.thread_id::text
        and n.created_at=cm.created_at
        and n.user_id=r.recipient_id
        and n.dismissed_at is null
      where cm.source_portal_message_id=pm.id
   );

notify pgrst,'reload schema';

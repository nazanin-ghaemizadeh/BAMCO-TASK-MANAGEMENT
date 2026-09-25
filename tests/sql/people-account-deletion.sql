-- The inner subtransaction rolls every fixture back, including Auth users.
do $test$
declare mid uuid;uid uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();tid bigint;aid bigint;gid uuid;did uuid;pmid bigint;bid uuid;cid bigint;reqid bigint;r record;n bigint;outcome jsonb;denied boolean;before_tasks jsonb;after_tasks jsonb;
begin
 begin
  select id into mid from public.profiles where role='manager' and active order by id limit 1;
  if mid is null then raise exception 'A manager is required';end if;
  perform set_config('request.jwt.claim.sub',mid::text,true);
  -- Fixture construction exercises historical/service-owned references and
  -- therefore runs with the same trusted role as the deletion RPC itself.
  perform set_config('request.jwt.claim.role','service_role',true);
  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values(uid,'authenticated','authenticated','people-qa-'||uid::text||'@example.invalid','{"provider":"email","providers":["email"]}',jsonb_build_object('full_name','__PEOPLE_DELETE_QA__'),now(),now());
  update public.profiles set active=true,messaging_enabled=true where id=uid;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,uid,now(),now());
  insert into public.user_sessions(user_id,last_activity_at) values(uid,now());
  insert into public.tasks(title,description,owner_id,status,priority,start_date,due_date,created_by)
  values('__PEOPLE_DELETE_QA_ACTIVE__','preserve description',uid,'در حال انجام','متوسط',current_date,current_date+5,uid) returning id into tid;
  insert into public.tasks(title,owner_id,status,priority,start_date,due_date,done_date,archived,created_by)
  values('__PEOPLE_DELETE_QA_ARCHIVED__',uid,'انجام شده','متوسط',current_date-5,current_date,current_date,true,uid) returning id into aid;
  select jsonb_agg(jsonb_build_array(id,title,description,status,start_date,due_date,done_date,archived) order by id) into before_tasks from public.tasks where id in (tid,aid);
  insert into public.portal_messages(sender_id,subject,body) values(uid,'__PEOPLE_QA__','__PEOPLE_QA__') returning id into pmid;
  insert into public.portal_message_recipients(message_id,recipient_id) values(pmid,uid);
  insert into public.chat_threads(thread_type,title,created_by) values('group','__PEOPLE_QA__',uid) returning id into gid;
  insert into public.chat_members(thread_id,user_id,member_role) values(gid,uid,'owner'),(gid,mid,'member');
  insert into public.chat_messages(thread_id,sender_id,body) values(gid,uid,'__PEOPLE_QA__');
  insert into public.chat_threads(thread_type,title,created_by) values('direct','__PEOPLE_DIRECT_QA__',uid) returning id into did;
  insert into public.chat_members(thread_id,user_id,member_role) values(did,uid,'member'),(did,mid,'member');
  insert into public.chat_messages(thread_id,sender_id,body) values(did,uid,'__DIRECT_HISTORY_QA__');
  insert into storage.objects(bucket_id,name,owner,owner_id) values('avatars',uid::text||'/qa.png',uid,uid::text);
  insert into public.change_requests(requested_by,request_type,request_status,proposed_data) values(uid,'create','pending',jsonb_build_object('title','__PEOPLE_QA__','owner_id',uid)) returning id into reqid;
  bid:=public.prepare_workflow_messages(array[uid],jsonb_build_object(uid::text,'portal'),'__PEOPLE_QA__','__PEOPLE_QA__');
  update public.message_batches set created_by=uid where id=bid;
  update public.message_deliveries set status='queued' where batch_id=bid;
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  denied:=false;begin perform public.delete_person_account(uid,mid);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Browser role can call privileged account deletion';end if;
  denied:=false;begin update public.tasks set owner_id=null,owner_deleted_at=now(),former_owner_name='forged' where id=tid;exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Manual owner-removal marker was accepted';end if;
  execute 'reset role';execute 'set local role service_role';
  perform set_config('request.jwt.claim.role','service_role',true);
  denied:=false;begin perform public.delete_person_account(mid,mid);exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Self deletion accepted';end if;
  denied:=false;begin perform public.delete_person_account(mid,uid);exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Nonmanager actor accepted';end if;
  outcome:=public.delete_person_account(uid,mid);
  if jsonb_array_length(outcome->'active_tasks')<>1 or (outcome->'active_tasks'->0->>'id')::bigint<>tid then raise exception 'Deletion did not return exactly the active task';end if;
  if (outcome->>'tasks_retained')::int<>2 then raise exception 'Retained task count incorrect';end if;
  execute 'reset role';
  if exists(select 1 from auth.users where id=uid) or exists(select 1 from auth.sessions where user_id=uid) or exists(select 1 from public.profiles where id=uid) or exists(select 1 from public.user_sessions where user_id=uid) or exists(select 1 from public.chat_members where user_id=uid) then raise exception 'Account/session/membership survived deletion';end if;
  select jsonb_agg(jsonb_build_array(id,title,description,status,start_date,due_date,done_date,archived) order by id) into after_tasks from public.tasks where id in (tid,aid);
  if before_tasks is distinct from after_tasks then raise exception 'Task content, dates, status or archive changed';end if;
  if (select count(*) from public.tasks where id in(tid,aid) and owner_id is null and former_owner_name='__PEOPLE_DELETE_QA__' and owner_deleted_at is not null)<>2 then raise exception 'Task deletion annotations missing';end if;
  if not exists(select 1 from public.change_requests where id=reqid and request_status='pending' and requested_by is null and requester_name_snapshot='__PEOPLE_DELETE_QA__') then raise exception 'Open request was decided automatically or history was lost';end if;
  if exists(select 1 from public.message_deliveries where batch_id=bid and (recipient_id is not null or status<>'cancelled')) then raise exception 'Queued recipient delivery not cancelled';end if;
  if not exists(select 1 from public.chat_messages where thread_id=gid and sender_id is null and sender_name_snapshot='__PEOPLE_DELETE_QA__') then raise exception 'Conversation history lost';end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  -- Simulates the old signed access-token subject after physical Auth deletion.
  for r in select c.oid::regclass tab from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='r' and c.relrowsecurity loop
   begin execute format('select count(*) from %s',r.tab) into n;exception when insufficient_privilege then n:=0;end;if n<>0 then raise exception 'Deleted identity can still read %',r.tab;end if;
  end loop;
  select count(*) into n from storage.objects;if n<>0 then raise exception 'Deleted identity can read Storage';end if;
  denied:=false;begin perform public.chat_send_message(gid,'__DENIED__',null);exception when raise_exception or insufficient_privilege then denied:=true;end;if not denied then raise exception 'Deleted identity sent chat';end if;
  denied:=false;begin insert into storage.objects(bucket_id,name) values('avatars',uid::text||'/unauthorized.png');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Deleted identity uploaded avatar';end if;
  execute 'reset role';perform set_config('request.jwt.claim.sub',mid::text,true);execute 'set local role authenticated';
  if not exists(select 1 from public.chat_threads where id=did and is_active=false and deleted_participant_name='__PEOPLE_DELETE_QA__') or not exists(select 1 from public.chat_messages where thread_id=did and body='__DIRECT_HISTORY_QA__' and sender_name_snapshot='__PEOPLE_DELETE_QA__') then raise exception 'Surviving member cannot read archived direct conversation';end if;
  update public.tasks set owner_id=mid where id=tid;
  if not exists(select 1 from public.tasks where id=tid and owner_id=mid and owner_deleted_at is null and former_owner_name is null) or not exists(select 1 from public.tasks where id=aid and owner_id is null and owner_deleted_at is not null) then raise exception 'Individual transfer changed another task or retained obsolete marker';end if;
  execute 'reset role';execute 'set local role service_role';
  perform set_config('request.jwt.claim.role','service_role',true);
  outcome:=public.delete_person_account(uid,mid);if outcome->>'already_deleted'<>'true' then raise exception 'Retry is not idempotent';end if;
  execute 'reset role';
  raise exception 'rollback fixtures' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
end $test$;

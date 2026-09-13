-- Shared correspondence. Writes go through the authenticated Edge Function.
create table public.letters (
 id uuid primary key default gen_random_uuid(), letter_number text not null unique,
 letter_date text not null check(letter_date ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}$'),
 recipient text not null, subject text not null,
 source_file_name text, storage_path text unique, file_name text, mime_type text, file_size bigint,
 version integer not null default 1, created_by uuid references public.profiles(id),
 updated_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(length(trim(letter_number)) between 1 and 120), check(length(trim(subject)) between 1 and 1000),check(length(trim(recipient)) between 1 and 300)
);
alter table public.letters enable row level security;
revoke all on public.letters from anon,authenticated;
grant select on public.letters to authenticated;
grant all on public.letters to service_role;
create policy letters_active_read on public.letters for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and active));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('letters-private','letters-private',false,26214400,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg']) on conflict(id) do nothing;

-- Subscription endpoints, keys and delivery state are never exposed to clients.
create table private.web_push_config(singleton boolean primary key default true check(singleton),public_key text,private_key text,worker_key text not null default encode(extensions.gen_random_bytes(32),'hex'));
insert into private.web_push_config(singleton) values(true);
create table private.web_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,endpoint text not null unique,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table private.web_push_jobs(id bigint generated always as identity primary key,notification_id bigint not null references public.notifications(id) on delete cascade,subscription_id uuid not null references private.web_push_subscriptions(id) on delete cascade,status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),locked_at timestamptz,last_error text,accepted_at timestamptz,unique(notification_id,subscription_id));
create index web_push_jobs_due on private.web_push_jobs(next_attempt_at) where status in ('pending','sending');
alter table private.web_push_config enable row level security;
alter table private.web_push_subscriptions enable row level security;
alter table private.web_push_jobs enable row level security;
revoke all on private.web_push_config,private.web_push_subscriptions,private.web_push_jobs from public,anon,authenticated;

create function public.push_service(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; actor uuid; begin
 if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'Service only';end if;
 if p_action='config' then select to_jsonb(c) into result from private.web_push_config c;return result;
 elsif p_action='keys' then update private.web_push_config set public_key=p_data->>'publicKey',private_key=p_data->>'privateKey' where public_key is null;select to_jsonb(c) into result from private.web_push_config c;return result;
 elsif p_action='subscribe' then
 actor:=(p_data->>'user_id')::uuid;if not exists(select 1 from public.profiles where id=actor and active) then raise exception 'Inactive user';end if;
 delete from private.web_push_jobs where subscription_id in (select id from private.web_push_subscriptions where endpoint=p_data->'subscription'->>'endpoint' and user_id<>actor);
 insert into private.web_push_subscriptions(user_id,endpoint,subscription) values(actor,p_data->'subscription'->>'endpoint',p_data->'subscription') on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription,updated_at=now();return '{}'::jsonb;
 elsif p_action='unsubscribe' then delete from private.web_push_subscriptions where user_id=(p_data->>'user_id')::uuid and endpoint=p_data->>'endpoint';return '{}'::jsonb;
 elsif p_action='claim' then
 with picked as(select j.id from private.web_push_jobs j join private.web_push_subscriptions s on s.id=j.subscription_id join public.profiles p on p.id=s.user_id and p.active where j.attempts<5 and j.next_attempt_at<=now() and (j.status='pending' or (j.status='sending' and j.locked_at<now()-interval '5 minutes')) order by j.id for update of j skip locked limit 30), taken as(update private.web_push_jobs j set status='sending',locked_at=now(),attempts=attempts+1 from picked where j.id=picked.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'subscription_id',s.id,'subscription',s.subscription,'notification_id',n.id,'title',n.title,'body',n.body)), '[]') into result from taken t join private.web_push_subscriptions s on s.id=t.subscription_id join public.notifications n on n.id=t.notification_id;return result;
 elsif p_action='finish' then
 if coalesce((p_data->>'expired')::boolean,false) then delete from private.web_push_subscriptions where id=(p_data->>'subscription_id')::uuid;
 else update private.web_push_jobs set status=case when (p_data->>'ok')::boolean then 'accepted' when attempts>=5 then 'failed' else 'pending' end,accepted_at=case when (p_data->>'ok')::boolean then now() end,last_error=left(p_data->>'error',300),next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::int)),locked_at=null where id=(p_data->>'id')::bigint;end if;return '{}'::jsonb;
 end if;raise exception 'Unknown action';end $$;
revoke all on function public.push_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.push_service(text,jsonb) to service_role;

create function private.dispatch_web_push() returns void language plpgsql security definer set search_path='' as $$
declare key text; begin
 select worker_key into key from private.web_push_config;
 if exists(select 1 from private.web_push_jobs where status in ('pending','sending') and next_attempt_at<=now()) then
 perform net.http_post(url:='https://zhhongjhhbvpmoquvkhl.supabase.co/functions/v1/web-push',headers:=jsonb_build_object('Content-Type','application/json','x-push-worker-key',key),body:='{"action":"deliver"}'::jsonb,timeout_milliseconds:=10000);
 end if;end $$;
revoke all on function private.dispatch_web_push() from public,anon,authenticated;
create function private.queue_web_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.web_push_jobs(notification_id,subscription_id) select new.id,s.id from private.web_push_subscriptions s where s.user_id=new.user_id on conflict do nothing;
 begin perform private.dispatch_web_push();exception when others then null;end;
 return new;end $$;
revoke all on function private.queue_web_push() from public,anon,authenticated;
create trigger notification_web_push after insert on public.notifications for each row execute function private.queue_web_push();
notify pgrst,'reload schema';

create extension if not exists pg_cron;
select cron.schedule('bamco-web-push-retry','* * * * *','select private.dispatch_web_push()');

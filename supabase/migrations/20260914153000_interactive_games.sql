create table if not exists public.game_matches (
  id uuid primary key default gen_random_uuid(),
  game_type text not null check (game_type in ('chess','backgammon')),
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','active','finished','cancelled')),
  current_player_id uuid references public.profiles(id),
  state jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  winner_id uuid references public.profiles(id),
  result_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint game_players_different check (host_id <> guest_id),
  constraint game_current_is_player check (current_player_id is null or current_player_id in (host_id,guest_id)),
  constraint game_winner_is_player check (winner_id is null or winner_id in (host_id,guest_id)),
  constraint game_state_size check (octet_length(state::text) <= 65536)
);

create index if not exists game_matches_host_recent on public.game_matches(host_id,updated_at desc);
create index if not exists game_matches_guest_recent on public.game_matches(guest_id,updated_at desc);
alter table public.game_matches enable row level security;
revoke all on public.game_matches from anon, authenticated;
grant select on public.game_matches to authenticated;
drop policy if exists game_participants_read on public.game_matches;
create policy game_participants_read on public.game_matches for select to authenticated
using ((select auth.uid()) in (host_id,guest_id));

create or replace function public.game_directory()
returns table(id uuid, name text)
language sql security definer set search_path=''
as $$
  select p.id, coalesce(nullif(p.display_name,''),nullif(p.full_name,''),p.email)
  from public.profiles p
  where p.active is true and p.id <> auth.uid()
  order by 2;
$$;

create or replace function public.game_create(p_game_type text,p_guest_id uuid,p_state jsonb)
returns public.game_matches
language plpgsql security definer set search_path=''
as $$
declare r public.game_matches;
begin
  if auth.uid() is null or p_guest_id=auth.uid() or p_game_type not in ('chess','backgammon') then raise exception 'درخواست ساخت میز معتبر نیست.'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and active is true) or
     not exists(select 1 from public.profiles where id=p_guest_id and active is true) then raise exception 'کاربر انتخاب‌شده فعال نیست.'; end if;
  insert into public.game_matches(game_type,host_id,guest_id,current_player_id,state)
  values(p_game_type,auth.uid(),p_guest_id,auth.uid(),coalesce(p_state,'{}'::jsonb)) returning * into r;
  return r;
end$$;

create or replace function public.game_accept(p_match_id uuid)
returns public.game_matches language plpgsql security definer set search_path=''
as $$declare r public.game_matches; begin
  update public.game_matches set status='active',updated_at=now(),version=version+1
  where id=p_match_id and guest_id=auth.uid() and status='waiting' returning * into r;
  if r.id is null then raise exception 'دعوت معتبر یا در انتظار نیست.'; end if; return r;
end$$;

create or replace function public.game_submit(p_match_id uuid,p_expected_version bigint,p_state jsonb,p_next_player uuid,p_finished boolean default false,p_winner uuid default null,p_reason text default null)
returns public.game_matches language plpgsql security definer set search_path=''
as $$declare r public.game_matches; begin
  update public.game_matches set state=p_state,current_player_id=case when p_finished then null else p_next_player end,
    status=case when p_finished then 'finished' else 'active' end,winner_id=case when p_finished then p_winner else null end,
    result_reason=case when p_finished then left(p_reason,100) else null end,finished_at=case when p_finished then now() else null end,
    updated_at=now(),version=version+1
  where id=p_match_id and version=p_expected_version and status='active' and current_player_id=auth.uid()
    and auth.uid() in (host_id,guest_id) and (p_next_player in (host_id,guest_id) or p_finished)
    and (p_winner is null or p_winner in (host_id,guest_id)) and octet_length(p_state::text)<=65536 returning * into r;
  if r.id is null then raise exception 'میز به‌روزرسانی شده یا نوبت شما نیست؛ صفحه تازه شد.'; end if; return r;
end$$;

create or replace function public.game_resign(p_match_id uuid)
returns public.game_matches language plpgsql security definer set search_path=''
as $$declare r public.game_matches; begin
  update public.game_matches set status=case when status='waiting' then 'cancelled' else 'finished' end,
    winner_id=case when status='active' then case when auth.uid()=host_id then guest_id else host_id end else null end,
    result_reason=case when status='active' then 'resign' else 'cancelled' end,current_player_id=null,finished_at=now(),updated_at=now(),version=version+1
  where id=p_match_id and status in ('waiting','active') and auth.uid() in (host_id,guest_id) returning * into r;
  if r.id is null then raise exception 'این میز دیگر فعال نیست.'; end if; return r;
end$$;

revoke all on function public.game_directory(),public.game_create(text,uuid,jsonb),public.game_accept(uuid),public.game_submit(uuid,bigint,jsonb,uuid,boolean,uuid,text),public.game_resign(uuid) from public,anon;
grant execute on function public.game_directory(),public.game_create(text,uuid,jsonb),public.game_accept(uuid),public.game_submit(uuid,bigint,jsonb,uuid,boolean,uuid,text),public.game_resign(uuid) to authenticated;

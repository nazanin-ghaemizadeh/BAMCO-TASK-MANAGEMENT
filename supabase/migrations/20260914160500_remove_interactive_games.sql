drop function if exists public.game_submit(uuid,bigint,jsonb,uuid,boolean,uuid,text);
drop function if exists public.game_resign(uuid);
drop function if exists public.game_accept(uuid);
drop function if exists public.game_create(text,uuid,jsonb);
drop function if exists public.game_directory();
drop table if exists public.game_matches;

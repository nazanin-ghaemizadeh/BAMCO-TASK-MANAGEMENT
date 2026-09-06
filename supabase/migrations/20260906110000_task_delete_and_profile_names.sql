-- Keep a reversible snapshot before completing missing display names.
create table if not exists private.profile_migration_backups (
  migration_name text primary key,
  captured_at timestamptz not null default now(),
  profiles jsonb not null
);

revoke all on table private.profile_migration_backups from public, anon, authenticated;

insert into private.profile_migration_backups (migration_name, profiles)
select '20260906110000_task_delete_and_profile_names', jsonb_agg(to_jsonb(p) order by p.email)
from public.profiles p
on conflict (migration_name) do nothing;

alter table public.profiles disable trigger profiles_guard_update;

update public.profiles p
set full_name = v.full_name,
    excel_name = coalesce(nullif(btrim(p.excel_name), ''), v.full_name),
    updated_at = now()
from (values
  ('ghaemizadeh@bamco.ir', 'نازنین قائمی'),
  ('a.zare@bamcofactory.ir', 'امیرحسین زارع جرجندی'),
  ('r.ahmadi@bamcofactory.ir', 'رضا احمدی'),
  ('p.moshki@bamcofactory.ir', 'پریسا مشکی'),
  ('rasti@bamco.ir', 'سوگند راستی'),
  ('k.shahabadi@bamco.ir', 'کامیاب شاه آبادی'),
  ('tanhaiyan@bamco.ir', 'شهاب الدین تنهائیان'),
  ('d.hosseinnezhad@bamcofactory.ir', 'دانیال حسین نژاد'),
  ('chehreh@bamco.ir', 'مصطفی چهره')
) as v(email, full_name)
where lower(p.email) = v.email
  and (nullif(btrim(p.full_name), '') is null or nullif(btrim(p.excel_name), '') is null);

alter table public.profiles enable trigger profiles_guard_update;

create or replace function public.delete_task_and_resequence(p_task_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start bigint;
  v_row record;
begin
  if not (select private.is_manager()) then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select coalesce(min(coalesce(legacy_id, id)), 1)
    into v_start
  from public.tasks;

  delete from public.tasks where id = p_task_id;
  if not found then
    raise exception 'تسک پیدا نشد';
  end if;

  -- Use temporary negative values so the unique legacy_id constraint never
  -- collides while gaps are closed.
  for v_row in
    select id, row_number() over (order by coalesce(legacy_id, id), id) as seq
    from public.tasks
  loop
    update public.tasks set legacy_id = -v_row.seq where id = v_row.id;
  end loop;

  for v_row in
    select id, -legacy_id as seq
    from public.tasks
    order by -legacy_id
  loop
    update public.tasks set legacy_id = v_start + v_row.seq - 1 where id = v_row.id;
  end loop;
end;
$$;

revoke all on function public.delete_task_and_resequence(bigint) from public, anon;
grant execute on function public.delete_task_and_resequence(bigint) to authenticated;

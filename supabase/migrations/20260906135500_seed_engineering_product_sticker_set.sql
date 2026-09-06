insert into public.sticker_sets (name, active, system_set, created_by)
values ('واحد مهندسی محصول', true, true, null)
on conflict (name) do update
set system_set = true,
    active = true;

update public.sticker_sets
set active = false
where name <> 'واحد مهندسی محصول'
  and active is true;

create unique index if not exists sticker_sets_one_active_idx
on public.sticker_sets ((active))
where active is true;

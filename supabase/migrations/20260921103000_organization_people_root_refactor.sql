-- Keep organizational person, position and role semantics canonical.
-- A profile's primary_position_id is derived from its active primary assignment;
-- it is never a second manually-maintained organization source.

insert into public.organization_roles(role_key,title,level_no) values
  ('expert','کارشناس',10),
  ('supervisor','سرپرست',20),
  ('head','رئیس',30),
  ('manager','مدیر',40),
  ('deputy','معاون',50),
  ('office_manager','مسئول دفتر',60)
on conflict(role_key) do update
  set title=excluded.title,level_no=excluded.level_no,active=true;

create or replace function private.organization_position_parent_is_acyclic()
returns trigger
language plpgsql
set search_path=''
as $$
declare found_cycle boolean;
begin
  if new.parent_position_id is null then return new; end if;
  if new.parent_position_id=new.id then
    raise exception 'یک جایگاه نمی‌تواند بالادست خودش باشد' using errcode='23514';
  end if;

  with recursive lineage(id,parent_position_id,path) as (
    select p.id,p.parent_position_id,array[p.id]
    from public.organization_positions p
    where p.id=new.parent_position_id
    union all
    select parent.id,parent.parent_position_id,lineage.path||parent.id
    from public.organization_positions parent
    join lineage on lineage.parent_position_id=parent.id
    where not parent.id=any(lineage.path)
  )
  select exists(select 1 from lineage where id=new.id) into found_cycle;
  if found_cycle then
    raise exception 'چرخه در ساختار سازمانی مجاز نیست' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.organization_position_parent_is_acyclic() from public;

drop trigger if exists organization_positions_acyclic on public.organization_positions;
create trigger organization_positions_acyclic
before insert or update of parent_position_id on public.organization_positions
for each row execute function private.organization_position_parent_is_acyclic();

create unique index if not exists organization_one_active_primary_position_per_user_idx
  on public.organization_position_assignments(user_id)
  where is_primary and valid_to is null;

create or replace function private.sync_profile_primary_position()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare candidate uuid;
begin
  for candidate in
    select distinct user_id
    from (values
      (case when tg_op in ('INSERT','UPDATE') then new.user_id else null end),
      (case when tg_op in ('DELETE','UPDATE') then old.user_id else null end)
    ) as affected(user_id)
    where user_id is not null
  loop
    update public.profiles profile
    set primary_position_id=(
      select assignment.position_id
      from public.organization_position_assignments assignment
      where assignment.user_id=candidate
        and assignment.is_primary
        and assignment.valid_to is null
      order by assignment.created_at desc,assignment.id desc
      limit 1
    )
    where profile.id=candidate;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.sync_profile_primary_position() from public;

drop trigger if exists organization_assignment_profile_primary_position on public.organization_position_assignments;
create trigger organization_assignment_profile_primary_position
after insert or update or delete on public.organization_position_assignments
for each row execute function private.sync_profile_primary_position();

update public.profiles profile
set primary_position_id=(
  select assignment.position_id
  from public.organization_position_assignments assignment
  where assignment.user_id=profile.id
    and assignment.is_primary
    and assignment.valid_to is null
  order by assignment.created_at desc,assignment.id desc
  limit 1
);

-- Organizational role, not subordinate count or a bypass checkbox, controls intake creation.
create or replace function private.can_create_registered_task(p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and p.active)
 and (
   private.is_system_manager(p_actor)
   or exists(
     select 1 from private.organization_active_primary_positions(p_actor) a
     join public.organization_positions p on p.id=a.position_id and p.active
     join public.organization_roles r on r.id=p.role_id and r.active
     where r.role_key in ('manager','head','deputy')
   )
   or exists(
     select 1 from public.organization_position_acting a
     join public.organization_positions p on p.id=a.position_id and p.active
     join public.organization_roles r on r.id=p.role_id and r.active
     where a.acting_user_id=p_actor and a.valid_from<=current_date and a.valid_to>=current_date
       and r.role_key in ('manager','head','deputy')
   )
 );
$$;
revoke all on function private.can_create_registered_task(uuid) from public,anon,authenticated;

create or replace function public.organization_can_assign_task(p_target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and private.feature_can_access_for(auth.uid(),'kanban','create')
 and (
   (p_target_user is null and private.can_create_registered_task(auth.uid()))
   or (p_target_user is not null and private.organization_actor_can_direct_manage_user(auth.uid(),p_target_user))
 );
$$;

-- Applies to both direct task creation and new approval requests. Previously
-- submitted requests remain reviewable; their eventual writer is the approver.
create or replace function private.guard_registered_task_creation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_status text; v_actor uuid;
begin
 if tg_table_name='change_requests' then
   if new.request_type<>'create' then return new; end if;
   v_status:=coalesce(new.proposed_data->>'status','ثبت شده');
   v_actor:=new.requested_by;
 else
   v_status:=new.status;
   v_actor:=auth.uid();
   if v_actor is null or auth.role()='service_role' then return new; end if;
 end if;
 if (private.task_status_option(v_status)).kind='registered'
    and not private.can_create_registered_task(v_actor) then
   raise exception 'ایجاد تسک در وضعیت ثبت‌شده فقط برای مدیر، رئیس و معاون مجاز است.' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_registered_task_creation() from public,anon,authenticated;
create trigger registered_task_creation_role_guard before insert on public.tasks
for each row execute function private.guard_registered_task_creation();
create trigger registered_request_creation_role_guard before insert on public.change_requests
for each row execute function private.guard_registered_task_creation();

alter policy tasks_direct_insert on public.tasks with check (
 public.can_access_feature('kanban','create')
 and created_by=(select auth.uid())
 and public.organization_can_assign_task(owner_id)
);

-- Newly created intake has no owner; keep it visible to its own creator.
create policy tasks_registered_creator_read on public.tasks for select to authenticated
using (
 not archived and owner_id is null and created_by=(select auth.uid())
 and public.can_access_feature('kanban','view')
 and public.organization_can_assign_task(null)
);

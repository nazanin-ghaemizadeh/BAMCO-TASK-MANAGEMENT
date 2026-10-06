-- Run against a configured organization; all deletions and event changes roll back.
begin;
set local statement_timeout='25s';
do $qa$
declare x record; tid bigint; n integer; candidate bigint; denied boolean; tested integer:=0;
begin
 for x in select distinct p.id,r.role_key from public.profiles p
 join public.organization_position_assignments a on a.user_id=p.id and a.is_primary
 join public.organization_positions pos on pos.id=a.position_id and pos.active
 join public.organization_roles r on r.id=pos.role_id
 where p.active and a.valid_from<=current_date and (a.valid_to is null or a.valid_to>current_date)
 and r.role_key in ('manager','head') loop
 perform set_config('request.jwt.claim.sub',x.id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 select t.id into tid from public.tasks t where public.organization_can_manage_task(t.id)
 and not exists(select 1 from public.project_items i where i.task_id=t.id)
 order by t.legacy_id limit 1;
 if tid is null then raise exception 'No authorized fixture for %',x.role_key; end if;
 begin
 n:=public.delete_tasks_and_resequence(array[tid]);
 if n<>1 or exists(select 1 from public.tasks where id=tid) then raise exception 'Delete failed'; end if;
 if exists(select 1 from private.task_delete_resequence_context) then raise exception 'Maintenance context leaked'; end if;
 if (select count(*)<>max(legacy_id) or min(legacy_id)<>1 from public.tasks) then raise exception 'IDs not contiguous'; end if;
 raise exception '__SUCCESS_ROLLBACK__';
 exception when raise_exception then if sqlerrm<>'__SUCCESS_ROLLBACK__' then raise; end if;
 end;
 tested:=tested+1;
 select t.id into candidate from public.tasks t where not public.organization_can_manage_task(t.id)
 and private.kanban_supervisor_can_access_task(x.id,t) limit 1;
 if candidate is not null then
 denied:=false;
 begin
 perform set_config('bamco.resequencing','1',true);
 update public.tasks set legacy_id=legacy_id where id=candidate;
 exception when insufficient_privilege then denied:=true;
 end;
 perform set_config('bamco.resequencing','',true);
 if not denied then raise exception 'Forged supervision maintenance allowed'; end if;
 end if;
 end loop;
 if tested<>2 then raise exception 'Expected manager and head tests, got %',tested; end if;
end $qa$;
rollback;
select 'PASS: manager/head delete, ID continuity and forged maintenance denial; rolled back' result;

begin;
set local statement_timeout='45s';
do $qa$
declare actor record; tid bigint; rid bigint; tested integer:=0;
begin
for actor in
 select distinct p.id from public.profiles p where p.active and
 exists(select 1 from public.tasks t where t.created_by=p.id and t.owner_id is null and (private.task_status_option(t.status)).kind='registered')
 and private.organization_actor_can_direct_manage_user(p.id,p.id)
loop
 perform set_config('request.jwt.claim.sub',actor.id::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 select id into tid from public.tasks where owner_id is null and created_by=actor.id and (private.task_status_option(status)).kind='registered' limit 1;
 begin
 rid:=public.submit_change_request('delete',tid,'{}',null);
 if exists(select 1 from public.tasks where id=tid) or not exists(select 1 from public.change_requests where id=rid and request_status='approved') then raise exception 'Delete not applied';end if;
 if exists(select 1 from private.task_delete_resequence_context) then raise exception 'Context leaked';end if;
 if (select count(*)<>max(legacy_id) or min(legacy_id)<>1 from public.tasks) then raise exception 'IDs not contiguous';end if;
 raise exception '__SUCCESS_ROLLBACK__';
 exception when raise_exception then if sqlerrm<>'__SUCCESS_ROLLBACK__' then raise;end if;
 end;
 tested:=tested+1;
end loop;
if tested=0 then raise exception 'No registered manager fixture';end if;
end $qa$;
rollback;
select 'PASS: immediate approved registered deletion, context cleanup and contiguous IDs; rolled back' result;

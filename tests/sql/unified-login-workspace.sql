do $test$
declare manager uuid;person uuid;expected text;resolved jsonb;begin
 select id into strict manager from public.profiles where role='manager' and active limit 1;
 select m.user_id,u.schema_name into person,expected from private.org_members m join private.org_units u on u.id=m.unit_id where u.active order by m.schema_name limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated')::text,true);set local role authenticated;
 resolved:=public.resolve_my_workspace();
 if resolved->>'key'<>'product' or not (resolved->>'is_system_manager')::boolean then raise exception 'Manager routing failed';end if;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',person,'role','authenticated')::text,true);set local role authenticated;
 resolved:=public.resolve_my_workspace();
 if resolved->>'schema_name'<>expected then raise exception 'Member routing failed: % <> %',resolved->>'schema_name',expected;end if;
 reset role;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);set local role authenticated;
 begin perform public.resolve_my_workspace();raise exception 'Unknown account routed';exception when insufficient_privilege then null;end;
end$test$;
select 'Unified login workspace resolution passed' result;

-- RESTRICTIVE policies are ANDed across every workspace on storage.objects.
-- A workspace's guard must therefore pass unrelated buckets, while retaining
-- the original guard and membership checks for its own files.
do $migration$
declare r record; workspace_key text; target text; definition text; old_fragment text; new_fragment text; clause text;
begin
 foreach workspace_key in array array['process','quality'] loop
  target := 'bamco_' || workspace_key;
  for r in select policyname,qual,with_check from pg_policies
   where schemaname='storage' and tablename='objects' and permissive='RESTRICTIVE'
     and (policyname like 'invoice_objects_%' or policyname like 'test_report_storage_%')
  loop
   definition := format('alter policy %I on storage.objects',workspace_key || '_' || r.policyname);
   if r.qual is not null then
    definition := definition || format(' using (bucket_id not like %L or (%s))',workspace_key||'-%',private.workspace_ddl(r.qual,target));
   end if;
   if r.with_check is not null then
    definition := definition || format(' with check (bucket_id not like %L or (%s))',workspace_key||'-%',private.workspace_ddl(r.with_check,target));
   end if;
   execute definition;
  end loop;
 end loop;
 -- Keep future bootstrap definitions consistent; permissive grants still
 -- require membership in their bucket namespace, restrictive guards do not.
 definition := pg_get_functiondef('private.bootstrap_management_workspace(text)'::regprocedure);
 foreach clause in array array['using','with check'] loop
  old_fragment := replace($old$ddl:=ddl||' @clause@ (bucket_id like '||quote_literal(p_key||'-%')||' and ('$old$,'@clause@',clause);
  new_fragment := replace($new$ddl:=ddl||' @clause@ ('||(case when r.permissive='RESTRICTIVE' then 'bucket_id not like '||quote_literal(p_key||'-%')||' or (' else 'bucket_id like '||quote_literal(p_key||'-%')||' and (' end)$new$,'@clause@',clause);
  if strpos(definition,old_fragment)=0 then raise exception 'Expected bootstrap storage policy expression missing'; end if;
  definition := replace(definition,old_fragment,new_fragment);
 end loop;
 execute definition;
end
$migration$;

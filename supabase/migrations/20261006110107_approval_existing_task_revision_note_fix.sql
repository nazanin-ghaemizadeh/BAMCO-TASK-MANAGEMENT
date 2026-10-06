-- Fix only the existing-task annotation variable. Preserve the installed
-- function's signature, authorization guards, owner, ACL and execution context.
-- Refuse an unexpected implementation rather than replace independent changes.
do $migration$
declare
  target regprocedure := to_regprocedure('public.review_request_stage(bigint,text,text,jsonb)');
  definition text;
  broken text := $old$update public.tasks set manager_notes=concat_ws(E'\n\n',nullif(btrim(manager_notes),''),manager_note) where id=r.task_id;$old$;
  repaired text := $new$update public.tasks set manager_notes=concat_ws(E'\n\n',nullif(btrim(manager_notes),''),v_manager_note) where id=r.task_id;$new$;
begin
  if target is null then
    raise exception 'review_request_stage(bigint,text,text,jsonb) is missing';
  end if;
  definition := pg_get_functiondef(target);
  if strpos(definition, broken) = 0 and strpos(definition, repaired) > 0 then
    return; -- Already repaired; never replace a newer implementation.
  end if;
  if (length(definition) - length(replace(definition, broken, ''))) <> length(broken)
     or strpos(definition, 'v_manager_note text;') = 0 then
    raise exception 'Unexpected review_request_stage definition; refusing revision-note patch';
  end if;
  execute replace(definition, broken, repaired);
end;
$migration$;

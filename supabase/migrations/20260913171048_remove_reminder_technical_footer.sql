do $migration$
declare original text; revised text; removed integer;
begin
 select pg_get_functiondef('private.prepare_delivery_reminders(bigint[],text,uuid)'::regprocedure) into original;
 select count(*) filter(where position('پیام‌های اصلی مرتبط با این یادآوری:' in line)>0),
        string_agg(line,E'\n' order by ordinal)
 into removed,revised
 from regexp_split_to_table(original,E'\n') with ordinality as src(line,ordinal)
 where position('پیام‌های اصلی مرتبط با این یادآوری:' in line)=0
    or position('پیام‌های اصلی مرتبط با این یادآوری:' in line)>0;
 select string_agg(line,E'\n' order by ordinal) into revised
 from regexp_split_to_table(original,E'\n') with ordinality as src(line,ordinal)
 where position('پیام‌های اصلی مرتبط با این یادآوری:' in line)=0;
 if removed<>1 or revised=original then raise exception 'Unexpected reminder function; no changes applied'; end if;
 if position('message_reminder_sources' in revised)=0 or position('reminder_context' in revised)=0 then raise exception 'Reminder linkage must remain intact'; end if;
 execute revised;
end $migration$;

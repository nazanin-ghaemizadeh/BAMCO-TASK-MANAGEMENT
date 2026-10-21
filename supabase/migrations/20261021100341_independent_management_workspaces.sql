-- Independent management workspaces, shared Auth identities, shared system admin.
-- Copy schema/configuration only. Never copy business rows, files, credentials,
-- individual grants, assignments, histories, sessions or notifications.
set local statement_timeout='120s';
set local check_function_bodies=off;
create or replace function private.workspace_ddl(p_sql text,p_schema text)
returns text language plpgsql set search_path='' as $$
declare result text:=p_sql; b record;
begin
 result:=regexp_replace(result,'\mpublic[.]',p_schema||'.','g');
 result:=regexp_replace(result,'\mprivate[.]',p_schema||'_private.','g');
 result:=regexp_replace(result,'((?:nspname|table_schema|TG_TABLE_SCHEMA)\s*(?:=|<>)\s*)''public''','\1'||quote_literal(p_schema),'gi');
 -- Extension objects/types remain shared infrastructure, never business data.
 for b in select p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') union select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and exists(select 1 from pg_depend d where d.classid='pg_type'::regclass and d.objid=t.oid and d.deptype='e') loop
  result:=replace(result,p_schema||'.'||b.name,'public.'||b.name);
 end loop;
 result:=replace(result,'search_path TO public','search_path TO '||quote_ident(p_schema));
 result:=replace(result,'search_path TO ''public''','search_path TO '||quote_ident(p_schema));
 for b in select id from storage.buckets where id not like 'process-%' and id not like 'quality-%' loop
  result:=replace(result,quote_literal(b.id),quote_literal(replace(p_schema,'bamco_','')||'-'||b.id));
 end loop;
 return result;
end $$;
revoke all on function private.workspace_ddl(text,text) from public,anon,authenticated,service_role;

create or replace function private.bootstrap_management_workspace(p_key text)
returns void language plpgsql security definer set search_path='' as $$
declare
 target text:='bamco_'||p_key; hidden text:='bamco_'||p_key||'_private';
 r record; x record; grant_row record; ddl text; dest text; pending integer; last_pending integer:=-1;
 seed text; cols text; role_name text; new_signature text; source_schemas text[]:=array['public','private'];
begin
 if p_key not in ('process','quality') then raise exception 'Unknown management workspace';end if;
 if to_regnamespace(target) is not null then raise exception 'Workspace already exists: %',target;end if;
 execute format('create schema %I',target); execute format('create schema %I',hidden);
 execute format('revoke all on schema %I,%I from public,anon',target,hidden);
 execute format('grant usage on schema %I,%I to authenticated,service_role',target,hidden);
 -- Empty tables with independent identities/indexes, retaining constraints.
 for r in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname=any(source_schemas) and c.relkind='r'
    and c.relname not like '%backup%' and c.relname not like '%recovery%' loop
  dest:=case when r.nspname='public' then target else hidden end;
  execute format('create table %I.%I (like %I.%I including all)',dest,r.relname,r.nspname,r.relname);
 end loop;
 -- Serial defaults must never advance the product workspace's sequences.
 for r in select c.oid,n.nspname,c.relname,s.* from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid where n.nspname=any(source_schemas) loop
  dest:=case when r.nspname='public' then target else hidden end;
  execute format('create sequence if not exists %I.%I increment %s minvalue %s maxvalue %s start %s cache %s %s',dest,r.relname,r.seqincrement,r.seqmin,r.seqmax,r.seqstart,r.seqcache,case when r.seqcycle then 'cycle' else 'no cycle' end);
 end loop;
 for r in select n.nspname,c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) expression from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum
  where n.nspname=any(source_schemas) and a.attidentity='' and a.attgenerated='' and c.relname not like '%backup%' and c.relname not like '%recovery%' loop
  dest:=case when r.nspname='public' then target else hidden end;
  execute format('alter table %I.%I alter column %I set default %s',dest,r.relname,r.attname,private.workspace_ddl(r.expression,target));
 end loop;
 -- SQL functions/views may depend on each other's composite result types.
 create temporary table if not exists workspace_pending(oid oid primary key,kind text,definition text) on commit drop;
 truncate workspace_pending;
 insert into workspace_pending
 select p.oid,'function',private.workspace_ddl(pg_get_functiondef(p.oid),target) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname=any(source_schemas) and p.prokind='f' and p.proname not in ('bootstrap_management_workspace','workspace_ddl')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');
 insert into workspace_pending
 select c.oid,'view',format('create view %I.%I with (security_invoker=true) as %s',target,c.relname,private.workspace_ddl(pg_get_viewdef(c.oid,true),target))
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v';
 loop
  for r in select * from workspace_pending loop
   begin execute r.definition;delete from workspace_pending where oid=r.oid;
   exception when undefined_function or undefined_table or undefined_object then null;end;
  end loop;
  select count(*) into pending from workspace_pending;
  exit when pending=0;
  if pending=last_pending then select string_agg(definition,E'\n') into ddl from workspace_pending;raise exception 'Unresolved workspace definitions: %',left(ddl,1500);end if;
  last_pending:=pending;
 end loop;
 -- Preserve the source's exact function EXECUTE boundary, especially helpers.
 for r in select p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,p.proacl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any(source_schemas) and p.prokind='f'
  and p.proname not in ('bootstrap_management_workspace','workspace_ddl') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
  dest:=case when r.nspname='public' then target else hidden end;
  new_signature:=format('%I.%I(%s)',dest,r.proname,private.workspace_ddl(r.args,target));
  execute 'revoke all on function '||new_signature||' from public,anon,authenticated,service_role';
  for grant_row in select * from aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) loop
   if grant_row.privilege_type='EXECUTE' then
    role_name:=case when grant_row.grantee=0 then 'authenticated' else (select rolname from pg_roles where oid=grant_row.grantee) end;
    if role_name in ('authenticated','service_role') then execute 'grant execute on function '||new_signature||' to '||quote_ident(role_name);end if;
   end if;
  end loop;
 end loop;
 -- Copy non-personal catalogs before installing triggers or foreign keys.
 foreach seed in array array['app_features','task_statuses','priorities','task_field_options','organization_roles','permission_catalog','organization_role_permissions'] loop
  if to_regclass('public.'||seed) is null then continue;end if;
  select string_agg(quote_ident(attname),',' order by attnum) into cols from pg_attribute where attrelid=to_regclass('public.'||seed) and attnum>0 and not attisdropped and attgenerated='';
  execute format('insert into %I.%I(%s) overriding system value select %s from public.%I',target,seed,cols,cols,seed);
  if seed='task_field_options' then execute format('update %I.task_field_options set created_by=null',target);end if;
 end loop;
 -- Only the existing system administrator is shared between environments.
 execute format('insert into %I.profiles select * from public.profiles where active and role=''manager''',target);
 execute format('update %I.profiles set avatar_path=null',target);
 -- All business FKs must resolve inside the same workspace; auth remains shared.
 for r in select c.oid,n.nspname,t.relname,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname=any(source_schemas) and c.contype='f' and t.relname not like '%backup%' and t.relname not like '%recovery%' loop
  dest:=case when r.nspname='public' then target else hidden end;
  execute format('alter table %I.%I add constraint %I %s',dest,r.relname,r.conname,private.workspace_ddl(r.definition,target));
 end loop;
 for r in select c.oid,n.nspname,c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any(source_schemas) and c.relkind='r' and c.relname not like '%backup%' and c.relname not like '%recovery%' loop
  dest:=case when r.nspname='public' then target else hidden end;
  execute format('alter table %I.%I enable row level security',dest,r.relname);
  for grant_row in select grantee,privilege_type from information_schema.table_privileges where table_schema=r.nspname and table_name=r.relname and grantee in ('authenticated','service_role') loop
   execute format('grant %s on %I.%I to %I',grant_row.privilege_type,dest,r.relname,grant_row.grantee);
  end loop;
 end loop;
 for r in select p.* from pg_policies p where schemaname=any(source_schemas) and tablename not like '%backup%' and tablename not like '%recovery%' loop
  dest:=case when r.schemaname='public' then target else hidden end;
  select string_agg(case when value='public' then 'public' else quote_ident(value) end,',') into cols from unnest(r.roles::text[]) value;
  ddl:=format('create policy %I on %I.%I as %s for %s to %s',r.policyname,dest,r.tablename,r.permissive,r.cmd,cols);
  if r.qual is not null then ddl:=ddl||' using ('||private.workspace_ddl(r.qual,target)||')';end if;
  if r.with_check is not null then ddl:=ddl||' with check ('||private.workspace_ddl(r.with_check,target)||')';end if;
  execute ddl;
 end loop;
 -- A profile is membership. Auth tokens alone cannot enter another workspace.
 execute format('create function %I.workspace_member() returns boolean language sql stable security definer set search_path='''' as $member$ select exists(select 1 from %I.profiles where id=auth.uid() and active) $member$',hidden,target);
 execute format('revoke all on function %I.workspace_member() from public,anon;grant execute on function %I.workspace_member() to authenticated',hidden,hidden);
 for r in select relname from pg_class where relnamespace=to_regnamespace(target) and relkind='r' loop
  execute format('create policy workspace_members_only on %I.%I as restrictive for all to authenticated using ((select %I.workspace_member())) with check ((select %I.workspace_member()))',target,r.relname,hidden,hidden);
 end loop;
 -- Install table triggers only after bootstrap; all called functions are cloned.
 for r in select pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=any(source_schemas) and not t.tgisinternal and c.relname not like '%backup%' and c.relname not like '%recovery%' loop
  execute private.workspace_ddl(r.definition,target);
 end loop;
 -- Views preserve source table/view grants, but enforce underlying RLS.
 for r in select table_name,grantee,privilege_type from information_schema.table_privileges where table_schema='public' and table_name in(select relname from pg_class where relnamespace='public'::regnamespace and relkind='v') and grantee in ('authenticated','service_role') loop
  execute format('grant %s on %I.%I to %I',r.privilege_type,target,r.table_name,r.grantee);
 end loop;
 for r in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any(source_schemas) and c.relkind='S' loop
  dest:=case when r.nspname='public' then target else hidden end;
  for grant_row in select privilege_type,grantee from information_schema.usage_privileges where object_schema=r.nspname and object_name=r.relname and grantee in ('authenticated','service_role') loop
   execute format('grant usage on sequence %I.%I to %I',dest,r.relname,grant_row.grantee);
  end loop;
 end loop;
 -- Advance copied catalog identity sequences past their copied IDs.
 for r in select c.relname,a.attname,pg_get_serial_sequence(format('%I.%I',target,c.relname),a.attname) seq from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where c.relnamespace=to_regnamespace(target) and c.relkind='r' and (a.attidentity<>'' or exists(select 1 from pg_attrdef d where d.adrelid=c.oid and d.adnum=a.attnum and pg_get_expr(d.adbin,d.adrelid) like 'nextval%')) loop
  if r.seq is not null then execute format('select setval(%L,greatest(coalesce(max(%I),0),1),max(%I) is not null) from %I.%I',r.seq,r.attname,r.attname,target,r.relname);end if;
 end loop;
 -- The same Auth login can administer all three; new accounts belong to one.
 execute format('create trigger %I after insert on auth.users for each row when (new.raw_app_meta_data->>''bamco_department''=%L) execute function %I.handle_new_user()',p_key||'_auth_user',p_key,target);
 execute format('create trigger %I after insert or update of email,encrypted_password on auth.users for each row execute function %I.sync_auth_credentials()',p_key||'_auth_credentials',hidden);
 -- Independent storage namespaces; no product files are copied.
 for r in select * from storage.buckets where id not like 'process-%' and id not like 'quality-%' loop
  insert into storage.buckets select (jsonb_populate_record(null::storage.buckets,to_jsonb(r)||jsonb_build_object('id',p_key||'-'||r.id,'name',p_key||'-'||r.name))).*;
 end loop;
 for r in select * from pg_policies where schemaname='storage' and tablename='objects' and policyname not like 'process_%' and policyname not like 'quality_%' loop
  select string_agg(case when value='public' then 'public' else quote_ident(value) end,',') into cols from unnest(r.roles::text[]) value;
  ddl:=format('create policy %I on storage.objects as %s for %s to %s',left(p_key||'_'||r.policyname,63),r.permissive,r.cmd,cols);
  if r.qual is not null then ddl:=ddl||' using (bucket_id like '||quote_literal(p_key||'-%')||' and ('||private.workspace_ddl(r.qual,target)||'))';end if;
  if r.with_check is not null then ddl:=ddl||' with check (bucket_id like '||quote_literal(p_key||'-%')||' and ('||private.workspace_ddl(r.with_check,target)||'))';end if;
  execute ddl;
 end loop;
 execute format('create policy %I on storage.objects as restrictive for all to authenticated using (bucket_id not like %L or (select %I.workspace_member())) with check (bucket_id not like %L or (select %I.workspace_member()))',p_key||'_storage_members_only',p_key||'-%',hidden,p_key||'-%',hidden);
end $$;
revoke all on function private.bootstrap_management_workspace(text) from public,anon,authenticated,service_role;
select private.bootstrap_management_workspace('process');
select private.bootstrap_management_workspace('quality');
-- Scope future profile creation using service-controlled Auth app_metadata.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.handle_new_user()'::regprocedure);
 if strpos(definition,'bamco_department')=0 then
  definition:=regexp_replace(definition,'\mbegin\M',E'begin\n  if new.raw_app_meta_data->>''bamco_department'' in (''process'',''quality'') then return new;end if;','i');
  execute definition;
 end if;
end $$;
-- PostgREST's database configuration supports custom exposed schemas.
alter role authenticator set pgrst.db_schemas='public,storage,graphql_public,bamco_process,bamco_quality';
notify pgrst,'reload config';
notify pgrst,'reload schema';

-- Apply membership before every REST/RPC call, including SECURITY DEFINER RPCs.
create or replace function public.validate_management_workspace_request()
returns void language plpgsql security definer set search_path='' as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 target text; member boolean;
begin
 if auth.role()='service_role' then return;end if;
 if auth.uid() is null then raise exception 'ورود معتبر لازم است.' using errcode='42501';end if;
 target:=case when current_setting('request.method',true) in ('GET','HEAD') then headers->>'accept-profile' else headers->>'content-profile' end;
 target:=coalesce(nullif(target,''),'public');
 if target not in ('public','bamco_process','bamco_quality') then raise exception 'محیط کاری معتبر نیست.' using errcode='42501';end if;
 execute format('select exists(select 1 from %I.profiles where id=$1 and active)',target) into member using auth.uid();
 if not member then raise exception 'حساب شما به این مدیریت دسترسی ندارد؛ مدیریت صحیح را انتخاب کنید.' using errcode='42501';end if;
end $$;
revoke all on function public.validate_management_workspace_request() from public,anon;
grant execute on function public.validate_management_workspace_request() to authenticated,service_role;
alter role authenticator set pgrst.db_pre_request='public.validate_management_workspace_request';
notify pgrst,'reload config';

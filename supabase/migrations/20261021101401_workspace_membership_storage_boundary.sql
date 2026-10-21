-- Apply the same membership boundary to the original environment and Storage,
-- including direct realtime reads (which do not run PostgREST pre-request).
create or replace function private.product_workspace_member()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and active)
$$;
revoke all on function private.product_workspace_member() from public,anon;
grant execute on function private.product_workspace_member() to authenticated;
do $$declare r record;begin
 for r in select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' loop
  execute format('create policy product_workspace_members_only on public.%I as restrictive for all to authenticated using ((select private.product_workspace_member())) with check ((select private.product_workspace_member()))',r.relname);
 end loop;
end $$;
create policy product_storage_members_only on storage.objects as restrictive for all to authenticated
using (bucket_id like 'process-%' or bucket_id like 'quality-%' or (select private.product_workspace_member()))
with check (bucket_id like 'process-%' or bucket_id like 'quality-%' or (select private.product_workspace_member()));

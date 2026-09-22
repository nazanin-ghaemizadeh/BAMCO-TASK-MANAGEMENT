-- Break message-table RLS recursion without widening access.  The batch /
-- delivery relationship is evaluated in one JWT-bound SECURITY DEFINER
-- helper; policies themselves no longer select from one another's tables.

create or replace function public.bamco_can_read_message_batch(p_batch_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or p_batch_id is null then
    return false;
  end if;
  return exists(
    select 1
    from public.message_batches batch
    where batch.id=p_batch_id
      and (
        (
          public.can_access_feature('messageCenter','view')
          and batch.created_by=v_actor
        )
        or (
          (
            public.can_access_feature('sentMessages','view')
            or public.can_access_feature('responseTracking','view')
          )
          and exists(
            select 1
            from public.message_deliveries delivery
            where delivery.batch_id=batch.id
              and delivery.recipient_id in (
                select scoped.user_id
                from public.organization_scope_user_ids(v_actor) scoped
              )
          )
        )
      )
  );
end;
$$;

revoke all on function public.bamco_can_read_message_batch(uuid) from public,anon;
grant execute on function public.bamco_can_read_message_batch(uuid) to authenticated;

drop policy if exists message_batches_feature_read on public.message_batches;
create policy message_batches_feature_read on public.message_batches
  for select to authenticated using(public.bamco_can_read_message_batch(id));

drop policy if exists message_snapshots_feature_read on public.message_snapshots;
create policy message_snapshots_feature_read on public.message_snapshots
  for select to authenticated using(
    (public.can_access_feature('messages','view') and recipient_id=auth.uid())
    or public.bamco_can_read_message_batch(batch_id)
  );

drop policy if exists message_deliveries_feature_read on public.message_deliveries;
create policy message_deliveries_feature_read on public.message_deliveries
  for select to authenticated using(
    (public.can_access_feature('messages','view') and recipient_id=auth.uid())
    or public.bamco_can_read_message_batch(batch_id)
  );

-- Managers can monitor every open request. The actionable flag still enforces
-- the current approval stage, so visibility never grants review authority.
create or replace function public.request_routing_status()
returns table(
  request_id bigint,
  stage_no smallint,
  stage_title text,
  approver_names text,
  actionable boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    s.stage_no,
    s.title,
    string_agg(distinct p.full_name, '، ' order by p.full_name),
    (
      (r.approval_chain_id is null and r.request_status = 'pending' and (select private.is_manager()))
      or coalesce(
        bool_or(
          a.approver_id = auth.uid()
          and coalesce(rs.decision, 'pending') = 'pending'
        ),
        false
      )
    ) as actionable
  from public.change_requests r
  left join public.approval_chain_stages s
    on s.chain_id = r.approval_chain_id
   and s.stage_no = r.current_stage
  left join public.approval_stage_approvers a on a.stage_id = s.id
  left join public.request_approval_steps rs
    on rs.request_id = r.id
   and rs.stage_id = s.id
   and rs.approver_id = a.approver_id
  left join public.profiles p on p.id = a.approver_id
  where auth.uid() is not null
    and r.request_status in ('pending', 'in_review', 'needs_revision')
    and (
      ((select private.is_manager()))
      or r.requested_by = auth.uid()
    )
  group by r.id, s.stage_no, s.title, r.approval_chain_id, r.request_status
  order by r.created_at desc, r.id desc;
$$;

create or replace function public.request_workflow_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_manager boolean;
  v_current jsonb;
  v_history jsonb;
  v_routes jsonb;
begin
  if v_uid is null then
    raise exception 'ورود به سامانه الزامی است';
  end if;

  v_manager := (select private.is_manager());

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc),
    '[]'::jsonb
  )
  into v_current
  from public.change_requests r
  where r.request_status in ('pending', 'in_review', 'needs_revision')
    and (v_manager or r.requested_by = v_uid);

  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by coalesce(r.reviewed_at, r.completed_at, r.created_at) desc, r.id desc
    ),
    '[]'::jsonb
  )
  into v_history
  from public.change_requests r
  where r.request_status in ('approved', 'rejected', 'cancelled')
    and (v_manager or r.requested_by = v_uid);

  select coalesce(
    jsonb_agg(to_jsonb(x) order by x.request_id desc),
    '[]'::jsonb
  )
  into v_routes
  from public.request_routing_status() x;

  return jsonb_build_object(
    'current_requests', v_current,
    'history_requests', v_history,
    'routes', v_routes
  );
end;
$$;

revoke all on function public.request_routing_status() from public, anon;
grant execute on function public.request_routing_status() to authenticated;
revoke all on function public.request_workflow_snapshot() from public, anon;
grant execute on function public.request_workflow_snapshot() to authenticated;

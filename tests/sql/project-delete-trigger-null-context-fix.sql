-- Regression: a normal task approval has no project-delete context and must
-- never enter the project deletion trigger. The transaction leaves request 186
-- unchanged while exercising the exact trigger path shown in production.
begin;

do $$
begin
  if not exists (
    select 1 from public.change_requests
    where id=186 and request_status='in_review'
      and proposed_data->>'request_context' is null
  ) then
    raise exception 'Regression fixture request 186 is not an open legacy task request';
  end if;
end;
$$;

update public.change_requests
set request_status='approved'
where id=186;

rollback;

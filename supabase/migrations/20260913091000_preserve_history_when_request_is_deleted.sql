-- A task deletion cascades to its change requests. Keep the audit history row,
-- but detach it from the deleted workflow request so the delete can complete.
set lock_timeout = '5s';

alter table public.task_history
  drop constraint if exists task_history_request_id_fkey;

alter table public.task_history
  add constraint task_history_request_id_fkey
  foreign key (request_id) references public.change_requests(id)
  on delete set null;

notify pgrst, 'reload schema';

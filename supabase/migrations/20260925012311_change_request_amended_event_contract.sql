-- The request editor records an explicit `amended` audit event. Keep the
-- table constraint aligned with every event emitted by the workflow RPCs.
alter table public.change_request_events
  drop constraint if exists change_request_events_event_type_check;

alter table public.change_request_events
  add constraint change_request_events_event_type_check
  check(event_type in (
    'drafted','submitted','routed','approved','corrected_and_approved',
    'rejected','needs_revision','resubmitted','amended','applied','cancelled'
  ));

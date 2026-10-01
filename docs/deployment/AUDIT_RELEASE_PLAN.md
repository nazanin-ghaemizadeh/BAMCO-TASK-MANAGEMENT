# Audit release plan (not executed)

This PR is code prepared for review. No production operation below has been performed.

## Preflight and sequence

1. Confirm the intended PR head, green checks and deterministic bundle checksums. Approve merge/frontend deployment separately.
2. Before database application, re-read `private.enforce_task_rules()` and compare with `tests/sql/fixtures/live-task-rules-20261001.sql`; if it changed since the capture, stop and reconcile. The proposed migration changes only automatic archiving of completed-but-active rows. It has no grants, RLS changes or bulk data correction.
3. Apply the migration only after explicit approval. Existing completed/unarchived records are NOT changed by migration application. A read-only aggregate on 2026-10-01 found 21 completed/unarchived rows, none with an unknown completion date; recheck before acting. A separate approved backfill must preserve `done_date`, owner history, and unrelated fields. Consider downstream task audit/notification/project-sync triggers before authorizing that data correction.
4. Separately authorize deployment of `session-audit` and `smart-assistant`. Preserve `verify_jwt=true` and the verified production origin allowlist. The deployed session-audit v9 references absent `bamco_terminate_auth_sessions`; the checked-in implementation removes that obsolete dependency and supports only non-revoked closed-session resumption. Do not recreate the missing privileged RPC just to satisfy old code.
5. Validate a test user's login/reload/logout, both session reports, assigned manager self-task creation, completion/archive flow, and real voice/model answers. Fixture tests do not replace this production acceptance step.

## Risks and rollback

- Frontend rollback: redeploy the prior verified release only after confirming compatibility with any approved backend change.
- Database function rollback: `docs/deployment/rollback-task-autoarchive.sql` restores the captured live function; re-check the capture before use. This reverses future trigger behavior only. It does not unarchive data already changed, delete audit events or reverse notifications.
- Any approved backfill needs a separately authorized recovery snapshot of affected IDs and original archive fields, plus transaction rollback on validation failure. Do not bulk infer unknown completion dates.
- Edge Function rollback: retain the deployed version/source before an authorized deployment. Rolling back to session-audit v9 also reintroduces the known missing-RPC defect, so assess that tradeoff explicitly.
- Organizational scope is unchanged: live manager-self authority exists; assigning no owner is reserved to system managers. This audit does not grant broader organizational access.

## Evidence scope

Read-only production inspection matched project `zhhongjhhbvpmoquvkhl` to the public app URL. Function definitions and migration metadata were inspected; no production business records were modified and no real credentials were read. The SQL test uses isolated PostgreSQL semantics and preserves the complete captured function body except the explicit archive block.

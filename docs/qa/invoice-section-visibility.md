# Invoice section visibility and authorization contract

Historical first-stage contract: its creator-scoped mutation boundary is superseded by [invoice capability parity](invoice-capability-parity.md). The original proposal and tests remain intact to verify the migration sequence and the earlier boundary before the parity upgrade.

## Status and boundary

This document separates the schema proposal and test evidence from rollout evidence. Keeping SQL under `supabase/schema-proposals/` does not establish that a remote database has been changed. Record the actual approved deployment and its database-reported migration version separately; do not infer activation from this file or use a mismatched migration timestamp. Local preparation uses synthetic records and does not impersonate production users.

Rollout order matters: the corrected client, including its stale-response/privacy handling, must be live before activating the broader production read scope. After the required approval and acceptance gates, record the actual migration and verify through an authorized session. This document does not claim that deployment or production verification has occurred.

The intended rule is that the existing invoice section feature decision authorizes the whole section:

- `view`: every invoice, its payment rows, its finalized attachment metadata, and authenticated downloads of its managed finalized files
- `view` plus `edit`: edit an invoice regardless of who created it or follows it
- Invoice creation/deletion, payment mutation, attachment mutation/upload/deletion, service cleanup and administrative scope retain their existing rules
- Pending attachment reservations remain private to their uploader; a section-wide reader does not see another uploader's unfinished files
- The generic feature resolver is not changed; explicit denials and any active-profile decisions remain its responsibility
- Archive, Kanban, dashboard and all other sections are untouched

Payment amounts/statuses, stage insertion/deletion and attachment upload/deletion are separate actions. This proposal does not broaden them. The client must likewise separate invoice edit and file download checks from legacy related-record payment/file mutation checks.

## Why changing one shared helper is unsafe

`public.platform_can_access_invoice(bigint)` checks section view and the creator, follow-up owner or system-manager relation. It is shared by payment/file INSERT, UPDATE and DELETE policies, file reservation/finalization guards, and the lock helper used by upload and deletion RPCs. Broadening it to section view would also broaden those mutations.

The proposal leaves its definition, ACL and every write policy using it untouched. The new no-argument `private.invoice_section_can_read()` is SECURITY INVOKER and checks authenticated section view. All three SELECT policies and the invoice UPDATE policy use it through a scalar SELECT, allowing PostgreSQL to resolve the expensive feature gate once per query rather than once per row. Every row shares this gate, and the child foreign keys require an existing invoice parent, so per-row parent lookups add no authorization. The helper never reads invoice tables and cannot recurse. Storage reads go through invoice_files RLS plus finalized/uploader checks.

## Exact schema changes

1. Alter only the existing invoice/payment/file SELECT policies and invoice UPDATE policy
2. Add the private invoker-only read helper, with an empty search path, no PUBLIC/anonymous execution, and authenticated execution
3. Change only `private.invoice_storage_read(text)` to use the new read scope, keeping pending-uploader privacy and all restrictive Storage write guards
4. Add a BEFORE UPDATE trigger that prevents newly eligible foreign invoice editors from changing `id`, `created_by` or `follow_up_owner_id`
5. Replace only the AFTER-total-change percentage trigger with a minimal private trigger-only definer that assigns `percent_of_total` for the changed invoice's payments

The identity trigger is necessary even though `save_invoice` rejects unsupported payload fields: direct table/API UPDATE can otherwise turn a foreign edit into creator/follow-up ownership and then gain legacy delete/payment/upload privileges. Existing related editors/managers retain their existing ownership controls; this is not an ownership-administration redesign.

The derived-percentage function has no caller-supplied arguments, verifies invoice/UPDATE/AFTER trigger context, uses an empty search path and has client/service EXECUTE revoked. It only writes the percentage expression for `NEW.id` when the total actually changed. PostgreSQL invokes it through the authorized invoice update. Existing payment validation, identity, status and audit triggers still run. This is derived financial consistency following an invoice edit, not a callable payment-edit endpoint.

The original invoker BEFORE-total-change validation/status functions stay unchanged. Without the trigger split, a foreign invoice editor's total update would succeed while the old invoker AFTER trigger silently updated zero payment rows under preserved payment UPDATE RLS, leaving stored percentages stale.

## Dependency review

### Invoice reads and editing

- `public.list_invoice_workspace()` remains SECURITY INVOKER. Its three SELECT subqueries obey the updated read policies; it has no independent owner filter
- `public.save_invoice(...)` remains SECURITY INVOKER. Its UPDATE obeys the broader invoice update policy. Its create identity rules, allowed-field validation, exact-decimal validation, currency handling and actor-scoped idempotency ledger are unchanged
- `private.invoice_row_json(...)` and `private.invoice_payment_json(...)` continue serializing exact numeric/ID values as strings
- `public.invoice_paid_amount(...)` and `public.invoice_remaining_amount(...)` remain invoker reads and therefore reflect the new authorized payment visibility
- `private.validate_invoice_total()` still rejects a total below paid amounts; the now-complete payment SELECT scope lets it validate all of the invoice's payments
- The BEFORE trigger using `private.refresh_invoice_amount_state()` still recalculates invoice status and respects cancelled/returned states; the original function is unchanged, but its AFTER percentage trigger is replaced
- `private.sync_invoice_status()` remains the existing trigger-only payment-status maintenance path
- `private.platform_audit_trigger()` remains the existing database audit path. It logs the authorization-bearing statement and derived updates; the proposal does not replace it or add any audit-data read grants

### Payment mutation

- `public.save_invoice_payment(...)` still uses the invoker parent lock, payment INSERT/UPDATE RLS and actor-scoped replay ledger
- Parent locking becomes possible for foreign invoice editors, but payment INSERT/UPDATE policies still deny their mutation; tests exercise RPC and direct-table paths
- `private.validate_invoice_payment()` retains the parent lock, overpayment check, computed percentage and paid-date normalization
- `private.guard_invoice_payment_identity()` preserves invoice-link immutability and valid finalized receipt linkage
- All three payment write policies and the existing DELETE behavior remain unchanged, including their existing feature/ownership requirements and trigger side effects
- A replay that only returns an already committed result is a read, not permission to repeat a mutation

### Files, uploads and deletion

- `public.reserve_invoice_file(...)`, `public.get_invoice_file_upload(...)`, `public.finalize_invoice_file(...)` and `public.delete_invoice_file(...)` remain SECURITY INVOKER with unchanged definitions and grants
- `private.lock_invoice_for_file(...)` retains its old owner-scoped authorization checks before and after taking the parent lock
- `private.guard_invoice_file()` retains reservation validation, immutable identity, uploader-only transition and existing owner-scoped checks
- `private.guard_invoice_file_primary_key()` remains unchanged
- `private.invoice_file_path(...)`, `private.invoice_file_object_matches(...)`, `private.invoice_file_json(...)`, `private.invoice_is_settled(...)` and `private.invoice_settlement_snapshot(...)` retain their definitions. Their reads now have authorized whole-section visibility; final-file current/history status is still calculated from financial state
- `private.record_invoice_file_request()` and private ledger policies remain unchanged
- `private.sync_invoice_receipt()` retains its payment UPDATE dependency. An ordinary related view-only user can still manage ordinary files under existing scope, while clearing/finalizing a receipt still needs the existing payment/invoice edit rights
- `private.queue_invoice_file_cleanup()`, `public.invoice_file_cleanup_batch(...)`, `public.ack_invoice_file_cleanup(...)` and their grants are unchanged. No SQL object-byte deletion is introduced
- The invoice upload Edge handler still authenticates the caller and requires `get_invoice_file_upload`, matching uploader identity, fixed reservation path, exact bytes/hash and no-upsert server completion. Section-wide file download is not upload authorization
- Restrictive Storage INSERT/UPDATE/DELETE/anonymous policies are unchanged, including when an unrelated permissive policy exists
- Legacy unmanaged attachment metadata remains visible under section view; the proposal does not invent a bucket/path migration or grant access to unknown legacy bytes

### Related scope preserved

The proposal does not rewrite `can_access_feature`, organization/profile permissions, ownership assignments or administrator grants. It does not change invoice INSERT/DELETE policies, payment/file write policies, request-ledger policies, pending-visibility policy or service cleanup ACLs. Installation and repeat application do not rewrite invoice, payment, file or Storage metadata rows.

## Executable verification

Run:

```
node scripts/test-invoice-section-visibility-sql.mjs
node --test tests/invoice-section-visibility-sql.test.cjs
```

The wrapper is picked up automatically by the existing `tests/*.test.cjs` full regression runner; no workflow change is needed.

The suite reuses the existing invoice attachment PostgreSQL/PGlite fixture and the checked-in payment-consistency, attachment-gate and file-controls SQL. It uses only synthetic actors and records. It reproduces the old foreign-reader failure before applying the proposal, applies it twice, verifies no installation-time data changes, and compares unchanged function definitions/ACLs, mutation policies and trigger definitions.

Positive coverage includes whole-section reads, managed-file Storage reads, foreign invoice RPC/direct edits, exact totals including valid zero, invalid negative/excess-precision/exponent inputs, idempotent replay, percentage maintenance across paid/planned rows, overpayment rollback, final-file history, existing creator/follow-up/manager behavior and unchanged creation identity rules. Negative coverage includes denied/view-only/edit-without-view/missing-identity/anonymous/inactive users, permission revocation after prior access and reactivation, hidden pending files, ownership/identity takeover, foreign invoice deletion, payment mutations, file reservation/upload/finalization/deletion, Storage writes and cleanup RPC calls.

These are real isolated PostgreSQL policy/function/trigger tests. Auth/profile decisions and Storage metadata are explicit fixture stubs. They do not prove real JWT/profile resolution, HTTP/PostgREST behavior, Storage bytes, production deployment, multi-session concurrency, existing external triggers or a live database policy inventory. Actual audit logging is reviewed from checked-in SQL but is not recreated by the attachment fixture. Before activation, review the exact live dependency/policy inventory, run production-version staging tests and database advisors, obtain the required deployment authorization, and verify through an authorized real session. Do not impersonate a production user as part of local tests.

## Real service and concurrent acceptance gates

The existing read-only-permission workflow `.github/workflows/report-invoice-files-browser.yml` already invokes both Python harnesses. No workflow permissions, hosted credentials or new secrets are required. Both keep their original safety guards: explicitly disposable loopback services, synthetic accounts/data, bounded deadlines and owned-resource cleanup.

`scripts/test-invoice-storage-api.py` now loads the checked-in payment consistency and file-delete prerequisites, runs its existing baseline Storage/Edge cases, then applies this section proposal inside the same owned local Supabase instance. It creates real local Auth sessions for unrelated owner/editor/viewer fixture accounts and verifies:

- Baseline foreign row and byte denial before the proposal
- Actual JWT-authenticated workspace RPC and direct PostgREST reads of invoice/payment/ready-file rows after it
- Byte-for-byte authenticated Storage downloads for both foreign viewer and editor
- Denial for another uploader's pending metadata and already-existing pending bytes, plus anonymous/public denial
- Foreign invoice RPC and direct PATCH edits, derived payment percentages, total-below-paid rollback and viewer edit denial
- Retained denial of foreign payment changes, invoice/file deletion, reservation/upload/finalization, direct Storage writes, Edge uploads and ownership takeover
- Feature revocation and restoration observed with the same real JWT

The sanitized acceptance artifact includes source hashes for the section proposal, prerequisites and API harness. Its feature-grant resolver remains explicit synthetic scaffolding; real Auth/JWT, PostgREST, Edge and Storage transports are exercised, but the application's entire organizational authorization resolver is not recreated.

`scripts/test-invoice-attachments-concurrency.py` preserves its original tests, then applies the section proposal and adds four real independent-session races. Both orderings of foreign invoice total reduction versus owner payment creation must preserve the paid-total invariant and roll back the losing invalid change. Both orderings of foreign total increase versus owner payment edit must commit with the correct derived percentage. Each case requires an observed `pg_blocking_pids` lock wait on distinct backend PIDs before releasing the first transaction; sleeps do not substitute for ordering evidence.

These two new real-service extensions were syntax-checked locally but have not been executed here: Docker, PostgreSQL tooling and the pinned Python driver are unavailable in this workspace. Their existing CI jobs must complete successfully before claiming real API or concurrent acceptance. They do not weaken or replace the requirement for authorized production deployment and verification.

## Current documentation check

The Supabase changelog and current RLS documentation were checked while preparing the proposal. The PostgreSQL minor-upgrade breaking-change notice concerns extension/operator behavior not introduced here. The applicable constraints are that UPDATE requires SELECT visibility, invoker RPCs retain RLS, private definer helpers require minimal scope and fixed search paths, and Storage upload/replacement permissions must remain distinct from reads.

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase changelog](https://supabase.com/changelog)
- [PostgreSQL minor-upgrade notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

# Report folders and financial file activation

Status: approved backend migrations and the two upload/report Edge functions are active and verified. Frontend release `2026.10.03.1` is gated on final exact-head checks. No cleanup scheduler or Excel import has been performed.

Base: `4496f0b6fd49ac4ed11441b2da00ba00d5df9df2`, release `2026.10.01.1`.

## Requested frontend changes

- اسناد و سامانه‌ها → گزارش آزمایش‌ها → محیط زیست / استاندارد → تحقیقاتی / انطباق تولید / تأیید نوع و تغییرات مهندسی → Jalali year folders → report files
- Editable year labels and report metadata, explicit deletion confirmation, nonempty year protection, stored update dates, scoped search, previews/downloads and the shared table controls
- Optional proforma on invoice creation, independent receipts per payment, final invoice after all stages are paid and the total is settled
- Thousands grouping during monetary entry, Persian/Arabic/Latin digit input, exact decimal serialization and exact large-value reads
- The shared phonebook command bar's top border

The Excel import is intentionally not performed. The user's workbook has not been supplied. Stable invoice/payment IDs, exact currency/amount fields and idempotent operations are available to support a later reviewed row-by-row importer.

## Backend package

1. `supabase/schema-proposals/test-reports.sql`
   - Dedicated report year/file tables; no fixed folder rows or user records seeded
   - Existing `documents` permissions govern report access and each mutation action
   - Private `test-reports-private` bucket; browser reads require authorized ready metadata
   - Report Edge mutations use explicit caller authorization and service-only serialized operations
2. `supabase/functions/test-report-library/index.ts`
   - Validates original filename/declared MIME/size, derives a safe immutable storage path, and hashes upload bytes
   - Pending/ready/deleting states retain enough information to reconcile interrupted operations
   - File writes touch the parent year timestamp in the same database transaction
3. `supabase/schema-proposals/invoice-attachments.sql`
   - Additive invoice/payment request identity, payment-to-invoice composite file links, staged upload metadata, settlement snapshots and cleanup outbox
   - Existing invoice/payment/file RLS scope is preserved
   - Public save/list/reserve/finalize RPCs are security invoker
   - Narrow private lock-only helper checks the existing invoice scope; trigger-only cleanup functions cannot be invoked by ordinary clients
   - Private `invoices-private` bucket, authorized row-scoped reads and denied direct browser writes
4. `supabase/functions/invoice-file-upload/`
   - Authenticates the caller, retrieves their reservation with caller-scoped RPC access, and verifies actual filename, size, MIME and SHA-256 bytes
   - Uses server-only non-upsert Storage upload; a duplicate/lost reply succeeds only after verifying the existing stored bytes
   - Finalizes through the caller-scoped RPC; the client never supplies a bucket, path or overwrite flag
5. `supabase/functions/invoice-file-cleanup/`
   - Trusted server-only cleanup calls Storage API, never deletes Storage metadata directly through SQL
   - Retained tombstones reconcile delayed uploads; initial five-minute grace and later hourly rechecks
   - Optional and NOT activated for this release. No cleanup function, cron, or new credential is deployed. Removed managed files remain private in the bucket and their paths are retained in the private outbox; no automatic permanent purge occurs

Migration entries were generated with the official Supabase CLI. Reviewed proposal SQL was applied after live read-only preflight; filenames match the authoritative production migration history: `20261003114419_test_report_library.sql` and `20261003114607_invoice_attachment_upload_gate.sql`. Proposal and migration contents are identical.

## Approved rollout and verification

- The user approved this feature release, compatible database changes and publication. The temporary pinned build job may commit only the two canonical bundle files on the feature branch; it must be removed before merge
- Production migrations `20261003114419` and `20261003114607` applied successfully on 2026-10-03. Existing counts remain one invoice, one payment, zero invoice files; no business records were created or changed
- `test-report-library` and `invoice-file-upload` are ACTIVE version 1 with JWT verification enabled. Readback matches every deployed source file exactly
- Private buckets: `test-reports-private` 25 MiB and `invoices-private` 6 MiB. All six public invoice RPCs are SECURITY INVOKER, and RLS remains enabled on all affected business tables
- Source head `7dd69161eb449b794df01e1f483812e2025aea43`: report/invoice Chromium desktop and mobile journeys, real-local Storage/Auth/REST/Edge acceptance, and concurrent PostgreSQL sessions passed in run `37120683383`
- Production backup/rollback posture: additive schema and preserved existing records; prior invoice trigger definitions and counts were captured before apply. If a frontend rollback is needed, restore the previous release while retaining additive tables/buckets and user files. Do not drop storage or new user data as rollback
- No cleanup Edge, cron, token or new service credential was enabled. Automated permanent purge requires separate approval; it is not required for safe upload/read behavior
- Report deletion confirms the selected file and removes its bytes before metadata; interrupted deletion is retriable. Nonempty year deletion is blocked. Invoice/payment deletion follows the existing confirmation flow and queues only newly managed object paths without purging them
- Excel row-by-row import remains pending the user's workbook

Final publication still requires fresh committed bundles, removal of the temporary workflow, exact-head read-only checks, merge and live release/cache verification.

## Known inherited finance rule

The current payment validation trigger obtains an invoice row lock that can require the existing invoice edit RLS permission. A scoped view-only owner can therefore be denied a payment mutation even though the broad payment policy is visible. This change does not silently expand invoice edit privileges to remove that inherited restriction. The isolated tests record it explicitly. Any permission-policy adjustment needs separate review and authorization.

## Checks

- `npm run build:assets && npm run check:assets`
- `npm test` / `npm run test:regression`
- `npm run test:task-lifecycle-db`
- `npm run test:invoice-files-db`
- `python scripts/test-invoice-attachments-concurrency.py` against the disposable loopback PostgreSQL 17 service only
- `python tests/browser/check_report_invoice_files.py` against synthetic in-memory API fixtures only

The PR workflow has repository `contents: read` permission. It builds, checks and stores screenshots/test results without deployment, live credentials or production database writes. Its initial source-only draft does not imply that committed generated assets are current.

# Report folders and financial file activation

Status: implementation/review package only. No production migration, bucket, function, scheduler, merge, deployment or invoice import has been performed by this change.

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
   - Private `invoices-private` bucket and path/row-scoped Storage policies
4. `supabase/functions/invoice-file-cleanup/`
   - Trusted server-only cleanup calls Storage API, never deletes Storage metadata directly through SQL
   - Retained tombstones reconcile delayed uploads; initial five-minute grace and later hourly rechecks
   - Must be activated with its server-side scheduler before rollout. No credential belongs in browser code, repository, logs or a public scheduler request

SQL is deliberately staged outside migration history because the Supabase CLI was unavailable in the implementation environment. Before activation, generate migration entries using the supported CLI, reconcile with the then-current live schema, and copy the reviewed SQL into those generated entries. Do not invent migration history or apply these proposals blindly.

## Approval and rollout gates

Do not merge/deploy the frontend before the backend gates below pass. Publication of the draft branch and read-only tests is separate from production approval.

1. Obtain explicit approval for the exact reviewed backend package, private bucket policies, Edge deployment and server-only recurring cleanup setup
2. Recheck live schema/migrations and take the normal recoverable database backup/snapshot; never replace existing tables or policies wholesale
3. Run the isolated PostgreSQL, true multi-session and browser acceptance checks at the exact reviewed source revision
4. In an approved isolated Supabase environment, verify actual Storage multipart metadata, RLS preflight/upsert, signed/authenticated download, pending retry and delete cleanup behavior. The SQL fixtures simulate Storage metadata; they do not prove physical object API behavior
5. Apply approved generated migrations, deploy the report and cleanup functions, and configure the approved server-only cleanup schedule using an existing authorized secret mechanism
6. Check advisors and schema/RPC availability, verify private bucket flags and scheduler health, and perform authorized smoke validation without fabricated production business records
7. Build committed canonical assets, rerun exact-head gates, then obtain the separate release/merge approval
8. Verify the deployed release marker and cache update, navigation and access after the approved release

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

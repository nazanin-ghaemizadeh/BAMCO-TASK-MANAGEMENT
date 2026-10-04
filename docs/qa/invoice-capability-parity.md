# Invoice capability parity

## Contract

The same existing invoice feature decisions must permit the same business operations on every invoice. Creator and follow-up assignment are not additional authorization requirements. This supersedes the mutation-scope boundary of `invoice-section-visibility.md`; it does not change the feature resolver or assign grants.

| Operation | Existing effective requirement |
| --- | --- |
| Section, payment and finalized attachment reads; ready downloads | `invoices.view` |
| Invoice creation | Existing `invoices.create` policy and authenticated creator identity |
| Invoice editing and follow-up assignment | `view` + `edit` |
| Payment registration and editing | `view` + `edit`, enforced by the invoker parent lock/validator |
| Proforma/final upload and ordinary attachment removal | `view`, plus existing file/settlement validation |
| Receipt finalization and removal of the actively linked receipt | `view` + `edit`, because the payment reference changes |
| Invoice deletion | `view` + `delete`, with the existing UI confirmation |
| Direct payment deletion | Existing `view`-based rule and its existing triggers |

The mapping above intentionally preserves established action boundaries rather than introducing a new upload permission or redesigning action grants. The UI does not offer direct payment deletion. A pending upload remains private and resumable only by its uploader; equal invoice capabilities do not allow taking over another person's incomplete request. A replacement is still a new frozen reservation/file under the existing attachment workflow, never arbitrary in-place Storage overwrite.

Invoice ID and original creator attribution are immutable for every authenticated client, including the creator and system managers. Follow-up assignment is an authorized edit for every editor. Audit records retain the actual acting `auth.uid()`.

## Bounded implementation

- Seven existing write policies change: three payment policies, three file policies and invoice DELETE
- File UPDATE and DELETE explicitly retain the pending-uploader boundary, including unfiltered writes that do not consult a SELECT policy; authorized parent cascades still perform their existing cleanup
- The existing private file lock keeps its fixed-search-path, lock-only definer design, checks section access before and after waiting, and verifies parent existence
- Only the two relationship checks inside the file guard change; uploader/request identity, byte metadata, settlement and immutable attachment fields stay enforced
- The invoice identity guard permits follow-up changes while consistently protecting invoice ID and creator attribution
- The shared `platform_can_access_invoice` function, RPC definitions, feature resolver, grants, Storage policies, audit triggers, cleanup and accounting validators are unchanged
- All SQL rollout and repeat-application tests use synthetic data. Installation does not rewrite business records
- The client uses the same operation gates regardless of invoice creator, and preserves identity/grant checks around asynchronous work

Payment INSERT/UPDATE policies remain view-gated. Their existing invoker parent lock and validator enforce invoice editing. Moving that edit condition into the payment UPDATE policy would cause an active-receipt deletion to skip reference clearing instead of raising and rolling back; the tested trigger boundary is retained.

## Verification and rollout

The new SQL suite, client tests and existing real API/Storage, independent-session concurrency and browser harnesses cover cross-owner parity and denial boundaries. Only synthetic accounts and fixtures are used. Exact executed results belong in the pull request/CI record; this document alone does not establish deployment or an authenticated production-user session.

The prior applied SQL is retained byte-identically in `supabase/migrations/20261004160141_invoice_section_visibility.sql`. The new SQL proposal is `supabase/schema-proposals/invoice-capability-parity.sql`. Production application is a separate authorized step after review and successful acceptance gates; retain the database-reported migration version when it is applied.

The corrected client is published before the production policy change. Final verification checks the released version and exact bundle bytes, expected policy/function changes, active RLS, unchanged unrelated grants/policies, and database advisors. No production invoice/payment/file writes or deletion are used as test fixtures.

Relevant platform references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

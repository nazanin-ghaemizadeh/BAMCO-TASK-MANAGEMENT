# Checked business-section capabilities: Stage 1

Status: local proposal and synthetic tests only. No deployed migration version is claimed.

## Bounded scope

The seven keys in this slice are `invoices`, `vehiclePermanent`,
`vehicleTemporary`, `parts`, `pettyCash`, `letters`, and `phonebook`.
For an allowed, unscoped grant on one of these keys, the effective ordinary
capabilities (`view`, `create`, `edit`, `delete`, `export`) equal `can_view`:
checked enables all five; unchecked disables all five, including historical
action-only rows. No grant is created by interpreting a missing section.

`manage_access` (including `manage`) and `bypass_approval` remain independent.
Resource-scoped grants keep their existing granular behavior.

### Deliberately pending

- `projects`: the existing edit bit also authorizes membership, owner changes
  and task-linked operations. Separate those protected gates before normalizing
  the ordinary project section. The shared project-access predicate is unchanged.
- `documents` / `testReports`: document-category and Storage paths also cover
  guide curation. Preserve existing guide curator authority, including category
  rename/move and alternate entry paths, before normalizing documents.
- `userGuide`: its independent grant remains outside normalization. Its section
  is read/download only; guide writes require a separately protected authority.
- Private, administrative, personal task/report and workflow sections are not
  changed. In particular, Kanban/archive/dashboard personal scope is untouched.

This proposal does not establish full application-wide section compliance.
Projects, reports and documents require their separate implementation slices.

## Exact SQL impact

`supabase/schema-proposals/business-section-capabilities.sql`:

1. Adds `private.feature_uses_section_capabilities(text)`, a pure immutable,
   security-invoker allowlist helper with an empty search path and private ACL
2. Replaces `private.feature_grant_allows(feature_access_grants,text)` to interpret
   only the seven unscoped allowed business grants using the checkbox semantics
3. Replaces `public.set_feature_access(text,jsonb)` with the same existing body
   plus normalization of the five ordinary bits on future allowlisted allow
   writes. The existing canonical grant row is updated in place

No table, column, policy, trigger, Storage policy, public function signature,
existing function ACL, feature row, user row, grant backfill or baseline data is
changed. There is no user-specific branch or identifier in the proposal.
Historical migrations and invoice sequence tests remain unchanged.

The actual resolver is deliberately not rewritten. Its precedence remains:
active actor and feature; existing system-manager override; otherwise any
matching direct user deny; then direct user allow or a matching organization-role
allow through a currently valid primary assignment to an active position.
Role denies remain ignored as before. The schema permits only direct user and
organization-role subject kinds. Historical baseline grants are ordinary rows
with source metadata, not a separate fallback. No position, unit, project or
other dormant grant source is newly activated.

The setter retains its existing handling of explicit protected bits, malformed
inputs, audit, revoked and resource rows. As before, omitted management/bypass
fields default to false on writes; this slice does not change that compatibility
behavior. Generic checkbox payload behavior for protected/pending sections must
be resolved in the corresponding slice, not by this normalizer.

## Client and refresh impact

No client source or generated bundle change is needed. Both
`effective_feature_access()` and the effective fields in
`feature_access_manage_snapshot()` already call the canonical resolver; their
returned five ordinary bits now agree. Raw management grant rows remain raw for
audit/history. `BamcoAccess` consumes these authoritative snapshots without
client-side permission inflation.

Aliases stay `lettersIncoming`/`lettersOutgoing` → `letters`, `phoneBook` →
`phonebook`, and `testReports` → `documents` (the latter still pending).

A function-only deployment does not emit a grant-row Realtime event. An
already-open client obtains new capabilities on its existing focus, reconnect,
foreground or explicit access refresh. Deployment verification must check that
refresh; do not claim instant Realtime propagation from the schema change alone.
Future editor updates continue using the existing stable grant ID and Realtime
update path. No session-specific SQL cache is introduced.

## Verification

Run `node scripts/test-business-section-capabilities-sql.mjs` or the Node wrapper
`tests/business-section-capabilities.test.cjs`.

The fixture extracts real canonical resolver, helper, setter and snapshot
definitions from their actual historical migrations. Their seven definitions
and ACLs were compared byte-for-byte with read-only live schema evidence. Only
auth context and minimal surrounding schema are synthetic.

Coverage:

- Historical partial-grant mismatch before proposal; seven keys × five actions
- Direct, baseline-source and active-primary-role grants; no per-user logic
- No grant, explicit direct deny over role allow, inactive actor/feature,
  missing actor, revoked grant and anonymous role denials
- Expired/future/non-primary assignments and inactive positions
- System-manager precedence and unknown actions
- Unchecked ordinary denial; scoped, empty and partial-null resource shapes;
  actual resource resolver and scoped action-deny behavior
- Effective and management snapshots; unchanged raw historical grant rows
- In-place allow/deny/allow setter ID, preserved scoped/revoked rows,
  protected bits, malformed-batch atomic rollback and delegated manager scope
- Exact function-only schema delta, preserved ACLs/data and repeat application
- Real database snapshots through the shipped client, aliases, grant refresh,
  account switching and administration boundaries
- Actual invoice migration sequence with the canonical resolver: unrelated
  invoice/payment edits, attachment reservation, payment/invoice deletion,
  denied users and foreign pending-upload protection

The invoice Storage fixture is synthetic. These tests do not replace real API
and Storage upload/concurrency checks, actual recipient Realtime delivery,
deployed browser verification, or the separate projects/documents/report tests.

## Publication

Only this proposal, its test runner/helper/wrapper and this QA note belong to the
slice. Do not copy the inherited empty invoice migration placeholder. Create the
eventual migration via the official CLI and reconcile its version with the
actual deployment history. Never present a local placeholder as deployed SQL.

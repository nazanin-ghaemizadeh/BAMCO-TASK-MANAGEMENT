# Enterprise relationship and authorization contract

This document records the canonical contracts introduced by
`20260922074613_enterprise_relationship_authorization_consolidation.sql` and
its follow-up policy migrations.  The message/projection follow-ups are
`20260922113000`, `20260922115500`, `20260922121000` and `20260922122000`;
they correct the same canonical RPC/RLS path rather than adding a parallel
message implementation.  This is intentionally a migration guide, not a
second runtime implementation.

## Canonical relationships

| Concern | Authority | Relationship key |
| --- | --- | --- |
| Authentication | `auth.users` | immutable user UUID |
| Current person data | `profiles` | `profiles.id = auth.users.id` |
| Login identity | `profiles.login_name` + internal Auth email | login name, never corporate email |
| Corporate contact | `profiles.email` | user UUID |
| Current avatar | `profiles.avatar_path`, `profiles.updated_at` | user UUID + revision |
| Position hierarchy | `organization_positions.parent_position_id` | position ID |
| Occupancy | `organization_position_assignments` | `user_id`, `position_id` |
| Position role | `organization_roles` | role ID |
| Tasks and workflows | operational rows | user IDs and position IDs only |

Current UI labels and avatars are hydrated from `BamcoProfiles`, which is keyed
by `user_id`.  Operational snapshots remain only for historical records where
the original identity must be retained.

## Authorization and organizational scope

`app_features` is the registry for every route and
`feature_access_grants` is the only grants model.  `BamcoNavigationCatalog`
maps a route to one feature key, and `BamcoAccess` obtains the effective
permissions from `effective_feature_access()`.

The same decision is made at three boundaries:

1. Navigation visibility and action controls call `BamcoAccess.can`.
2. Direct route navigation calls the same service and fails closed.
3. RLS and security-definer RPCs call `can_access_feature(feature, action)`.

Direct user `deny` grants override baseline and organization-role `allow`
grants.  A system manager retains protected implicit access so the final
administrative account cannot be locked out.

Reporting authority is never inferred from a role name or manager flag.  The
recursive source is the active primary assignment's position followed by
`parent_position_id`.  Shared scope functions provide self, descendants,
ancestors and direct parent.  Task visibility uses that scope; task management
uses strict descendants.  Approval routing uses only the direct parent
occupant and moves one policy-defined level at a time.

## Replaced paths

| Earlier path | Canonical replacement |
| --- | --- |
| `.manager-only` visibility and scattered `isManager()` route gates | `BamcoAccess` feature/action checks and route catalog |
| `letter_access`, `vehicle_access`, `petty_cash_access`, site assignments | migrated `feature_access_grants` plus feature RLS |
| role labels and manager flags as reporting authority | active primary assignment + `parent_position_id` recursion |
| `hasSubordinates` as approval bypass | separate task scope, current approver and explicit bypass permission |
| duplicate profile-shaped UI arrays | `BamcoProfiles` hydration by immutable user ID |
| current-name copies in message recipients and selectors | profile `display_name`/`full_name` resolution by recipient ID |
| polling and standalone request sync patch | Supabase Realtime domain invalidation with focus recovery |
| manager-only message/response controls | feature-scoped message, template, sent-message and response-tracking policies/RPCs |

Legacy access setter RPCs are retained only as migration-compatible writers to
`feature_access_grants`; the active frontend and RLS paths do not use their
legacy tables.

## Change propagation

`profiles`, organization positions/assignments, grants, tasks, workflows,
requests, notifications and chat records are published to Realtime.  The
client refreshes the affected domain rather than running an aggressive global
poll.  A profile revision invalidates avatar URLs and re-renders every current
person binding.  Organization changes refresh scope and approval authority;
grant changes refresh navigation and deny an already-open route immediately.

## Deliberate server-side projection boundary

The three message reporting views run as controlled server-side projections so
a supervisor can resolve current profile identity for their recursive scope
without being granted an unrestricted `profiles` table read.  Each view binds
the caller through `can_access_feature(...)` and
`organization_scope_user_ids(auth.uid())`; direct message table reads remain
behind RLS and the JWT-bound `bamco_can_read_message_batch(...)` helper.  This
is an intentional security-definer boundary, not a bypass or a second source
of person data.

## Security test contract

`tests/sql/enterprise-relationship-security.sql` is the transactional SQL
contract for identity separation, explicit feature revocation and controlled
profile updates.  `tests/sql/message-center-scope-security.sql` additionally
proves the message feature scope, RPC-only writes, direct RLS reads, portal
queue and reminder flow.  Both are designed to be executed against a populated
environment and roll back their fixture rows.  Frontend/source regressions are
covered by `tests/enterprise-relationship-consolidation.test.cjs` and the
workflow, organization, profile and live-sync test suites.

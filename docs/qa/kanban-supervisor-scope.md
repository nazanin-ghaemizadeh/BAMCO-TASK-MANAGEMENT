# Scoped Kanban intake and assignment

## Outcome

Active primary organizational `head` and `manager` positions can see and assign
registered, unassigned Kanban tasks in their organizational scope. This is not
limited to tasks that already have an owner and does not require the profile-level
system-administrator role or an ordinary Kanban create/edit grant.

The active position tree is the authority. Existing nonarchived descendant-owned
tasks remain editable. Ownerless intake must have catalog kind `registered`, a
real in-scope creator, and no deleted-owner/historical repair markers. The safe
creator set is the actor plus active strict descendants of qualifying roots.
For a chief, it also includes the active primary occupant of their immediate
active manager parent position. This shares that manager’s registered intake
with both sibling chiefs, without exposing one sibling’s own intake to the other.
After assignment, the other chief loses the shared-intake path and cannot claim
or reassign the row outside their own branch. There is no whole-company intake feed. Out-of-branch creators and rows without a
safe organizational anchor remain outside this additional entitlement.

The exact actor-scoped snapshot carries `kanban_supervision`,
`kanban_supervised_owner_ids`, `kanban_assignment`, and
`kanban_intake_creator_ids`. Client assignment is disabled until the server
explicitly advertises the new capability. Old deployed snapshots remain
compatible and do not unlock ownership changes prematurely.

## Assignment flow and safety

Open a registered row, change its status to an active or waiting status, and select
an active subordinate. The shared status catalog determines required dates. The
registered status itself intentionally has no owner; the ordinary lifecycle
validation still applies.

First assignment and reassignment can target only active strict descendants of the
actor's qualifying head/manager roots. An assignment uses the task's current
`row_version` in its PATCH filter. A stale form or competing claim cannot overwrite
a newer task version; zero affected rows remain an error and keep the form open.
After assignment, visibility and editability follow the new owner's branch.

The added path preserves creator, source, identifiers and system fields. It does
not grant create, delete, export, archive, restore or approval bypass. Completion
cannot implicitly archive a supervision-only row. Deleted-owner repair remains
under its prior authority. Existing explicit permissions and project activity
approval/access guards are preserved. An explicit user Kanban deny wins.
Inactive actors, feature, roles, positions, dated/expired/nonprimary assignments,
inactive descendants, and unqualified secondary roots do not gain authority.

## Verification

- `node scripts/test-kanban-supervisor-scope-sql.mjs` exercises real isolated
  PostgreSQL RLS and canonical lifecycle/project/hierarchy triggers with synthetic
  identities. It covers intake visibility, assignment, reload/persistence,
  reassignment, both sibling-chief claim directions, parent assignment invalidation,
  stale-claim rejection and out-of-scope/protected-field denial.
- `node --test --test-force-exit tests/kanban-supervisor-scope.test.cjs` covers both
  organizational roles without ordinary admin/edit grants, destination controls,
  save/reload, owner/status guards, revoked/mismatched/failed snapshots, and prior
  snapshot compatibility. Dashboard data retains its prior authority.
- `python tests/browser/check_kanban_supervision.py` covers real desktop/mobile
  Chromium controls, registered-to-assigned flow, full page reload, stale saves,
  out-of-scope visibility, and revocation. All non-loopback traffic is blocked.
- Full regression, bundle reproducibility and exact-head CI remain release gates.

The local managed runtime blocks Chromium Unix sockets, including under reviewed
escalation; browser acceptance is performed in the existing isolated GitHub CI.
This is never a production-user impersonation or fake production-data test.

## Database publication

The SQL file remains a proposal until the reviewed access change is explicitly
activated. The old owned-row-only proposal is superseded, not an alternate
migration to apply. No business task rows or feature grant rows are modified by
this proposal. Deploy and verify the compatible client first, then activate the
reviewed SQL and refresh access. Record the actual migration version and read-only
live verification when applied; source publication alone is not user-visible
functional completion.

# Bounded Kanban supervision

## Requested outcome and scope

Active primary organizational `head` and `manager` positions can view and edit
existing, nonarchived Kanban tasks owned by active strict descendants of their
own qualifying position tree. This uses the canonical tree and role keys; it is
not a name-specific exception or the profile-level system-manager role.

The added capability is separate from ordinary feature grants. Effective access
snapshots carry `kanban_supervision` and the exact `kanban_supervised_owner_ids`.
The original grant resolver and grants are untouched. A current direct Kanban
deny wins (including legacy untyped grants with a nonnull resource ID).
Revoking an ordinary allow does not cancel the independent organizational
entitlement; remove the active qualifying assignment or apply an explicit deny.
Inactive actor/feature/position/role, expired or non-primary assignments and
inactive descendants are excluded. Dated overlapping assignments cannot borrow
supervisory power for a non-head/non-manager second root.

## Mutation boundaries

The new UPDATE path permits title, description, status changes that retain the
owner and nonarchived state, priority, start/due/done dates, reminder days,
manager notes, last-update note and change reason, subject to existing validation. Owner, creator, source, archive fields,
identifiers and other system fields stay unchanged. Existing task lifecycle
triggers still run; RLS WITH CHECK rejects any resulting owner clearing or
completion/archive transition. The UI locks ownership and disallows those
status transitions for supervision-only editors.

No new create, delete, export, reassignment, restore or approval bypass is
introduced. Existing explicit authority, including an organizational manager's
own-task path and previously allowed archive operations, remains unchanged.
Ownerless intake and historic/orphan tasks retain the existing access model.
The original project-binding guard still rejects pending activities and requires
separate project edit/access authority. The ordinary project authority is not
rewritten by this patch.

Two additive task policies use an authenticated, current-actor wrapper with no
caller-supplied actor argument. Private helpers have EXECUTE revoked from public,
anon and authenticated. Snapshot and scoped directory helpers retain the existing
SECURITY DEFINER/empty-search-path convention and expose only the current actor's
scope. No business rows, grant rows, user profiles or approval records change.

## Client and compatibility

The capability refreshes through the existing authoritative access snapshot,
realtime invalidation and focus recovery. Failed responses, mismatched profile
identity, inactive accounts and logout fail closed. Stale directory data cannot
restore a revoked supervision capability. Ordinary permission checks remain
available as `canExplicit`; orphan transfer and ownership/archive actions use
the original permission path. Dashboard calculations retain the prior task-feed
authority rather than consuming newly visible Kanban-only rows.

## Verification

- `node scripts/test-kanban-supervisor-scope-sql.mjs`: isolated PostgreSQL tests
  with canonical permission functions, SELECT/UPDATE RLS, hierarchy, lifecycle
  and project-binding triggers. Only out-of-scope approval/application hooks are
  stubbed fail-closed. No production data or identities are used
- `node --test --test-force-exit tests/kanban-supervisor-scope.test.cjs`: shipped
  bundle tests for head/manager editing, owner lock, restricted statuses,
  dashboard calculation isolation, revocation and session failure behavior
- `python tests/browser/check_kanban_supervision.py`: desktop/mobile Chromium,
  real edit controls, save payload and revocation, all non-loopback traffic blocked
- Full aggregate regression remains the normal release gate

## Publication order

This source is initially a proposal, not evidence of deployed SQL. Apply only
after the bounded scope/security review and record the actual Supabase migration
version. Deploy the snapshot/SQL before the compatible client bundle. Old clients
ignore the additive capability; new clients safely ignore it when absent.
No production fake writes, deletion probes or user impersonation are needed.

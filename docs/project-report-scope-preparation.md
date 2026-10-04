# Project metadata and report section scope

Local preparation only. Neither SQL proposal has been applied to a remote database.

## Project slice

- `projects` remains excluded from the shared five-action normalizer
- A dedicated ordinary-operation predicate resolves checked project section access, active identity, active feature, grants and denial through the existing resolver
- `list_project_workspace` returns all ordinary project/WBS/dependency metadata through a separate read-only API. Existing direct SELECT policies stay unchanged
- `save_project_metadata` edits only title, description, status, priority and planned dates across creators. It creates self-owned projects; assigning another owner continues through the existing raw-authority path
- `mutate_project_node` handles phase/milestone creation, edit and deletion. Identity, owner, task bindings and approval state are not accepted payload fields. Existing same-project parent, cycle, date, progress and pending-request guards remain active
- `mutate_project_dependency` validates both endpoints and the existing dependency against the explicit project. Missing rows fail. The dependency trigger now serializes graph writes per project, checks same-project endpoints and immutable identity, and excludes the replaced edge when validating cycles
- Project deletion remains entirely on the current approval workflow, including empty projects. Deleting phase/milestone subtrees containing activities/tasks remains denied
- Member changes, owner transfers, activity/task operations, approval decisions and bypass permissions retain the existing raw action and organizational rules

### Access checkbox boundary

The canonical setter has one projects-only branch. It preserves protected raw create/edit/delete/export/manage/bypass bits on an existing direct allow row, and uses false for a new row. Unmarked legacy deny rows contain denial flags and therefore contribute no direct protected rights. Deny rows written by this setter carry a server-generated preservation marker so an off/on toggle can safely retain the earlier direct allow bits. View/effect still follows the checkbox. Role grants are never copied or rewritten: the current resolver combines direct and role allows. Unchecking applies the existing whole-feature deny. Rechecking retains existing direct bits and recalculates current role authority. No existing grants are migrated or backfilled.

## Report slice

- `task_timeline_report_feed` requires only `taskTimeline.view`; returns all active tasks with an explicit read-only field list
- `performance_report_feed` requires only `performanceReport.view`; returns status/date/task-metric fields across active and archived tasks, minimal display names and daily definition counts
- Definition counts preserve request/direct-task deduplication and the `web`/`project` source restriction. The report API returns aggregate counts, never approval request IDs, payloads, notes, decisions or routing
- Neither feed depends on Kanban or approvals access. Task SELECT policy and workflow snapshot functions are unchanged
- Separate feature/account/grant-scoped memory caches never assign `state.tasks`, `state.requests`, `state.requestHistory`, `state.definitionRequests` or the profile directory
- Timeline details are read-only in their own dialog; they no longer navigate into Kanban
- Cache invalidation rejects old account, revoked access, superseded request and malformed payload responses. Report data and open details clear on access changes. Export rechecks identity/access after loading its export library

## Deployment coupling

These clients require the Stage1 seven-key capability proposal and then their new API proposals to be applied in order. Stage2 preserves PR135’s exact setter normalization and adds only its protected project branch. Canonical migration filenames must use the actual server-reported applied versions; local empty CLI placeholders are not publication inputs. Do not deploy clients alone: they intentionally fail closed without the new endpoints. Keep this work separate from invoice delivery. Combine any future edits to `set_feature_access` with its live current body, rather than overwriting another independently prepared branch.

## Verification boundaries

Synthetic PGlite tests exercise real PostgreSQL functions, constraints, triggers and RLS in an isolated database. External organization/approval routing is stubbed explicitly, while selected current protected function bodies are included as schema-only fixtures. This is not a complete Supabase schema replay or a concurrent multi-connection test. No production impersonation, live writes or real records were used. Live advisor/rehearsal and browser visual QA remain release prerequisites.


## Local verification record

- Frozen implementation regression: 883 tests, 882 passed, one existing anonymous rendered-route skip, zero failures
- Project metadata/workflow/protected-control and independent report cache/UI tests passed
- Both isolated SQL runners passed, including anonymous, inactive and revoked access
- Independent source-derived full-trigger rehearsal passed: ordinary project writes leave canonical tasks unchanged and keep actual-actor audit attribution
- The combined PR135 setter retains the exact seven-key normalization while preserving existing project protected action bits, role grants and explicit denies
- Static JavaScript syntax and generated bundle consistency passed
- Native independent-session PostgreSQL and visual browser checks remain separate CI acceptance gates

The task SELECT expression and protected function fixtures are derived from existing repository migrations. Supporting organization and approval-proof dependencies are explicitly stubbed. No live records or private audit snapshots are publication inputs. A synthetic legacy deny row with true denial flags proves that enabling a section cannot reinterpret those flags as protected allow rights.

Queued mutations recheck project permission and profile activity after the project lock, and node/dependency paths recheck again after their target-row locks. Native tests must observe actual lock barriers before accepting the concurrency claims.

The combined project setter is derived from PR135 proposal SHA256 5d036e92170dda0ba5aa429d4726882bd1c377a4d3cd74b35aa8cd4fb03364c7. Synthetic tests verify all seven business keys retain checked/unchecked future-write normalization and deny behavior alongside project-specific direct/role/legacy-deny preservation. A byte-equivalence test strips only the project insertion and marker before comparing with that Stage1 setter.

### Protected control hints

The project workspace now carries actor-specific protected capability hints calculated from the unchanged legacy project relationship, raw project/Kanban actions and organizational direct-management helper. Project deletion, activity choice/edit/delete, owner transfer choices and owner lock explanations use those hints. Ordinary phase/milestone controls remain available. Original protected RPCs and triggers still reauthorize every action; client hints never grant authority.

Source-derived checks confirm that node forms have no independent owner control, matching the previous UI and identity trigger. Current-project-owner labels no longer misdescribe an authority lock as a hierarchy or existing-activity lock.

Current protected-control SQL tests, positive legacy workflow/UI tests, readonly detail tests and the full project form journey pass.

The canonical active-subject-feature unique index prevents duplicate active unscoped grants. An independent deliberately index-free diagnostic is outside that schema invariant and is not a reason to broaden or rewrite protected authority.

Independent follow-up review closed the protected-control issue on project proposal SHA256 0a5a1def7152ce3959dcd15a875e9dbc55173e183b833f91225b6d156f489045 and client SHA256 4edf45709e564da5ee8ff7eb1a3518a80e0e9d7daa30925de364399e943f7fde. It independently passed the original UI reproduction, 15 focused tests, the capability SQL runner and source-derived full-trigger/report rehearsal. No protected-authority predicate mismatch was found. The exact-final frozen implementation aggregate subsequently passed.

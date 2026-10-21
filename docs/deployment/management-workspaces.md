# Independent management workspaces

Product engineering remains in `public` / `private`. Process and Quality use
`bamco_process` / `bamco_process_private` and `bamco_quality` /
`bamco_quality_private`. Their business tables, sequences, grants, workflows,
files and people are independent. Existing business data was not copied.
The existing active system administrator is present in all three profiles tables.

Select a management card, sign in with the administrator account, then use
Management users → People, Access, and Organization to configure that environment.
The sidebar's management switch signs out and reloads before another selection;
module state and private cache keys cannot carry business content across scopes.

Three migrations provision the namespaces, independent serial ownership,
realtime publication, notification infrastructure, and membership boundaries.
PostgREST checks active membership before REST/RPC calls. Restrictive RLS also
protects direct table/realtime and Storage access. Existing feature/organization
checks remain in force. The two new environments begin with no ordinary users
and no individual feature grants. The administrator configures these explicitly.

Edge variants use a fixed schema compiled into each deployment, not a header
chosen by a caller. `supabase/workspace-edge-sources` contains the verified live
source snapshots used for those variants. Run
`node scripts/build-workspace-edge-functions.mjs` to prepare deployment packages.
Each package contains the source plus `_shared/workspace-runtime.ts`; deploy its
listed entrypoint and verify_jwt setting. Product Edge functions were not changed.
Auth remains shared; service-controlled app_metadata routes newly created users
only into their management's profiles table. Shared identities cannot be deleted
by a departmental administrator through the departmental account endpoint.

Future database fixes must be applied to each affected namespace, with schema
references rewritten through `private.workspace_ddl` and reviewed before running.
Updating the product schema alone does not change either isolated environment.
Future Edge fixes must update the source snapshots and redeploy affected variants.

Validation: isolated PostgreSQL tests cover tables, functions, views, sequences,
FKs, membership, trusted account provisioning and access management. Runtime tests
cover fixed routing, file buckets, external-host preservation and membership.
Both production environments passed rolled-back administrator task creation and
permission checks. Existing data and requests remained unchanged by those probes.

Storage guard correction: `workspace_storage_guard_scope` scopes copied
RESTRICTIVE policies with `bucket_id not like '<workspace>-%' OR <guard>`.
Permissive grants retain `bucket_id like '<workspace>-%' AND <grant>`.
Restrictive policies combine with AND globally on `storage.objects`; a positive
namespace condition would otherwise block images in every other workspace.
`tests/storage/workspace-guards.sql` verifies existing avatar/sticker visibility,
unrelated bucket access, protected write denial, and nonmember isolation.

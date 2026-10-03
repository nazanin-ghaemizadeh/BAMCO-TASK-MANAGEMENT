# Staged invoice attachment cleanup

This function and `supabase/schema-proposals/invoice-attachments.sql` are staged code only. Nothing here has been deployed or scheduled.

## Activation checklist

1. Generate a reviewed migration from the proposal using the project's normal Supabase CLI workflow. Apply only after approval. It configures the private `invoices-private` bucket (6 MiB, PDF/JPEG/PNG/WebP), request ledger, attachment RPCs and Storage policies.
2. Run `node --test tests/invoice-attachments-sql.test.cjs tests/invoice-file-cleanup-edge.test.cjs` and the real PostgreSQL multi-session acceptance tests. PGlite validates SQL/RLS in isolation, not the hosted Storage API.
3. Verify actual Storage multipart upload, metadata (`metadata.size`, `metadata.mimetype`, `user_metadata.sha256`), overwrite retries, signed downloads, and upload-versus-delete behavior in an isolated Supabase environment.
4. Deploy `invoice-file-cleanup` with the existing server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment. The worker permits only a POST whose Authorization bearer matches that server key. No browser calls or public credentials are supported.
5. Before enabling attachment deletion in production, configure an authorized server-side schedule to POST to this function at least once per minute. Keep the bearer key in the scheduler's secret store. Confirm a test deletion is queued, API-removed, acknowledged, and later eligible for reconciliation. Monitor queue age and worker `failed`/`deferred` counts.

## Lifecycle and safety

- Metadata is reserved before bytes are uploaded. Interrupted uploads retain a pending retry handle.
- File request IDs are retained after deletion, so a stale retry cannot recreate a retired storage path.
- Authorized direct or cascading file deletion writes a private cleanup tombstone. The only new privileged writer is a trigger that copies the deleted row's identity; it accepts no arbitrary caller arguments.
- Cleanup waits five minutes after deletion. It processes at most 20 records per invocation, with at most four requests in flight and a 45-second work-start budget.
- The service-only batch RPC excludes any path still referenced by an attachment row. The worker accepts only the fixed bucket and generated path structure, calls Storage's delete API, then acknowledges the tombstone. It never deletes rows from `storage.objects` directly.
- Successful tombstones remain, and become eligible again after one hour. This ongoing reconciliation catches uploads that finish after a delete. Failed jobs are not acknowledged. Batch claims use a one-minute retry delay and least-recently-attempted ordering, so repeated failures cannot permanently block newer jobs.
- The Storage API and Postgres cannot provide one transaction for object bytes and metadata. The reservation locks, five-minute grace, request tombstones and ongoing reconciliation make cleanup eventually consistent. Bytes can temporarily remain after metadata deletion, and cleanup depends on the deployed schedule running successfully.
- Client SHA-256 is an immutable retry identity, not trusted content validation. Size/MIME are checked against Storage metadata, but a trusted server-side download-and-hash/scanning pipeline would be needed to authenticate file contents or inspect PDFs.
- Legacy attachment rows retain their paths and a null managed bucket marker. No legacy bucket is guessed or migrated.
- Existing invoice payment validation requires invoice edit access when it takes an invoker parent lock. This inherited restriction is preserved. View-scoped file access is preserved using a narrowly authorized lock-only helper, without granting invoice edit rights.

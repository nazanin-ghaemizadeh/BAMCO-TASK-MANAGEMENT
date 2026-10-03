# Staged invoice file upload

Source only: this function has not been deployed and no production policy has been changed.

## Contract

POST multipart/form-data with exactly `file_id` (the reservation's decimal-string ID) and `file` (the original bytes and filename), authenticated by the user's existing bearer JWT. The response is `{ "file": <ready invoice_file row> }`; all IDs and numeric sizes remain strings.

1. Authenticate the caller through Auth and read `get_invoice_file_upload` with that caller's JWT. This SECURITY INVOKER RPC preserves the current invoice scope and requires the reservation's uploader.
2. Verify canonical server-generated path, original filename, MIME, size, and SHA-256 of the actual request bytes against the frozen reservation. Reject client-supplied paths, bucket names, upsert flags and extra fields.
3. Upload through the existing server service credential with **upsert disabled**. The new private bucket denies every direct anonymous/authenticated INSERT/UPDATE, including raw upsert and metadata-only preflight.
4. If bytes were already recorded or the upload response was lost/duplicate, download the fixed object server-side and compare actual MIME, size and SHA-256 before continuing. Never overwrite or delete a conflicting object.
5. Call `finalize_invoice_file` with the caller's JWT. Its current authorization, payment linkage, exact stored metadata and final-settlement checks still apply. An error leaves the reservation pending for a bounded, idempotent retry.

## Activation

- Review/apply the staged invoice attachment SQL through the normal approved migration process first.
- Deploy this endpoint with the existing `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server environment; never expose the service credential to the frontend.
- Verify the real isolated Storage/Edge integration, including concurrent same-file retries, direct authenticated upsert denial, revoked caller authorization, mismatched bytes, and deletion while an upload is in progress.
- Deploy and schedule the staged `invoice-file-cleanup` worker before enabling the feature. Storage bytes are not transactional with financial metadata; deleted reservations retain cleanup tombstones for delayed-upload reconciliation.

## Verification and limits

`node --test tests/invoice-file-upload-edge.test.cjs tests/invoice-attachments.test.cjs tests/invoice-attachments-sql.test.cjs`

The protocol is checked against CLI 2.119.0's Storage v1.79.28 uploader. Its final object commit runs as a privileged service role, so client-facing RLS alone cannot prevent an earlier admitted upsert from replacing finalized bytes. The enforced server endpoint plus denial of direct bucket writes removes that route.

Hash equality protects retry identity and verifies that stored bytes match the selected file. It is not antivirus scanning or proof that a PDF/image is safe to open. No client metadata is used to grant invoice permissions.

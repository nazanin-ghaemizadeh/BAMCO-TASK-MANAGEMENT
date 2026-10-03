-- STAGED PROPOSAL ONLY. Review and apply separately before publishing the UI.
-- Requires 20261003114607_invoice_attachment_upload_gate.sql.
-- No data/policy/Storage changes. Existing invoice-file RLS, receipt linkage,
-- request retirement and cleanup tombstone triggers remain authoritative.
-- This removes the selected attachment's database record, not Storage bytes.
-- Existing private cleanup outbox entries/tombstones are retained. No automatic
-- byte purge is scheduled by this proposal or implied by the deletion result.
BEGIN;

-- Primary keys anchor upload request and cleanup identity. The existing guard
-- already freezes the other attachment fields; close only this missing ID check.
CREATE OR REPLACE FUNCTION private.guard_invoice_file_primary_key() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id THEN
  RAISE EXCEPTION 'attachment primary key is immutable' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_invoice_file_primary_key() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS invoice_files_immutable_primary_key ON public.invoice_files;
CREATE TRIGGER invoice_files_immutable_primary_key BEFORE UPDATE OF id ON public.invoice_files
 FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_file_primary_key();

CREATE OR REPLACE FUNCTION public.delete_invoice_file(
 p_file_id bigint, p_invoice_id bigint, p_payment_id bigint,
 p_file_type text, p_file_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.invoice_files; deleted_id bigint;
BEGIN
 IF auth.uid() IS NULL OR p_file_id IS NULL OR p_file_id<1 OR p_invoice_id IS NULL OR p_invoice_id<1
  OR p_file_request_id IS NULL OR p_file_type IS NULL OR p_file_type NOT IN('proforma','receipt','final')
  OR (p_file_type='receipt') IS DISTINCT FROM (p_payment_id IS NOT NULL)
 THEN RAISE EXCEPTION 'invalid attachment deletion request' USING ERRCODE='22023'; END IF;

 -- Matches the established finance/file lock order without requiring invoice
 -- edit privileges for viewers already authorized by invoice_files DELETE RLS.
 -- The existing helper rechecks auth and invoice ownership after taking the lock.
 PERFORM private.lock_invoice_for_file(p_invoice_id);
 SELECT * INTO r FROM public.invoice_files WHERE id=p_file_id;
 IF NOT FOUND THEN
  -- A lost success response can be retried safely. This says only that the row
  -- is absent from this caller's authorized scope, not that bytes were purged.
  RETURN jsonb_build_object('id',p_file_id::text,'invoice_id',p_invoice_id::text,
   'payment_id',p_payment_id::text,'file_type',p_file_type,'deleted',false);
 END IF;
 IF r.client_request_id IS NULL OR ROW(r.invoice_id,r.payment_id,r.file_type,r.client_request_id)
  IS DISTINCT FROM ROW(p_invoice_id,p_payment_id,p_file_type,p_file_request_id)
 THEN RAISE EXCEPTION 'attachment identity does not match deletion request' USING ERRCODE='22023'; END IF;

 -- Never take a file lock for a different parent based on caller-supplied IDs.
 -- The DELETE obtains its row lock only after the immutable identity matches.

 DELETE FROM public.invoice_files WHERE id=r.id AND invoice_id=p_invoice_id
  AND payment_id IS NOT DISTINCT FROM p_payment_id AND file_type=p_file_type
  AND client_request_id=p_file_request_id RETURNING id INTO deleted_id;
 IF deleted_id IS NULL THEN RAISE EXCEPTION 'attachment deletion access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',r.id::text,'invoice_id',r.invoice_id::text,
  'payment_id',r.payment_id::text,'file_type',r.file_type,'deleted',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_invoice_file(bigint,bigint,bigint,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice_file(bigint,bigint,bigint,text,uuid) TO authenticated;

COMMIT;

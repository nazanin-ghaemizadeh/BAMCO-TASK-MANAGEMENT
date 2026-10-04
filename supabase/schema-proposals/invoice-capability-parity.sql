-- Invoice capability parity. Apply after invoice_section_visibility.
-- Reviewed, bounded proposal: the same invoice feature grants authorize the
-- same actions on every invoice, regardless of creator/follow-up assignment.
-- Does not change feature grants, shared platform_can_access_invoice, RPCs,
-- accounting validation/locks, request replay identity, pending-uploader
-- privacy, Storage write guards, cleanup or audit triggers, or business rows.
BEGIN;

-- Row-independent authorization is evaluated once per statement. The existing
-- payment validator still takes an invoker parent FOR UPDATE lock and requires
-- invoice edit permission for payment INSERT/UPDATE and active receipt writes.
-- Keep this check there: filtering payment UPDATE by edit instead would let an
-- active receipt DELETE silently skip reference clearing rather than abort.
ALTER POLICY invoice_payments_scoped_insert ON public.invoice_payments
 WITH CHECK((SELECT private.invoice_section_can_read()));
ALTER POLICY invoice_payments_scoped_update ON public.invoice_payments
 USING((SELECT private.invoice_section_can_read()))
 WITH CHECK((SELECT private.invoice_section_can_read()));
ALTER POLICY invoice_payments_scoped_delete ON public.invoice_payments
 USING((SELECT private.invoice_section_can_read()));
ALTER POLICY invoice_files_scoped_insert ON public.invoice_files
 WITH CHECK((SELECT private.invoice_section_can_read()));
-- SELECT's restrictive pending-visibility policy is not applied to an
-- unfiltered UPDATE/DELETE that does not read columns. Repeat it explicitly
-- on these mutations so invisible foreign reservations cannot be erased or
-- churned. FK-authorized invoice/payment cascades retain cleanup behavior.
ALTER POLICY invoice_files_scoped_update ON public.invoice_files
 USING((SELECT private.invoice_section_can_read()) AND
  (client_request_id IS NULL OR upload_state='ready' OR uploaded_by=(SELECT auth.uid())))
 WITH CHECK((SELECT private.invoice_section_can_read()) AND
  (client_request_id IS NULL OR upload_state='ready' OR uploaded_by=(SELECT auth.uid())));
ALTER POLICY invoice_files_scoped_delete ON public.invoice_files
 USING((SELECT private.invoice_section_can_read()) AND
  (client_request_id IS NULL OR upload_state='ready' OR uploaded_by=(SELECT auth.uid())));
ALTER POLICY invoices_feature_delete ON public.invoices
 USING((SELECT private.invoice_section_can_read()) AND (SELECT public.can_access_feature('invoices','delete')));

-- Follow-up assignment is an ordinary authorized invoice edit for every
-- editor. Primary key and original creator remain immutable audit identity,
-- including for the original creator and system managers acting as clients.
CREATE OR REPLACE FUNCTION private.guard_invoice_section_edit_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF ROW(NEW.id,NEW.created_by) IS DISTINCT FROM ROW(OLD.id,OLD.created_by)
  AND auth.uid() IS NOT NULL
 THEN RAISE EXCEPTION 'invoice identity and creator are immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_invoice_section_edit_identity() FROM PUBLIC,anon,authenticated;

-- Preserve the existing lock-only definer. A view-authorized file operation
-- must not gain invoice edit rights, and the invoker FOR UPDATE alternative
-- would wrongly require them. This returns no row data and performs no writes.
-- The explicit lookup both locks and proves parent existence; authorization
-- is rechecked after the wait. No ownership-based or recursive RLS helper.
CREATE OR REPLACE FUNCTION private.lock_invoice_for_file(p_invoice_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.invoice_section_can_read() THEN RAISE EXCEPTION 'invoice lock access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invoice no longer exists' USING ERRCODE='42501'; END IF;
 IF NOT private.invoice_section_can_read() THEN RAISE EXCEPTION 'invoice lock access denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.lock_invoice_for_file(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.lock_invoice_for_file(bigint) TO authenticated;

-- Only the two invoice-ownership checks change in this guard. Attachment
-- uploader/request identity, file validation, exact Storage-object verification,
-- receipt linkage, and settlement/snapshot checks remain unchanged.
CREATE OR REPLACE FUNCTION private.guard_invoice_file() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.invoice_id,NEW.payment_id,NEW.file_type,NEW.file_name,NEW.storage_path,NEW.uploaded_by,NEW.created_at,NEW.client_request_id,NEW.content_type,NEW.size_bytes,NEW.sha256)
   IS DISTINCT FROM ROW(OLD.invoice_id,OLD.payment_id,OLD.file_type,OLD.file_name,OLD.storage_path,OLD.uploaded_by,OLD.created_at,OLD.client_request_id,OLD.content_type,OLD.size_bytes,OLD.sha256)
  THEN RAISE EXCEPTION 'attachment identity is immutable' USING ERRCODE='22023'; END IF;
  IF NEW.upload_state=OLD.upload_state AND NEW.settlement_snapshot IS NOT DISTINCT FROM OLD.settlement_snapshot THEN RETURN NEW; END IF;
  IF OLD.client_request_id IS NULL OR OLD.upload_state<>'pending' OR NEW.upload_state<>'ready' OR OLD.uploaded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'invalid attachment transition' USING ERRCODE='42501'; END IF;
  IF NOT private.invoice_section_can_read() THEN RAISE EXCEPTION 'invoice access denied' USING ERRCODE='42501'; END IF;
  IF NEW.file_type='final' THEN
   PERFORM private.lock_invoice_for_file(NEW.invoice_id);
   IF NOT private.invoice_is_settled(NEW.invoice_id) THEN RAISE EXCEPTION 'final invoice requires full settlement and no unpaid stages' USING ERRCODE='22023'; END IF;
   NEW.settlement_snapshot:=private.invoice_settlement_snapshot(NEW.invoice_id);
  ELSE NEW.settlement_snapshot:=NULL; END IF;
  IF NOT private.invoice_file_object_matches(NEW)
  THEN RAISE EXCEPTION 'uploaded object metadata does not match reservation' USING ERRCODE='22023'; END IF;
  RETURN NEW;
 END IF;
 IF auth.uid() IS NULL OR NEW.client_request_id IS NULL OR NEW.uploaded_by IS DISTINCT FROM auth.uid() OR NEW.upload_state<>'pending'
  OR NEW.file_type NOT IN('proforma','receipt','final') OR NEW.content_type NOT IN('application/pdf','image/jpeg','image/png','image/webp')
  OR NEW.size_bytes IS NULL OR NEW.size_bytes<1 OR NEW.size_bytes>6291456 OR NEW.sha256 IS NULL OR NEW.sha256 !~ '^[0-9a-f]{64}$'
  OR nullif(btrim(NEW.file_name),'') IS NULL OR length(NEW.file_name)>255 OR NEW.file_name ~ '[[:cntrl:]/\\]' OR NEW.settlement_snapshot IS NOT NULL
  OR NOT (CASE NEW.content_type WHEN 'application/pdf' THEN btrim(NEW.file_name) ~* '[.]pdf$' WHEN 'image/jpeg' THEN btrim(NEW.file_name) ~* '[.](jpg|jpeg)$' WHEN 'image/png' THEN btrim(NEW.file_name) ~* '[.]png$' WHEN 'image/webp' THEN btrim(NEW.file_name) ~* '[.]webp$' ELSE false END)
  OR (NEW.file_type='receipt') IS DISTINCT FROM (NEW.payment_id IS NOT NULL)
  OR NEW.storage_path IS DISTINCT FROM private.invoice_file_path(NEW.invoice_id,NEW.payment_id,NEW.file_type,NEW.client_request_id,NEW.content_type)
 THEN RAISE EXCEPTION 'invalid attachment reservation' USING ERRCODE='22023'; END IF;
 IF NOT private.invoice_section_can_read() THEN RAISE EXCEPTION 'invoice access denied' USING ERRCODE='42501'; END IF;
 IF NEW.file_type='final' THEN
  PERFORM private.lock_invoice_for_file(NEW.invoice_id);
  IF NOT private.invoice_is_settled(NEW.invoice_id) THEN RAISE EXCEPTION 'final invoice requires full settlement and no unpaid stages' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;

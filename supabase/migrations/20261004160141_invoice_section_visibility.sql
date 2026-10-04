-- Invoice section access contract. Database rollout is separate from client release.
-- Requires the existing invoice attachment upload gate and file controls.
-- Section view/edit apply to all invoices. Payment/file mutation, invoice
-- create/delete, pending-uploader privacy and Storage write scope are retained.
-- Generate the eventual migration with the Supabase CLI only after approval.
BEGIN;

-- Every row in this section shares one read gate. Child invoice_id foreign
-- keys require their parent to exist; there is no personal row predicate.
-- A scalar SELECT lets PostgreSQL compute this gate once per policy/query,
-- rather than resolving feature grants or looking up parents for every row.
-- Do not widen platform_can_access_invoice: write paths still depend on it.
CREATE OR REPLACE FUNCTION private.invoice_section_can_read()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL
  AND (SELECT public.can_access_feature('invoices','view'));
$$;
REVOKE ALL ON FUNCTION private.invoice_section_can_read() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.invoice_section_can_read() TO authenticated;

ALTER POLICY invoices_feature_read ON public.invoices
 USING((SELECT private.invoice_section_can_read()));
ALTER POLICY invoice_payments_scoped_read ON public.invoice_payments
 USING((SELECT private.invoice_section_can_read()));
ALTER POLICY invoice_files_scoped_read ON public.invoice_files
 USING((SELECT private.invoice_section_can_read()));
ALTER POLICY invoices_feature_update ON public.invoices
 USING((SELECT private.invoice_section_can_read()) AND (SELECT public.can_access_feature('invoices','edit')))
 WITH CHECK((SELECT private.invoice_section_can_read()) AND (SELECT public.can_access_feature('invoices','edit')));

-- Newly eligible section editors must not turn an ordinary invoice edit into
-- a grant of the separate, legacy owner-scoped delete/payment/upload rights.
-- Legacy related editors/managers retain their existing ownership controls.
CREATE OR REPLACE FUNCTION private.guard_invoice_section_edit_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF ROW(NEW.id,NEW.created_by,NEW.follow_up_owner_id)
    IS DISTINCT FROM ROW(OLD.id,OLD.created_by,OLD.follow_up_owner_id)
  AND auth.uid() IS NOT NULL
  AND NOT public.platform_can_access_invoice(OLD.id)
 THEN RAISE EXCEPTION 'section edit cannot change invoice identity or ownership' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_invoice_section_edit_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS invoices_guard_section_edit_identity ON public.invoices;
CREATE TRIGGER invoices_guard_section_edit_identity
 BEFORE UPDATE OF id,created_by,follow_up_owner_id ON public.invoices
 FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_section_edit_identity();

-- Metadata visibility and authenticated Storage downloads must use the same
-- read scope. Pending objects remain private to their uploader. Storage INSERT,
-- UPDATE, DELETE guards and all upload authorization helpers are untouched.
CREATE OR REPLACE FUNCTION private.invoice_storage_read(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.invoice_files f
  WHERE f.storage_path=p_name AND f.client_request_id IS NOT NULL
   -- invoice_files RLS supplies the section read gate.
   AND (f.upload_state='ready' OR f.uploaded_by=auth.uid()));
$$;
REVOKE ALL ON FUNCTION private.invoice_storage_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.invoice_storage_read(text) TO authenticated;

-- Total changes already maintain stored payment percentages. The old invoker
-- AFTER trigger silently skips foreign payments under the preserved payment
-- UPDATE policies. A trigger-only definer performs only this derived update.
-- It takes no caller IDs or payload, is bound to the authorized invoice UPDATE,
-- keeps existing payment validation/status/audit triggers active, and exposes
-- no callable payment mutation endpoint. The invoker BEFORE trigger stays as-is.
CREATE OR REPLACE FUNCTION private.refresh_invoice_section_payment_percent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'invoices' OR TG_OP<>'UPDATE' OR TG_WHEN<>'AFTER' THEN
  RAISE EXCEPTION 'invalid invoice percentage trigger context' USING ERRCODE='42501';
 END IF;
 IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
  UPDATE public.invoice_payments
   SET percent_of_total=CASE WHEN NEW.total_amount>0 THEN amount/NEW.total_amount*100 ELSE NULL END
   WHERE invoice_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.refresh_invoice_section_payment_percent() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS invoices_refresh_payment_percent ON public.invoices;
CREATE TRIGGER invoices_refresh_payment_percent AFTER UPDATE OF total_amount ON public.invoices
 FOR EACH ROW EXECUTE FUNCTION private.refresh_invoice_section_payment_percent();

COMMIT;

-- STAGED PROPOSAL ONLY. Not a migration and not applied to any remote project.
-- Reviewed against the read-only live invoice policies/schema on 2026-10-03.
-- Preserve existing invoice/payment/file RLS; SECURITY INVOKER RPCs cannot bypass it.
-- Activation prerequisites: review this schema/bucket proposal, verify actual
-- Storage API metadata/preflight behavior, and deploy/schedule the staged
-- invoice-file-cleanup Edge Function using server-only service-role credentials.
-- Storage objects are read-only here: never DELETE storage.objects through SQL.
-- Client SHA-256 metadata is a retry identity, NOT trusted verification of bytes.
-- A trusted download-and-hash/scanner is required for adversarial content assurance.
BEGIN;

-- Bucket configuration only; object data is always managed via the Storage API.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('invoices-private','invoices-private',false,6291456,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.invoice_payments ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_client_request_id_key ON public.invoices(client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_client_request_id_key ON public.invoice_payments(client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_id_invoice_id_key ON public.invoice_payments(id,invoice_id);
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS payment_id bigint;
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS upload_state text NOT NULL DEFAULT 'ready';
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.invoice_files ADD COLUMN IF NOT EXISTS settlement_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_files_client_request_id_key ON public.invoice_files(client_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_files_reserved_path_key ON public.invoice_files(storage_path) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_files_payment_id_idx ON public.invoice_files(payment_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.invoice_files'::regclass AND conname='invoice_files_payment_invoice_fkey') THEN
  ALTER TABLE public.invoice_files ADD CONSTRAINT invoice_files_payment_invoice_fkey
   FOREIGN KEY(payment_id,invoice_id) REFERENCES public.invoice_payments(id,invoice_id) ON DELETE CASCADE;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.invoice_files'::regclass AND conname='invoice_files_upload_state_check') THEN
  ALTER TABLE public.invoice_files ADD CONSTRAINT invoice_files_upload_state_check CHECK(upload_state IN('pending','ready'));
 END IF;
END $$;

-- An append-only request ledger remembers edits as well as creates. Retrying an old
-- request returns the CURRENT authorized row, never reapplies an obsolete payload.
CREATE TABLE IF NOT EXISTS private.invoice_mutation_requests(
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, operation text NOT NULL,
 requested_target_id bigint, target_id bigint NOT NULL, payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(operation IN('invoice','payment','file'))
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_file_request_target_key ON private.invoice_mutation_requests(target_id) WHERE operation='file';
ALTER TABLE private.invoice_mutation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.invoice_mutation_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON private.invoice_mutation_requests TO authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
DROP POLICY IF EXISTS invoice_request_read ON private.invoice_mutation_requests;
CREATE POLICY invoice_request_read ON private.invoice_mutation_requests FOR SELECT TO authenticated USING(actor_id=auth.uid());
DROP POLICY IF EXISTS invoice_request_insert ON private.invoice_mutation_requests;
CREATE POLICY invoice_request_insert ON private.invoice_mutation_requests FOR INSERT TO authenticated WITH CHECK(
 actor_id=auth.uid() AND (
  (operation='invoice' AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=target_id AND i.client_request_id=request_id)) OR
  (operation='payment' AND EXISTS(SELECT 1 FROM public.invoice_payments p WHERE p.id=target_id AND p.client_request_id=request_id)) OR
  (operation='file' AND EXISTS(SELECT 1 FROM public.invoice_files f WHERE f.id=target_id AND f.client_request_id=request_id))
 )
);

CREATE OR REPLACE FUNCTION private.invoice_row_json(r public.invoices) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(r)||jsonb_build_object('id',r.id::text,'project_id',r.project_id::text,'part_id',r.part_id::text,'total_amount',r.total_amount::text);
$$;
CREATE OR REPLACE FUNCTION private.invoice_payment_json(r public.invoice_payments) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(r)||jsonb_build_object('id',r.id::text,'invoice_id',r.invoice_id::text,'amount',r.amount::text,'percent_of_total',r.percent_of_total::text);
$$;
CREATE OR REPLACE FUNCTION private.invoice_settlement_snapshot(p_invoice_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('total_amount',i.total_amount::text,'currency',i.currency,
  'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id::text,'sequence_no',p.sequence_no,'amount',p.amount::text,
    'status',p.status,'planned_date',p.planned_date,'paid_date',p.paid_date,'tracking_no',p.tracking_no,'document_no',p.document_no,
    'payment_method',p.payment_method,'payer_id',p.payer_id,'approver_id',p.approver_id,'notes',p.notes) ORDER BY p.id)
    FROM public.invoice_payments p WHERE p.invoice_id=i.id),'[]'::jsonb))
 FROM public.invoices i WHERE i.id=p_invoice_id;
$$;
CREATE OR REPLACE FUNCTION private.invoice_is_settled(p_invoice_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT i.total_amount>0 AND i.status NOT IN('cancelled','returned')
  AND coalesce((SELECT sum(p.amount) FROM public.invoice_payments p WHERE p.invoice_id=i.id AND p.status='paid'),0)>=i.total_amount
  AND NOT EXISTS(SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id=i.id AND p.status IS DISTINCT FROM 'paid')
 FROM public.invoices i WHERE i.id=p_invoice_id),false);
$$;
CREATE OR REPLACE FUNCTION private.invoice_file_json(r public.invoice_files) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (to_jsonb(r)-'settlement_snapshot')||jsonb_build_object('id',r.id::text,'invoice_id',r.invoice_id::text,'payment_id',r.payment_id::text,
 'size_bytes',r.size_bytes::text,'bucket_id',CASE WHEN r.client_request_id IS NOT NULL THEN 'invoices-private' ELSE NULL END,
 'final_is_current',CASE WHEN r.file_type='final' THEN r.upload_state='ready' AND r.settlement_snapshot IS NOT NULL
  AND private.invoice_is_settled(r.invoice_id) AND r.settlement_snapshot=private.invoice_settlement_snapshot(r.invoice_id) ELSE NULL END);
$$;

CREATE OR REPLACE FUNCTION public.save_invoice(p_request_id uuid,p_invoice_id bigint,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.invoices; previous private.invoice_mutation_requests; amount_value numeric;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid invoice request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-request:'||p_request_id::text,0));
 SELECT * INTO previous FROM private.invoice_mutation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF previous.operation<>'invoice' OR previous.requested_target_id IS DISTINCT FROM p_invoice_id OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'request ID was already used with different data' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.invoices WHERE id=previous.target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice no longer exists or access denied' USING ERRCODE='42501'; END IF;
  RETURN private.invoice_row_json(r);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('invoice_number','title','account_party','company_name','currency','total_amount','due_date','description')) THEN RAISE EXCEPTION 'unsupported invoice field' USING ERRCODE='22023'; END IF;
 IF coalesce(p_payload->>'total_amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'invalid exact invoice amount' USING ERRCODE='22023'; END IF;
 amount_value:=(p_payload->>'total_amount')::numeric;
 IF amount_value>9999999999999999.99 OR nullif(btrim(p_payload->>'invoice_number'),'') IS NULL OR nullif(btrim(p_payload->>'title'),'') IS NULL
  OR nullif(btrim(p_payload->>'account_party'),'') IS NULL OR coalesce(p_payload->>'currency','') NOT IN('IRR','IRT','USD','EUR') THEN RAISE EXCEPTION 'invalid invoice data' USING ERRCODE='22023'; END IF;
 IF p_invoice_id IS NULL THEN
  INSERT INTO public.invoices(invoice_number,title,account_party,company_name,currency,total_amount,due_date,description,created_by,follow_up_owner_id,client_request_id)
  VALUES(btrim(p_payload->>'invoice_number'),btrim(p_payload->>'title'),btrim(p_payload->>'account_party'),nullif(btrim(p_payload->>'company_name'),''),p_payload->>'currency',amount_value,
   nullif(p_payload->>'due_date','')::date,nullif(btrim(p_payload->>'description'),''),auth.uid(),auth.uid(),p_request_id);
  -- Separate statement: STABLE invoice access helper cannot see INSERT's new
  -- row during RETURNING's SELECT-policy check. Do not weaken that policy.
  SELECT * INTO r FROM public.invoices WHERE client_request_id=p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice read access denied after creation' USING ERRCODE='42501'; END IF;
 ELSE
  UPDATE public.invoices SET invoice_number=btrim(p_payload->>'invoice_number'),title=btrim(p_payload->>'title'),account_party=btrim(p_payload->>'account_party'),
   company_name=nullif(btrim(p_payload->>'company_name'),''),currency=p_payload->>'currency',total_amount=amount_value,due_date=nullif(p_payload->>'due_date','')::date,
   description=nullif(btrim(p_payload->>'description'),''),updated_at=now(),client_request_id=p_request_id WHERE id=p_invoice_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found or edit access denied' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO private.invoice_mutation_requests(request_id,actor_id,operation,requested_target_id,target_id,payload) VALUES(p_request_id,auth.uid(),'invoice',p_invoice_id,r.id,p_payload);
 RETURN private.invoice_row_json(r);
END $$;

CREATE OR REPLACE FUNCTION public.save_invoice_payment(p_request_id uuid,p_payment_id bigint,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.invoice_payments; previous private.invoice_mutation_requests; amount_value numeric; parent_id bigint; stage integer;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid payment request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-request:'||p_request_id::text,0));
 SELECT * INTO previous FROM private.invoice_mutation_requests WHERE request_id=p_request_id;
 IF FOUND THEN
  IF previous.operation<>'payment' OR previous.requested_target_id IS DISTINCT FROM p_payment_id OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'request ID was already used with different data' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.invoice_payments WHERE id=previous.target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment no longer exists or access denied' USING ERRCODE='42501'; END IF;
  RETURN private.invoice_payment_json(r);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN('invoice_id','sequence_no','amount','planned_date','paid_date','status','tracking_no','notes','payer_id')) THEN RAISE EXCEPTION 'unsupported payment field' USING ERRCODE='22023'; END IF;
 IF coalesce(p_payload->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'invalid exact payment amount' USING ERRCODE='22023'; END IF;
 amount_value:=(p_payload->>'amount')::numeric;
 parent_id:=(p_payload->>'invoice_id')::bigint; stage:=(p_payload->>'sequence_no')::integer;
 IF amount_value<=0 OR amount_value>9999999999999999.99 OR parent_id IS NULL OR stage IS NULL OR stage<1 OR coalesce(p_payload->>'status','') NOT IN('planned','paid') THEN RAISE EXCEPTION 'invalid payment data' USING ERRCODE='22023'; END IF;
 -- Parent-before-payment order matches total changes, file finalization and
 -- deletion. This uses the same invoker lock/permissions as the existing trigger.
 PERFORM 1 FROM public.invoices WHERE id=parent_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invoice payment lock access denied' USING ERRCODE='42501'; END IF;
 IF p_payment_id IS NULL THEN
  INSERT INTO public.invoice_payments(invoice_id,sequence_no,amount,planned_date,paid_date,status,tracking_no,notes,payer_id,client_request_id)
  VALUES(parent_id,stage,amount_value,nullif(p_payload->>'planned_date','')::date,nullif(p_payload->>'paid_date','')::date,p_payload->>'status',nullif(btrim(p_payload->>'tracking_no'),''),
   nullif(btrim(p_payload->>'notes'),''),CASE WHEN p_payload->>'status'='paid' THEN auth.uid() END,p_request_id) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM public.invoice_payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found or access denied' USING ERRCODE='42501'; END IF;
  IF r.invoice_id<>parent_id THEN RAISE EXCEPTION 'payment invoice is immutable' USING ERRCODE='22023'; END IF;
  UPDATE public.invoice_payments SET sequence_no=stage,amount=amount_value,planned_date=nullif(p_payload->>'planned_date','')::date,paid_date=nullif(p_payload->>'paid_date','')::date,
   status=p_payload->>'status',tracking_no=nullif(btrim(p_payload->>'tracking_no'),''),notes=nullif(btrim(p_payload->>'notes'),''),
   payer_id=CASE WHEN p_payload->>'status'='paid' THEN coalesce(r.payer_id,auth.uid()) END,client_request_id=p_request_id WHERE id=p_payment_id RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment edit access denied' USING ERRCODE='42501'; END IF;
 END IF;
 -- Existing validate_invoice_payment calculates percent_of_total and paid_date.
 INSERT INTO private.invoice_mutation_requests(request_id,actor_id,operation,requested_target_id,target_id,payload) VALUES(p_request_id,auth.uid(),'payment',p_payment_id,r.id,p_payload);
 RETURN private.invoice_payment_json(r);
END $$;

CREATE OR REPLACE FUNCTION private.guard_invoice_payment_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN RAISE EXCEPTION 'payment invoice is immutable' USING ERRCODE='22023'; END IF;
 IF (TG_OP='INSERT' AND NEW.receipt_path IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.receipt_path IS DISTINCT FROM OLD.receipt_path AND NEW.receipt_path IS NOT NULL) THEN
  IF NOT EXISTS(SELECT 1 FROM public.invoice_files f WHERE f.invoice_id=NEW.invoice_id AND f.payment_id=NEW.id AND f.file_type='receipt' AND f.upload_state='ready' AND f.storage_path=NEW.receipt_path) THEN RAISE EXCEPTION 'receipt must be a finalized attachment for this payment' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_payments_attachment_identity ON public.invoice_payments;
CREATE TRIGGER invoice_payments_attachment_identity BEFORE INSERT OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_payment_identity();

CREATE OR REPLACE FUNCTION private.invoice_file_path(p_invoice_id bigint,p_payment_id bigint,p_kind text,p_request uuid,p_content_type text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_invoice_id::text||'/'||coalesce(p_payment_id::text,'invoice')||'/'||p_kind||'/'||p_request::text||
 CASE p_content_type WHEN 'application/pdf' THEN '.pdf' WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' END;
$$;
-- Lock-only helper preserves the existing view-scoped attachment rights. A
-- SECURITY INVOKER SELECT FOR UPDATE would incorrectly require invoice-edit RLS.
-- No row contents or write privileges are exposed; access is rechecked per call.
CREATE OR REPLACE FUNCTION private.lock_invoice_for_file(p_invoice_id bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.platform_can_access_invoice(p_invoice_id) THEN RAISE EXCEPTION 'invoice lock access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invoice no longer exists' USING ERRCODE='42501'; END IF;
 -- Access could have changed while waiting for the row lock.
 IF NOT public.platform_can_access_invoice(p_invoice_id) THEN RAISE EXCEPTION 'invoice lock access denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.lock_invoice_for_file(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.lock_invoice_for_file(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_invoice_file() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.invoice_id,NEW.payment_id,NEW.file_type,NEW.file_name,NEW.storage_path,NEW.uploaded_by,NEW.created_at,NEW.client_request_id,NEW.content_type,NEW.size_bytes,NEW.sha256)
   IS DISTINCT FROM ROW(OLD.invoice_id,OLD.payment_id,OLD.file_type,OLD.file_name,OLD.storage_path,OLD.uploaded_by,OLD.created_at,OLD.client_request_id,OLD.content_type,OLD.size_bytes,OLD.sha256)
  THEN RAISE EXCEPTION 'attachment identity is immutable' USING ERRCODE='22023'; END IF;
  IF NEW.upload_state=OLD.upload_state AND NEW.settlement_snapshot IS NOT DISTINCT FROM OLD.settlement_snapshot THEN RETURN NEW; END IF;
  IF OLD.client_request_id IS NULL OR OLD.upload_state<>'pending' OR NEW.upload_state<>'ready' OR OLD.uploaded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'invalid attachment transition' USING ERRCODE='42501'; END IF;
  IF NOT public.platform_can_access_invoice(NEW.invoice_id) THEN RAISE EXCEPTION 'invoice access denied' USING ERRCODE='42501'; END IF;
  IF NEW.file_type='final' THEN
   PERFORM private.lock_invoice_for_file(NEW.invoice_id);
   IF NOT private.invoice_is_settled(NEW.invoice_id) THEN RAISE EXCEPTION 'final invoice requires full settlement and no unpaid stages' USING ERRCODE='22023'; END IF;
   NEW.settlement_snapshot:=private.invoice_settlement_snapshot(NEW.invoice_id);
  ELSE NEW.settlement_snapshot:=NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='invoices-private' AND o.name=NEW.storage_path
   AND o.metadata->>'size'=NEW.size_bytes::text AND o.metadata->>'mimetype'=NEW.content_type AND o.user_metadata->>'sha256'=NEW.sha256)
  THEN RAISE EXCEPTION 'uploaded object metadata does not match reservation' USING ERRCODE='22023'; END IF;
  RETURN NEW;
 END IF;
 IF auth.uid() IS NULL OR NEW.client_request_id IS NULL OR NEW.uploaded_by IS DISTINCT FROM auth.uid() OR NEW.upload_state<>'pending'
  OR NEW.file_type NOT IN('proforma','receipt','final') OR NEW.content_type NOT IN('application/pdf','image/jpeg','image/png','image/webp')
  OR NEW.size_bytes IS NULL OR NEW.size_bytes<1 OR NEW.size_bytes>6291456 OR NEW.sha256 IS NULL OR NEW.sha256 !~ '^[0-9a-f]{64}$'
  OR nullif(btrim(NEW.file_name),'') IS NULL OR length(NEW.file_name)>255 OR NEW.file_name ~ '[[:cntrl:]/\\]' OR NEW.settlement_snapshot IS NOT NULL
  OR NOT (CASE NEW.content_type WHEN 'application/pdf' THEN NEW.file_name ~* '[.]pdf$' WHEN 'image/jpeg' THEN NEW.file_name ~* '[.](jpg|jpeg)$' WHEN 'image/png' THEN NEW.file_name ~* '[.]png$' WHEN 'image/webp' THEN NEW.file_name ~* '[.]webp$' ELSE false END)
  OR (NEW.file_type='receipt') IS DISTINCT FROM (NEW.payment_id IS NOT NULL)
  OR NEW.storage_path IS DISTINCT FROM private.invoice_file_path(NEW.invoice_id,NEW.payment_id,NEW.file_type,NEW.client_request_id,NEW.content_type)
 THEN RAISE EXCEPTION 'invalid attachment reservation' USING ERRCODE='22023'; END IF;
 IF NOT public.platform_can_access_invoice(NEW.invoice_id) THEN RAISE EXCEPTION 'invoice access denied' USING ERRCODE='42501'; END IF;
 IF NEW.file_type='final' THEN
  PERFORM private.lock_invoice_for_file(NEW.invoice_id);
  IF NOT private.invoice_is_settled(NEW.invoice_id) THEN RAISE EXCEPTION 'final invoice requires full settlement and no unpaid stages' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_files_guard ON public.invoice_files;
CREATE TRIGGER invoice_files_guard BEFORE INSERT OR UPDATE ON public.invoice_files FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_file();

CREATE OR REPLACE FUNCTION private.record_invoice_file_request() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO private.invoice_mutation_requests(request_id,actor_id,operation,requested_target_id,target_id,payload)
 VALUES(NEW.client_request_id,auth.uid(),'file',NEW.invoice_id,NEW.id,jsonb_build_object('storage_path',NEW.storage_path));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_files_record_request ON public.invoice_files;
CREATE TRIGGER invoice_files_record_request AFTER INSERT ON public.invoice_files FOR EACH ROW EXECUTE FUNCTION private.record_invoice_file_request();

CREATE OR REPLACE FUNCTION public.reserve_invoice_file(p_request_id uuid,p_invoice_id bigint,p_payment_id bigint,p_file_type text,p_file_name text,p_content_type text,p_size_bytes bigint,p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.invoice_files;
BEGIN
 IF auth.uid() IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'invalid attachment request' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-file:'||p_request_id::text,0));
 SELECT * INTO r FROM public.invoice_files WHERE client_request_id=p_request_id;
 IF FOUND THEN
  IF r.uploaded_by IS DISTINCT FROM auth.uid() OR ROW(r.invoice_id,r.payment_id,r.file_type,r.file_name,r.content_type,r.size_bytes,r.sha256)
   IS DISTINCT FROM ROW(p_invoice_id,p_payment_id,p_file_type,btrim(p_file_name),p_content_type,p_size_bytes,lower(p_sha256)) THEN RAISE EXCEPTION 'request ID was already used with different file data' USING ERRCODE='22023'; END IF;
  IF r.file_type='final' AND r.upload_state='pending' THEN
   PERFORM private.lock_invoice_for_file(r.invoice_id);
   IF NOT private.invoice_is_settled(r.invoice_id) THEN RAISE EXCEPTION 'final invoice requires full settlement and no unpaid stages' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN private.invoice_file_json(r);
 END IF;
 IF EXISTS(SELECT 1 FROM private.invoice_mutation_requests WHERE request_id=p_request_id) THEN RAISE EXCEPTION 'attachment request is retired or already used' USING ERRCODE='22023'; END IF;
 INSERT INTO public.invoice_files(invoice_id,payment_id,file_type,file_name,storage_path,uploaded_by,client_request_id,upload_state,content_type,size_bytes,sha256)
 VALUES(p_invoice_id,p_payment_id,p_file_type,btrim(p_file_name),private.invoice_file_path(p_invoice_id,p_payment_id,p_file_type,p_request_id,p_content_type),auth.uid(),p_request_id,'pending',p_content_type,p_size_bytes,lower(p_sha256)) RETURNING * INTO r;
 RETURN private.invoice_file_json(r);
END $$;
CREATE OR REPLACE FUNCTION public.finalize_invoice_file(p_file_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.invoice_files;
BEGIN
 -- Parent-before-file lock order matches financial mutations and cascades.
 SELECT * INTO r FROM public.invoice_files WHERE id=p_file_id;
 IF NOT FOUND OR r.client_request_id IS NULL OR r.uploaded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'attachment not found or access denied' USING ERRCODE='42501'; END IF;
 IF r.upload_state='ready' THEN RETURN private.invoice_file_json(r); END IF;
 PERFORM private.lock_invoice_for_file(r.invoice_id);
 SELECT * INTO r FROM public.invoice_files WHERE id=p_file_id FOR UPDATE;
 IF NOT FOUND OR r.client_request_id IS NULL OR r.uploaded_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'attachment not found or access denied' USING ERRCODE='42501'; END IF;
 IF r.upload_state='pending' THEN
  UPDATE public.invoice_files SET upload_state='ready' WHERE id=p_file_id RETURNING * INTO r;
 END IF;
 RETURN private.invoice_file_json(r);
END $$;

-- Existing permissive policies remain authoritative. Restrictive policies make
-- pending reservations private to their uploader without OR-policy bypasses.
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_files_pending_visibility ON public.invoice_files;
CREATE POLICY invoice_files_pending_visibility ON public.invoice_files AS RESTRICTIVE FOR SELECT TO authenticated
 USING(client_request_id IS NULL OR upload_state='ready' OR uploaded_by=auth.uid());

CREATE OR REPLACE FUNCTION private.invoice_storage_read(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.invoice_files f WHERE f.storage_path=p_name AND f.client_request_id IS NOT NULL
  AND public.platform_can_access_invoice(f.invoice_id) AND (f.upload_state='ready' OR f.uploaded_by=auth.uid()));
$$;
CREATE OR REPLACE FUNCTION private.invoice_storage_write(p_name text,p_metadata jsonb,p_user_metadata jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.invoice_files;
BEGIN
 SELECT * INTO f FROM public.invoice_files WHERE storage_path=p_name AND client_request_id IS NOT NULL
  AND upload_state='pending' AND uploaded_by=auth.uid() AND public.platform_can_access_invoice(invoice_id);
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM private.lock_invoice_for_file(f.invoice_id);
 -- Re-read after waiting; the reservation may have become ready or been deleted.
 -- Hold its row through the Storage metadata write so finalization cannot race it.
 SELECT * INTO f FROM public.invoice_files WHERE id=f.id AND client_request_id IS NOT NULL
  AND upload_state='pending' AND uploaded_by=auth.uid() AND public.platform_can_access_invoice(invoice_id) FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF f.file_type='final' AND NOT private.invoice_is_settled(f.invoice_id) THEN RETURN false; END IF;
 -- Storage may preflight an empty metadata record; finalization always requires
 -- actual server-observed size/type and matching custom retry hash.
 RETURN (p_metadata IS NULL OR (p_metadata->>'size'=f.size_bytes::text AND p_metadata->>'mimetype'=f.content_type))
  AND (p_user_metadata IS NULL OR p_user_metadata->>'sha256'=f.sha256);
END $$;
DROP POLICY IF EXISTS invoice_objects_read ON storage.objects;
CREATE POLICY invoice_objects_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='invoices-private' AND private.invoice_storage_read(name));
DROP POLICY IF EXISTS invoice_objects_insert ON storage.objects;
CREATE POLICY invoice_objects_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='invoices-private' AND private.invoice_storage_write(name,metadata,user_metadata));
DROP POLICY IF EXISTS invoice_objects_update ON storage.objects;
CREATE POLICY invoice_objects_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='invoices-private' AND private.invoice_storage_write(name,metadata,user_metadata))
 WITH CHECK(bucket_id='invoices-private' AND private.invoice_storage_write(name,metadata,user_metadata));
-- These restrictive gates also defeat accidentally broad, unrelated Storage policies.
DROP POLICY IF EXISTS invoice_objects_read_guard ON storage.objects;
CREATE POLICY invoice_objects_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'invoices-private' OR private.invoice_storage_read(name));
DROP POLICY IF EXISTS invoice_objects_insert_guard ON storage.objects;
CREATE POLICY invoice_objects_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'invoices-private' OR private.invoice_storage_write(name,metadata,user_metadata));
DROP POLICY IF EXISTS invoice_objects_update_guard ON storage.objects;
CREATE POLICY invoice_objects_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'invoices-private' OR private.invoice_storage_write(name,metadata,user_metadata))
 WITH CHECK(bucket_id<>'invoices-private' OR private.invoice_storage_write(name,metadata,user_metadata));
DROP POLICY IF EXISTS invoice_objects_delete_guard ON storage.objects;
CREATE POLICY invoice_objects_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'invoices-private');
-- Anonymous callers never access the bucket, even if another policy is broad.
DROP POLICY IF EXISTS invoice_objects_anon_guard ON storage.objects;
CREATE POLICY invoice_objects_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'invoices-private') WITH CHECK(bucket_id<>'invoices-private');

-- Durable cleanup outbox. Only a privileged worker can inspect/ack it. A worker
-- MUST confirm the matching invoice_files row is absent, delete via Storage API,
-- and only then acknowledge this row. Tombstones remain for hourly reconciliation
-- of delayed uploads: Storage bytes and database rows cannot share a transaction.
-- SQL never deletes Storage metadata/bytes.
CREATE TABLE IF NOT EXISTS private.invoice_storage_cleanup(
 file_id bigint PRIMARY KEY, invoice_id bigint NOT NULL, storage_path text NOT NULL,
 bucket_id text NOT NULL DEFAULT 'invoices-private' CHECK(bucket_id='invoices-private'),
 requested_by uuid, requested_at timestamptz NOT NULL DEFAULT now(),
 last_checked_at timestamptz, last_attempted_at timestamptz, cleanup_attempts bigint NOT NULL DEFAULT 0
);
ALTER TABLE private.invoice_storage_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.invoice_storage_cleanup FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.invoice_storage_cleanup TO service_role;
-- A trigger-only definer is necessary: invoice/payment CASCADE can delete pending
-- files hidden from the deleting user. It accepts no IDs/paths and only copies
-- the OLD row already deleted by an RLS-authorized statement. It cannot delete
-- objects or grant access, and EXECUTE is revoked from every client role.
CREATE OR REPLACE FUNCTION private.queue_invoice_file_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.client_request_id IS NOT NULL THEN
  INSERT INTO private.invoice_storage_cleanup(file_id,invoice_id,storage_path,requested_by)
   VALUES(OLD.id,OLD.invoice_id,OLD.storage_path,auth.uid()) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.queue_invoice_file_cleanup() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS invoice_files_queue_cleanup ON public.invoice_files;
CREATE TRIGGER invoice_files_queue_cleanup BEFORE DELETE ON public.invoice_files FOR EACH ROW EXECUTE FUNCTION private.queue_invoice_file_cleanup();

CREATE OR REPLACE FUNCTION private.sync_invoice_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.payment_id IS NOT NULL THEN
   UPDATE public.invoice_payments p SET receipt_path=(SELECT f.storage_path FROM public.invoice_files f WHERE f.payment_id=OLD.payment_id AND f.id<>OLD.id AND f.file_type='receipt' AND f.upload_state='ready' ORDER BY f.created_at DESC,f.id DESC LIMIT 1)
    WHERE p.id=OLD.payment_id AND p.invoice_id=OLD.invoice_id AND p.receipt_path=OLD.storage_path;
  END IF;
  RETURN OLD;
 END IF;
 IF NEW.file_type='receipt' AND NEW.upload_state='ready' AND OLD.upload_state='pending' THEN
  UPDATE public.invoice_payments SET receipt_path=NEW.storage_path WHERE id=NEW.payment_id AND invoice_id=NEW.invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment not found or access denied' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_files_sync_receipt ON public.invoice_files;
CREATE TRIGGER invoice_files_sync_receipt AFTER UPDATE OF upload_state ON public.invoice_files FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_receipt();
DROP TRIGGER IF EXISTS invoice_files_clear_receipt ON public.invoice_files;
CREATE TRIGGER invoice_files_clear_receipt BEFORE DELETE ON public.invoice_files FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_receipt();

-- Keep stored percentages and settled status correct after a total edit. The
-- original payment validation/overpayment locks and authorization are preserved.
CREATE OR REPLACE FUNCTION private.refresh_invoice_amount_state() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE paid_value numeric;
BEGIN
 IF TG_WHEN='AFTER' THEN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
   UPDATE public.invoice_payments SET percent_of_total=CASE WHEN NEW.total_amount>0 THEN amount/NEW.total_amount*100 ELSE NULL END WHERE invoice_id=NEW.id;
  END IF;
 ELSE
  IF NEW.status NOT IN('cancelled','returned') THEN
   SELECT coalesce(sum(p.amount) FILTER(WHERE p.status='paid'),0) INTO paid_value FROM public.invoice_payments p WHERE p.invoice_id=NEW.id;
   NEW.status:=CASE WHEN NEW.total_amount>0 AND paid_value>=NEW.total_amount AND NOT EXISTS(SELECT 1 FROM public.invoice_payments p WHERE p.invoice_id=NEW.id AND p.status IS DISTINCT FROM 'paid') THEN 'settled'
    WHEN paid_value>0 THEN 'partially_paid' WHEN NEW.due_date<current_date THEN 'overdue' ELSE 'awaiting_payment' END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoices_refresh_amount_status ON public.invoices;
CREATE TRIGGER invoices_refresh_amount_status BEFORE UPDATE OF total_amount,due_date,status ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.refresh_invoice_amount_state();
DROP TRIGGER IF EXISTS invoices_refresh_payment_percent ON public.invoices;
CREATE TRIGGER invoices_refresh_payment_percent AFTER UPDATE OF total_amount ON public.invoices FOR EACH ROW EXECUTE FUNCTION private.refresh_invoice_amount_state();

-- Service-only cleanup API. Private schema stays unexposed to PostgREST.
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON public.invoice_files TO service_role;
CREATE OR REPLACE FUNCTION public.invoice_file_cleanup_batch(p_limit integer DEFAULT 50)
RETURNS TABLE(file_id text,bucket_id text,storage_path text)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 WITH candidates AS (
  SELECT q.file_id FROM private.invoice_storage_cleanup q
  WHERE q.requested_at <= now()-interval '5 minutes'
   AND (q.last_checked_at IS NULL OR q.last_checked_at<=now()-interval '1 hour')
   AND (q.last_attempted_at IS NULL OR q.last_attempted_at<=now()-interval '1 minute')
   AND NOT EXISTS(SELECT 1 FROM public.invoice_files f WHERE f.id=q.file_id OR f.storage_path=q.storage_path)
  ORDER BY q.last_attempted_at NULLS FIRST,q.requested_at,q.file_id
  LIMIT greatest(1,least(coalesce(p_limit,50),50)) FOR UPDATE SKIP LOCKED
 )
 UPDATE private.invoice_storage_cleanup q SET last_attempted_at=now(),cleanup_attempts=cleanup_attempts+1
 FROM candidates c WHERE q.file_id=c.file_id RETURNING q.file_id::text,q.bucket_id,q.storage_path;
$$;
CREATE OR REPLACE FUNCTION public.ack_invoice_file_cleanup(p_file_id bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE private.invoice_storage_cleanup q SET last_checked_at=now() WHERE q.file_id=p_file_id
  AND NOT EXISTS(SELECT 1 FROM public.invoice_files f WHERE f.id=q.file_id OR f.storage_path=q.storage_path);
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.invoice_file_cleanup_batch(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ack_invoice_file_cleanup(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_file_cleanup_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_invoice_file_cleanup(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.list_invoice_workspace() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'invoices',coalesce((SELECT jsonb_agg(private.invoice_row_json(i) ORDER BY i.id DESC) FROM public.invoices i),'[]'::jsonb),
  'payments',coalesce((SELECT jsonb_agg(private.invoice_payment_json(p) ORDER BY p.invoice_id,p.sequence_no) FROM public.invoice_payments p),'[]'::jsonb),
  'files',coalesce((SELECT jsonb_agg(private.invoice_file_json(f) ORDER BY f.created_at DESC,f.id DESC) FROM public.invoice_files f),'[]'::jsonb));
$$;

-- Explicitly scope all newly introduced functions. Existing auth policies and
-- their functions are not replaced or re-granted by this proposal.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN('save_invoice','save_invoice_payment','reserve_invoice_file','finalize_invoice_file','list_invoice_workspace'))
   OR (n.nspname='private' AND p.proname IN('invoice_row_json','invoice_payment_json','invoice_settlement_snapshot','invoice_is_settled','invoice_file_json','guard_invoice_payment_identity','invoice_file_path','guard_invoice_file','invoice_storage_read','invoice_storage_write','sync_invoice_receipt','refresh_invoice_amount_state','record_invoice_file_request'))
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $$;
COMMIT;

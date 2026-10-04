// Synthetic, isolated PostgreSQL/PGlite contract test. No network, credentials,
// real identities, live data, Storage API/bytes, or multi-session concurrency.
// Reuses the existing attachment harness's explicit auth/Storage stubs.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const identities = {
  owner: '00000000-0000-0000-0000-000000000001',
  editor: '00000000-0000-0000-0000-000000000002',
  viewer: '00000000-0000-0000-0000-000000000003',
  followup: '00000000-0000-0000-0000-000000000004',
  manager: '00000000-0000-0000-0000-000000000005',
  denied: '00000000-0000-0000-0000-000000000006',
};
const all = { view: true, create: true, edit: true, delete: true };
const actor = async (name = 'owner', permissions = all, manager = false, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false),set_config('test.manager',$3,false)", [identities[name] || '', JSON.stringify(permissions), String(manager)]);
  await db.exec(`set role ${role}`);
};
const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)).rows[0].result;
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const invoicePayload = (number, total = '100.00') => ({ invoice_number: number, title: `Synthetic ${number}`, account_party: 'Synthetic supplier', company_name: 'Synthetic supplier', currency: 'IRR', total_amount: total });
const paymentPayload = (invoice, sequence, amount = '40.00', status = 'paid') => ({ invoice_id: invoice.id, sequence_no: sequence, amount, status, notes: 'Synthetic payment' });
const saveInvoice = (payload, id = null, request = randomUUID()) => rpc('save_invoice', [request, id, JSON.stringify(payload)]);
const savePayment = (payload, id = null, request = randomUUID()) => rpc('save_invoice_payment', [request, id, JSON.stringify(payload)]);
const reserve = (invoice, payment = null, kind = 'proforma', request = randomUUID()) => rpc('reserve_invoice_file', [request, invoice.id, payment?.id || null, kind, 'synthetic.pdf', 'application/pdf', 32, 'a'.repeat(64)]);
const removeFile = f => rpc('delete_invoice_file', [f.id, f.invoice_id, f.payment_id, f.file_type, f.client_request_id]);
const deny = (promise, pattern = /denied|policy|permission|identity|ownership|not found|یافت نشد|کل/) => assert.rejects(promise, pattern);
const zero = async promise => assert.equal((await promise).rows.length, 0);
const stored = async file => {
  await db.exec('reset role');
  await db.query('insert into storage.objects(bucket_id,name,metadata,user_metadata) values($1,$2,$3,$4)', ['invoices-private', file.storage_path, JSON.stringify({ size: 32, mimetype: 'application/pdf' }), JSON.stringify({ sha256: file.sha256 })]);
  await db.exec('set role authenticated');
};
const ready = async file => { await stored(file); return rpc('finalize_invoice_file', [file.id]); };
const functions = async () => (await db.query(`select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proacl::text acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') order by 1,2,3`)).rows;
const policies = async () => (await db.query("select * from pg_policies where schemaname in('public','private','storage') order by schemaname,tablename,policyname")).rows;
const triggers = async () => (await db.query(`select t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and n.nspname='public' order by t.tgname`)).rows;
const tableRows = async () => (await one(`select jsonb_build_object('invoices',(select jsonb_agg(to_jsonb(i) order by id) from public.invoices i),
 'payments',(select jsonb_agg(to_jsonb(p) order by id) from public.invoice_payments p),'files',(select jsonb_agg(to_jsonb(f) order by id) from public.invoice_files f),
 'objects',(select jsonb_agg(to_jsonb(o) order by name) from storage.objects o)) snapshot`)).snapshot;
const mutationColumns = row => { const { percent_of_total, ...rest } = row; return rest; };
try {
  await db.exec(source('../tests/sql/fixtures/invoice-live-contract.sql'));
  // This synthetic profile-aware stub models the production resolver's active
  // profile gate; it does not replace or pretend to test the real resolver.
  await db.exec(`alter table public.profiles add column active boolean not null default true;
    create or replace function public.can_access_feature(feature text,action text) returns boolean
    language sql stable security invoker set search_path='' as $$
      select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
       and coalesce((current_setting('test.permissions',true)::jsonb->>action)::boolean,false)
    $$;`);
  await db.exec(source('../supabase/migrations/20260924160000_invoice_payment_consistency.sql'));
  // Include the original read-only public balance helper, absent from the
  // smaller attachment fixture. Execute its checked-in definition verbatim.
  const platformSource = source('../supabase/migrations/20260920120000_organizational_platform.sql');
  const remainingDefinition = platformSource.match(/create or replace function public[.]invoice_remaining_amount[\s\S]*?\$\$;/i)?.[0];
  assert(remainingDefinition, 'checked-in invoice balance helper exists');
  await db.exec(remainingDefinition);
  for (const id of Object.values(identities)) await db.query('insert into public.profiles(id) values($1)', [id]);
  // A grandfathered metadata row exists before attachment-gate installation.
  const legacy = await one("insert into public.invoices(invoice_number,title,account_party,total_amount,created_by,follow_up_owner_id) values('SYNTHETIC-LEGACY','Synthetic legacy','Synthetic supplier',100,$1,$1) returning id::text", [identities.owner]);
  const legacyFile = await one("insert into public.invoice_files(invoice_id,file_type,file_name,storage_path,uploaded_by) values($1,'proforma','synthetic-legacy.pdf','synthetic-legacy/document.pdf',$2) returning id::text", [legacy.id, identities.owner]);
  await db.exec(source('../supabase/migrations/20261003114607_invoice_attachment_upload_gate.sql'));
  await db.exec(source('../supabase/migrations/20261003134731_invoice_file_controls.sql'));
  await actor();
  const invoice = await saveInvoice(invoicePayload('SYNTHETIC-SCOPE'));
  const paid = await savePayment(paymentPayload(invoice, 1));
  const planned = await savePayment(paymentPayload(invoice, 2, '60.00', 'planned'));
  const receipt = await ready(await reserve(invoice, paid, 'receipt'));
  const proforma = await ready(await reserve(invoice));
  const pending = await reserve(invoice); await stored(pending);
  const settled = await saveInvoice(invoicePayload('SYNTHETIC-SETTLED'));
  await savePayment(paymentPayload(settled, 1, '100.00'));
  const finalFile = await ready(await reserve(settled, null, 'final'));
  const noRelations = await saveInvoice(invoicePayload('SYNTHETIC-NO-RELATIONS'));
  await actor('editor');
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await deny(saveInvoice(invoicePayload('SYNTHETIC-SCOPE'), invoice.id));
  await db.exec('reset role');
  const beforeFunctions = await functions(), beforePolicies = await policies(), beforeTriggers = await triggers(), beforeRows = await tableRows();
  const proposal = source('../supabase/schema-proposals/invoice-section-visibility.sql');
  await db.exec(proposal); await db.exec(proposal);
  assert.deepEqual(await tableRows(), beforeRows, 'install/reapply does not mutate any business rows or Storage metadata');
  const changedPolicies = new Set(['invoices_feature_read', 'invoices_feature_update', 'invoice_payments_scoped_read', 'invoice_files_scoped_read']);
  assert.deepEqual((await policies()).filter(p => !changedPolicies.has(p.policyname)), beforePolicies.filter(p => !changedPolicies.has(p.policyname)), 'every write/delete/create, ledger, pending, and Storage policy remains byte-for-byte unchanged');
  const afterFunctions = await functions();
  for (const previous of beforeFunctions.filter(f => f.proname !== 'invoice_storage_read')) assert.deepEqual(afterFunctions.find(f => f.nspname === previous.nspname && f.proname === previous.proname && f.args === previous.args), previous, `${previous.proname} implementation/ACL unchanged`);
  for (const previous of beforeTriggers.filter(t => t.tgname !== 'invoices_refresh_payment_percent')) assert.deepEqual((await triggers()).find(t => t.tgname === previous.tgname), previous, `${previous.tgname} unchanged`);
  console.log('PASS baseline failure reproduced; idempotent proposal; no data rewrite; original mutation policies/RPCs/guards preserved');

  await actor('editor');
  let workspace = await rpc('list_invoice_workspace');
  assert.deepEqual(new Set(workspace.invoices.map(i => i.id)), new Set([legacy.id, invoice.id, settled.id, noRelations.id]));
  assert(workspace.payments.some(p => p.id === paid.id)); assert(workspace.payments.some(p => p.id === planned.id));
  assert(workspace.files.some(f => f.id === legacyFile.id));
  for (const file of [receipt, proforma, finalFile]) assert(workspace.files.some(f => f.id === file.id));
  assert(!workspace.files.some(f => f.id === pending.id), 'another uploader pending remains private');
  const visibleObjects = (await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.map(r => r.name);
  for (const file of [receipt, proforma, finalFile]) assert(visibleObjects.includes(file.storage_path));
  assert(!visibleObjects.includes(pending.storage_path));
  assert.equal((await one('select public.platform_can_access_invoice($1) allowed', [invoice.id])).allowed, false, 'legacy helper is still owner-scoped');
  assert.equal((await one('select private.invoice_section_can_read() allowed')).allowed, true);
  assert.equal((await db.query('select id from public.invoices where id=999999999')).rows.length, 0);
  assert.equal((await one('select public.invoice_paid_amount($1)::text paid,public.invoice_remaining_amount($1)::text remaining', [invoice.id])).paid, '40.00');
  assert.equal((await one('select public.invoice_remaining_amount($1)::text remaining', [invoice.id])).remaining, '60.00');
  console.log('PASS whole-section invoice/payment/ready-file metadata and Storage reads, pending uploader privacy, unchanged legacy write helper');

  const editRequest = randomUUID(), editPayload = { ...invoicePayload('SYNTHETIC-SCOPE'), title: 'Section editor title' };
  assert.equal((await saveInvoice(editPayload, invoice.id, editRequest)).title, editPayload.title);
  const paymentRowsBefore = (await rpc('list_invoice_workspace')).payments.filter(p => p.invoice_id === invoice.id);
  await saveInvoice({ ...editPayload, total_amount: '200.00' }, invoice.id);
  workspace = await rpc('list_invoice_workspace');
  const paymentRowsAfter = workspace.payments.filter(p => p.invoice_id === invoice.id);
  assert.deepEqual(paymentRowsAfter.map(mutationColumns), paymentRowsBefore.map(mutationColumns), 'total edit changes derived percentages only for valid payment records');
  assert.equal(paymentRowsAfter.find(p => p.id === paid.id).percent_of_total, '20.000');
  assert.equal(paymentRowsAfter.find(p => p.id === planned.id).percent_of_total, '30.000');
  assert.equal((await saveInvoice(editPayload, invoice.id, editRequest)).total_amount, '200.00', 'request replay returns current data and cannot overwrite later edits');
  await deny(saveInvoice({ ...editPayload, total_amount: '39.99' }, invoice.id));
  assert.equal((await one('select total_amount::text amount from public.invoices where id=$1', [invoice.id])).amount, '200.00');
  await saveInvoice(invoicePayload('SYNTHETIC-SETTLED', '120.00'), settled.id);
  workspace = await rpc('list_invoice_workspace');
  assert.equal(workspace.files.find(f => f.id === finalFile.id).final_is_current, false, 'changed settlement makes the old final historic');
  assert.equal(workspace.payments.find(p => p.invoice_id === settled.id).percent_of_total, '83.333');
  await saveInvoice(invoicePayload('SYNTHETIC-SETTLED'), settled.id);
  assert.equal((await rpc('list_invoice_workspace')).files.find(f => f.id === finalFile.id).final_is_current, true);
  await db.query("update public.invoices set description='Direct section edit' where id=$1", [invoice.id]);
  assert.equal((await one('select description from public.invoices where id=$1', [invoice.id])).description, 'Direct section edit');
  assert.equal((await saveInvoice(invoicePayload('SYNTHETIC-NO-RELATIONS', '0.00'), noRelations.id)).total_amount, '0.00');
  for (const total of ['-1.00', '1.001', '1e2']) await deny(saveInvoice(invoicePayload('SYNTHETIC-NO-RELATIONS', total), noRelations.id), /invalid/);
  await deny(db.query('update public.invoices set total_amount=-1 where id=$1', [noRelations.id]));
  await deny(saveInvoice({ ...editPayload, total_amount: '0.00' }, invoice.id));
  assert.equal((await one('select total_amount::text amount from public.invoices where id=$1', [noRelations.id])).amount, '0.00');
  await saveInvoice(invoicePayload('SYNTHETIC-NO-RELATIONS'), noRelations.id);
  console.log('PASS unrelated section editor RPC/direct edits, exact totals, request replay, all-payment percentage consistency, overpayment rollback and final-file history');

  // Direct REST-like table updates cannot convert section edit into ownership.
  for (const field of ['created_by', 'follow_up_owner_id']) await deny(db.query(`update public.invoices set ${field}=$1 where id=$2`, [identities.editor, invoice.id]), /identity|ownership/);
  await deny(db.query('update public.invoices set id=999999 where id=$1', [noRelations.id]), /identity|ownership/);
  await deny(db.query('update public.invoices set follow_up_owner_id=null where id=$1', [invoice.id]), /identity|ownership/);
  assert.equal((await one('select created_by,follow_up_owner_id from public.invoices where id=$1', [invoice.id])).created_by, identities.owner);
  await zero(db.query('delete from public.invoices where id=$1 returning id', [invoice.id]));
  await deny(savePayment(paymentPayload(invoice, 3)));
  await deny(savePayment({ ...paymentPayload(invoice, 1), amount: '30.00' }, paid.id));
  await deny(db.query("insert into public.invoice_payments(invoice_id,sequence_no,amount,status) values($1,9,1,'planned')", [invoice.id]));
  await zero(db.query("update public.invoice_payments set notes='Unauthorized' where id=$1 returning id", [paid.id]));
  await zero(db.query('delete from public.invoice_payments where id=$1 returning id', [planned.id]));
  await deny(reserve(invoice));
  await deny(rpc('get_invoice_file_upload', [proforma.id]));
  await deny(rpc('finalize_invoice_file', [pending.id]));
  await deny(removeFile(proforma));
  await zero(db.query('delete from public.invoice_files where id=$1 returning id', [proforma.id]));
  await zero(db.query("update public.invoice_files set upload_state=upload_state where id=$1 returning id", [proforma.id]));
  await deny(db.query("insert into storage.objects(bucket_id,name) values('invoices-private','synthetic-forbidden.pdf')"));
  await zero(db.query("update storage.objects set metadata='{}' where name=$1 returning name", [proforma.storage_path]));
  await zero(db.query('delete from storage.objects where name=$1 returning name', [proforma.storage_path]));
  await deny(db.query('select private.refresh_invoice_section_payment_percent()'), /permission/);
  await deny(rpc('invoice_file_cleanup_batch', [50]), /permission/);
  console.log('PASS no ownership/identity escalation, unrelated invoice delete/payment mutation/file upload/delete/Storage mutation/service cleanup denied');

  await actor('viewer', { view: true });
  assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === invoice.id));
  await deny(saveInvoice(editPayload, invoice.id));
  await zero(db.query("update public.invoices set title='Blocked' where id=$1 returning id", [invoice.id]));
  await deny(saveInvoice(invoicePayload('SYNTHETIC-VIEWER-CREATE')));
  await deny(savePayment(paymentPayload(invoice, 3))); await deny(reserve(invoice));
  for (const permissions of [{ ...all, view: false }, {}, { edit: true }]) {
    await actor('denied', permissions);
    assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
    assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length, 0);
    assert.equal((await one('select public.invoice_paid_amount($1)::text paid,public.invoice_remaining_amount($1)::text remaining', [invoice.id])).paid, '0');
    assert.equal((await one('select public.invoice_remaining_amount($1)::text remaining', [invoice.id])).remaining, '0');
    await deny(saveInvoice(editPayload, invoice.id));
    await deny(savePayment(paymentPayload(invoice, 3))); await deny(reserve(invoice)); await deny(removeFile(proforma));
  }
  await actor('missing', all);
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await zero(db.query("update public.invoices set title='Blocked' where id=$1 returning id", [invoice.id]));
  await actor('missing', {}, false, 'anon');
  await deny(rpc('list_invoice_workspace'), /permission/);
  await deny(db.query('select private.invoice_section_can_read()'), /permission/);
  assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length, 0);
  console.log('PASS view-only, explicit deny, edit-without-view, missing UID and anonymous boundaries');

  // Revocation is applied after a successful read in the same database; no
  // helper caches a past authorization decision. Reactivation is also live.
  await actor('editor');
  assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === invoice.id));
  await actor('editor', { ...all, view: false });
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await deny(saveInvoice(editPayload, invoice.id));
  await actor('editor', { ...all, edit: false });
  assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === invoice.id));
  await deny(saveInvoice(editPayload, invoice.id));
  await db.exec('reset role');
  await db.query('update public.profiles set active=false where id=$1', [identities.editor]);
  await actor('editor');
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await deny(saveInvoice(editPayload, invoice.id));
  await zero(db.query("update public.invoices set title='Inactive edit' where id=$1 returning id", [invoice.id]));
  await deny(savePayment(paymentPayload(invoice, 3))); await deny(reserve(invoice));
  assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length, 0);
  await db.exec('reset role');
  await db.query('update public.profiles set active=true where id=$1', [identities.editor]);
  await actor('editor');
  assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === invoice.id));
  assert.equal((await saveInvoice({ ...editPayload, total_amount: '200.00' }, invoice.id)).title, editPayload.title);
  console.log('PASS permission revocation after successful reads, inactive positive-permission editor denied, and reactivation restores access');

  await actor('editor', { view: true, edit: true });
  await deny(saveInvoice(invoicePayload('SYNTHETIC-NO-CREATE')));
  await actor('editor');
  await deny(db.query("insert into public.invoices(invoice_number,title,account_party,created_by,follow_up_owner_id) values('SYNTHETIC-IMPERSONATION','Synthetic','Synthetic',$1,$1)", [identities.owner]));
  await deny(db.query("insert into public.invoices(invoice_number,title,account_party,created_by,follow_up_owner_id) values('SYNTHETIC-ASSIGN','Synthetic','Synthetic',$1,$2)", [identities.editor, identities.owner]));
  const ownNew = await saveInvoice(invoicePayload('SYNTHETIC-OWN-CREATE'));
  assert.equal(ownNew.created_by, identities.editor); assert.equal(ownNew.follow_up_owner_id, identities.editor);
  assert.equal((await db.query('delete from public.invoices where id=$1 returning id', [ownNew.id])).rows.length, 1);
  await actor('owner', { ...all, delete: false });
  await zero(db.query('delete from public.invoices where id=$1 returning id', [noRelations.id]));
  await actor();
  // Existing related-owner assignment remains available, rather than silently
  // turning this limited proposal into a new ownership-administration policy.
  await db.query('update public.invoices set follow_up_owner_id=$1 where id=$2', [identities.followup, invoice.id]);
  await actor('followup');
  assert.equal((await one('select public.platform_can_access_invoice($1) allowed', [invoice.id])).allowed, true);
  await saveInvoice({ ...invoicePayload('SYNTHETIC-SCOPE', '200.00'), title: 'Follow-up edit' }, invoice.id);
  await savePayment({ ...paymentPayload(invoice, 1), notes: 'Existing follow-up update' }, paid.id);
  const followFile = await ready(await reserve(invoice));
  assert.equal((await removeFile(followFile)).deleted, true);
  await zero(db.query('delete from public.invoices where id=$1 returning id', [invoice.id]));
  await actor('owner', { view: true });
  const ownerViewFile = await ready(await reserve(invoice));
  assert.equal((await removeFile(ownerViewFile)).deleted, true, 'legacy owner ordinary-file writes still need view, not edit');
  await deny(savePayment(paymentPayload(invoice, 4, '1.00', 'planned')));
  await deny(removeFile(receipt)); // Existing receipt clear needs invoice edit via payment validation.
  await actor('manager', all, true);
  await saveInvoice({ ...invoicePayload('SYNTHETIC-SCOPE', '200.00'), title: 'Manager edit' }, invoice.id);
  await savePayment({ ...paymentPayload(invoice, 1), notes: 'Existing manager update' }, paid.id);
  const managerFile = await ready(await reserve(invoice));
  assert.equal((await removeFile(managerFile)).deleted, true);
  assert.equal((await db.query('delete from public.invoices where id=$1 returning id', [noRelations.id])).rows.length, 1);
  await actor('manager', { ...all, view: false }, true);
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await deny(saveInvoice(editPayload, invoice.id)); await deny(reserve(invoice));
  console.log('PASS original create identity rules, feature-delete denial, creator/follow-up/manager mutation scopes and view-only owner file behavior');

  await db.exec('reset role');
  const scopeHelper = await one("select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon_execute from pg_proc where oid='private.invoice_section_can_read()'::regprocedure");
  assert.equal(scopeHelper.prosecdef, false); assert.equal(scopeHelper.anon_execute, false); assert(scopeHelper.proconfig.includes('search_path=""'));
  for (const name of ['guard_invoice_section_edit_identity', 'refresh_invoice_section_payment_percent']) {
    const f = await one("select prosecdef,proconfig,has_function_privilege('authenticated',oid,'execute') client_execute,has_function_privilege('anon',oid,'execute') anon_execute from pg_proc where oid=$1::regprocedure", [`private.${name}()`]);
    assert.equal(f.client_execute, false); assert.equal(f.anon_execute, false); assert(f.proconfig.includes('search_path=""'));
    assert.equal(f.prosecdef, name === 'refresh_invoice_section_payment_percent');
  }
  console.log('PASS invoker read helper, empty search_path, trigger-only definer with no client execution');
} finally { await db.close(); }

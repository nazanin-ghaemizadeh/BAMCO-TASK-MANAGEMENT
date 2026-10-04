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
  foreign: '00000000-0000-0000-0000-000000000002',
  viewer: '00000000-0000-0000-0000-000000000003',
  followup: '00000000-0000-0000-0000-000000000004',
  admin: '00000000-0000-0000-0000-000000000005',
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
const deny = (promise, pattern = /denied|policy|permission|identity|ownership|not found|no longer|invalid|یافت نشد|کل/) => assert.rejects(promise, pattern);
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
const structures = async () => ({
  triggers: await triggers(),
  columns: (await db.query("select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in('public','private','storage') order by 1,2,ordinal_position")).rows,
  constraints: (await db.query("select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','storage') order by 1,2,3")).rows,
  indexes: (await db.query("select * from pg_indexes where schemaname in('public','private','storage') order by schemaname,tablename,indexname")).rows,
  tableAcl: (await db.query("select n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private','storage') and c.relkind in('r','S') order by 1,2")).rows,
});
const privateRows = async () => (await one(`select jsonb_build_object(
 'requests',(select jsonb_agg(to_jsonb(r) order by request_id) from private.invoice_mutation_requests r),
 'cleanup',(select jsonb_agg(to_jsonb(q) order by file_id) from private.invoice_storage_cleanup q),
 'profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p),
 'audit',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_trail a)) snapshot`)).snapshot;
const blanketPendingProtected = async pending => {
  // No WHERE and no RETURNING: SELECT RLS does not participate in these writes.
  await db.exec('begin; update public.invoice_files set upload_state=upload_state; reset role;');
  assert.equal((await one("select count(*)::int n from public.audit_trail where target_type='invoice_files' and target_id=$1 and action='update'", [pending.id])).n, 0, 'blanket no-op UPDATE cannot churn another uploader pending row');
  await db.exec('rollback; begin; delete from public.invoice_files; reset role;');
  assert.equal((await one('select count(*)::int n from public.invoice_files where id=$1', [pending.id])).n, 1, 'blanket DELETE cannot erase another uploader pending row');
  await db.exec('rollback');
};
const financeAmount = async invoice => one('select public.invoice_paid_amount($1)::text paid,total_amount::text total from public.invoices where id=$1', [invoice.id]);
const deleted = async (table, id) => assert.equal((await db.query(`delete from public.${table} where id=$1 returning id`, [id])).rows.length, 1);
const directStorageDenied = async file => {
  await deny(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['invoices-private', `synthetic-${randomUUID()}.pdf`]));
  await zero(db.query("update storage.objects set metadata='{}' where bucket_id='invoices-private' and name=$1 returning id", [file.storage_path]));
  await zero(db.query("delete from storage.objects where bucket_id='invoices-private' and name=$1 returning id", [file.storage_path]));
};
try {
  await db.exec(source('../tests/sql/fixtures/invoice-live-contract.sql'));
  // Explicit test stub: permission booleans are synthetic and a present, active
  // profile is required. Production's feature resolver is not replaced/tested.
  await db.exec(`alter table public.profiles add column active boolean not null default true;
    create or replace function public.can_access_feature(feature text,action text) returns boolean
    language sql stable security invoker set search_path='' as $$
      select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)
       and coalesce((current_setting('test.permissions',true)::jsonb->>action)::boolean,false)
    $$;`);
  // Execute the checked-in audit table/function verbatim. Its function body
  // also matches the read-only live definition reviewed for this change.
  const platform = source('../supabase/migrations/20260920120000_organizational_platform.sql');
  const auditTable = platform.match(/create table if not exists public[.]audit_trail\([\s\S]*?\n\);/i)?.[0];
  const auditFunction = platform.match(/create or replace function private[.]platform_audit_trigger[\s\S]*?end \$\$;/i)?.[0];
  assert(auditTable && auditFunction, 'canonical audit definitions exist');
  await db.exec(auditTable); await db.exec(auditFunction);
  await db.exec('alter table public.audit_trail enable row level security; revoke all on public.audit_trail from authenticated,anon;');
  for (const table of ['invoices', 'invoice_payments', 'invoice_files']) await db.exec(`create trigger ${table}_audit after insert or update or delete on public.${table} for each row execute function private.platform_audit_trigger()`);
  for (const id of Object.values(identities)) await db.query('insert into public.profiles(id) values($1)', [id]);
  for (const file of ['20260924160000_invoice_payment_consistency.sql', '20261003114607_invoice_attachment_upload_gate.sql', '20261003134731_invoice_file_controls.sql', '20261004160141_invoice_section_visibility.sql']) {
    await db.exec(source(`../supabase/migrations/${file}`));
  }
  await actor();
  const baseline = await saveInvoice(invoicePayload('SYNTHETIC-BASELINE'));
  const baselinePayment = await savePayment(paymentPayload(baseline, 1));
  const baselineFile = await ready(await reserve(baseline));
  const baselinePending = await reserve(baseline); await stored(baselinePending);
  await actor('foreign');
  assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === baseline.id));
  await saveInvoice({ ...invoicePayload('SYNTHETIC-BASELINE'), title: 'Existing section edit' }, baseline.id);
  await deny(savePayment(paymentPayload(baseline, 2, '1.00')));
  await deny(savePayment({ ...paymentPayload(baseline, 1), notes: 'Denied baseline' }, baselinePayment.id));
  await zero(db.query('delete from public.invoice_payments where id=$1 returning id', [baselinePayment.id]));
  await deny(reserve(baseline)); await deny(removeFile(baselineFile));
  await zero(db.query('delete from public.invoices where id=$1 returning id', [baseline.id]));
  await deny(db.query('update public.invoices set follow_up_owner_id=$1 where id=$2', [identities.foreign, baseline.id]));
  await blanketPendingProtected(baselinePending);
  console.log('PASS baseline failures reproduced for foreign payments, attachments, invoice delete and follow-up assignment');

  await db.exec('reset role');
  const beforeFunctions = await functions(), beforePolicies = await policies(), beforeStructures = await structures();
  const beforeRows = await tableRows(), beforePrivateRows = await privateRows();
  const proposal = source('../supabase/schema-proposals/invoice-capability-parity.sql');
  await db.exec(proposal);
  const first = { functions: await functions(), policies: await policies(), structures: await structures() };
  await db.exec(proposal);
  assert.deepEqual({ functions: await functions(), policies: await policies(), structures: await structures() }, first, 'reapplication is schema-idempotent');
  assert.deepEqual(await tableRows(), beforeRows, 'no business or Storage data rewrite');
  assert.deepEqual(await privateRows(), beforePrivateRows, 'no profile, request or cleanup rewrite');
  assert.deepEqual(await structures(), beforeStructures, 'table/column/constraint/index/trigger/ACL/RLS schema stays unchanged');
  const changedPolicies = new Set(['invoices_feature_delete', 'invoice_payments_scoped_insert', 'invoice_payments_scoped_update', 'invoice_payments_scoped_delete', 'invoice_files_scoped_insert', 'invoice_files_scoped_update', 'invoice_files_scoped_delete']);
  assert.deepEqual(new Set((await policies()).filter((p, i) => JSON.stringify(p) !== JSON.stringify(beforePolicies[i])).map(p => p.policyname)), changedPolicies);
  assert.deepEqual((await policies()).filter(p => !changedPolicies.has(p.policyname)), beforePolicies.filter(p => !changedPolicies.has(p.policyname)), 'read/create/pending/ledger/Storage policies stay unchanged');
  const changedFunctions = new Set(['guard_invoice_section_edit_identity', 'lock_invoice_for_file', 'guard_invoice_file']);
  const afterFunctions = await functions();
  assert.equal(afterFunctions.length, beforeFunctions.length, 'no new public endpoint or definer');
  assert.deepEqual(new Set(afterFunctions.filter((f, i) => f.definition !== beforeFunctions[i].definition).map(f => f.proname)), changedFunctions);
  for (let i = 0; i < beforeFunctions.length; i++) {
    const old = beforeFunctions[i], next = afterFunctions[i];
    assert.equal(next.acl, old.acl, `${old.proname} ACL unchanged`);
    if (!changedFunctions.has(old.proname)) assert.deepEqual(next, old, `${old.proname} stays byte-identical`);
  }
  const oldGuard = beforeFunctions.find(f => f.proname === 'guard_invoice_file').definition;
  const newGuard = afterFunctions.find(f => f.proname === 'guard_invoice_file').definition;
  assert.equal(newGuard, oldGuard.replaceAll('public.platform_can_access_invoice(NEW.invoice_id)', 'private.invoice_section_can_read()'), 'file guard changes exactly two authorization predicates');
  console.log('PASS idempotence and exact schema diff: seven policies, three existing functions, zero data/grant/trigger/Storage changes');

  await actor('foreign');
  await blanketPendingProtected(baselinePending);
  console.log('PASS blanket UPDATE/DELETE without WHERE or RETURNING protects invisible foreign pending reservations');

  // Same grants, different relationships. Every scenario starts with records
  // created/uploaded by owner, including existing payment and ready attachment.
  for (const name of ['owner', 'followup', 'foreign', 'admin']) {
    await actor();
    const invoice = await saveInvoice(invoicePayload(`SYNTHETIC-MATRIX-${name}`));
    await db.query('update public.invoices set follow_up_owner_id=$1 where id=$2', [identities.followup, invoice.id]);
    const existingPayment = await savePayment(paymentPayload(invoice, 1, '40.00'));
    const existingFile = await ready(await reserve(invoice));
    const hiddenPending = await reserve(invoice); await stored(hiddenPending);
    await db.exec('reset role');
    const auditStart = (await one('select coalesce(max(id),0)::text id from public.audit_trail')).id;
    await actor(name, all, name === 'admin');
    assert.equal((await saveInvoice({ ...invoicePayload(`SYNTHETIC-MATRIX-${name}`), title: `Edited by ${name}` }, invoice.id)).title, `Edited by ${name}`);
    assert.equal((await db.query('update public.invoices set follow_up_owner_id=$1 where id=$2 returning follow_up_owner_id', [identities.foreign, invoice.id])).rows[0].follow_up_owner_id, identities.foreign);
    await deny(db.query('update public.invoices set created_by=$1 where id=$2', [identities.viewer, invoice.id]), /immutable/);
    await deny(db.query('update public.invoices set id=id+100000 where id=$1', [invoice.id]), /immutable/);
    assert.equal((await one('select created_by from public.invoices where id=$1', [invoice.id])).created_by, identities.owner);
    assert.equal((await savePayment({ ...paymentPayload(invoice, 1, '40.00'), notes: `${name} update` }, existingPayment.id)).notes, `${name} update`);
    const nextPayment = await savePayment(paymentPayload(invoice, 2, '60.00'));
    const throwaway = await savePayment(paymentPayload(invoice, 3, '1.00', 'planned'));
    await deleted('invoice_payments', throwaway.id);
    assert.deepEqual(await financeAmount(invoice), { paid: '100.00', total: '100.00' });
    const proforma = await ready(await reserve(invoice));
    const receipt = await ready(await reserve(invoice, nextPayment, 'receipt'));
    const final = await ready(await reserve(invoice, null, 'final'));
    assert.equal(final.final_is_current, true);
    assert.equal((await one('select receipt_path from public.invoice_payments where id=$1', [nextPayment.id])).receipt_path, receipt.storage_path);
    for (const file of [existingFile, proforma, receipt, final]) {
      assert((await db.query('select name from storage.objects where name=$1', [file.storage_path])).rows.length === 1);
      await directStorageDenied(file);
    }
    if (name !== 'owner') {
      assert(!(await rpc('list_invoice_workspace')).files.some(f => f.id === hiddenPending.id));
      await deny(rpc('get_invoice_file_upload', [hiddenPending.id]));
      await deny(rpc('finalize_invoice_file', [hiddenPending.id]));
      assert.equal((await removeFile(hiddenPending)).deleted, false, 'hidden foreign pending remains inaccessible');
    }
    assert.equal((await removeFile(existingFile)).deleted, true, 'may remove another uploader ready file');
    for (const file of [proforma, receipt, final]) assert.equal((await removeFile(file)).deleted, true);
    assert.equal((await one('select receipt_path from public.invoice_payments where id=$1', [nextPayment.id])).receipt_path, null);
    await deleted('invoice_payments', nextPayment.id);
    assert.deepEqual(await financeAmount(invoice), { paid: '40.00', total: '100.00' });
    await deleted('invoices', invoice.id);
    await db.exec('reset role');
    assert.equal((await one('select count(*)::int n from public.invoice_files where invoice_id=$1', [invoice.id])).n, 0);
    assert.equal((await one('select count(*)::int n from private.invoice_storage_cleanup where file_id=$1', [hiddenPending.id])).n, 1, 'invoice cascade queues hidden pending cleanup');
    assert.equal((await one('select requested_by from private.invoice_storage_cleanup where file_id=$1', [hiddenPending.id])).requested_by, identities[name]);
    const auditRows = (await db.query('select actor_id,action,target_type,old_data,new_data from public.audit_trail where id>$1 order by id', [auditStart])).rows;
    assert(auditRows.length > 10, 'business mutations generated audit records');
    assert(auditRows.every(row => row.actor_id === identities[name]), `${name} is actual audit actor, including derived changes and cascades`);
    for (const table of ['invoices', 'invoice_payments', 'invoice_files']) assert(auditRows.some(row => row.target_type === table), `audit covers ${table}`);
    for (const row of auditRows.filter(row => row.target_type === 'invoices')) {
      if (row.old_data) assert.equal(row.old_data.created_by, identities.owner, 'audit retains original invoice creator');
      if (row.new_data) assert.equal(row.new_data.created_by, identities.owner, 'audit records actual actor separately from creator');
    }
  }
  console.log('PASS equal-grant owner/follow-up/foreign/admin matrix: edit, assignment, payments CRUD, all attachment types, invoice delete and cascades');
  console.log('PASS canonical audit trigger attributes every mutation to the actual actor while original invoice creator stays immutable');

  // Action limits are independent of relationship. View-only ordinary file
  // writes and payment DELETE are existing capabilities, not new feature grants.
  for (const name of ['owner', 'followup', 'foreign', 'admin']) {
    await actor();
    const invoice = await saveInvoice(invoicePayload(`SYNTHETIC-LIMIT-${name}`));
    await db.query('update public.invoices set follow_up_owner_id=$1 where id=$2', [identities.followup, invoice.id]);
    const paid = await savePayment(paymentPayload(invoice, 1, '100.00'));
    const receipt = await ready(await reserve(invoice, paid, 'receipt'));
    const plannedInvoice = await saveInvoice(invoicePayload(`SYNTHETIC-LIMIT-DELETE-${name}`));
    const planned = await savePayment(paymentPayload(plannedInvoice, 1, '1.00', 'planned'));
    await actor(name, { view: true }, name === 'admin');
    assert((await rpc('list_invoice_workspace')).invoices.some(i => i.id === invoice.id));
    await deny(saveInvoice(invoicePayload(`SYNTHETIC-LIMIT-${name}`), invoice.id));
    await deny(saveInvoice(invoicePayload(`SYNTHETIC-NO-CREATE-${name}`)));
    await deny(savePayment(paymentPayload(invoice, 2, '1.00', 'planned')));
    await deny(savePayment(paymentPayload(invoice, 1, '100.00'), paid.id));
    await zero(db.query('update public.invoices set follow_up_owner_id=$1 where id=$2 returning id', [identities.viewer, invoice.id]));
    await zero(db.query('delete from public.invoices where id=$1 returning id', [invoice.id]));
    for (const kind of ['proforma', 'final']) {
      const file = await ready(await reserve(invoice, null, kind));
      assert.equal((await removeFile(file)).deleted, true);
    }
    const pendingReceipt = await reserve(invoice, paid, 'receipt'); await stored(pendingReceipt);
    await deny(rpc('finalize_invoice_file', [pendingReceipt.id]));
    assert.equal((await one('select upload_state from public.invoice_files where id=$1', [pendingReceipt.id])).upload_state, 'pending');
    await deny(removeFile(receipt));
    assert.equal((await one('select receipt_path from public.invoice_payments where id=$1', [paid.id])).receipt_path, receipt.storage_path, 'denied active receipt deletion rolls back atomically');
    await deleted('invoice_payments', planned.id);
    await actor(name, { view: true, edit: true }, name === 'admin');
    await saveInvoice(invoicePayload(`SYNTHETIC-LIMIT-${name}`), invoice.id);
    await deny(saveInvoice(invoicePayload(`SYNTHETIC-EDIT-NO-CREATE-${name}`)));
    await zero(db.query('delete from public.invoices where id=$1 returning id', [invoice.id]));
    assert.equal((await rpc('finalize_invoice_file', [pendingReceipt.id])).upload_state, 'ready');
    await actor(name, { view: true, delete: true }, name === 'admin');
    await deleted('invoices', plannedInvoice.id);
  }
  console.log('PASS relationship-independent action limits: view-only file rights, edit-required payments/active receipts, create/delete feature denial');

  // Unchecked, view-revoked, no-grant and missing-session callers cannot read
  // or mutate any existing invoice or attachment, including privileged names.
  for (const permissions of [{}, { ...all, view: false }, { edit: true }, { delete: true }]) {
    for (const name of ['owner', 'foreign', 'admin']) {
      await actor(name, permissions, name === 'admin');
      assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
      await deny(saveInvoice(invoicePayload('SYNTHETIC-BASELINE'), baseline.id));
      await deny(savePayment(paymentPayload(baseline, 2, '1.00', 'planned')));
      await deny(savePayment(paymentPayload(baseline, 1), baselinePayment.id));
      await zero(db.query('delete from public.invoice_payments where id=$1 returning id', [baselinePayment.id]));
      await zero(db.query('delete from public.invoices where id=$1 returning id', [baseline.id]));
      await deny(reserve(baseline)); await deny(removeFile(baselineFile));
      await deny(rpc('get_invoice_file_upload', [baselinePending.id]));
      await deny(rpc('finalize_invoice_file', [baselinePending.id]));
      assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length, 0);
      await directStorageDenied(baselineFile);
    }
  }
  for (const name of ['owner', 'foreign', 'admin']) {
    await db.exec('reset role'); await db.query('update public.profiles set active=false where id=$1', [identities[name]]);
    await actor(name, all, name === 'admin');
    assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
    await deny(saveInvoice(invoicePayload('SYNTHETIC-BASELINE'), baseline.id));
    await deny(savePayment(paymentPayload(baseline, 2, '1.00', 'planned'))); await deny(reserve(baseline)); await deny(removeFile(baselineFile));
    await zero(db.query('delete from public.invoices where id=$1 returning id', [baseline.id]));
    await zero(db.query('delete from public.invoice_payments where id=$1 returning id', [baselinePayment.id]));
    await db.exec('reset role'); await db.query('update public.profiles set active=true where id=$1', [identities[name]]);
  }
  await actor('missing', all);
  assert.deepEqual(await rpc('list_invoice_workspace'), { invoices: [], payments: [], files: [] });
  await deny(reserve(baseline)); await deny(removeFile(baselineFile));
  await actor('missing', {}, false, 'anon');
  for (const [name, args] of [['list_invoice_workspace', []], ['get_invoice_file_upload', [baselinePending.id]], ['finalize_invoice_file', [baselinePending.id]]]) await deny(rpc(name, args), /permission/);
  await deny(db.query('select private.invoice_section_can_read()'), /permission/);
  assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length, 0);
  await directStorageDenied(baselineFile);
  console.log('PASS unchecked, revoked, action-only, inactive, missing UID and anonymous negative matrix; admin name is no bypass');

  await actor('foreign');
  assert.equal((await one('select public.platform_can_access_invoice($1) allowed', [baseline.id])).allowed, false, 'shared platform helper remains unchanged');
  await savePayment({ ...paymentPayload(baseline, 1), notes: 'Foreign permitted by new dedicated gate' }, baselinePayment.id);
  await deny(savePayment(paymentPayload(baseline, 2, '60.01')), /کل|amount|paid/);
  await deny(saveInvoice(invoicePayload('SYNTHETIC-BASELINE', '39.99'), baseline.id), /کل/);
  await deny(reserve(baseline, null, 'final'), /settlement/);
  for (const amount of ['-1', '1.001', '1e2']) await deny(savePayment(paymentPayload(baseline, 2, amount)), /amount/);
  const other = await saveInvoice(invoicePayload('SYNTHETIC-OTHER'));
  await deny(savePayment(paymentPayload(other, 1), baselinePayment.id), /immutable/);
  await deny(db.query('update public.invoice_payments set invoice_id=$1 where id=$2', [other.id, baselinePayment.id]), /immutable/);
  await deny(db.query("update public.invoice_payments set receipt_path='forged.pdf' where id=$1", [baselinePayment.id]), /finalized attachment/);
  await deny(reserve(other, baselinePayment, 'receipt'), /foreign key/);
  const reserved = await reserve(baseline);
  await deny(rpc('finalize_invoice_file', [reserved.id]), /metadata/);
  await stored(reserved);
  await deny(db.query('update public.invoice_files set uploaded_by=$1 where id=$2', [identities.owner, reserved.id]), /immutable/);
  await deny(db.query('update public.invoice_files set id=id+100000 where id=$1', [reserved.id]), /immutable/);
  const readyFile = await rpc('finalize_invoice_file', [reserved.id]);
  assert.equal(readyFile.upload_state, 'ready');
  await deny(db.query("update public.invoice_files set upload_state='pending' where id=$1", [reserved.id]), /transition/);
  await actor('owner');
  await deny(rpc('get_invoice_file_upload', [reserved.id])); await deny(rpc('finalize_invoice_file', [reserved.id]));
  await deny(reserve(baseline, null, 'proforma', reserved.client_request_id), /different/);
  await actor('foreign');
  assert.equal((await removeFile(readyFile)).deleted, true);
  assert.equal((await removeFile(readyFile)).deleted, false);
  await deny(reserve(baseline, null, 'proforma', reserved.client_request_id), /retired/);
  await deny(db.query('select private.lock_invoice_for_file(999999999)'), /no longer/);
  const req = randomUUID(), payload = { ...paymentPayload(baseline, 1), notes: 'Original request' };
  await savePayment(payload, baselinePayment.id, req);
  await savePayment({ ...payload, notes: 'Later edit' }, baselinePayment.id);
  assert.equal((await savePayment(payload, baselinePayment.id, req)).notes, 'Later edit', 'request replay returns current row, not stale payload');
  await actor('foreign', { view: true });
  await deny(savePayment({ ...payload, notes: 'Revoked new edit' }, baselinePayment.id));
  await actor('foreign', {});
  await deny(savePayment(payload, baselinePayment.id, req));
  console.log('PASS accounting validation, settlement, payment/attachment immutable identity, upload metadata, uploader isolation and replay/revocation safety');

  await db.exec('reset role');
  for (const [name, definer, clientExecute] of [['private.invoice_section_can_read()', false, true], ['private.lock_invoice_for_file(bigint)', true, true], ['private.guard_invoice_section_edit_identity()', false, false]]) {
    const row = await one("select prosecdef,proconfig,has_function_privilege('authenticated',oid,'execute') client_execute,has_function_privilege('anon',oid,'execute') anon_execute from pg_proc where oid=$1::regprocedure", [name]);
    assert.equal(row.prosecdef, definer); assert.equal(row.client_execute, clientExecute); assert.equal(row.anon_execute, false); assert(row.proconfig.includes('search_path=""'));
  }
  console.log('PASS security attributes: no new definer/public endpoint, empty search_path, unchanged shared helper/Storage guards');
} finally { await db.close(); }

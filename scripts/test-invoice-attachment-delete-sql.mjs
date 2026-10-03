// Isolated PostgreSQL/PGlite contract tests. No network, credentials, live data,
// Storage API, real bytes or multi-session concurrency is involved.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const actors = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003'];
const all = { view: true, create: true, edit: true, delete: true };
const actor = async (id = actors[0], permissions = all, manager = false, role = 'authenticated') => {
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false),set_config('test.manager',$3,false)", [id, JSON.stringify(permissions), String(manager)]);
  await db.exec(`set role ${role}`);
};
const rpc = async (name, args) => (await db.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)).rows[0].result;
const reserve = (invoice, payment = null, kind = 'proforma') => rpc('reserve_invoice_file', [randomUUID(), invoice, payment, kind, 'same.pdf', 'application/pdf', 32, 'a'.repeat(64)]);
const remove = (file, overrides = {}) => { const f = { ...file, ...overrides }; return rpc('delete_invoice_file', [f.id, f.invoice_id, f.payment_id, f.file_type, f.client_request_id]); };
const deny = (promise, pattern = /denied|policy|permission|match|invalid/) => assert.rejects(promise, pattern);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const ready = async file => {
  await db.exec('reset role');
  await db.query('insert into storage.objects(bucket_id,name,metadata,user_metadata) values($1,$2,$3,$4)', ['invoices-private', file.storage_path, JSON.stringify({ size: 32, mimetype: 'application/pdf' }), JSON.stringify({ sha256: file.sha256 })]);
  await db.exec('set role authenticated');
  return rpc('finalize_invoice_file', [file.id]);
};
try {
  await db.exec(source('../tests/sql/fixtures/invoice-live-contract.sql'));
  await db.exec(source('../supabase/migrations/20260924160000_invoice_payment_consistency.sql'));
  await db.exec(source('../supabase/migrations/20261003114607_invoice_attachment_upload_gate.sql'));
  const proposal = source('../supabase/schema-proposals/invoice-attachment-delete.sql');
  await db.exec(proposal); await db.exec(proposal);
  for (const id of actors) await db.query('insert into public.profiles(id) values($1)', [id]);
  await actor();
  const invoice = await rpc('save_invoice', [randomUUID(), null, JSON.stringify({ invoice_number: 'DELETE-TEST', title: 'Scoped files', account_party: 'Supplier', company_name: 'Supplier', currency: 'IRR', total_amount: '100.00' })]);
  const stages = [];
  for (const sequence of [1, 2]) stages.push(await rpc('save_invoice_payment', [randomUUID(), null, JSON.stringify({ invoice_id: invoice.id, sequence_no: sequence, amount: '50.00', status: 'paid' })]));
  const first = await ready(await reserve(invoice.id, stages[0].id, 'receipt'));
  const second = await ready(await reserve(invoice.id, stages[1].id, 'receipt'));
  const older = await ready(await reserve(invoice.id));
  const newer = await ready(await reserve(invoice.id));
  const pending = await reserve(invoice.id);
  const final = await ready(await reserve(invoice.id, null, 'final'));
  const before = await rpc('list_invoice_workspace', []);
  await deny(remove(first, { payment_id: stages[1].id }));
  await deny(remove(first, { file_type: 'proforma', payment_id: null }));
  await deny(remove(first, { client_request_id: randomUUID() }));
  assert.equal((await rpc('list_invoice_workspace', [])).files.length, before.files.length);
  await actor(actors[1]); await deny(remove(first));
  await actor(actors[0], { ...all, view: false }); await deny(remove(first));
  await actor('', {}, false, 'anon'); await deny(remove(first), /permission/);
  console.log('PASS exact invoice/payment/kind/request checks, unrelated actor/feature denial, anon execution denied');

  // The existing payment validation trigger requires invoice-edit scope when
  // clearing a current receipt_path. This proposal does not widen that right.
  await actor(actors[0], { view: true });
  await deny(remove(first), /یافت نشد|denied/);
  assert.equal((await remove(older)).deleted, true, 'ordinary file deletion retains view-only owner scope');
  await actor();
  const result = await remove(first);
  assert.deepEqual(result, { id: first.id, invoice_id: invoice.id, payment_id: stages[0].id, file_type: 'receipt', deleted: true });
  const replay = await remove(first); assert.equal(replay.deleted, false);
  assert.equal((await one('select receipt_path from public.invoice_payments where id=$1', [stages[0].id])).receipt_path, null);
  assert.equal((await one('select receipt_path from public.invoice_payments where id=$1', [stages[1].id])).receipt_path, second.storage_path);
  const after = await rpc('list_invoice_workspace', []);
  assert.equal(after.invoices[0].total_amount, '100.00'); assert.equal(after.payments.length, 2); assert(after.payments.every(row => row.amount === '50.00'));
  assert(after.files.some(row => row.id === second.id)); assert(!after.files.some(row => row.id === older.id)); assert(after.files.some(row => row.id === newer.id)); assert(after.files.find(row => row.id === final.id).final_is_current);
  await deny(db.query('select * from private.invoice_storage_cleanup'), /permission/);
  await db.exec('reset role');
  assert.equal((await one('select storage_path from private.invoice_storage_cleanup where file_id=$1', [first.id])).storage_path, first.storage_path);
  assert(await one('select id from storage.objects where name=$1', [first.storage_path]), 'metadata delete does not purge stored bytes');
  await actor();
  await deny(rpc('reserve_invoice_file', [first.client_request_id, invoice.id, stages[0].id, 'receipt', first.file_name, first.content_type, 32, first.sha256]), /retired|used/);
  console.log('PASS view-only owner scope, exact one-file removal, idempotent absence response, preserved finances and other receipt link, cleanup tombstone/request retirement');

  // A manager can delete a ready attachment under existing scope, but cannot
  // falsely claim deletion of another uploader's hidden pending reservation.
  await actor(actors[2], { view: true }, true);
  assert.equal((await remove(newer)).deleted, true);
  assert.equal((await remove(pending)).deleted, false);
  await actor(); assert((await rpc('list_invoice_workspace', [])).files.some(row => row.id === pending.id));
  assert.equal((await remove(pending)).deleted, true);
  await db.exec('reset role');
  assert(await one('select file_id from private.invoice_storage_cleanup where file_id=$1', [pending.id]));
  const flags = await one("select prosecdef,proconfig from pg_proc where oid='public.delete_invoice_file(bigint,bigint,bigint,text,uuid)'::regprocedure");
  assert.equal(flags.prosecdef, false); assert(flags.proconfig.includes('search_path=""'));
  console.log('PASS manager scope, hidden pending privacy, uploader cancellation, SECURITY INVOKER and empty search_path');
} finally { await db.close(); }

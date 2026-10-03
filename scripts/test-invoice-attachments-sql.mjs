// Actual PostgreSQL functions, triggers, constraints and role RLS in isolated
// PGlite. No network/credentials/live writes. Storage metadata/auth are explicit
// stubs: this is NOT a claim to test Storage bytes/API or concurrent sessions.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const actors = ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
const all = {view:true,create:true,edit:true,delete:true};
const actor = async (id=actors[0], permissions=all, manager=false, role='authenticated') => {
 await db.exec('reset role');
 await db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false),set_config('test.manager',$3,false)",[id,JSON.stringify(permissions),String(manager)]);
 await db.exec(`set role ${role}`);
};
const invoicePayload = (number, amount='100.00') => ({invoice_number:number,title:`Invoice ${number}`,account_party:'Supplier',company_name:'Supplier',currency:'IRR',total_amount:amount,due_date:null,description:null});
const paymentPayload = (id,sequence,amount='100.00',status='paid') => ({invoice_id:id,sequence_no:sequence,amount,status,planned_date:null,paid_date:null,tracking_no:null,notes:null});
const rpc = async (name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
const saveInvoice = (payload,id=null,request=randomUUID()) => rpc('save_invoice',[request,id,JSON.stringify(payload)]);
const savePayment = (payload,id=null,request=randomUUID()) => rpc('save_invoice_payment',[request,id,JSON.stringify(payload)]);
const reserve = (invoice,payment=null,kind='proforma',request=randomUUID(),overrides={}) => rpc('reserve_invoice_file',[request,invoice,payment,kind,overrides.file_name||'invoice.pdf',overrides.content_type||'application/pdf',overrides.size_bytes??32,overrides.sha256||'a'.repeat(64)]);
const upload = (row, metadata={size:Number(row.size_bytes),mimetype:row.content_type}, user={sha256:row.sha256}, name=row.storage_path) => db.query('insert into storage.objects(bucket_id,name,metadata,user_metadata,owner_id) values ($1,$2,$3,$4,$5)', ['invoices-private',name,JSON.stringify(metadata),JSON.stringify(user),actors[0]]);
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const deny = async (promise,pattern=/denied|policy|permission|not found|immutable|invalid|unsupported|requires|match|already used|duplicate|foreign key|پرداخت|کل|receipt/i) => assert.rejects(promise,pattern);
try {
 await db.exec(source('../tests/sql/fixtures/invoice-live-contract.sql'));
 await db.exec(source('../supabase/migrations/20260924160000_invoice_payment_consistency.sql'));
 for (const id of actors) await db.query('insert into public.profiles(id) values($1)',[id]);
 // Legacy rows must survive the proposal untouched and be readable afterwards.
 const legacyInvoice = (await db.query("insert into public.invoices(invoice_number,title,account_party,total_amount,created_by,follow_up_owner_id) values('LEGACY','Old','Old',100,$1,$1) returning id::text",[actors[0]])).rows[0].id;
 const legacyFile = (await db.query("insert into public.invoice_files(invoice_id,file_type,file_name,storage_path,uploaded_by) values($1,'proforma','old.pdf','legacy/old.pdf',$2) returning id::text",[legacyInvoice,actors[0]])).rows[0].id;
 const proposal = source('../supabase/schema-proposals/invoice-attachments.sql');
 await db.exec(proposal);
 await db.exec(proposal); // Proposal must be safe to reapply to an isolated DB.
 await actor();
 let workspace = await rpc('list_invoice_workspace',[]);
 assert.equal(workspace.files.find(f=>f.id===legacyFile).upload_state,'ready');
 assert.equal(workspace.files.find(f=>f.id===legacyFile).storage_path,'legacy/old.pdf');
 assert.equal(workspace.files.find(f=>f.id===legacyFile).bucket_id,null);

 const createRequest = randomUUID(), payload=invoicePayload('ONE');
 const inv = await saveInvoice(payload,null,createRequest);
 assert.equal(typeof inv.id,'string'); assert.equal(inv.total_amount,'100.00');
 const same = await saveInvoice(payload,null,createRequest);
 assert.equal(same.id,inv.id);
 await deny(saveInvoice({...payload,title:'Different'},null,createRequest));
 await deny(saveInvoice(payload)); // Same invoice number, genuinely new request.
 const edited = await saveInvoice({...payload,title:'Edited'},inv.id);
 assert.equal((await saveInvoice(payload,null,createRequest)).title,'Edited','old create retry must not overwrite later edit');
 const editRequest=randomUUID();
 await saveInvoice({...payload,title:'Second'},inv.id,editRequest);
 await saveInvoice({...payload,title:'Third'},inv.id);
 assert.equal((await saveInvoice({...payload,title:'Second'},inv.id,editRequest)).title,'Third','old edit retry returns current row');
 const repeated = await Promise.all(Array.from({length:5},()=>saveInvoice(invoicePayload('QUEUED'),null,'10000000-0000-0000-0000-000000000001')));
 assert.equal(new Set(repeated.map(i=>i.id)).size,1,'queued duplicate requests return one row');
 await deny(saveInvoice(invoicePayload('FRACTION','10.001')));
 await deny(saveInvoice(invoicePayload('EXPONENT','1e2')));
 await deny(saveInvoice({...payload,created_by:actors[1]}));
 const huge = await saveInvoice(invoicePayload('EXACT','9007199254740993.01'));
 assert.equal(huge.total_amount,'9007199254740993.01');
 await db.exec('reset role');
 await db.query('update public.invoices set id=9007199254740993 where id=$1',[huge.id]);
 await actor();
 workspace = await rpc('list_invoice_workspace',[]);
 assert.ok(workspace.invoices.some(i=>i.id==='9007199254740993' && i.total_amount==='9007199254740993.01'));
 const maximum=await saveInvoice(invoicePayload('MAXIMUM','9999999999999999.99')); assert.equal(maximum.total_amount,'9999999999999999.99');
 await deny(saveInvoice(invoicePayload('OVER-MAX','10000000000000000.00')));
 const maximumPayment=await savePayment(paymentPayload(maximum.id,1,'9999999999999999.99')); assert.equal(maximumPayment.amount,'9999999999999999.99');
 await deny(savePayment(paymentPayload(maximum.id,2,'0.001')));
 console.log('PASS exact money/IDs, create/edit replay, conflicts and repeated submission');

 const payRequest=randomUUID(), pp=paymentPayload(inv.id,1,'60.00');
 const pay=await savePayment(pp,null,payRequest);
 assert.equal(pay.amount,'60.00'); assert.equal(pay.percent_of_total,'60.000'); assert.ok(pay.paid_date);
 assert.equal((await savePayment(pp,null,payRequest)).id,pay.id);
 await deny(savePayment(paymentPayload(inv.id,1,'20.00')));
 await deny(savePayment(paymentPayload(inv.id,2,'41.00')));
 const resequenced=await savePayment({...pp,sequence_no:8},pay.id); assert.equal(resequenced.sequence_no,8);
 await savePayment(pp,pay.id);
 await deny(db.query('update public.invoice_payments set invoice_id=$1 where id=$2',[legacyInvoice,pay.id]));
 await deny(savePayment({...pp,percent_of_total:'999'},pay.id));
 const stage=await savePayment(paymentPayload(inv.id,2,'40.00','planned'));
 assert.equal(stage.paid_date,null);
 await deny(reserve(inv.id,null,'final'));
 await saveInvoice({...payload,total_amount:'120.00'},inv.id);
 assert.equal((await one('select percent_of_total::text p from public.invoice_payments where id=$1',[pay.id])).p,'50.000');
 await saveInvoice(payload,inv.id);
 await savePayment(paymentPayload(inv.id,2,'40.00'),stage.id);
 const extra=await savePayment(paymentPayload(inv.id,3,'1.00','planned'));
 await deny(reserve(inv.id,null,'final'));
 assert.notEqual((await one('select status from public.invoices where id=$1',[inv.id])).status,'settled','unpaid stage precludes settled status');
 await db.query('delete from public.invoice_payments where id=$1',[extra.id]);
 const zero=await saveInvoice(invoicePayload('ZERO','0.00'));
 await deny(reserve(zero.id,null,'final'));
 console.log('PASS server percentages, overpayment validation, immutable payment pair and settlement eligibility');

 const fileReq=randomUUID();
 const receipt=await reserve(inv.id,pay.id,'receipt',fileReq);
 assert.equal(receipt.upload_state,'pending'); assert.equal(receipt.storage_path,`${inv.id}/${pay.id}/receipt/${fileReq}.pdf`);
 assert.equal((await reserve(inv.id,pay.id,'receipt',fileReq)).id,receipt.id);
 await deny(reserve(inv.id,pay.id,'receipt',fileReq,{sha256:'b'.repeat(64)}));
 await deny(reserve(inv.id,stage.id,'proforma'));
 await deny(reserve(legacyInvoice,pay.id,'receipt'));
 await deny(reserve(inv.id,null,'receipt'));
 await deny(reserve(inv.id,null,'unknown'));
 await deny(reserve(inv.id,null,'proforma',randomUUID(),{file_name:'payload.exe'}));
 await deny(reserve(inv.id,null,'proforma',randomUUID(),{file_name:'image.png',content_type:'application/pdf'}));
 await deny(reserve(inv.id,null,'proforma',randomUUID(),{content_type:'text/html'}));
 await deny(reserve(inv.id,null,'proforma',randomUUID(),{size_bytes:6291457}));
 await deny(reserve(inv.id,null,'proforma',randomUUID(),{size_bytes:0}));
 await deny(rpc('finalize_invoice_file',[receipt.id]));
 assert.equal((await one('select upload_state from public.invoice_files where id=$1',[receipt.id])).upload_state,'pending','failed upload leaves stable retry reservation');
 await deny(upload(receipt,{size:33,mimetype:receipt.content_type}));
 await deny(upload(receipt,undefined,{sha256:'b'.repeat(64)}));
 await deny(upload(receipt,undefined,undefined,'wrong/path.pdf'));
 await upload(receipt);
 const finalized=await rpc('finalize_invoice_file',[receipt.id]);
 assert.equal(finalized.upload_state,'ready');
 assert.equal((await one('select receipt_path from public.invoice_payments where id=$1',[pay.id])).receipt_path,receipt.storage_path);
 assert.equal((await rpc('finalize_invoice_file',[receipt.id])).id,receipt.id);
 assert.equal((await db.query('update storage.objects set metadata=$1 where name=$2 returning name',[JSON.stringify({size:32,mimetype:'application/pdf'}),receipt.storage_path])).rows.length,0,'ready bytes are immutable');
 assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[receipt.storage_path])).rows.length,0,'client cannot remove ready bytes');
 for (const assignment of ["invoice_id="+legacyInvoice,"payment_id="+stage.id,"file_type='final'","file_name='renamed.pdf'","storage_path='evil'","uploaded_by='"+actors[1]+"'","upload_state='pending'"]) await deny(db.query(`update public.invoice_files set ${assignment} where id=$1`,[receipt.id]));
 await deny(db.query("update public.invoice_payments set receipt_path='arbitrary/path' where id=$1",[pay.id]));
 const newer=await reserve(inv.id,pay.id,'receipt'); await upload(newer); await rpc('finalize_invoice_file',[newer.id]);
 await rpc('finalize_invoice_file',[receipt.id]);
 assert.equal((await one('select receipt_path from public.invoice_payments where id=$1',[pay.id])).receipt_path,newer.storage_path,'old finalize retry cannot replace newer receipt');
 const final=await reserve(inv.id,null,'final'); await upload(final); const readyFinal=await rpc('finalize_invoice_file',[final.id]);
 assert.equal(readyFinal.final_is_current,true);
 await saveInvoice({...payload,total_amount:'110.00'},inv.id);
 workspace=await rpc('list_invoice_workspace',[]);
 assert.equal(workspace.files.find(f=>f.id===final.id).final_is_current,false);
 assert.notEqual(workspace.invoices.find(i=>i.id===inv.id).status,'settled');
 await savePayment(paymentPayload(inv.id,4,'10.00'));
 workspace=await rpc('list_invoice_workspace',[]);
 assert.equal(workspace.files.find(f=>f.id===final.id).final_is_current,false,'old final stays stale after different settlement');
 assert.equal((await one('select count(*)::text n from storage.objects where name=$1',[final.storage_path])).n,'1','stale final remains available as history');
 console.log('PASS reservation retry, allowed types/limits, metadata checks, immutable files, receipt atomicity and stale-final history');

 // Outsider and feature-denied users cannot use RPCs or Storage; a related owner
 // can view ready documents but cannot inspect or finalize somebody else's pending.
 const pending=await reserve(inv.id);
 await actor(actors[1]);
 assert.deepEqual(await rpc('list_invoice_workspace',[]),{invoices:[],payments:[],files:[]});
 await deny(saveInvoice(payload,inv.id)); await deny(savePayment(paymentPayload(inv.id,5,'1.00'))); await deny(reserve(inv.id)); await deny(rpc('finalize_invoice_file',[receipt.id]));
 assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length,0);
 await deny(upload(pending));
 await db.exec('reset role'); await db.query('update public.invoices set follow_up_owner_id=$1 where id=$2',[actors[1],inv.id]);
 await actor(actors[1]);
 workspace=await rpc('list_invoice_workspace',[]);
 assert.ok(workspace.files.some(f=>f.id===receipt.id)); assert.ok(!workspace.files.some(f=>f.id===pending.id));
 await deny(rpc('finalize_invoice_file',[pending.id])); await deny(upload(pending));
 const ownPending=await reserve(inv.id); assert.equal(ownPending.upload_state,'pending');
 await actor(actors[0],{...all,create:false}); await deny(saveInvoice(invoicePayload('DENIED-CREATE')));
 await actor(actors[0],{...all,edit:false}); await deny(saveInvoice(payload,inv.id));
 // Existing payment trigger's invoker parent lock already requires edit rights.
 await deny(savePayment(paymentPayload(inv.id,6,'1.00','planned')));
 // Files retain original view-scoped access, including final locks.
 const viewFinal=await reserve(inv.id,null,'final'); await upload(viewFinal); assert.equal((await rpc('finalize_invoice_file',[viewFinal.id])).upload_state,'ready');
 await actor(actors[0],{...all,delete:false}); assert.equal((await db.query('delete from public.invoices where id=$1 returning id',[inv.id])).rows.length,0);
 await actor(actors[0],{...all,view:false}); assert.deepEqual(await rpc('list_invoice_workspace',[]),{invoices:[],payments:[],files:[]}); await deny(reserve(inv.id));
 await actor('',{},false,'anon'); await deny(rpc('list_invoice_workspace',[]),/permission/); assert.equal((await db.query("select name from storage.objects where bucket_id='invoices-private'")).rows.length,0);
 await actor(actors[2],all,true); assert.ok((await rpc('list_invoice_workspace',[])).invoices.some(i=>i.id===inv.id));
 console.log('PASS existing invoice feature/owner/manager scope, pending uploader scope, restrictive Storage guards and anon denial');

 await actor();
 await deny(db.query('select * from private.invoice_storage_cleanup'),/permission/);
 await db.query('delete from public.invoice_files where id=$1',[newer.id]);
 assert.equal((await one('select receipt_path from public.invoice_payments where id=$1',[pay.id])).receipt_path,receipt.storage_path,'deleting latest receipt selects earlier ready attachment');
 await deny(reserve(inv.id,pay.id,'receipt',newer.client_request_id),/retired|used/);
 await db.exec('reset role');
 assert.equal((await one('select storage_path from private.invoice_storage_cleanup where file_id=$1',[newer.id])).storage_path,newer.storage_path);
 await actor(); await db.query('delete from public.invoice_payments where id=$1',[pay.id]);
 assert.equal((await db.query('select id from public.invoice_files where id=$1',[receipt.id])).rows.length,0);
 await db.exec('reset role'); assert.ok(await one('select file_id from private.invoice_storage_cleanup where file_id=$1',[receipt.id]));
 await actor(); await db.query('delete from public.invoices where id=$1',[inv.id]);
 await deny(saveInvoice(payload,null,createRequest),/no longer exists/);
 await db.exec('reset role');
 assert.ok(await one('select file_id from private.invoice_storage_cleanup where file_id=$1',[ownPending.id]),'invoice cascade queues other uploader hidden pending row');
 assert.ok(await one('select file_id from private.invoice_storage_cleanup where file_id=$1',[final.id]));
 assert.ok(await one('select name from storage.objects where name=$1',[final.storage_path]),'SQL never deletes Storage metadata or bytes');
 const exposed=await db.query("select proname,prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in('save_invoice','save_invoice_payment','reserve_invoice_file','finalize_invoice_file','list_invoice_workspace')");
 assert.equal(exposed.rows.length,5); assert.ok(exposed.rows.every(f=>!f.prosecdef));
 assert.equal((await one("select has_function_privilege('authenticated','private.queue_invoice_file_cleanup()','EXECUTE') allowed")).allowed,false);
 console.log('PASS delete outbox, cascades, legacy preservation, invoker RPCs and trigger-only cleanup privileges');
 console.log('Invoice attachment SQL contract: PASS. Activation still requires real Storage API and multi-session PostgreSQL integration checks.');
} finally { await db.close(); }

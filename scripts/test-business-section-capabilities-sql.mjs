// LOCAL synthetic PostgreSQL tests, with the actual canonical access resolver,
// snapshots and setter from historical migrations. No production or network use.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { featureDb, ids, ordinary, protectedActions, source, canonicalFunction } from '../tests/helpers/feature-access-db.mjs';

const business = ['invoices','vehiclePermanent','vehicleTemporary','parts','pettyCash','letters','phonebook'];
const excluded = ['documents','projects','settings','people','organization','activeSessions','loginActivity','systemOptions',
  'kanban','archive','dashboard','approvals','requestHistory','taskTimeline','performanceReport','userGuide',
  'messages','messageCenter','sentMessages','groupChat','directMessages','taskChats','notes','voiceAssistant','sitesAccess','stickers','tools'];
const f=await featureDb(), {db,root,one,as,can,snapshot,grant,features}=f;
const proposal=source('supabase/schema-proposals/business-section-capabilities.sql');
const allRows=async()=> (await one(`select jsonb_agg(to_jsonb(g) order by id) rows from public.feature_access_grants g`)).rows;
const functions=async()=> (await db.query(`select n.nspname||'.'||p.proname name,pg_get_functiondef(p.oid) definition,p.proacl::text acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') order by 1`)).rows;
const catalog=async()=>({
  policies:(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,
  relations:(await db.query("select n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') order by 1,2")).rows,
  columns:(await db.query("select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in('public','private') order by 1,2,ordinal_position")).rows,
  constraints:(await db.query("select c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') order by 1,2")).rows
});
async function allowed(feature,expected,actions=ordinary){for(const action of actions)assert.equal(await can(feature,action),expected,`${feature}.${action}`);}
async function unchangedOrdinary(feature){assert.equal(await can(feature),true,`${feature}.view`);await allowed(feature,false,ordinary.slice(1));}
const rpc=async(name,args=[]) => (await one(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).result;
const setter=(feature,user,bits={})=>rpc('set_feature_access',[feature,JSON.stringify([{user_id:ids[user],can_view:true,...bits}])]);
const assertDenied=promise=>assert.rejects(promise,/permission|دسترسی|42501/);

try{
  await features([...business,...excluded]);
  for(const key of [...business,...excluded]){
    await grant(key,'direct');
    await grant(key,'peer',{}, {metadata:JSON.stringify({source:'baseline_migration'})});
    await grant(key,'role',{}, {subject_kind:'organization_role',user_id:null,role_id:1});
    await grant(key,'inactive');
    await grant(key,'denied',{can_view:false},{effect:'deny'});
  }
  await grant('documents','resource',{}, {resource_type:'category',resource_id:'alpha'});
  await as('direct');
  for(const key of business)await unchangedOrdinary(key);
  console.log('PASS historical partial grants reproduce checked-view / denied-action mismatch');
  await root();
  const beforeRows=await allRows(),beforeCatalog=await catalog(),beforeFunctions=await functions();
  await db.exec(proposal);
  assert.deepEqual(await allRows(),beforeRows,'no historical grants or baseline grants are written');
  assert.deepEqual(await catalog(),beforeCatalog,'no relation, RLS, column, constraint or ACL change');
  const firstFunctions=await functions();
  const changed=firstFunctions.filter(fn=>JSON.stringify(beforeFunctions.find(old=>old.name===fn.name))!==JSON.stringify(fn)).map(fn=>fn.name);
  assert.deepEqual(changed.sort(),['private.feature_grant_allows','private.feature_uses_section_capabilities','public.set_feature_access'].sort());
  for(const old of beforeFunctions)assert.equal(firstFunctions.find(fn=>fn.name===old.name).acl,old.acl,`${old.name} ACL preserved`);
  await db.exec(proposal);assert.deepEqual(await functions(),firstFunctions,'proposal is idempotent');
  assert.deepEqual(await allRows(),beforeRows,'second application writes no grants');
  console.log('PASS exact 2 replacements + 1 private pure helper; no data/RLS/ACL changes; idempotent');

  for(const user of ['direct','peer','role']){
    await as(user);
    for(const key of business){await allowed(key,true);await allowed(key,false,protectedActions);assert.equal(await can(key,'unknown'),false);}
    for(const key of excluded)await unchangedOrdinary(key);
    const rows=(await snapshot()).grants;
    for(const key of business){const row=rows.find(r=>r.feature_key===key);for(const action of ordinary)assert.equal(row[`can_${action}`],true);assert.equal(row.can_manage_access,false);assert.equal(row.can_bypass_approval,false);}
  }
  console.log('PASS direct, historical baseline-source and active primary-role grants normalize all seven sections; snapshots agree');
  for(const user of ['none','denied','inactive',null]){await as(user);for(const key of business)await allowed(key,false,[...ordinary,...protectedActions]);}
  await as(null,'anon');await assertDenied(snapshot());await assertDenied(can('invoices'));
  await as('direct');await assertDenied(db.query("select private.feature_uses_section_capabilities('invoices')"));
  await assertDenied(db.query("select private.feature_can_access_for($1,'invoices','edit')",[ids.peer]));
  console.log('PASS no grant, explicit deny over inherited role, inactive, missing actor, anon and private-function ACL boundaries');

  // Exact current resolver precedence: no new subject kinds or inheritance.
  await root();
  await assert.rejects(grant('invoices','none',{}, {subject_kind:'organization_position',user_id:null}),/check constraint/);
  for(const mutation of ["is_primary=false","valid_from=current_date+1","valid_to=current_date"]){
    await root();await db.exec(`update public.organization_position_assignments set ${mutation} where user_id='${ids.role}'`);
    await as('role');for(const key of business)await allowed(key,false);
    await root();await db.exec(`update public.organization_position_assignments set is_primary=true,valid_from=current_date,valid_to=null where user_id='${ids.role}'`);
  }
  await root();await db.exec('update public.organization_positions set active=false where id=1');await as('role');await allowed('invoices',false);
  await root();await db.exec('update public.organization_positions set active=true where id=1');
  await db.exec("update public.feature_access_grants set revoked_at=now() where feature_key='invoices' and user_id='"+ids.direct+"'");
  await as('direct');await allowed('invoices',false);
  await root();await db.exec("update public.feature_access_grants set revoked_at=null where feature_key='invoices' and user_id='"+ids.direct+"'");
  await db.exec("update public.app_features set active=false where feature_key='invoices'");
  for(const user of ['direct','role','manager']){await as(user);await allowed('invoices',false);assert(!(await snapshot()).grants.some(row=>row.feature_key==='invoices'));}
  await root();await db.exec("update public.app_features set active=true where feature_key='invoices'");
  await as('manager');await allowed('invoices',true,[...ordinary,...protectedActions]);
  console.log('PASS role primary/date/position activity, revoked grants and disabled features retain canonical behavior');

  // Scoped grants must never become a checked whole section or gain new actions.
  await as('resource');await allowed('documents',false);
  await root();
  for(const action of ordinary){const row=await one("select private.feature_can_access_for($1,'documents',$2,'category','alpha') allowed",[ids.resource,action]);assert.equal(row.allowed,action==='view');}
  assert.equal((await one("select private.feature_can_access_for($1,'documents','view','category','other') allowed",[ids.resource])).allowed,false);
  await db.exec("update public.feature_access_grants set can_view=false,can_edit=true where feature_key='invoices' and user_id='"+ids.direct+"'");
  await as('direct');assert.equal(await can('invoices'),false);assert.equal(await can('invoices','edit'),false);await allowed('invoices',false,['create','delete','export']);
  await root();await db.exec("update public.feature_access_grants set can_view=true,can_edit=false where feature_key='invoices' and user_id='"+ids.direct+"'");
  console.log('PASS resource-only grants retain boundaries; unchecked whole-section grants deny all ordinary actions');

  // Preserve the unusual but existing partial-null matching behavior without
  // letting any malformed/scoped row become a whole-section action grant.
  for(const resource of [{resource_type:null,resource_id:'orphan'},{resource_type:'category',resource_id:null},{resource_type:'',resource_id:''}]){
    await root();await db.query("delete from public.feature_access_grants where feature_key='documents' and user_id=$1",[ids.resource]);
    await grant('documents','resource',{},resource);
    await root();
    for(const action of ordinary){const result=await one("select private.feature_can_access_for($1,'documents',$2,$3,$4) allowed",[ids.resource,action,resource.resource_type,resource.resource_id]);assert.equal(result.allowed,action==='view');}
  }
  await root();
  const helperDeny=await one("select private.feature_grant_allows(jsonb_populate_record(null::public.feature_access_grants,'{\"feature_key\":\"invoices\",\"effect\":\"deny\",\"can_view\":true,\"can_edit\":false}'),'edit') allowed");
  assert.equal(helperDeny.allowed,false,'denies never have ordinary bits inflated by helper');
  await db.exec("update public.feature_access_grants set effect='deny' where feature_key='invoices' and subject_kind='organization_role'");
  await as('direct');await allowed('invoices',true,'view edit'.split(' '));
  await as('role');await allowed('invoices',false);
  await root();await db.exec("update public.feature_access_grants set effect='allow' where feature_key='invoices' and subject_kind='organization_role'");
  await grant('invoices','manager',{can_view:false},{effect:'deny'});await as('manager');await allowed('invoices',true);
  console.log('PASS scoped/partial-null grant shapes, raw deny bits, role-deny and manager precedence');

  // The resource-specific resolver must still require its own scoped grant.
  // A normalized whole-section grant does not normalize scoped action bits.
  const scopedInvoice=await grant('invoices','direct',{}, {resource_type:'invoice',resource_id:'scoped-fixture'});
  await root();
  const resourceCan=async action=>(await one("select private.feature_can_access_resource_for($1,'invoices',$2,'invoice','scoped-fixture') allowed",[ids.direct,action])).allowed;
  assert.equal(await resourceCan('view'),true);assert.equal(await resourceCan('edit'),false);
  await db.query('update public.feature_access_grants set can_edit=true where id=$1',[scopedInvoice.id]);assert.equal(await resourceCan('edit'),true);
  await db.query("update public.feature_access_grants set effect='deny' where id=$1",[scopedInvoice.id]);assert.equal(await resourceCan('edit'),false);
  await db.query('delete from public.feature_access_grants where id=$1',[scopedInvoice.id]);assert.equal(await resourceCan('edit'),false);
  console.log('PASS actual resource resolver requires scoped action grants and preserves scoped deny');

  // Future access-editor saves persist normalized ordinary bits in place, but
  // preserve explicit protected bits, deny behavior and excluded sections.
  await as('direct');await assertDenied(setter('invoices','none'));
  await as('manager');
  const manage=await rpc('feature_access_manage_snapshot',['invoices']);
  assert.equal(manage.users.find(u=>u.id===ids.direct).effective_access.can_edit,true);
  assert.equal(manage.effective_grants.find(u=>u.user_id===ids.direct).can_delete,true);
  assert.equal(manage.grants.find(u=>u.user_id===ids.direct).can_edit,false,'raw historical row remains raw');
  await setter('invoices','none',{can_create:false,can_edit:false,can_delete:false,can_export:false});
  await root();let saved=await one("select * from public.feature_access_grants where feature_key='invoices' and user_id=$1",[ids.none]);const savedId=saved.id;
  for(const action of ordinary)assert.equal(saved[`can_${action}`],true);
  assert.equal(saved.can_manage_access,false);assert.equal(saved.can_bypass_approval,false);
  await as('manager');await setter('invoices','none',{effect:'deny',can_view:false});
  await root();saved=await one('select * from public.feature_access_grants where id=$1',[savedId]);assert.equal(saved.effect,'deny');
  await as('none');await allowed('invoices',false);
  await as('manager');await setter('invoices','none',{can_manage_access:true,can_bypass_approval:true});
  await as('none');await allowed('invoices',true,[...ordinary,...protectedActions]);
  await root();assert.equal((await one("select count(*)::int n from public.feature_access_grants where feature_key='invoices' and user_id=$1",[ids.none])).n,1);
  assert.equal((await one("select id from public.feature_access_grants where feature_key='invoices' and user_id=$1",[ids.none])).id,savedId,'canonical Realtime row ID preserved');
  for(const key of excluded){await as('manager');await setter(key,'none');await as('none');await unchangedOrdinary(key);}
  await as('manager');await setter('invoices','none',{can_view:false,can_edit:true});await as('none');assert.equal(await can('invoices'),false);assert.equal(await can('invoices','edit'),false);await allowed('invoices',false,['create','delete','export']);
  // The unchanged setter defaults omitted protected fields to false. This is
  // compatibility, not authority granted by the normalization block.
  await allowed('invoices',false,protectedActions);
  await root();const preservedScoped=await grant('invoices','none',{}, {resource_type:'invoice',resource_id:'synthetic'});
  const preservedRevoked=await grant('invoices','none',{}, {revoked_at:'2026-01-01T00:00:00Z'});
  await as('manager');await setter('invoices','none');
  await root();for(const savedRow of [preservedScoped,preservedRevoked])assert.deepEqual(await one('select * from public.feature_access_grants where id=$1',[savedRow.id]),savedRow);
  const beforeAtomic=await allRows(),auditBefore=await one('select count(*)::int n from public.audit_trail');
  await as('manager');
  await assert.rejects(rpc('set_feature_access',['invoices',JSON.stringify([{user_id:ids.none,can_view:false,effect:'deny'},{user_id:'malformed-uuid',can_view:true}])]),/شناسه کاربر نامعتبر/);
  await root();assert.deepEqual(await allRows(),beforeAtomic,'malformed later element rolls back earlier change');assert.deepEqual(await one('select count(*)::int n from public.audit_trail'),auditBefore);
  await as('manager');await setter('invoices','delegated',{can_view:false,can_manage_access:true});
  await as('delegated');await rpc('feature_access_manage_snapshot',['invoices']);await setter('invoices','none');
  await assertDenied(setter('parts','none'));
  await assertDenied(rpc('feature_access_manage_snapshot',['parts']));
  console.log('PASS management snapshot, in-place setter, explicit protected bits and excluded-section writes');

  // A synthetic, feature-only RLS table demonstrates creator-independent
  // ordinary decisions without claiming unrelated real modules are repaired.
  await root();await db.exec(`create table public.section_test_records(id integer primary key,feature_key text,created_by uuid,body text);
    alter table public.section_test_records enable row level security;
    grant select,insert,update,delete on public.section_test_records to authenticated;
    create policy section_read on public.section_test_records for select to authenticated using(public.can_access_feature(feature_key,'view'));
    create policy section_create on public.section_test_records for insert to authenticated with check(public.can_access_feature(feature_key,'create'));
    create policy section_edit on public.section_test_records for update to authenticated using(public.can_access_feature(feature_key,'edit')) with check(public.can_access_feature(feature_key,'edit'));
    create policy section_delete on public.section_test_records for delete to authenticated using(public.can_access_feature(feature_key,'delete'));
    insert into public.section_test_records values(1,'invoices','${ids.peer}','unrelated creator');`);
  await as('direct');assert.equal((await db.query("update public.section_test_records set body='ordinary edit' where id=1 returning id")).rows.length,1);
  await db.exec(`insert into public.section_test_records values(2,'invoices','${ids.direct}','new')`);
  assert.equal((await db.query('delete from public.section_test_records where id=1 returning id')).rows.length,1);
  await as('denied');assert.equal((await db.query('select * from public.section_test_records')).rows.length,0);
  assert.equal((await db.query("update public.section_test_records set body='denied' returning id")).rows.length,0);
  assert.equal((await db.query('delete from public.section_test_records returning id')).rows.length,0);
  await assert.rejects(db.exec(`insert into public.section_test_records values(3,'invoices','${ids.denied}','denied')`),/row-level security/);
  console.log('PASS canonical RLS actions independent of record creator, denied zero-row mutations remain protected');

  // Feed REAL database snapshots through the shipped client registry; never
  // locally infer create/edit/delete/export from a client view flag.
  await as('direct');let currentPayload=await snapshot();
  const windowEvents=new EventTarget(),document=new EventTarget();
  Object.assign(document,{readyState:'loading',querySelector(){return null},querySelectorAll(){return []},getElementById(){return null}});
  let generation=1;
  const state={token:'synthetic-token',user:{id:ids.direct},profile:{id:ids.direct,active:true,role:'owner'},view:'home'};
  const c={document,Bamco:{state},BamcoData:{rpc:async()=>currentPayload},bamcoAuth:{snapshot:()=>({generation})},Event,CustomEvent,queueMicrotask,setTimeout,clearTimeout,
    addEventListener:windowEvents.addEventListener.bind(windowEvents),dispatchEvent:windowEvents.dispatchEvent.bind(windowEvents)};
  c.window=c;vm.runInNewContext(source('assets/js/navigation-registry.js'),c);
  await c.BamcoAccess.refresh();
  for(const key of business)for(const action of ordinary)assert.equal(c.BamcoAccess.can(key,action),true,`client ${key}.${action}`);
  for(const [route,key] of Object.entries({testReports:'documents',lettersIncoming:'letters',lettersOutgoing:'letters',phoneBook:'phonebook'})){
    assert.equal(c.BamcoNavigationCatalog.featureForRoute(route),key);
    for(const action of ordinary)assert.equal(c.BamcoAccess.can(c.BamcoAccess.routeFeature(route),action),key==='documents'?action==='view':true);
    assert(!currentPayload.grants.some(row=>row.feature_key===route),'aliases do not create new grant keys');
  }
  for(const action of protectedActions)assert.equal(c.BamcoAccess.can('invoices',action),false);
  assert.equal(c.BamcoAccess.can('settings','manage_access'),false);
  await as('denied');currentPayload=await snapshot();await c.BamcoAccess.invalidate();for(const action of ordinary)assert.equal(c.BamcoAccess.can('invoices',action),false);
  await as('direct');currentPayload=await snapshot();await c.BamcoAccess.invalidate();
  state.user={id:ids.denied};generation++;for(const action of ordinary)assert.equal(c.BamcoAccess.can('invoices',action),false);
  state.profile={id:ids.denied,active:true,role:'owner'};await as('denied');currentPayload=await snapshot();await c.BamcoAccess.refresh();
  for(const action of ordinary)assert.equal(c.BamcoAccess.can('invoices',action),false);
  state.profile.active=false;assert.equal(c.BamcoAccess.can('invoices'),false);
  console.log('PASS real SQL snapshots through unchanged client, canonical aliases, refresh/revoke/account and admin boundaries');

  // Exercise the actual invoice migrations with the canonical resolver too.
  // Reuse only invoice/Storage schema from its existing isolated fixture,
  // explicitly omitting its auth, profile and permission-function stubs.
  await root();
  const invoiceFixture=source('tests/sql/fixtures/invoice-live-contract.sql').split('\n').filter(line=>
    !/^CREATE SCHEMA (private|auth);|^CREATE ROLE |^CREATE FUNCTION auth.uid\(|^CREATE FUNCTION public.can_access_feature\(|^CREATE TABLE public.profiles\(|^GRANT EXECUTE ON ALL FUNCTIONS/.test(line)).join('\n');
  await db.exec(invoiceFixture);
  for(const file of ['20260924160000_invoice_payment_consistency.sql','20261003114607_invoice_attachment_upload_gate.sql','20261003134731_invoice_file_controls.sql','20261004160141_invoice_section_visibility.sql'])
    await db.exec(source(`supabase/migrations/${file}`));
  await db.exec(source('supabase/schema-proposals/invoice-capability-parity.sql'));
  await db.exec(canonicalFunction(source('supabase/migrations/20260922074613_enterprise_relationship_authorization_consolidation.sql'),'private.feature_grant_allows'));
  await as('manager');
  const invoice=await rpc('save_invoice',[randomUUID(),null,JSON.stringify({invoice_number:'SYNTHETIC-NORMALIZED',title:'Synthetic',account_party:'Synthetic supplier',company_name:'Synthetic supplier',currency:'IRR',total_amount:'100.00'})]);
  const pending=await rpc('reserve_invoice_file',[randomUUID(),invoice.id,null,'proforma','synthetic.pdf','application/pdf',32,'a'.repeat(64)]);
  await as('direct');assert((await rpc('list_invoice_workspace')).invoices.some(row=>row.id===invoice.id));
  const paymentPayload={invoice_id:invoice.id,sequence_no:1,amount:'10.00',status:'paid'};
  await assert.rejects(rpc('save_invoice_payment',[randomUUID(),null,JSON.stringify(paymentPayload)]),/permission|denied|مجوز|42501|دسترسی/);
  assert.equal((await db.query('delete from public.invoices where id=$1 returning id',[invoice.id])).rows.length,0);
  await root();await db.exec(proposal);await as('direct');
  const payment=await rpc('save_invoice_payment',[randomUUID(),null,JSON.stringify(paymentPayload)]);
  assert.equal(payment.invoice_id,invoice.id);
  await rpc('save_invoice_payment',[randomUUID(),payment.id,JSON.stringify({...paymentPayload,notes:'Normalized unrelated edit'})]);
  await rpc('save_invoice',[randomUUID(),invoice.id,JSON.stringify({invoice_number:'SYNTHETIC-NORMALIZED',title:'Normalized unrelated invoice edit',account_party:'Synthetic supplier',company_name:'Synthetic supplier',currency:'IRR',total_amount:'100.00'})]);
  const ownPending=await rpc('reserve_invoice_file',[randomUUID(),invoice.id,null,'proforma','synthetic.pdf','application/pdf',32,'b'.repeat(64)]);
  assert.equal(ownPending.uploaded_by,ids.direct);
  assert.equal((await db.query('delete from public.invoice_files where id=$1 returning id',[pending.id])).rows.length,0,'normalization does not delete foreign pending upload');
  assert.equal((await db.query('delete from public.invoice_payments where id=$1 returning id',[payment.id])).rows.length,1);
  await as('denied');assert.equal((await rpc('list_invoice_workspace')).invoices.length,0);
  await assert.rejects(rpc('save_invoice_payment',[randomUUID(),null,JSON.stringify(paymentPayload)]),/permission|denied|مجوز|42501|دسترسی/);
  await as('manager');await db.query('delete from public.invoice_files where id=$1',[pending.id]);
  await as('direct');await rpc('delete_invoice_file',[ownPending.id,invoice.id,null,'proforma',ownPending.client_request_id]);
  assert.equal((await db.query('delete from public.invoices where id=$1 returning id',[invoice.id])).rows.length,1);
  console.log('PASS actual invoice migration sequence + canonical resolver: legacy checked grant enables unrelated payment/invoice/file operations, preserves denied and pending-upload boundaries');
} finally { await db.close(); }

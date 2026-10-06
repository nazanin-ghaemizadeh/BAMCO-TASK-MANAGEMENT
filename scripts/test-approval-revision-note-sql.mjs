// Local-only synthetic PostgreSQL transactions. No network or production data.
// Real review/authorization/revision-context functions; minimal tables and
// explicit downstream notification/apply doubles isolate this RPC's contract.
import assert from 'node:assert/strict';
import { featureDb, ids, source, canonicalFunction } from '../tests/helpers/feature-access-db.mjs';
const { db, as, root, one, grant, features } = await featureDb();
const oldSql = source('supabase/migrations/20261006063711_approval_revision_note_variable_fix.sql');
const patch = source('supabase/migrations/20261006110107_approval_existing_task_revision_note_fix.sql');
const broken = "update public.tasks set manager_notes=concat_ws(E'\\n\\n',nullif(btrim(manager_notes),''),manager_note) where id=r.task_id;";
const repaired = broken.replace(',manager_note)', ',v_manager_note)');
const signature = 'public.review_request_stage(bigint,text,text,jsonb)';
const rpc = async (id, decision = 'needs_revision', note = '  Synthetic correction  ', payload = null) =>
  (await one('select public.review_request_stage($1,$2,$3,$4::jsonb) result', [id, decision, note, payload === null ? null : JSON.stringify(payload)])).result;
const metadata = async () => one(`select oid,proowner,proacl::text acl,prosecdef,proconfig,proargnames,proargtypes::text,prorettype,provolatile,proparallel,pg_get_functiondef(oid) definition from pg_proc where oid=$1::regprocedure`, [signature]);
const context = async () => one("select current_setting('bamco.request_id',true) request_id,current_setting('bamco.source_path',true) source_path,current_setting('bamco.approval_apply',true) approval_apply");
const snapshot = async () => {
  await root();
  return (await one(`select jsonb_build_object(
    'requests',(select jsonb_agg(to_jsonb(t) order by id) from public.change_requests t),
    'workflows',(select jsonb_agg(to_jsonb(t) order by id) from public.organization_workflows t),
    'steps',(select jsonb_agg(to_jsonb(t) order by id) from public.organization_workflow_steps t),
    'tasks',(select jsonb_agg(to_jsonb(t) order by id) from public.tasks t),
    'events',(select jsonb_agg(to_jsonb(t) order by id) from public.change_request_events t),
    'notifications',(select jsonb_agg(to_jsonb(t) order by id) from private.test_notifications t),
    'writes',(select jsonb_agg(to_jsonb(t) order by id) from private.test_task_writes t),
    'applies',(select jsonb_agg(to_jsonb(t) order by id) from private.test_applies t)) snapshot`)).snapshot;
};
let nextId = 0;
const seed = async ({ type = 'update', task = true, taskNotes = 'Old task note', payload = { manager_notes: 'Old payload note', description: 'Unchanged proposed detail' }, approver = 'direct', status = 'pending', workflow = true, pending = true } = {}) => {
  await root(); const id = ++nextId;
  if (task) await db.query('insert into public.tasks(id,manager_notes,title,owner_id) values($1,$2,$3,$4)', [id, taskNotes, 'Synthetic unchanged title', ids.none]);
  if (workflow) await db.query("insert into public.organization_workflows(id,current_step,status) values($1,1,'in_review')", [id]);
  await db.query('insert into public.change_requests(id,request_type,task_id,requested_by,request_status,organization_workflow_id,proposed_data) values($1,$2,$3,$4,$5,$6,$7::jsonb)', [id, type, task ? id : null, ids.none, status, workflow ? id : null, payload === null ? null : JSON.stringify(payload)]);
  if (workflow) await db.query('insert into public.organization_workflow_steps(id,workflow_id,step_no,approver_id,decision) values($1,$2,1,$3,$4),($5,$2,2,$3,\'pending\')', [id * 10, id, ids[approver], pending ? 'pending' : 'approved', id * 10 + 1]);
  return id;
};
const transaction = async (actor, action) => {
  await as(actor); await db.exec('begin');
  try {
    await db.exec("select set_config('bamco.request_id','987654',true),set_config('bamco.source_path','synthetic_prior',true),set_config('bamco.approval_apply','prior',true)");
    const previous = await context(); await action(); assert.deepEqual(await context(), previous, 'same-transaction context restored');
    await db.exec('commit');
  } catch (error) { await db.exec('rollback'); throw error; }
};
const deny = async (id, actor, code, decision = 'needs_revision', payload = null) => {
  const before = await snapshot();
  await transaction(actor, async () => {
    await db.exec('savepoint denied');
    await assert.rejects(rpc(id, decision, 'Synthetic denied note', payload), error => error.code === code);
    await db.exec('rollback to savepoint denied');
  });
  assert.deepEqual(await snapshot(), before, 'denied transaction has no business effects');
};
try {
  await features(['approvals']);
  for (const name of ['direct', 'peer', 'inactive']) await grant('approvals', name, { can_edit: true });
  await grant('approvals', 'denied', { can_edit: true }, { effect: 'deny' });
  await db.exec(`
    create table public.tasks(id bigint primary key,manager_notes text,title text,owner_id uuid);
    create table public.organization_workflows(id bigint primary key,current_step integer,status text,updated_at timestamptz);
    create table public.organization_workflow_steps(id bigint primary key,workflow_id bigint,step_no integer,approver_id uuid,decision text,note text,decided_at timestamptz);
    create table public.change_requests(id bigint primary key,request_type text,task_id bigint,requested_by uuid,request_status text,organization_workflow_id bigint,proposed_data jsonb,manager_note text,reviewed_by uuid,reviewed_at timestamptz,completed_at timestamptz);
    create table public.change_request_events(id bigint generated always as identity,request_id bigint,actor_id uuid,event_type text,note text,snapshot jsonb);
    create table private.test_notifications(id bigint generated always as identity,user_id uuid,event_type text,note text,snapshot jsonb);
    create table private.test_task_writes(id bigint generated always as identity,task_id bigint,request_id text,source_path text,approval_apply text);
    create table private.test_applies(id bigint generated always as identity,request_id bigint,actor uuid,payload jsonb);
    create function private.emit_relationship_event(uuid,text,text,text,text,text,jsonb) returns void language plpgsql as $$
    begin insert into private.test_notifications(user_id,event_type,note,snapshot) values($1,$2,$4,$7); end $$;
    create function private.apply_change_request(bigint,uuid,jsonb) returns void language plpgsql as $$
    begin insert into private.test_applies(request_id,actor,payload) values($1,$2,$3); end $$;
  `);
  await db.exec(canonicalFunction(source('supabase/migrations/20260925034000_approval_execution_context_lifecycle.sql'), 'private.is_verified_revision_note_path'));
  await db.exec(`create function private.test_revision_write_guard() returns trigger language plpgsql as $$ begin
    if not private.is_verified_revision_note_path(new.id) then raise exception 'Invalid revision execution context'; end if;
    if current_setting('test.fail_task_write',true)='1' then raise exception 'Synthetic task write failure' using errcode='P0001'; end if;
    insert into private.test_task_writes(task_id,request_id,source_path,approval_apply) values(new.id,current_setting('bamco.request_id',true),current_setting('bamco.source_path',true),current_setting('bamco.approval_apply',true));
    return new; end $$;
    create trigger synthetic_revision_guard before update on public.tasks for each row execute function private.test_revision_write_guard();`);
  await db.exec(oldSql);
  await db.exec(`revoke all on function ${signature} from public,anon; grant execute on function ${signature} to authenticated,service_role`);
  const failing = await seed(); await deny(failing, 'direct', '42703');
  console.log('PASS baseline 42703 and complete transaction rollback reproduced');
  await root(); const beforeMeta = await metadata(), beforeRows = await snapshot();
  await db.exec(patch); const afterMeta = await metadata();
  assert.deepEqual(afterMeta, { ...beforeMeta, definition: beforeMeta.definition.replace(broken, repaired) }, 'only intended token changed, all security attributes unchanged');
  await db.exec(patch); assert.deepEqual(await metadata(), afterMeta); assert.deepEqual(await snapshot(), beforeRows);
  // Preserve an independent function edit and refuse an unknown expression.
  await db.exec(afterMeta.definition.replace('declare\n', 'declare\n  -- synthetic independent edit\n'));
  await db.exec(patch); assert.match((await metadata()).definition, /synthetic independent edit/);
  await db.exec(afterMeta.definition.replace(repaired, 'update public.tasks set manager_notes=manager_notes where id=r.task_id;'));
  const unexpected = await metadata(); await assert.rejects(db.exec(patch), /Unexpected review_request_stage/); assert.deepEqual(await metadata(), unexpected);
  await db.exec(afterMeta.definition);
  console.log('PASS one-token diff, idempotence, independent edits, unknown-definition guard and security attributes');

  for (const type of ['update', 'complete', 'delete']) {
    const id = await seed({ type }); const before = await snapshot();
    await transaction('direct', async () => assert.equal(await rpc(id), 'needs_revision'));
    const after = await snapshot(), r = after.requests.find(r => r.id === id), task = after.tasks.find(t => t.id === id);
    assert.equal(r.request_status, 'needs_revision'); assert.equal(r.manager_note, '  Synthetic correction  '); assert.equal(r.reviewed_by, ids.direct);
    assert.deepEqual(r.proposed_data, { manager_notes: 'Old payload note\n\nیادداشت مدیر: Synthetic correction', description: 'Unchanged proposed detail' });
    assert.deepEqual(task, { ...before.tasks.find(t => t.id === id), manager_notes: 'Old task note\n\nیادداشت مدیر: Synthetic correction' });
    assert.equal(after.workflows.find(w => w.id === id).status, 'needs_revision');
    const steps = after.steps.filter(s => s.workflow_id === id); assert.equal(steps[0].decision, 'needs_revision'); assert.equal(steps[0].note, r.manager_note); assert.equal(steps[1].decision, 'rejected');
    const event = after.events.find(e => e.request_id === id); assert.equal(event.note, r.manager_note); assert.equal(event.snapshot.manager_override, false);
    assert.equal(after.notifications.length, (before.notifications?.length || 0) + 1); assert.equal(after.writes.at(-1).source_path, 'approval_revision_note'); assert.equal(after.writes.at(-1).request_id, String(id));
    await deny(id, 'direct', '42501');
  }
  console.log('PASS existing-task nonempty correction, payload/task preservation, workflow/events, verified context and replay denial');

  for (const setup of [{ type: 'create', task: false }, { type: 'create', task: true }, { type: 'update', task: false }]) {
    const id = await seed(setup), before = await snapshot();
    await transaction('direct', async () => assert.equal(await rpc(id), 'needs_revision'));
    const after = await snapshot(); assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.writes, before.writes);
    assert.equal(after.requests.find(r => r.id === id).proposed_data.manager_notes, 'Old payload note\n\nیادداشت مدیر: Synthetic correction');
  }
  for (const note of [null, '', '   ']) {
    const id = await seed(), before = await snapshot(); await transaction('direct', async () => assert.equal(await rpc(id, 'needs_revision', note), 'needs_revision'));
    const after = await snapshot(); assert.deepEqual(after.tasks, before.tasks); assert.deepEqual(after.writes, before.writes);
    assert.deepEqual(after.requests.find(r => r.id === id).proposed_data, before.requests.find(r => r.id === id).proposed_data);
  }
  for (const taskNotes of [null, '', '   ']) {
    const id = await seed({ taskNotes, payload: null }); await transaction('direct', async () => assert.equal(await rpc(id), 'needs_revision'));
    const after = await snapshot(); assert.equal(after.tasks.find(t => t.id === id).manager_notes, 'یادداشت مدیر: Synthetic correction');
    assert.deepEqual(after.requests.find(r => r.id === id).proposed_data, { manager_notes: 'یادداشت مدیر: Synthetic correction' });
  }
  console.log('PASS create/null-task isolation, null/empty/whitespace note and existing-note cases');

  for (const name of ['peer', 'none', 'denied', 'inactive']) { const id = await seed({ approver: name === 'peer' ? 'direct' : name }); await deny(id, name, '42501'); }
  const anonymous = await seed(); await deny(anonymous, 'missing', '42501');
  const anonBefore = await snapshot(); await as('direct','anon'); await assert.rejects(rpc(anonymous), error => error.code === '42501'); assert.deepEqual(await snapshot(), anonBefore);
  for (const setup of [{ status: 'approved' }, { status: 'rejected' }, { workflow: false }, { pending: false }]) {
    const id = await seed(setup); await deny(id, 'direct', ['approved','rejected'].includes(setup.status) ? 'P0002' : '42501');
  }
  const invalid = await seed(); await deny(invalid, 'direct', '22023', 'invalid');
  const ownership = await seed(); await deny(ownership, 'direct', '42501', 'approved', { owner_id: ids.peer });
  const manager = await seed(); await transaction('manager', async () => assert.equal(await rpc(manager), 'needs_revision'));
  assert.equal((await snapshot()).events.find(e => e.request_id === manager).snapshot.manager_override, true);
  const rejected = await seed(); await transaction('direct', async () => assert.equal(await rpc(rejected, 'rejected', 'Synthetic rejection'), 'rejected'));
  const approved = await seed(); await transaction('direct', async () => assert.equal(await rpc(approved, 'approved', null, { owner_id: ids.none }), 'approved'));
  console.log('PASS reviewer/role/edit/active/anonymous/ownership gates, manager override and unchanged approve/reject paths');

  const injected = await seed(); await root(); await db.exec("select set_config('test.fail_task_write','1',false)"); await deny(injected, 'direct', 'P0001');
  await root(); await db.exec("select set_config('test.fail_task_write','0',false)");
  const beforeRollback = await snapshot(); await as('direct'); await db.exec('begin'); assert.equal(await rpc(injected), 'needs_revision'); await db.exec('rollback'); assert.deepEqual(await snapshot(), beforeRollback);
  console.log('PASS downstream failure and explicit rollback leave every business row unchanged');
} finally { await db.close(); }

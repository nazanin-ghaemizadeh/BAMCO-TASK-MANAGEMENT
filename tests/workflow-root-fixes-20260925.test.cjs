const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, until, pause } = require('./helpers/app-fixture.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('sent-message detail rebuilds the actual snapshot, including the registered-work table', async t => {
  const snapshot = {
    id: 71,
    subject: 'گزارش مدیر',
    created_at: '2026-09-25T00:00:00Z',
    body_template: 'مدیر محترم\n\n[جدول امور ثبت‌شده]',
    final_text: 'امور ثبت‌شده و بدون متولی:\n1428 | متن خامی که نباید نمایش داده شود',
    task_ids: [91], warning_task_ids: [], overdue_task_ids: [], waiting_task_ids: [],
    tasks: [{ id: 91, legacy_id: 1428, title: 'امر ثبت‌شده', status: 'ثبت شده', status_key: 'registered', status_kind: 'registered', priority: 'متوسط', start_date: null, due_state: 'none' }]
  };
  const sent = { log_key: 'delivery:71', source_type: 'delivery', source_id: 71, recipient_id: 'test-manager', recipient_name: 'مدیر آزمایشی', subject: snapshot.subject, channel: 'portal', delivery_status: 'sent', sent_at: snapshot.created_at, attempt_count: 3, sender_name: 'سامانه', snapshot_id: 71 };
  const f = await fixture({ tables: { sent_message_log: [sent], message_snapshots: [snapshot] } }); t.after(() => f.dispose());
  await f.open('sentMessages');
  f.d.querySelector('[data-sent-detail="delivery:71"]').click();
  await until(() => f.d.querySelector('#sentMessageDetail .workflow-registered-section'));
  const dialog = f.d.querySelector('#sentMessageDetail');
  assert.equal(dialog.open, true);
  assert.match(dialog.textContent, /امور ثبت‌شده و بدون متولی/);
  assert.match(dialog.textContent, /۱۴۲۸/);
  assert.equal(dialog.querySelectorAll('.workflow-registered-section tbody tr').length, 1);
  assert.equal(dialog.querySelector('.sent-detail-text'), null, 'snapshot detail must use the canonical styled renderer, not raw final_text');
  assert.doesNotMatch(dialog.textContent, /\[جدول امور ثبت‌شده\]/);
  assert.equal([...f.d.querySelectorAll('#sentMessagesView thead th')].some(th => th.textContent.trim() === 'تلاش'), false);
  assert.deepEqual(f.errors, []);
});

test('request history never presents a requester cancellation as a manager note', async t => {
  const now = new Date().toISOString();
  const f = await fixture({ tables: { change_requests: [
    { id: 501, requested_by: 'test-owner', reviewed_by: 'test-owner', request_type: 'create', request_status: 'cancelled', manager_note: 'لغو توسط ثبت‌کننده', proposed_data: { title: 'درخواست لغوشده' }, created_at: now, reviewed_at: now },
    { id: 502, requested_by: 'test-owner', reviewed_by: 'test-manager', request_type: 'update', request_status: 'rejected', manager_note: 'یادداشت واقعی مدیر', proposed_data: { title: 'درخواست ردشده' }, created_at: now, reviewed_at: now }
  ] } }); t.after(() => f.dispose());
  await f.open('requestHistory');
  const cancelled = f.d.querySelector('#requestHistoryBody tr[data-request-id="501"]');
  const rejected = f.d.querySelector('#requestHistoryBody tr[data-request-id="502"]');
  assert.equal(cancelled.cells[6].textContent.trim(), '—');
  assert.equal(rejected.cells[6].textContent.trim(), 'یادداشت واقعی مدیر');
  assert.deepEqual(f.errors, []);
});

test('calendar and Gantt task routes open an exact one-row Kanban filter', async t => {
  const tasks = [
    { id: 91, legacy_id: 1428, title: 'امر بدون زمان‌بندی', description: '', owner_id: 'test-manager', status: 'ثبت شده', priority: 'متوسط', start_date: null, due_date: null, done_date: null, reminder_days: 0, manager_notes: '', archived: false },
    { id: 92, legacy_id: 1429, title: 'امر دیگر', description: '', owner_id: 'test-manager', status: 'در حال انجام', priority: 'متوسط', start_date: '2026-09-01', due_date: '2026-09-30', done_date: null, reminder_days: 0, manager_notes: '', archived: false }
  ];
  const f = await fixture({ tables: { tasks } }); t.after(() => f.dispose());
  await f.open('taskTimeline');
  f.d.querySelector('#ttUnscheduled').click();
  const route = f.d.querySelector('#ttUnscheduledList [data-task="91"]'); assert.ok(route);
  route.click();
  await until(() => !f.d.querySelector('#kanbanView').classList.contains('hidden'));
  await until(() => f.d.querySelectorAll('#kanbanBody tr[data-task-id]').length === 1);
  assert.equal(f.d.querySelector('#kanbanSearch').value, '۱۴۲۸');
  assert.equal(f.d.querySelector('#kanbanSearch').dataset.taskFocusId, '91');
  assert.equal(f.d.querySelector('#kanbanBody tr[data-task-id]').dataset.taskId, '91');
  assert.equal(f.d.querySelector('#kanbanBody tr[data-task-id="91"]').getAttribute('aria-selected'), 'true');
  assert.deepEqual(f.errors, []);
});

test('finishing deleted-person task transfer emits one explicit completion notification', async t => {
  const task = { id: 301, legacy_id: 10, title: 'وظیفه انتقالی', description: '', owner_id: null, former_owner_name: 'فرد حذف‌شده', owner_deleted_at: new Date().toISOString(), status: 'در حال انجام', priority: 'متوسط', start_date: '2026-09-01', due_date: '2026-09-30', archived: false };
  const f = await fixture({ tables: { tasks: [task] } }); t.after(() => f.dispose());
  f.w.bamcoTaskTransfer.open([{ id: 'deleted-user', full_name: 'فرد حذف‌شده' }], [task], 1);
  await pause(30);
  assert.equal(f.calls.some(call => call.endpoint === 'ui-notice' && /با موفقیت حذف شد/.test(call.body)), false);
  f.w.eval("state.tasks[0].owner_id='test-manager';state.tasks[0].owner_deleted_at=null;bamcoTaskTransfer.sync()");
  await until(() => f.calls.some(call => call.endpoint === 'ui-notice' && /فرد با موفقیت حذف شد و وظایفش منتقل شد/.test(call.body)));
  f.w.bamcoTaskTransfer.sync();
  assert.equal(f.calls.filter(call => call.endpoint === 'ui-notice' && /وظایفش منتقل شد/.test(call.body)).length, 1);
  assert.deepEqual(f.errors, []);
});

test('database contract separates cancellation notes and keeps project status canonical with Kanban', () => {
  const sql = read('supabase/migrations/20260925003446_request_notes_and_project_status_sync.sql');
  assert.match(sql, /add column if not exists cancellation_note text/);
  assert.match(sql, /cancellation_note = v_note/);
  assert.doesNotMatch(sql, /request_status = 'cancelled',[\s\S]{0,160}manager_note\s*=/);
  assert.match(sql, /manager_note = \([\s\S]*event\.event_type in \('needs_revision', 'rejected', 'approved'\)/);
  assert.match(sql, /new\.status := private\.project_item_task_status\(new\.status\)/);
  assert.match(sql, /status = private\.task_project_item_status\(new\.status\)/);
  assert.match(sql, /status = v_task_status/);
});

test('revision, unread watermark and manager registered-work contracts are enforced in SQL', () => {
  const sql = read('supabase/migrations/20260925011606_revision_chat_and_manager_message_root_fix.sql');
  assert.match(sql, /request_status='needs_revision'/);
  assert.match(sql, /jsonb_set\([\s\S]*?'\{owner_id\}'[\s\S]*?v_request\.requested_by/);
  assert.match(sql, /when request\.request_status='needs_revision' then null/);
  assert.match(sql, /when request\.request_status='needs_revision' then false/);
  assert.match(sql, /member\.last_read_at/);
  assert.match(sql, /role_row\.role_key='manager'/);
  assert.match(sql, /private\.message_recipient_receives_registered\(v_recipient_id\)/);
  assert.match(sql, /raise exception 'prepare_workflow_messages registered-task predicate was not found'/);
  const eventSql = read('supabase/migrations/20260925012311_change_request_amended_event_contract.sql');
  assert.match(eventSql, /'resubmitted','amended','applied'/);
});

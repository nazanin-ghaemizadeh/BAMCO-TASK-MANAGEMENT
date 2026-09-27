const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('single-superior migration keeps one canonical, auditable route', () => {
  const sql = read('supabase/migrations/20260927113000_single_superior_approval_root.sql');
  assert.match(sql, /order by ancestor\.depth_no\s+limit 1/i);
  assert.match(sql, /v_superior_id is null/i);
  assert.doesNotMatch(sql, /v_superior\.(id|user_id|role_key|title)/i);
  assert.match(sql, /'manager_direct'/);
  assert.match(sql, /approval_chain_id=null/);
  assert.match(sql, /step_no>w\.current_step and decision='pending'/);
  assert.match(sql, /request_status in \('pending','in_review'\)[\s\S]*perform private\.route_change_request/i);
});

test('direct manager execution has the verified workflow context for project deletion', () => {
  const sql = read('supabase/migrations/20260927113000_single_superior_approval_root.sql');
  const direct = sql.slice(sql.indexOf('if v_direct then'), sql.indexOf('return;', sql.indexOf('if v_direct then')));
  assert.match(direct, /organization_workflows[\s\S]*'in_review'/);
  assert.match(direct, /organization_workflow_steps[\s\S]*'approved'/);
  assert.match(direct, /perform private\.apply_change_request/);
  assert.match(direct, /set status='approved'/);
});

test('phonebook implementation is bundled once, with no observer override', () => {
  const build = read('scripts/build-static-bundles.mjs');
  const html = read('index.html');
  const phonebook = read('assets/js/phonebook-directory-v2.js');
  assert.match(build, /assets\/js\/phonebook-directory-v2\.js/);
  assert.doesNotMatch(build, /assets\/js\/phonebook\.js/);
  assert.doesNotMatch(html, /phonebook-directory-v2\.js/);
  assert.doesNotMatch(phonebook, /new MutationObserver/);
  assert.match(phonebook, /data-phonebook-unit/);
  assert.match(phonebook, /data-phonebook-contact-delete/);
  assert.match(phonebook, /data-phonebook-contact-edit/);
  assert.match(phonebook, /data-phonebook-filter/);
});

test('approval-state changes avoid expensive project fan-out and snapshot scans', () => {
  const sql = read('supabase/migrations/20260927113000_single_superior_approval_root.sql');
  const app = read('assets/js/app.js');
  assert.match(sql, /update of task_id,title,description,owner_id,status,priority,planned_start,planned_end,progress/i);
  assert.match(sql, /change_requests_terminal_requester_idx/);
  assert.match(sql, /organization_workflow_steps_approver_idx/);
  assert.match(sql, /create or replace function public\.request_workflow_snapshot\(\)/i);
  assert.match(app, /async function refreshAfterMutation\(\)/);
  assert.match(app, /await refreshAfterMutation\(\)/);
});

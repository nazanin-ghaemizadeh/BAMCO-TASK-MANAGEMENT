const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('management gate owns the viewport until a department is selected',()=>{
  const css=read('assets/css/release-fixes.css');
  assert.match(css,/body:not\(\.department-pending\) #loginView\.login-shell\{display:grid!important/);
  assert.doesNotMatch(css,/html body #loginView\.login-shell\{display:grid!important/);
});

test('task deletion and archive restore use one atomic batch resequence',()=>{
  const app=read('assets/js/app.js'),ui=read('assets/js/unified-ui.js'),sql=read('supabase/migrations/20260911050000_optimize_task_lifecycle_resequence.sql');
  assert.match(app,/delete_tasks_and_resequence/);
  assert.match(app,/restore_tasks_to_kanban_and_resequence/);
  assert.match(ui,/delete_tasks_and_resequence.*p_task_ids:ids\.map\(Number\)/s);
  assert.match(ui,/restore_tasks_to_kanban_and_resequence.*p_task_ids:ids\.map\(Number\)/s);
  assert.doesNotMatch(ui,/for\(const id of ids\)[\s\S]{0,500}delete_task_and_resequence/);
  assert.match(sql,/create or replace function public\.delete_tasks_and_resequence\(p_task_ids bigint\[\]\)/);
  assert.match(sql,/create or replace function public\.restore_tasks_to_kanban_and_resequence\(p_task_ids bigint\[\]\)/);
  assert.match(sql,/row_number\(\) over\(order by -legacy_id,id\)::bigint as seq/);
  assert.match(sql,/set legacy_id=ordered\.seq/);
  assert.match(sql,/current_setting\('bamco\.resequencing',true\)='1'/);
});

test('task filter dropdowns are populated before interaction and runtime tabs render immediately',()=>{
  const app=read('assets/js/app.js'),runtime=read('assets/js/production-runtime.js'),sidebar=read('assets/js/sidebar.js');
  assert.match(app,/populateFilter\(selectEl,scope,index\);/);
  assert.doesNotMatch(app,/bamcoLazyBound|scheduleCommonFilterWarmup/);
  assert.match(runtime,/addEventListener\('click',\(\)=>\{void render\(id\)\}\)/);
  assert.doesNotMatch(runtime,/setTimeout\(\(\)=>render\(id\),0\)/);
  assert.match(sidebar,/if\(willOpen\)positionDropdown\(group\)/);
});

test('every nonzero workload segment, including one, receives a label',()=>{
  const chart=read('assets/js/dashboard-response-fixes-20260911.js');
  assert.doesNotMatch(chart,/if\(height>16\)/);
  assert.match(chart,/ctx\.strokeText\(faNum\(value\)/);
  assert.match(chart,/ctx\.fillText\(faNum\(value\)/);
});

test('conversation navigation exposes red aggregate and route unread badges',()=>{
  const conversations=read('assets/js/conversations.js'),shell=read('assets/js/shell.js');
  assert.match(conversations,/conversation-nav-count/);
  assert.match(conversations,/conversation-route-count/);
  assert.match(conversations,/window\.bamcoConversations=\{refresh:refreshCurrent,syncUnread,syncUnreadTotal/);
  assert.match(shell,/syncUnreadTotal/);
  assert.match(shell,/syncUnread\?\.\(threads\)/);
});

test('message center is one send flow and uses one renderer for portal and email',()=>{
  const center=read('assets/js/phase2-message-engine.js'),renderer=read('assets/js/message-renderer.js'),inbox=read('assets/js/messaging-history-root-20260911.js'),sql=read('supabase/migrations/20260911035403_unified_internal_messages_and_sent_log.sql');
  assert.match(center,/id="messageChannel"/);
  assert.match(center,/>ارسال<\/button>/);
  assert.doesNotMatch(center,/messageCustomText|recipient-channel|شناسه<\/th>|استیکر/);
  assert.match(renderer,/const riskColumns=\[/);
  assert.match(renderer,/const waitingColumns=\[/);
  assert.match(renderer,/kind==='warning'/);
  assert.match(renderer,/overdue_task_ids/);
  assert.match(renderer,/\?task=/);
  assert.match(center,/BamcoMessageRender\.html/);
  assert.match(inbox,/BamcoMessageRender\.html/);
  assert.match(inbox,/cleanMessageUi/);
  assert.match(inbox,/#messagesView \.message-actions\{display:none!important\}/);
  assert.match(inbox,/suite-table-options/);
  assert.match(sql,/create or replace view public\.sent_message_log/);
  assert.match(sql,/from public\.message_deliveries/);
  assert.match(sql,/union all[\s\S]*from public\.portal_messages/);
  assert.match(sql,/sender_name_snapshot/);
  assert.match(sql,/portal_recipient_system_chat/);
  assert.match(sql,/پیام‌های خودکار سامانه/);
  assert.match(sql,/nullif\(p\.salutation,''\)/);
});

test('task history is Persian and resolves owner names',()=>{
  const history=read('assets/js/messaging-history-root-20260911.js');
  assert.match(history,/owner_id:'متولی'/);
  assert.match(history,/field==='owner_id'.*person/s);
  assert.match(history,/وظیفه ایجاد شد/);
  assert.match(history,/اطلاعات وظیفه.*تغییر کرد/s);
  assert.match(history,/انجام‌دهنده:/);
});

test('removed message-text editor cannot be reintroduced beside the canonical send flow',()=>{
  const rootFix=read('assets/js/admin-root-fixes-20260911.js');
  assert.match(rootFix,/deadSelector=.*#templatesView/);
  assert.match(rootFix,/purgeMessageTextUi/);
  assert.match(rootFix,/state\.view==='templates'/);
  assert.equal(fs.existsSync(path.join(root,'assets/js/templates.js')),false);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('entry is lightweight and management gate precedes login',()=>{
  const stagedEntry=path.resolve(root,'../review-next/index.html');
  const html=fs.readFileSync(fs.existsSync(stagedEntry)?stagedEntry:path.join(root,'index.html'),'utf8');
  assert.ok(html.indexOf('id="departmentEntry"')<html.indexOf('id="loginView"'));
  assert.doesNotMatch(html,/data:image\//);
  assert.match(html,/release-fixes\.css/);
});

test('permanent vehicle template upload is enabled without embedding the PDF',()=>{
  const js=read('assets/js/vehicles.js');
  assert.ok(Buffer.byteLength(js)<50000);
  assert.match(js,/vehicle-template-upload/);
  assert.match(js,/uploadBlankTemplate/);
  assert.match(js,/class="ghost vehicle-import"/);
  assert.doesNotMatch(js,/data:application\/pdf;base64/);
  assert.ok(fs.statSync(path.join(root,'assets/forms/vehicle-permanent-blank.pdf')).size>1000);
});

test('sticker manager is empty-safe and previews both sides together',()=>{
  const js=read('assets/js/stickers.js');
  assert.doesNotMatch(js,/desktopStickerGender/);
  assert.match(js,/sticker-pair/);
  assert.match(js,/نسخه‌ای ثبت نشده است/);
  assert.match(js,/state1:'وضعیت مطلوب'/);
  assert.doesNotMatch(js,/وضعیت یک/);
});

test('welcome uses the active database sticker pair and home is deduplicated',()=>{
  const js=read('assets/js/card-home.js');
  assert.match(js,/active=eq\.true/);
  assert.match(js,/state_key=eq\.state1/);
  assert.match(js,/const routes=new Set/);
  assert.match(js,/bamcoPrepareWelcomeStickers/);
  // Non-blocking welcome is exercised with delayed API responses in login-lifecycle.test.cjs.
});

test('all data tables default to compact multi-selection behavior',()=>{
  const js=read('assets/js/table-suite.js');
  assert.match(js,/classList\.add\('suite-table','suite-compact'\)/);
  assert.match(read('assets/js/table-selection.js'),/event\.ctrlKey.*event\.metaKey/);
  assert.match(js,/home\.textContent='⌂ خانه'/);
});

test('people can omit email and never enter an initial password',()=>{
  const js=read('assets/js/shell.js'),edge=read('supabase/functions/admin-users/index.ts');
  assert.doesNotMatch(js,/name="initial_password"/);
  assert.match(js,/پست الکترونیک سازمانی \(اختیاری\)/);
  assert.match(js,/messaging_enabled/);
  assert.doesNotMatch(edge,/password:"123456"/);
  assert.match(edge,/crypto.getRandomValues/);
  assert.match(edge,/internalEmail/);
});

test('gantt hides owner as a column while retaining owner filtering',()=>{
  const js=read('assets/js/timeline.js');
  assert.match(js,/id="ttOwner"/);
  assert.doesNotMatch(js,/<div>متولی<\/div><div class="tt-timeline-head">/);
  assert.match(js,/title=.*متولی:/s);
});

test('chat exposes requested messaging controls',()=>{
  const js=read('assets/js/chat-ui.js'),runtime=read('assets/js/conversations.js');
  assert.match(js,/5\*1024\*1024/);
  assert.match(js,/message-reply/);
  assert.match(js,/message-delete/);
  assert.match(read('assets/js/media-cache.js'),/avatar_path/);
  assert.match(runtime,/chat_manage_group/);
  assert.match(runtime,/chat_group_members/);
});

test('dashboard and Excel formatting remain responsive and conditional',()=>{
  const app=read('assets/js/app.js');
  assert.match(app,/Math\.max\(window\.matchMedia.*\?640:320,canvas\.parentElement\.clientWidth\)/);
  assert.match(app,/درخواست‌های منتظر بررسی/);
  assert.match(app,/درخواست تعریف وظیفه/);
  assert.match(app,/کارهای بدون زمان‌بندی/);
  const excel=read('assets/js/styled-excel.js');
  assert.match(excel,/rightToLeft="1"/);
  assert.match(excel,/conditionalFormatting/);
  assert.match(excel,/B Nazanin/);
});

test('approval routing skips supervisor self-approval and exposes only the active stage',()=>{
  const sql=read('supabase/migrations/20260910_request_routing_status.sql');
  assert.match(sql,/approval_rule='any'/);
  assert.match(sql,/approver_id=r\.requested_by/);
  assert.match(sql,/s\.stage_no=r\.current_stage/);
  assert.match(sql,/request_routing_status/);
});

test('task history omits field and path columns',()=>{
  const js=read('assets/js/tab-workspace.js');
  assert.doesNotMatch(js,/\['زمان','عامل','فیلد'/);
  assert.doesNotMatch(js,/,'مسیر','درخواست'/);
});

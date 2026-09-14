const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('workflow message renderer is compact, centered and warning/overdue colored',()=>{
  const renderer=read('assets/js/message-renderer.js');
  assert.match(renderer,/workflow-sticker/);
  assert.match(renderer,/display:block;margin:0 auto/);
  assert.match(renderer,/width:100%;max-width:980px;margin:10px auto 12px/);
  assert.match(renderer,/#f0c44c/);
  assert.match(renderer,/#e8756e/);
  assert.match(renderer,/text-align:center!important/);
  assert.match(renderer,/replace\(\/\\n\{3,\}\/g,'\\n\\n'\)/);
});

test('system message UI blocks generic table-suite controls and preserves inbox cards',()=>{
  const root=read('assets/js/messaging-history-root-20260911.js');
  assert.match(root,/\.workflow-message \.suite-filters/);
  assert.match(root,/\.workflow-message table\{margin-left:auto!important;margin-right:auto!important;min-width:0!important\}/);
  assert.doesNotMatch(root,/qa\('\[data-mid\]',list\)\.forEach\(x=>x\.remove\(\)\)/);
  assert.match(root,/conversation-route-count/);
  assert.match(root,/#d52f2f/);
  assert.match(root,/پاک کردن زنجیره/);
  assert.match(root,/chat_clear_system_thread/);
});

test('database migration exposes only own system chain and creates self-system alerts',()=>{
  const sql=read('supabase/migrations/20260911131500_unified_system_chain_and_chat_alerts.sql');
  assert.match(sql,/t\.system_recipient_id=auth\.uid\(\)/);
  assert.match(sql,/\(new\.is_system and p\.id=t\.system_recipient_id\)/);
  assert.match(sql,/chat_clear_system_thread/);
  assert.match(sql,/delete from public\.chat_messages where thread_id=p_thread_id/);
});

test('sent history contains only daily reports and reminders',()=>{
  const sql=read('supabase/migrations/20260914065000_limit_sent_log_to_reports_and_reminders.sql');
  assert.match(sql,/where b\.kind in \('daily', 'reminder'\)/);
  assert.doesNotMatch(sql,/system_chat|portal_event|union all/i);
  const ui=read('assets/js/admin-root-fixes-20260911.js');
  assert.match(ui,/فقط گزارش وضعیت امور و یادآوری‌ها/);
  assert.match(ui,/sent-command-row\+\.table-wrap\{margin-top:0;border-top:0/);
});


test('automatic message renders three separate task sections from one snapshot',()=>{
  const renderer=require(path.join(__dirname,'..','assets/js/message-renderer.js'));
  const snapshot={body_template:'[جدول امور دیرکردی]\n\n[جدول امور هشداری]',warning_task_ids:[2],overdue_task_ids:[1],waiting_task_ids:[3],tasks:[{id:1,legacy_id:11,title:'Late',status:'در حال انجام',priority:'فوری',due_date:'2026-09-01',due_state:'overdue'},{id:2,legacy_id:12,title:'Warn',status:'در حال انجام',priority:'متوسط',due_date:'2026-09-20',due_state:'warning'},{id:3,legacy_id:13,title:'Wait',status:'منتظر پاسخ',status_key:'waiting',status_kind:'waiting',priority:'متوسط',start_date:'2026-09-02',due_state:'none'}]};
  const html=renderer.html(snapshot);
  assert.match(html,/امور هشداری/);assert.match(html,/امور دیرکردی/);assert.doesNotMatch(html,/workflow-risk-section/);
  assert.match(html,/امور منتظر پاسخ/);
  assert.match(html,/workflow-auto-task-grid/);
  assert.match(html,/data-bamco-task-id="3"/);
  assert.equal((html.match(/workflow-auto-task-grid/g)||[]).length,1);
  const empty=renderer.html({...snapshot,waiting_task_ids:[],tasks:snapshot.tasks.filter(x=>x.id!==3)});
  assert.doesNotMatch(empty,/workflow-waiting-section/);
});


test('state1 text without table tokens still renders its own waiting tasks and links',()=>{
 const renderer=require('../assets/js/message-renderer.js');
 const html=renderer.html({body_template:'وضعیت مطلوب',tasks:[{id:19,title:'Waiting A',status_kind:'waiting'}]});
 assert.match(html,/وضعیت مطلوب/);assert.match(html,/workflow-waiting-section/);
 assert.match(html,/\?task=19/);assert.match(html,/#8b949e/);
 assert.doesNotMatch(renderer.html({body_template:'Recipient B',tasks:[]}),/Waiting A/);
});
test('localized old snapshots retain warning and overdue groups',()=>{
 const renderer=require('../assets/js/message-renderer.js');
 const g=renderer.taskGroups({tasks:[{id:1,due_state:'دوره هشدار'},{id:2,due_state:'دیرکرد'}]});
 assert.equal(g.warning[0].id,1);assert.equal(g.overdue[0].id,2);
});

test('message task link closes preview and repeated navigation preserves selection',()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<nav id="nav"><button data-view="kanban"></button></nav><dialog open><a data-bamco-task-id="19" href="?task=19">Waiting</a></dialog><table><tbody id="kanbanBody"><tr data-task-id="19" aria-selected="false"><td>Task</td></tr></tbody></table>',{runScripts:'outside-only',url:'https://example.test'});
 const w=dom.window;w.CSS={escape:String};let focused=0,clicked=0;
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.bamcoFocusMessageTask=()=>focused++;
 const row=w.document.querySelector('tr');row.onclick=()=>{clicked++;row.setAttribute('aria-selected','true')};
 w.eval(fs.readFileSync(path.join(__dirname,'..','assets/js/message-renderer.js'),'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 w.document.querySelector('a').click();w.document.querySelector('a').click();
 assert.equal(w.document.querySelector('dialog').open,false);assert.equal(clicked,1);assert.equal(focused,2);assert.equal(row.getAttribute('aria-selected'),'true');dom.window.close();
});

test('each task group has its own table, Kanban colors and only its own task links',()=>{
 const {JSDOM}=require('jsdom'),renderer=require('../assets/js/message-renderer.js');
 const dom=new JSDOM(renderer.html({body_template:'[جدول امور هشداری]\n[جدول امور دیرکردی]',tasks:[{id:1,due_state:'warning'},{id:2,due_state:'overdue'},{id:3,status_kind:'waiting',status_color:'#8b949e'}]}));
 const d=dom.window.document;assert.equal(d.querySelectorAll('.workflow-auto-section').length,3);
 for(const [kind,id,bg] of [['warning',1,'rgb(255, 248, 229)'],['overdue',2,'rgb(255, 240, 239)'],['waiting',3,'rgb(241, 242, 243)']]){
  const section=d.querySelector('.workflow-'+kind+'-section');assert.equal(section.querySelectorAll('tbody tr').length,1);assert.equal(section.querySelector('tbody a').dataset.bamcoTaskId,String(id));assert.equal(section.querySelector('tbody td').style.backgroundColor,bg);
 }
 dom.window.close();
});
test('automatic message sticker is resolved from the active pack every time',async()=>{
 const renderer=require('../assets/js/message-renderer.js'),calls=[];let current='new-pack/female-state3.png';
 global.rpc=async(name,args)=>{calls.push([name,args]);return current};global.bamcoMedia={get:async(bucket,path)=>path};
 try{const snapshot={id:70,sticker_path:'old-pack/female-state3.png'};assert.equal(await renderer.stickerUrl(snapshot),current);current='third-pack/female-state3.png';assert.equal(await renderer.stickerUrl(snapshot),current);assert.equal(calls.length,2);assert.equal(calls[0][0],'resolve_message_sticker');assert.equal(calls[0][1].p_snapshot_id,70)}finally{delete global.rpc;delete global.bamcoMedia}
});

test('email-safe automatic report has distinct headers and never serializes a blob sticker',()=>{
 const {JSDOM}=require('jsdom'),renderer=require('../assets/js/message-renderer.js');
 const snapshot={body_template:'[استیکر]\n\n[جدول امور هشداری]',warning_task_ids:[1],tasks:[{id:1,title:'کار نمونه',status:'در حال انجام',priority:'فوری',due_date:'2026-09-14',due_state:'warning'}]};
 const html=renderer.html(snapshot,{stickerUrl:'blob:https://example.test/private'});
 const dom=new JSDOM(html),d=dom.window.document,headers=[...d.querySelectorAll('.workflow-warning-section th')].map(x=>x.textContent.trim());
 assert.deepEqual(headers,['شناسه','عنوان فعالیت','وضعیت','اولویت','تاریخ پایان']);
 assert.equal(d.querySelectorAll('.workflow-warning-section tbody tr:first-child td').length,5);
 assert.doesNotMatch(html,/blob:/);
 assert.doesNotMatch(html,/استیکر وضعیت امور/);
 dom.window.close();
});

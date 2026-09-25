const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
const {firstUnreadMessageId}=require('../assets/js/chat-ui.js');

test('chat refresh restores the reading anchor without smooth scrolling',()=>{
  const ui=fs.readFileSync('assets/js/chat-ui.js','utf8');
  const css=fs.readFileSync('assets/css/unified-ui.css','utf8');
  assert.match(ui,/bottomGap=Math\.max\(0,box\.scrollHeight-box\.clientHeight-oldTop\),atBottom=bottomGap<12/);
  assert.match(ui,/getBoundingClientRect\(\)\.top-viewportTop/);
  assert.match(ui,/box\.style\.setProperty\('scroll-behavior','auto','important'\)/);
  assert.match(ui,/mediaJobs\.push\(attach\(m,body\)\)/);
  assert.match(ui,/await Promise\.allSettled\(mediaJobs\)/);
  assert.doesNotMatch(ui,/stateUI\.signature=null/);
  assert.match(ui,/initialAnchorId:initialUnreadId/);
  assert.match(css,/\.conversation-stage\.messenger-host\{[^}]*overflow:hidden!important;overscroll-behavior:none!important/s);
  assert.match(css,/\.messenger-messages\{[^}]*scroll-behavior:auto!important;overflow-anchor:none!important;overscroll-behavior:contain!important/s);
});

test('first unread anchor uses the member watermark with a count fallback',()=>{
 const messages=[
  {id:1,sender_id:'other',created_at:'2026-09-25T08:00:00Z'},
  {id:2,sender_id:'me',created_at:'2026-09-25T08:01:00Z'},
  {id:3,sender_id:'other',created_at:'2026-09-25T08:02:00Z'},
  {id:4,sender_id:'other',created_at:'2026-09-25T08:03:00Z'}
 ];
 assert.equal(firstUnreadMessageId(messages,{lastReadAt:'2026-09-25T08:01:30Z',unreadCount:2,userId:'me'}),3);
 assert.equal(firstUnreadMessageId(messages,{unreadCount:2,userId:'me'}),3);
 assert.equal(firstUnreadMessageId(messages,{unreadCount:0,userId:'me'}),null);
});

test('opening any conversation lands on first unread, marks once and unchanged refresh does not rebuild',async t=>{
 const lastReadAt='2026-09-25T08:00:30Z';
 const f=await fixture({fetchResult:({endpoint,data})=>endpoint==='chat_conversation_list'?data.map(row=>({...row,last_read_at:lastReadAt,unread_count:2})):undefined});t.after(()=>f.dispose());
 f.messages.push(
  {id:201,thread_id:'test-room',sender_id:'test-owner',body:'پیام خوانده‌شده',created_at:'2026-09-25T08:00:00Z'},
  {id:202,thread_id:'test-room',sender_id:'test-owner',body:'اولین پیام خوانده‌نشده',created_at:'2026-09-25T08:01:00Z'},
  {id:203,thread_id:'test-room',sender_id:'test-owner',body:'دومین پیام خوانده‌نشده',created_at:'2026-09-25T08:02:00Z'}
 );
 await f.open('groupChat');
 await until(()=>f.d.querySelector('.chat-unread-divider'));
 const divider=f.d.querySelector('.chat-unread-divider'),firstUnread=divider.nextElementSibling;
 assert.equal(firstUnread?.dataset.messageId,'202');
 assert.match(divider.textContent,/پیام‌های خوانده‌نشده/);
 await until(()=>f.calls.some(call=>call.endpoint==='chat_mark_read'));
 assert.equal(f.calls.filter(call=>call.endpoint==='chat_mark_read').length,1);
 const sameBubble=f.d.querySelector('[data-message-id="202"]'),box=f.d.querySelector('.messenger-messages');box.scrollTop=37;
 f.d.dispatchEvent(new f.w.CustomEvent('bamco:domain-invalidated',{detail:{domain:'chat'}}));
 await pause(120);
 assert.strictEqual(f.d.querySelector('[data-message-id="202"]'),sameBubble);
 assert.equal(box.scrollTop,37);
 assert.equal(f.calls.filter(call=>call.endpoint==='chat_mark_read').length,1);
 assert.deepEqual(f.errors,[]);
});

test('public, direct and task conversations share first-unread and read-watermark behavior',async t=>{
 const lastReadAt='2026-09-25T09:00:30Z',task={id:501,legacy_id:1501,title:'وظیفه گفت‌وگو',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-25',due_date:'2026-09-30',archived:false};
 const f=await fixture({tables:{tasks:[task]},fetchResult:({endpoint,data})=>endpoint==='chat_conversation_list'?data.map(row=>({...row,last_read_at:lastReadAt,unread_count:1})):undefined});t.after(()=>f.dispose());
 f.threads.push(
  {id:'direct-unread',thread_type:'direct',title:'گفت‌وگوی خصوصی',is_active:true},
  {id:'task-unread',thread_type:'direct',task_id:501,title:'گفت‌وگوی وظیفه',is_active:true}
 );
 for(const threadId of ['direct-unread','task-unread'])f.members.push({thread_id:threadId,user_id:'test-manager',member_role:'member'},{thread_id:threadId,user_id:'test-owner',member_role:'member'});
 f.messages.push(
  {id:301,thread_id:'test-room',sender_id:'test-owner',body:'عمومی خوانده‌نشده',created_at:'2026-09-25T09:01:00Z'},
  {id:302,thread_id:'direct-unread',sender_id:'test-owner',body:'خصوصی خوانده‌نشده',created_at:'2026-09-25T09:02:00Z'},
  {id:303,thread_id:'task-unread',sender_id:'test-owner',body:'وظیفه خوانده‌نشده',created_at:'2026-09-25T09:03:00Z'}
 );
 const cases=[['groupChat','test-room','301'],['directMessages','direct-unread','302'],['taskChats','task-unread','303']];
 for(const [route,threadId,messageId] of cases){
  await f.open(route);
  const button=f.d.querySelector(`#${route}View [data-thread="${threadId}"]`);assert.ok(button,`${route} thread is listed`);
  if(!button.classList.contains('active'))button.click();
  await until(()=>f.d.querySelector(`#${route}View .chat-unread-divider`)?.nextElementSibling?.dataset.messageId===messageId);
  await until(()=>f.calls.some(call=>call.endpoint==='chat_mark_read'&&call.body.p_thread_id===threadId));
 }
 assert.deepEqual(f.calls.filter(call=>call.endpoint==='chat_mark_read').map(call=>call.body.p_thread_id),['test-room','direct-unread','task-unread']);
 assert.deepEqual(f.errors,[]);
});

test('a transient mark-read failure retries on an unchanged refresh without moving the scroll',async t=>{
 const f=await fixture({fetchResult:({endpoint,data})=>endpoint==='chat_conversation_list'?data.map(row=>({...row,last_read_at:'2026-09-25T10:00:00Z',unread_count:1})):undefined});t.after(()=>f.dispose());
 f.messages.push({id:401,thread_id:'test-room',sender_id:'test-owner',body:'پیام نیازمند ثبت خواندن',created_at:'2026-09-25T10:01:00Z'});
 f.failures.add('chat_mark_read');
 await f.open('groupChat');
 await until(()=>f.calls.filter(call=>call.endpoint==='chat_mark_read').length===1);
 const box=f.d.querySelector('.messenger-messages'),bubble=f.d.querySelector('[data-message-id="401"]');box.scrollTop=43;
 f.failures.delete('chat_mark_read');
 f.d.querySelector('.chat-refresh').click();
 await until(()=>f.calls.filter(call=>call.endpoint==='chat_mark_read').length===2);
 assert.strictEqual(f.d.querySelector('[data-message-id="401"]'),bubble);
 assert.equal(box.scrollTop,43);
 f.d.querySelector('.chat-refresh').click();await pause(120);
 assert.equal(f.calls.filter(call=>call.endpoint==='chat_mark_read').length,2);
});

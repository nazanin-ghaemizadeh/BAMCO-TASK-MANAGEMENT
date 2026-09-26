const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

function directTexts(node){return [...node.children].map(el=>el.textContent.replace(/\s+/g,' ').trim()).filter(Boolean)}

test('removed response screens cannot appear in the portal',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 for(const route of ['responseTracking','responseReport']){
  assert.equal(f.d.querySelector(`#nav [data-view="${route}"]`),null);
  assert.equal(f.d.querySelector(`#${route}View`),null);
  assert.equal(f.w.BamcoNavigationCatalog.routeFor(route),null);
  assert.equal(f.w.bamcoTabs.owns(route),false);
 }
});

test('message center command row is home, excel, refresh, green send and local row selection enables send',async t=>{
 const f=await fixture({tables:{message_recipient_live_state:[{recipient_id:'test-owner',recipient_name:'متولی آزمایشی',email:'owner@example.test',active_count:2,warning_count:1,overdue_count:0,sticker_state:1,last_sent_at:null}]}});t.after(()=>f.dispose());
 await f.open('messageCenter');await until(()=>f.d.querySelector('#messageCenterView .message-command-row'));
 const bar=f.d.querySelector('#messageCenterView .message-command-row'),texts=directTexts(bar);
 assert.deepEqual([...bar.querySelectorAll(':scope > button')].map(b=>b.textContent.trim()),['بازگشت به خانه','خروجی اکسل','تازه‌سازی','مدیریت دسترسی','ارسال']);assert.equal(bar.querySelectorAll('#messageChannel option').length,3);
 assert.match(f.d.querySelector('#bamcoMessageCenterCommandCss').textContent,/sendSelectedMessages[^}]*background:#218764/);
 assert.match(f.d.querySelector('#bamcoMessageCenterCommandCss').textContent,/messageCenterError:empty\{display:none\}/);assert.match(f.d.querySelector('#bamcoMessageCenterCommandCss').textContent,/message-command-row\{[^}]*margin:0;/);assert.equal(f.d.querySelector('#messageCenterError').textContent,'');
 const row=f.d.querySelector('#messageCenterBody tr[data-id="test-owner"]'),send=f.d.querySelector('#sendSelectedMessages');assert.ok(row);assert.equal(send.disabled,true);row.click();await pause(20);assert.equal(row.classList.contains('suite-selected'),true);assert.equal(send.disabled,false);assert.match(f.d.querySelector('#messageSelectionCount').textContent,/۱ نفر/);
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('sent messages uses unified log, has no overview cards and requested controls',async t=>{
 const f=await fixture({tables:{sent_message_log:[{log_key:'portal:1',source_type:'portal_event',source_id:1,recipient_id:'test-owner',recipient_name:'متولی آزمایشی',subject:'به‌روزرسانی وظیفه',channel:'portal',delivery_status:'sent',sent_at:new Date().toISOString(),attempt_count:0,error_message:null,sender_name:'سامانه',snapshot_id:null,portal_message_id:1}]}});t.after(()=>f.dispose());
 await f.open('sentMessages');await until(()=>f.d.querySelector('#sentMessagesView .sent-command-row'));
 assert.equal(f.w.bamcoTabs.owns('sentMessages'),false,'نمای نهایی پیام‌های ارسال‌شده فقط یک مالک رندر دارد');
 const bar=f.d.querySelector('#sentMessagesView .sent-command-row');assert.ok(bar.classList.contains('bamco-command-bar'),'نوار پیام‌های ارسال‌شده باید دقیقاً از ابعاد و فاصله‌های نوار مشترک سامانه استفاده کند');assert.deepEqual(directTexts(bar).slice(0,4),['بازگشت به خانه','خروجی اکسل','تازه‌سازی','مدیریت دسترسی']);
 const access=bar.querySelector('[data-sent-access]');assert.ok(access);assert.equal(access.previousElementSibling?.textContent.trim(),'تازه‌سازی');
 assert.equal(f.d.querySelectorAll('#sentMessagesView .sent-overview,#sentMessagesView .sent-log-summary').length,0);
 assert.equal([...f.d.querySelectorAll('#sentMessagesView thead th')].some(th=>th.textContent.trim()==='خطا'),false);
 assert.equal([...f.d.querySelectorAll('#sentMessagesView thead th')].some(th=>th.textContent.trim()==='تلاش'),false);
 assert.equal(f.d.querySelectorAll('#sentMessagesView thead tr:first-child th').length,9);
 assert.match(f.d.querySelector('#sentMessagesView tbody').textContent,/پیام داخل سامانه/);assert.match(f.d.querySelector('#sentMessagesView tbody').textContent,/به‌روزرسانی وظیفه/);
 assert.ok(f.calls.some(c=>c.endpoint==='sent_message_log'));
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('sent messages keeps its final toolbar mounted while the first dataset is loading',async t=>{
 let release;
 const row={log_key:'portal:stable',source_type:'portal_event',source_id:2,recipient_id:'test-owner',recipient_name:'متولی آزمایشی',subject:'پیام پایدار',channel:'portal',delivery_status:'sent',sent_at:new Date().toISOString(),attempt_count:0,sender_name:'سامانه',snapshot_id:null,portal_message_id:2};
 const f=await fixture({tables:{sent_message_log:[row]},fetchResult:({endpoint,data})=>endpoint==='sent_message_log'?new Promise(resolve=>{release=()=>resolve(data)}):undefined});t.after(()=>f.dispose());
 const initialBar=f.d.querySelector('#sentMessagesView .sent-command-row');assert.ok(initialBar,'نوار نهایی باید پیش از ورود به صفحه آماده باشد');
 const opening=f.open('sentMessages');await until(()=>release);await opening;
 assert.strictEqual(f.d.querySelector('#sentMessagesView .sent-command-row'),initialBar,'نوار هنگام دریافت داده نباید تعویض شود');
 assert.deepEqual(directTexts(initialBar).slice(0,4),['بازگشت به خانه','خروجی اکسل','تازه‌سازی','مدیریت دسترسی']);
 assert.ok(f.d.querySelector('#sentMessagesView .sent-table .workspace-loading'));assert.equal(f.d.querySelector('#sentMessagesView .bamco-management-toolbar'),null);
 release();await until(()=>f.d.querySelector('#sentMessagesView tr[data-sent-key="portal:stable"]'));
 assert.strictEqual(f.d.querySelector('#sentMessagesView .sent-command-row'),initialBar,'نوار پس از دریافت داده نیز باید همان عنصر قبلی بماند');
 assert.equal(f.d.querySelector('#sentMessagesView .workspace-loading'),null);assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('task history resolves deleted owner from task snapshot instead of UUID',async t=>{
 const f=await fixture();t.after(()=>f.dispose());await until(()=>f.w.bamcoTaskHistory?.ownerValue);
 const row={old_value:'"00000000-0000-0000-0000-000000000001"',new_value:null,old_data:{owner_id:'00000000-0000-0000-0000-000000000001'},new_data:{owner_id:null,former_owner_name:'متولی سابق'}};
 assert.equal(f.w.bamcoTaskHistory.ownerValue(row,'old',{}),'متولی سابق');
 assert.equal(f.w.bamcoTaskHistory.ownerValue(row,'new',{}),'بدون متولی');
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('kanban delete has one authoritative rpc path and archive controls remain functional',async t=>{
 const task={id:91,legacy_id:1,title:'وظیفه تست',description:'',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-01',due_date:'2026-09-30',done_date:null,reminder_days:0,manager_notes:'',archived:false};
 const archived={...task,id:92,legacy_id:2,title:'وظیفه آرشیوی',archived:true,archived_at:new Date().toISOString()};
 const f=await fixture({tables:{tasks:[task,archived]},fetchResult:({endpoint,body,tables})=>{if(endpoint==='delete_tasks_and_resequence'){const ids=new Set(body.p_task_ids.map(Number));tables.tasks=tables.tasks.filter(x=>!ids.has(Number(x.id)));return body.p_task_ids.length}if(endpoint==='restore_tasks_to_kanban_and_resequence'){for(const x of tables.tasks)if(body.p_task_ids.includes(Number(x.id))){x.archived=false;x.archived_at=null}return body.p_task_ids.length}}});t.after(()=>f.dispose());
 await f.open('kanban');await until(()=>f.d.querySelector('#kanbanBody tr[data-task-id="91"]'));f.d.querySelector('#kanbanBody tr[data-task-id="91"]').click();await pause(30);assert.equal(f.d.querySelector('#kanbanDeleteBtn').disabled,false);f.d.querySelector('#kanbanDeleteBtn').click();await until(()=>f.calls.filter(c=>c.endpoint==='delete_tasks_and_resequence').length===1);await pause(80);assert.equal(f.calls.filter(c=>c.endpoint==='delete_tasks_and_resequence').length,1);
 await f.open('archive');await until(()=>f.d.querySelector('#archiveBody tr[data-task-id="92"]'));f.d.querySelector('#archiveBody tr[data-task-id="92"]').click();await pause(30);assert.equal(f.d.querySelector('#archiveEditBtn').disabled,false);assert.equal(f.d.querySelector('#archiveRestoreBtn').disabled,false);
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

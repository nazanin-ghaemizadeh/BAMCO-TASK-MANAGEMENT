const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

function directTexts(node){return [...node.children].map(el=>el.textContent.replace(/\s+/g,' ').trim()).filter(Boolean)}

test('response tracking owns requested command order, current-month dates, selection and has no tracking id',async t=>{
 const f=await fixture({tables:{message_response_tracking:[{delivery_id:11,recipient_id:'test-owner',recipient_name:'متولی آزمایشی',recipient_email:'owner@example.test',channel:'portal',subject:'پیام آزمایشی',sent_at:new Date().toISOString(),delivery_status:'sent',response_status:'awaiting',reminder_count:0}]}});t.after(()=>f.dispose());
 await f.open('responseTracking');
 const bar=f.d.querySelector('#responseTrackingView .response-command-row');assert.ok(bar);
 const texts=directTexts(bar);assert.match(texts[0],/بازگشت به خانه/);assert.match(texts[1],/از تاریخ/);assert.match(texts[2],/تازه‌سازی/);assert.match(texts[3],/مدیریت دسترسی/);assert.match(texts[4],/خروجی اکسل/);assert.match(bar.querySelector('#sendResponseReminder').textContent,/ارسال یادآوری/);assert.equal(bar.querySelectorAll('select option').length,3);
 assert.ok(f.d.querySelector('#responseFrom').value);assert.ok(f.d.querySelector('#responseTo').value);
 assert.doesNotMatch(f.d.querySelector('#responseTrackingView table').textContent,/شناسه پیگیری/);
 const row=f.d.querySelector('#responseTrackingBody tr[data-delivery="11"]');assert.ok(row);assert.equal(f.d.querySelector('#sendResponseReminder').disabled,true);row.click();await pause(20);assert.equal(f.d.querySelector('#responseTrackingBody tr[data-delivery="11"]').getAttribute('aria-selected'),'true');assert.equal(f.d.querySelector('#sendResponseReminder').disabled,false);
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('response report has requested command order, month defaults and filtered table source',async t=>{
 const now=new Date().toISOString();
 const f=await fixture({tables:{message_response_tracking:[{delivery_id:21,recipient_id:'test-owner',recipient_name:'متولی آزمایشی',channel:'portal',subject:'گزارش آزمایشی',sent_at:now,delivery_status:'sent',response_status:'awaiting',reminder_count:0}]}});t.after(()=>f.dispose());
 await f.open('responseReport');await until(()=>f.d.querySelector('#responseReportView .response-command-row'));
 const bar=f.d.querySelector('#responseReportView .response-command-row'),texts=directTexts(bar);
 assert.match(texts[0],/بازگشت به خانه/);assert.match(texts[1],/از تاریخ/);assert.match(texts[2],/تازه‌سازی/);assert.match(texts[3],/خروجی اکسل/);assert.match(texts[4],/حذف رکورد/);
 assert.ok(f.d.querySelector('#canonicalResponseFrom').value);assert.ok(f.d.querySelector('#canonicalResponseTo').value);
 assert.ok(f.d.querySelector('#responseReportBody tr[data-delivery-id="21"]'));
 const css=f.d.querySelector('#bamcoCanonicalReportCss').textContent;assert.match(css,/data-response-bulk-delete[^}]*color:#b54040/);
 assert.equal(f.errors.length,0,f.errors.join('\n'));
});

test('message center command row is home, excel, refresh, green send and local row selection enables send',async t=>{
 const f=await fixture({tables:{message_recipient_live_state:[{recipient_id:'test-owner',recipient_name:'متولی آزمایشی',email:'owner@example.test',active_count:2,warning_count:1,overdue_count:0,sticker_state:1,last_sent_at:null}]}});t.after(()=>f.dispose());
 await f.open('messageCenter');await until(()=>f.d.querySelector('#messageCenterView .message-command-row'));
 const bar=f.d.querySelector('#messageCenterView .message-command-row'),texts=directTexts(bar);
 assert.deepEqual([...bar.querySelectorAll(':scope > button')].map(b=>b.textContent.trim()),['بازگشت به خانه','خروجی اکسل','تازه‌سازی','مدیریت دسترسی','ارسال']);assert.equal(bar.querySelectorAll('#messageChannel option').length,3);
 assert.match(f.d.querySelector('#bamcoMessageCenterCommandCss').textContent,/sendSelectedMessages[^}]*background:#218764/);
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
 assert.match(f.d.querySelector('#sentMessagesView tbody').textContent,/پیام داخل سامانه/);assert.match(f.d.querySelector('#sentMessagesView tbody').textContent,/به‌روزرسانی وظیفه/);
 assert.ok(f.calls.some(c=>c.endpoint==='sent_message_log'));
 assert.equal(f.errors.length,0,f.errors.join('\n'));
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

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('live sync checks a tiny version and downloads the full task dataset only after a change',async t=>{
 let version='fixture-v1';
 const tasks=[{id:1,legacy_id:1,title:'عنوان نخست',owner_id:'test-manager',archived:false,status:'در حال انجام',priority:'متوسط',row_version:1,last_updated_at:'2026-09-13T00:00:00Z'}];
 const f=await fixture({tables:{tasks},fetchResult:({endpoint})=>endpoint==='task_dataset_version'?version:undefined});t.after(()=>f.dispose());
 await f.open('kanban');await until(()=>f.w.eval('state.tasks.length')===1);await f.w.bamcoLiveSync.refresh();
 const baseline=f.calls.filter(c=>c.endpoint==='task_status_view').length;
 await f.w.bamcoLiveSync.refresh();
 assert.equal(f.calls.filter(c=>c.endpoint==='task_status_view').length,baseline,'unchanged data must not be downloaded again');
 tasks[0]={...tasks[0],title:'عنوان تازه',row_version:2,last_updated_at:'2026-09-13T00:01:00Z'};version='fixture-v2';
 await f.w.bamcoLiveSync.refresh();
 assert.equal(f.calls.filter(c=>c.endpoint==='task_status_view').length,baseline+1);
 assert.match(f.d.querySelector('#kanbanBody').textContent,/عنوان تازه/);
 const sentBaseline=f.calls.filter(c=>c.endpoint==='sent_message_log').length;
 await f.w.bamcoLiveSync.refresh();
 assert.equal(f.calls.filter(c=>c.endpoint==='sent_message_log').length,sentBaseline,'unchanged sent history must not be downloaded again');
 assert.equal(f.w.bamcoLiveSync.interval,5000);
 assert.deepEqual(f.errors,[]);
});

test('sent-message history is refreshed only when its lightweight version changes',async t=>{
 let sentVersion='sent-v1';
 const history=[{log_key:'portal:1:test-owner',source_type:'portal_event',source_id:'1',recipient_id:'test-owner',recipient_name:'متولی آزمایشی',subject:'پیام نخست',channel:'portal',delivery_status:'sent',sent_at:'2026-09-13T00:00:00Z',attempt_count:1,sender_name:'سامانه',portal_message_id:1}];
 const f=await fixture({tables:{sent_message_log:history},fetchResult:({endpoint})=>endpoint==='sent_message_dataset_version'?sentVersion:undefined});t.after(()=>f.dispose());
 await f.open('sentMessages');await until(()=>f.calls.some(c=>c.endpoint==='sent_message_log'));await f.w.bamcoLiveSync.refresh();
 const baseline=f.calls.filter(c=>c.endpoint==='sent_message_log').length;
 await f.w.bamcoLiveSync.refresh();
 assert.equal(f.calls.filter(c=>c.endpoint==='sent_message_log').length,baseline);
 history[0]={...history[0],subject:'پیام تازه'};sentVersion='sent-v2';
 await f.w.bamcoLiveSync.refresh();
 assert.equal(f.calls.filter(c=>c.endpoint==='sent_message_log').length,baseline+1);
 assert.match(f.d.querySelector('#sentMessagesView').textContent,/پیام تازه/);
 assert.deepEqual(f.errors,[]);
});

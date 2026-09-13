const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

test('task controls enforce status fields, save once and export a readable workbook',async t=>{
 const f=await fixture({tables:{tasks:[]}}),{w,d}=f;t.after(()=>f.dispose());
 await f.open('kanban');d.querySelector('#addTaskBtn').click();const form=d.querySelector('#taskForm');
 assert(d.querySelector('#taskDialog').open);assert(form.elements.owner_id.disabled);assert.equal(form.elements.owner_id.value,'');assert(d.querySelector('[data-date-input=start_date_j]').disabled);
 form.elements.title.value='وظیفهٔ ثبت‌شده';form.requestSubmit();await until(()=>f.tables.tasks.length===1);await until(()=>!d.querySelector('#taskDialog').open);
 assert.equal(f.tables.tasks[0].owner_id,null);assert.equal(f.tables.tasks[0].due_date,null);
 await until(()=>d.querySelector('#kanbanBody tr[data-task-id]'));d.querySelector('#kanbanBody tr[data-task-id]').click();d.querySelector('#kanbanEditBtn').click();
 form.elements.status.value='در حال انجام';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));assert(!form.elements.owner_id.disabled);form.elements.owner_id.value='test-owner';
 form.requestSubmit();await pause(80);assert.equal(f.calls.filter(c=>c.endpoint==='tasks'&&c.method==='PATCH').length,0);assert(d.querySelector('#taskDialog').open);
 for(const name of ['start_date_j','due_date_j']){d.querySelector('[data-date-input="'+name+'"]').click();d.querySelector('#calDay').value='1';d.querySelector('#setDateBtn').click()}
 form.requestSubmit();form.requestSubmit();await until(()=>!d.querySelector('#taskDialog').open);await until(()=>!d.querySelector('#saveTaskBtn').disabled);
 assert.equal(f.calls.filter(c=>c.endpoint==='tasks'&&c.method==='PATCH').length,1);assert.equal(f.tables.tasks[0].owner_id,'test-owner');assert(f.tables.tasks[0].start_date);assert(f.tables.tasks[0].due_date);
 await until(()=>d.querySelector('#kanbanBody tr[data-task-id]'));d.querySelector('#kanbanBody tr[data-task-id]').click();d.querySelector('#kanbanEditBtn').click();form.elements.status.value='منتظر پاسخ';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(form.elements.due_date.value,'');assert(d.querySelector('[data-date-input=due_date_j]').disabled);form.requestSubmit();await until(()=>!d.querySelector('#taskDialog').open);
 d.querySelector('#kanbanExportBtn').click();await until(()=>f.downloads.length);const bytes=await f.downloads[0].blob.arrayBuffer(),book=w.XLSX.read(new Uint8Array(bytes),{type:'array'});assert(w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}).flat().includes('وظیفهٔ ثبت‌شده'));
 assert.deepEqual(f.errors,[]);
});

test('message selection, recipient channels, preview, queue and delivery work without editable message text',async t=>{
 const recipient={recipient_id:'test-owner',recipient_name:'متولی آزمایشی',email:'owner@example.test',active_count:2,warning_count:1,overdue_count:0,sticker_state:2,default_message_channel:'portal'};
 const snapshot={...recipient,id:1,batch_id:91,subject:'پیام آزمایشی',recipient_email:recipient.email,cc_emails:[],template_version:1,final_text:'متن آزمایشی',tasks:[],warning_task_ids:[],overdue_task_ids:[]};
 const f=await fixture({tables:{message_recipient_live_state:[recipient],message_snapshots:[snapshot]},fetchResult:({endpoint})=>['prepare_workflow_messages'].includes(endpoint)?91:undefined}),{d,w}=f;t.after(()=>f.dispose());
 await f.open('messageCenter');await until(()=>d.querySelector('#messageCenterBody tr[data-id]'));
 assert.equal(d.querySelector('#messageCustomText'),null);assert.equal(d.querySelector('#nav [data-view="templates"]'),null);assert.equal(d.querySelector('#templatesView'),null);assert.equal(d.querySelector('#desktopTemplateEditor'),null);
 d.querySelector('#messageCenterBody tr[data-id]').click();assert(d.querySelector('#messageSelectionCount').textContent.includes('۱'));
 const channel=d.querySelector('#messageChannel');channel.value='email';channel.dispatchEvent(new w.Event('change',{bubbles:true}));d.querySelector('#sendSelectedMessages').click();await until(()=>d.querySelector('#messagePreviewDialog').open);
 const prepared=f.calls.find(c=>c.endpoint==='prepare_workflow_messages');assert.equal(prepared.body.p_channels['test-owner'],'email');assert.equal(prepared.body.p_template_text,null);assert(d.querySelector('#messagePreviewContent').textContent.includes('متن آزمایشی'));assert(!f.calls.some(c=>c.endpoint==='queue_message_batch'));
 d.querySelector('[data-message-preview-close]').click();assert(!d.querySelector('#messagePreviewDialog').open);
 d.querySelector('#sendSelectedMessages').click();await until(()=>d.querySelector('#messagePreviewDialog').open);f.failures.add('queue_message_batch');d.querySelector('#confirmSendMessage').click();await until(()=>!d.querySelector('#confirmSendMessage').disabled);assert(d.querySelector('#messagePreviewDialog').open);
 f.failures.delete('queue_message_batch');d.querySelector('#confirmSendMessage').click();await until(()=>!d.querySelector('#messagePreviewDialog').open);assert.equal(f.calls.filter(c=>c.endpoint==='send-message-queue').length,1);
 const reads=f.calls.filter(c=>c.endpoint==='message_recipient_live_state').length;d.querySelector('#refreshMessageCenter').click();await until(()=>f.calls.filter(c=>c.endpoint==='message_recipient_live_state').length>reads);
 assert.deepEqual(f.errors,[]);
});

test('message text route, editor and custom text cannot be reintroduced into the app',async t=>{
 const f=await fixture({tables:{email_templates:[],app_settings:[]}}),{d}=f;t.after(()=>f.dispose());
 await f.open('messageCenter');
 assert.equal(d.querySelector('#nav [data-view="templates"]'),null);assert.equal(d.querySelector('#templatesView'),null);assert.equal(d.querySelector('#desktopTemplateEditor'),null);assert.equal(d.querySelector('#messageCustomText'),null);
 const nav=d.querySelector('#nav');nav.insertAdjacentHTML('beforeend','<button data-view="templates">متن پیام‌ها</button>');
 d.querySelector('.workspace').insertAdjacentHTML('beforeend','<section id="templatesView"><button id="openDesktopTemplateEditor">ویرایش متن</button><textarea id="templateBody"></textarea></section>');
 d.body.insertAdjacentHTML('beforeend','<dialog id="desktopTemplateEditor"></dialog>');
 d.querySelector('#messageCenterView').insertAdjacentHTML('beforeend','<label class="message-custom-text">متن پیام<textarea id="messageCustomText"></textarea></label>');
 await until(()=>!d.querySelector('#nav [data-view="templates"]')&&!d.querySelector('#templatesView')&&!d.querySelector('#desktopTemplateEditor')&&!d.querySelector('#messageCustomText'));
 assert.deepEqual(f.errors,[]);
});

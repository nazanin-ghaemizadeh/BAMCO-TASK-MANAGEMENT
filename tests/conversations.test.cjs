const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
const tasks=[{id:71,title:'وظیفهٔ آزمایشی',status:'درحال انجام',priority:'متوسط',owner_id:'test-owner',start_date:new Date().toISOString().slice(0,10),due_date:new Date().toISOString().slice(0,10),archived:false}];

test('conversation controls use the real UI: public attachment, reply, delete, group lifecycle, task recipient',async t=>{
 const f=await fixture({tables:{tasks}}),{w,d}=f;t.after(()=>f.dispose());
 await f.open('groupChat');await until(()=>d.querySelector('#groupChatView .messenger-compose'));
 await t.test('Persian filenames upload using a safe storage key; metadata and downloads retain the name',async()=>{
  const picker=d.querySelector('#groupChatView input[type=file]'),file=new w.File(['test pdf'],'گزارش بررسی.pdf',{type:'application/pdf'});
  Object.defineProperty(picker,'files',{configurable:true,value:[file]});picker.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert(d.querySelector('.chat-pending').textContent.includes(file.name));
  d.querySelector('.messenger-compose').requestSubmit();await until(()=>f.messages.length===1);await until(()=>d.querySelector('.chat-file'));
  assert.equal(f.uploads.length,1);assert.doesNotMatch(f.uploads[0].url,/[\u0600-\u06ff]/);assert.match(f.uploads[0].url,/\.pdf$/);
  const meta=JSON.parse(f.messages[0].body.split('BAMCO_ATTACHMENT_V1:')[1]);assert.equal(meta.name,file.name);assert.equal(meta.size,file.size);
  d.querySelector('.chat-file').click();await until(()=>f.downloads.length===1);assert.equal(f.downloads[0].name,file.name);assert(f.downloads[0].blob.size>0);
 });
 await t.test('reply, cancellation, failed send retry, delete and refresh',async()=>{
  assert(d.querySelector('.message-reply').classList.contains('bamco-icon-button'));assert.equal(d.querySelector('.message-reply').getAttribute('aria-label'),'پاسخ');d.querySelector('.message-reply').click();assert(!d.querySelector('.chat-reply').classList.contains('hidden'));d.querySelector('.chat-reply button').click();assert(d.querySelector('.chat-reply').classList.contains('hidden'));
  d.querySelector('.message-reply').click();const input=d.querySelector('.messenger-compose textarea');input.value='پاسخ آزمایشی';
  f.failures.add('chat_send_message');d.querySelector('.messenger-compose').requestSubmit();await until(()=>d.querySelector('.chat-error').textContent);assert.equal(input.value,'پاسخ آزمایشی');assert(!d.querySelector('.chat-send').disabled);
  f.failures.delete('chat_send_message');d.querySelector('.messenger-compose').requestSubmit();await until(()=>f.messages.length===2);assert.equal(f.messages[1].reply_to,f.messages[0].id);await until(()=>d.querySelectorAll('.chat-bubble').length===2);
  d.querySelector('.message-delete').click();await until(()=>f.messages[0].deleted_at);await until(()=>d.querySelectorAll('.chat-bubble').length===1);
  const before=f.calls.length;d.querySelector('.chat-refresh').click();await until(()=>f.calls.slice(before).some(c=>c.endpoint==='chat_messages'));
 });
 await t.test('group creation uses searchable member choices; manage, leave and delete are executable',async()=>{
  d.querySelector('[data-create-group]').click();await until(()=>d.querySelector('#conversationGroupForm'));
  const form=d.querySelector('#conversationGroupForm');form.elements.title.value='گروه بررسی';form.requestSubmit();assert(d.querySelector('#groupManageDialog .form-error').textContent.includes('یک نفر دیگر'));
  const search=form.querySelector('[data-member-search]');search.value='متولی';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal([...form.querySelectorAll('.group-member-option')].filter(x=>!x.hidden).length,1);
  form.querySelector('input[value="test-owner"]').click();form.requestSubmit();await until(()=>!d.querySelector('#groupManageDialog').open);await until(()=>d.querySelector('[data-kind=group]'));
  d.querySelector('[data-kind=group]').click();await until(()=>[...d.querySelectorAll('.messenger-head-actions button')].some(b=>b.textContent==='تنظیمات گروه'));
  const action=text=>[...d.querySelectorAll('.messenger-head-actions button')].find(b=>b.getAttribute('aria-label')===text);
  action('تنظیمات گروه').click();await until(()=>d.querySelector('#conversationGroupForm'));d.querySelector('#conversationGroupForm').elements.title.value='گروه ویرایش‌شده';d.querySelector('#conversationGroupForm').requestSubmit();await until(()=>!d.querySelector('#groupManageDialog').open);await until(()=>d.querySelector('[data-kind=group]')?.textContent.includes('ویرایش‌شده'));
  d.querySelector('[data-kind=group]').click();await until(()=>action('خروج از گروه'));action('خروج از گروه').click();await until(()=>!d.querySelector('[data-kind=group]'));assert(f.calls.some(c=>c.endpoint==='chat_leave_group'));
  d.querySelector('[data-create-group]').click();await until(()=>d.querySelector('#conversationGroupForm'));d.querySelector('#conversationGroupForm').elements.title.value='گروه حذف';d.querySelector('#conversationGroupForm input[value="test-owner"]').click();d.querySelector('#conversationGroupForm').requestSubmit();await until(()=>d.querySelector('[data-kind=group]'));d.querySelector('[data-kind=group]').click();await until(()=>action('حذف گفت‌وگو'));action('حذف گفت‌وگو').click();await until(()=>!d.querySelector('[data-kind=group]'));assert(f.calls.some(c=>c.endpoint==='chat_delete_thread'));
 });
 await t.test('task choice is not overwritten by a second renderer and uses the selected recipient',async()=>{
  await f.open('taskChats');await until(()=>d.querySelector('[data-task-choice="71"]'));await pause(180);d.querySelector('[data-task-choice="71"]').click();await until(()=>d.querySelector('.conversation-recipient-grid [data-person]'));
  assert(d.querySelector('.conversation-recipient-head').textContent.includes('با چه کسی'));d.querySelector('.conversation-recipient-grid [data-person="test-owner"]').click();await until(()=>d.querySelector('#taskChatsView .messenger-compose'));
  const request=f.calls.findLast(c=>c.endpoint==='chat_ensure_task_direct');assert.deepEqual(request.body,{p_task_id:71,p_other_user:'test-owner'});assert(d.querySelector('#taskChatsView .messenger-head').textContent.includes('متولی آزمایشی'));
  d.querySelector('#taskChatsView .messenger-compose textarea').value='دربارهٔ وظیفه';d.querySelector('#taskChatsView .messenger-compose').requestSubmit();await until(()=>f.messages.some(m=>m.body==='دربارهٔ وظیفه'));
  d.querySelector('#taskChatsView .content-back').click();assert(!d.querySelector('#homeView').classList.contains('hidden'));assert(d.querySelector('#taskChatsView').classList.contains('hidden'));assert.equal(d.querySelector('#nav button.active'),null);
 });
 assert.deepEqual(f.errors,[]);
});

test('owner portal: conversation controls follow explicit feature grants, not the manager role',async t=>{
 const f=await fixture({role:'owner',tables:{tasks}}),{d}=f;t.after(()=>f.dispose());
 // The fixture grants this owner group-chat creation, while deliberately not
 // granting deletion.  The visible controls must follow those action grants
 // rather than the historical "manager only" assumption.
 await f.open('groupChat');await until(()=>d.querySelector('#groupChatView .messenger-compose'));assert(d.querySelector('[data-create-group]'));
 d.querySelector('.messenger-compose textarea').value='پیام متولی';d.querySelector('.messenger-compose').requestSubmit();await until(()=>f.messages.length);await until(()=>d.querySelector('.chat-bubble'));assert.equal(d.querySelector('.message-delete'),null);
 await f.open('directMessages');await until(()=>d.querySelector('[data-person="test-manager"]'));d.querySelector('[data-person="test-manager"]').click();await until(()=>d.querySelector('#directMessagesView .messenger-compose'));
 assert.equal(f.calls.findLast(c=>c.endpoint==='chat_ensure_direct').body.p_other_user,'test-manager');assert(![...d.querySelectorAll('.messenger-head-actions button')].some(b=>b.textContent.includes('حذف')));
 assert.deepEqual(f.errors,[]);
});

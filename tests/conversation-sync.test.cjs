const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('conversation media separates images, documents and safe links',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {d,w}=f;
 const file=(id,name,mime)=>({id,thread_id:'test-room',sender_id:'test-owner',created_at:new Date().toISOString(),body:'BAMCO_ATTACHMENT_V1:'+JSON.stringify({path:'test-room/'+name,name,mime,size:10})});
 f.messages.push(file(1,'photo.png','image/png'),file(2,'report.pdf','application/pdf'),{id:3,thread_id:'test-room',sender_id:'test-owner',created_at:new Date().toISOString(),body:'https://example.test/report javascript:alert(1)'});
 await f.open('groupChat');await until(()=>d.querySelector('#groupChatView .chat-bubble'));
 d.querySelector('#groupChatView .messenger-head-actions [aria-label="عکس‌ها، فایل‌ها و لینک‌ها"]').click();await until(()=>d.querySelector('#chatMediaDialog')?.open);
 assert(d.querySelector('.chat-media-content').textContent.includes('photo.png'));assert(!d.querySelector('.chat-media-content').textContent.includes('report.pdf'));
 d.querySelector('[data-media-tab=files]').click();assert(d.querySelector('.chat-media-content').textContent.includes('report.pdf'));assert(!d.querySelector('.chat-media-content').textContent.includes('photo.png'));
 d.querySelector('[data-media-tab=links]').click();assert.equal(d.querySelectorAll('.chat-media-content a').length,1);assert.equal(d.querySelector('.chat-media-content a').href,'https://example.test/report');assert.deepEqual(f.errors,[]);
});
test('owner tasks, Persian IDs, system sender identity and notification-to-thread navigation',async t=>{
 const tasks=[{id:71,title:'وظیفه خود متولی',owner_id:'test-owner',archived:false},{id:72,title:'وظیفه شخص دیگر',owner_id:'someone-else',archived:false}];
 const f=await fixture({role:'owner',tables:{tasks,notifications:[]}});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('taskChats');await until(()=>d.querySelector('[data-task-choice="71"]'));assert.equal(d.querySelector('[data-task-choice="72"]'),null);assert.match(d.querySelector('.conversation-task-id').textContent,/۷۱/);
 await f.open('directMessages');await until(()=>d.querySelector('[data-person="test-manager"]'));d.querySelector('[data-person="test-manager"]').click();await until(()=>d.querySelector('#directMessagesView .messenger-compose'));
 const thread=f.threads.find(x=>x.thread_type==='direct');thread.system_recipient_id='test-owner';thread.title='پیام‌های سامانه';
 f.messages.push({id:11,thread_id:thread.id,sender_id:null,is_system:true,message_kind:'daily',body:'گزارش خودکار',created_at:new Date().toISOString()});
 f.tables.notifications.push({id:91,user_id:'test-owner',notification_type:'daily',title:'گزارش وضعیت امور روزانه',body:'گزارش خودکار',entity_type:'chat_thread',entity_id:thread.id,created_at:new Date().toISOString(),read_at:null});
 await w.bamcoInbox.load();assert.equal(d.querySelector('#messageBadge').textContent,'۱');assert.equal(d.querySelector('[data-group="conversations"] .conversation-nav-count').textContent,'۱');await f.open('messages');await until(()=>d.querySelector('[data-notification="91"]'));
 assert.match(d.querySelector('[data-notification="91"]').textContent,/گزارش وضعیت امور روزانه/);d.querySelector('[data-notification="91"]').click();
 await until(()=>!d.querySelector('#directMessagesView').classList.contains('hidden')&&d.querySelector('#directMessagesView .chat-sender')?.textContent==='سامانه');assert(f.tables.notifications[0].read_at);assert.equal(d.querySelector('#messageBadge').textContent,'');assert.deepEqual(f.errors,[]);
});

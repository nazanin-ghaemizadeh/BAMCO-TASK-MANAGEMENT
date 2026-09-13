const test=require('node:test');
const assert=require('node:assert/strict');
const catalog=require('../assets/data/chat-emoji.json');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('dismiss inbox copies persists across reload and synchronizes the bell without opening the conversation',async t=>{
 const now=new Date().toISOString(),note=(id,user_id)=>({id,user_id,notification_type:'public_chat',title:'اعلان',body:'متن اعلان',entity_type:'chat_thread',entity_id:'test-room',created_at:now,read_at:null});
 const f=await fixture({tables:{notifications:[note(81,'test-manager'),note(82,'test-owner')],portal_message_recipients:[{message_id:51,recipient_id:'test-manager',read_at:null,reply_text:'پاسخ قبلی',portal_messages:{subject:'گزارش',body:'سابقه گزارش',created_at:now}}]}});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('messages');await until(()=>d.querySelector('[data-dismiss-notification="81"]'));assert.equal(d.querySelector('#messageBadge').textContent,'۲');
 d.querySelector('[data-dismiss-notification="81"]').click();await until(()=>!d.querySelector('[data-notification="81"]'));assert.equal(w.eval('state.view'),'messages');assert(f.tables.notifications[0].dismissed_at);assert(!f.tables.notifications[1].dismissed_at);await until(()=>d.querySelector('#notificationBell .header-notification-count').textContent==='۱');
 await w.bamcoInbox.load();assert(!d.querySelector('[data-notification="81"]'));
 d.querySelector('[data-dismiss-message="51"]').click();await until(()=>!d.querySelector('[data-mid="51"]'));assert(f.tables.portal_message_recipients[0].dismissed_at);assert.equal(f.tables.portal_message_recipients[0].reply_text,'پاسخ قبلی');
 await until(()=>d.querySelector('#messageBadge').textContent==='');await w.bamcoInbox.load();assert.equal(d.querySelectorAll('#messageList .message-card').length,0);assert.equal(f.tables.notifications.length,2);assert.equal(f.tables.portal_message_recipients.length,1);assert.deepEqual(f.errors,[]);
});

test('failed dismiss keeps the card and unread count available for retry',async t=>{
 const f=await fixture({tables:{notifications:[{id:91,user_id:'test-manager',title:'اعلان',body:'متن',created_at:new Date().toISOString()}]},fetchResult:({endpoint,method})=>endpoint==='notifications'&&method==='PATCH'?[]:undefined});t.after(()=>f.dispose());
 await f.open('messages');await until(()=>f.d.querySelector('[data-dismiss-notification="91"]'));f.failures.add('notifications');f.d.querySelector('[data-dismiss-notification="91"]').click();await until(()=>f.calls.some(x=>x.endpoint==='ui-notice'));assert(f.d.querySelector('[data-notification="91"]'));assert.equal(f.d.querySelector('#messageBadge').textContent,'۱');
});

test('complete emoji groups are selectable without losing drafts; emoji sequences and image stickers keep shared sizing',async t=>{
 const f=await fixture({styles:true,fetchResult:({endpoint})=>endpoint==='chat-emoji.json'?catalog:undefined});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('groupChat');await until(()=>d.querySelector('.chat-sticker-toggle'));assert.match(d.querySelector('.messenger-head .chat-avatar img').getAttribute('src'),/bamco-icon-192/);d.querySelector('.chat-sticker-toggle').click();await until(()=>d.querySelector('.chat-emoji-choice'));
 assert.equal(d.querySelectorAll('.chat-emoji-tools select option').length,catalog.groups.length+1);assert(catalog.groups.flatMap(g=>g.items).length>3900);
 const input=d.querySelector('.messenger-compose textarea');input.value='سلام ';input.setSelectionRange(input.value.length,input.value.length);const emoji=d.querySelector('.chat-emoji-choice img')?.alt||d.querySelector('.chat-emoji-choice').textContent;d.querySelector('.chat-emoji-choice').click();assert.equal(input.value,'سلام '+emoji);assert.equal(f.messages.length,0);
 input.value='👩🏽‍💻 🇮🇷 1️⃣';d.querySelector('.messenger-compose').requestSubmit();await until(()=>d.querySelectorAll('.chat-emoji-glyph').length===3);assert.equal(w.getComputedStyle(d.querySelector('.chat-emoji-glyph')).width,'72px');
 d.querySelector('.chat-sticker-toggle').click();const select=d.querySelector('.chat-emoji-tools select');select.value='stickers';select.dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('.chat-sticker-choice').length,Object.keys(w.BAMCO_DESKTOP_ASSETS).length);assert.equal(w.getComputedStyle(d.querySelector('.chat-sticker-choice img')).width,'52px');d.querySelector('.chat-sticker-choice').click();await until(()=>d.querySelector('.chat-sticker'));assert.equal(w.getComputedStyle(d.querySelector('.chat-sticker')).width,'72px');assert.deepEqual(f.errors,[]);
});

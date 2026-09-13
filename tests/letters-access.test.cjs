const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('public sidebar avatar stays company logo despite person and group photo metadata',async t=>{
 const f=await fixture({fetchResult:({endpoint,data})=>endpoint==='chat_conversation_list'?data.map(row=>({...row,person_id:'test-owner',avatar_path:'old-user.jpg'})):undefined});t.after(()=>f.dispose());
 await f.open('groupChat');await until(()=>f.d.querySelector('[data-thread="test-room"] .conversation-avatar img'));
 const avatar=f.d.querySelector('[data-thread="test-room"] .conversation-avatar');
 assert(!avatar.hasAttribute('data-profile-photo'));assert(!avatar.hasAttribute('data-thread-photo'));assert.match(avatar.querySelector('img').src,/bamco-icon-192/);
 await f.w.bamcoMedia.avatars(f.d,f.profiles);assert.match(avatar.querySelector('img').src,/bamco-icon-192/);assert.deepEqual(f.errors,[]);
});
for(const allowed of [false,true])test(`letters home card and independent route respect grant ${allowed}`,async t=>{
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='can_access_letters'?allowed:undefined});t.after(()=>f.dispose());
 await until(()=>f.calls.some(c=>c.endpoint==='can_access_letters'));
 await until(()=>f.d.querySelector('#lettersNav').classList.contains('hidden')===!allowed);
 assert(f.d.querySelector('#lettersNav').closest('[data-group="resources"]'));
 assert(!f.d.querySelector('#documentsView [data-document-tab]'));
 await f.open('letters');
 if(!allowed)await until(()=>f.w.eval('state.view')!=='letters');else {await until(()=>f.d.querySelector('#lettersBody table'));assert(f.d.querySelector('#lettersAccess').classList.contains('hidden'));}
 assert.deepEqual(f.errors,[]);
});
test('manager grants letters access without changing profiles or other permissions',async t=>{
 const f=await fixture({tables:{letter_access:[]},fetchResult:({endpoint})=>endpoint==='can_access_letters'?true:undefined});t.after(()=>f.dispose());
 await f.open('letters');await until(()=>!f.d.querySelector('#lettersAccess').classList.contains('hidden'));
 f.d.querySelector('#lettersAccess').click();await until(()=>f.d.querySelector('#letterAccessDialog input[type=checkbox]'));
 const box=f.d.querySelector('#letterAccessDialog input[value="test-owner"]');assert(box);box.checked=true;
 f.d.querySelector('#letterAccessDialog form').requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='set_letters_access'));
 const save=f.calls.find(c=>c.endpoint==='set_letters_access');assert.deepEqual(save.body.p_user_ids,['test-owner']);
 assert(!f.calls.some(c=>c.endpoint==='profiles'&&c.method==='PATCH'));assert.deepEqual(f.errors,[]);
});

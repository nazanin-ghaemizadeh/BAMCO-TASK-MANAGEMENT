const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('public sidebar avatar stays company logo despite person and group photo metadata',async t=>{
 const f=await fixture({fetchResult:({endpoint,data})=>endpoint==='chat_conversation_list'?data.map(row=>({...row,person_id:'test-owner',avatar_path:'old-user.jpg'})):undefined});t.after(()=>f.dispose());
 await f.open('groupChat');await until(()=>f.d.querySelector('[data-thread="test-room"] .conversation-avatar img'));
 const avatar=f.d.querySelector('[data-thread="test-room"] .conversation-avatar');
 assert(!avatar.hasAttribute('data-profile-photo'));assert(!avatar.hasAttribute('data-thread-photo'));assert.match(avatar.querySelector('img').src,/bamco-icon-192/);
 await f.w.bamcoMedia.avatars(f.d,f.profiles);assert.match(avatar.querySelector('img').src,/bamco-icon-192/);assert.deepEqual(f.errors,[]);
});
for(const allowed of [false,true])test(`letters home card and independent route respect canonical grant ${allowed}`,async t=>{
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:allowed?[{feature_key:'letters',can_view:true,can_create:true,can_edit:true,can_delete:true,can_export:true}]:[]}:undefined});t.after(()=>f.dispose());
 await until(()=>f.w.BamcoAccess?.isReady?.());
 await until(()=>f.d.querySelector('#lettersIncomingNav').classList.contains('hidden')===!allowed&&f.d.querySelector('#lettersOutgoingNav').classList.contains('hidden')===!allowed);
 assert(f.d.querySelector('#lettersIncomingNav').closest('[data-group="resources"]'));
 assert(!f.d.querySelector('#documentsView [data-document-tab]'));
 if(!allowed){
  assert.equal(f.w.BamcoNavigation.navigate('lettersIncoming'),false);
  assert.notEqual(f.w.eval('state.view'),'lettersIncoming');
 }else {await f.open('lettersIncoming');await until(()=>f.d.querySelector('#lettersIncomingView [data-letters-table]'));assert(f.d.querySelector('#lettersIncomingView [data-letter-action="access"]').classList.contains('hidden'));}
 assert.deepEqual(f.errors,[]);
});
test('letters pages never expose local access management',async t=>{const f=await fixture();t.after(()=>f.dispose());for(const route of ['lettersIncoming','lettersOutgoing']){await f.open(route);const view=f.d.querySelector(`#${route}View`);assert(view.querySelector('[data-letter-action="access"]').classList.contains('hidden'));assert.equal(view.querySelector('#featureAccessControl'),null)}assert.deepEqual(f.errors,[])});
test('a failed canonical access refresh fails closed and blocks a direct route',async t=>{
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'letters',can_view:true}]}:undefined});t.after(()=>f.dispose());
 await f.open('lettersIncoming');await until(()=>f.d.querySelector('#lettersIncomingView [data-letters-table]'));
 f.failures.add('effective_feature_access');f.w.dispatchEvent(new f.w.Event('focus'));
 await until(()=>f.w.BamcoAccess.snapshot().unavailable===true);
 await until(()=>f.w.eval('state.view')!=='lettersIncoming');
 assert.equal(f.w.BamcoAccess.can('letters','view'),false);
 assert.equal(f.w.BamcoAccess.can('settings','view'),true);
 assert.equal(f.w.BamcoNavigation.navigate('lettersIncoming'),false);
 assert.deepEqual(f.errors,[]);
});

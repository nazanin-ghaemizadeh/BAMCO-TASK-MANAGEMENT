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
 await until(()=>f.d.querySelector('#lettersNav').classList.contains('hidden')===!allowed);
 assert(f.d.querySelector('#lettersNav').closest('[data-group="resources"]'));
 assert(!f.d.querySelector('#documentsView [data-document-tab]'));
 if(!allowed){
  assert.equal(f.w.BamcoNavigation.navigate('letters'),false);
  assert.notEqual(f.w.eval('state.view'),'letters');
 }else {await f.open('letters');await until(()=>f.d.querySelector('#lettersBody table'));assert(f.d.querySelector('#lettersAccess').classList.contains('hidden'));}
 assert.deepEqual(f.errors,[]);
});
test('manager grants letters access through the generic feature editor without changing profiles',async t=>{
 const f=await fixture({fetchResult:({endpoint,body})=>{
  if(endpoint==='feature_access_manage_snapshot')return {schema:'bamco.feature-access.v1',feature:{feature_key:'letters'},users:[{id:'test-manager',display_name:'مدیر آزمایشی',active:true},{id:'test-owner',display_name:'متولی آزمایشی',active:true}],grants:[],effective_grants:[]};
  if(endpoint==='set_feature_access')return {schema:'bamco.feature-access.v1',feature_key:body.p_feature_key,changed:1};
 }});t.after(()=>f.dispose());
 await f.open('letters');await until(()=>!f.d.querySelector('#lettersAccess').classList.contains('hidden'));
 f.d.querySelector('#lettersAccess').click();await until(()=>f.d.querySelector('#letterAccessDialog input[type=checkbox]'));
 const box=f.d.querySelector('#letterAccessDialog input[value="test-owner"]');assert(box);box.click();
 f.d.querySelector('#letterAccessDialog form').requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='set_feature_access'));
 const save=f.calls.find(c=>c.endpoint==='set_feature_access');assert.equal(save.body.p_feature_key,'letters');assert.deepEqual(save.body.p_grants,[{user_id:'test-owner',effect:'allow',can_view:true,can_create:true,can_edit:true,can_delete:true,can_export:true}]);
 assert(!f.calls.some(c=>c.endpoint==='profiles'&&c.method==='PATCH'));assert.deepEqual(f.errors,[]);
});
test('turning off effective letters access sends the explicit inherited-grant deny',async t=>{
 const f=await fixture({fetchResult:({endpoint,body})=>{
  if(endpoint==='feature_access_manage_snapshot')return {schema:'bamco.feature-access.v1',feature:{feature_key:'letters'},users:[{id:'test-manager',display_name:'مدیر آزمایشی',active:true},{id:'test-owner',display_name:'متولی آزمایشی',active:true}],grants:[],effective_grants:[{user_id:'test-owner',can_view:true,can_create:true,can_edit:true,can_delete:true,can_export:true}]};
  if(endpoint==='set_feature_access')return {schema:'bamco.feature-access.v1',feature_key:body.p_feature_key,changed:1};
 }});t.after(()=>f.dispose());
 await f.open('letters');f.d.querySelector('#lettersAccess').click();await until(()=>f.d.querySelector('#letterAccessDialog [data-user-id="test-owner"]'));
 const owner=f.d.querySelector('#letterAccessDialog [data-user-id="test-owner"]'),view=owner.querySelector('[data-permission="can_view"]');assert.equal(view.checked,true);view.click();
 f.d.querySelector('#letterAccessDialog form').requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='set_feature_access'));
 const save=f.calls.find(c=>c.endpoint==='set_feature_access');assert.deepEqual(save.body.p_grants,[{user_id:'test-owner',effect:'deny',can_view:false,can_create:false,can_edit:false,can_delete:false,can_export:false}]);
 assert.deepEqual(f.errors,[]);
});
test('a failed canonical access refresh fails closed and blocks a direct route',async t=>{
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'letters',can_view:true}]}:undefined});t.after(()=>f.dispose());
 await f.open('letters');await until(()=>f.d.querySelector('#lettersTable'));
 f.failures.add('effective_feature_access');f.w.dispatchEvent(new f.w.Event('focus'));
 await until(()=>f.w.BamcoAccess.snapshot().unavailable===true);
 await until(()=>f.w.eval('state.view')!=='letters');
 assert.equal(f.w.BamcoAccess.can('letters','view'),false);
 assert.equal(f.w.BamcoAccess.can('settings','view'),true);
 assert.equal(f.w.BamcoNavigation.navigate('letters'),false);
 assert.deepEqual(f.errors,[]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
function snapshot(){return {
 departments:[{id:1,title:'معاونت فنی',active:true,revision:1}],
 units:['public','bamco_process','bamco_quality'].map((schema_name,i)=>({id:i+1,department_id:1,parent_id:null,title:['محصول','فرآیند','کیفیت'][i],schema_name,local_unit_id:1,active:true,features_configured:false,revision:1})),
 members:[{schema_name:'public',user_id:'test-owner',unit_id:1}],packages:[{id:1,title:'مشاهده‌کننده',active:true,revision:1}],package_grants:[{package_id:1,feature_key:'pettyCash',actions:['view']}],bindings:[],unit_features:[],
 workspaces:['public','bamco_process','bamco_quality'].map(schema_name=>({schema_name,people:schema_name==='public'?[{id:'test-owner',name:'کارشناس',full_name:'کارشناس',login_name:'expert',role:'owner',active:true}]:[],roles:[{id:1,title:'کارشناس'}],positions:[],assignments:[],features:[{feature_key:'pettyCash',title:'تنخواه'},{feature_key:'kanban',title:'کانبان'}]}))
};}
function change(f,node,value){node.value=value;node.dispatchEvent(new f.w.Event('change',{bubbles:true}));}
test('central admin manages all scopes, bulk packages, features and effective permissions',async t=>{
 const data=snapshot(),writes=[];
 const f=await fixture({fetchResult:({endpoint,body})=>{
  if(endpoint==='admin_org_snapshot')return data;
  if(endpoint==='admin_org_save'){writes.push(body);if(body.p_action==='features'){data.units[0].features_configured=true;data.units[0].revision++;data.unit_features=body.p_payload.features.map(feature_key=>({unit_id:1,feature_key}));}return {ok:true,id:4};}
  if(endpoint==='admin_org_effective')return [{feature_key:'pettyCash',title:'تنخواه',permissions:{view:true},unit_enabled:true,direct_grants:[]}];
 }});t.after(()=>f.dispose());
 await f.open('organizationAdmin');await until(()=>f.d.querySelector('#orgAdminUnit'));
 assert(f.d.querySelector('#organizationAdminView .enterprise-feature-root'));
 assert.equal(f.d.querySelectorAll('#organizationAdminView .enterprise-toolbar').length,1);
 assert.equal(f.d.querySelectorAll('#organizationAdminView .feature-toolbar-actions').length,1);
 assert(f.d.querySelector('#organizationAdminView .org-admin-workspace #orgAdminUnit'));
 assert.equal(f.d.querySelector('[data-org-tab="structure"]').textContent,'محدوده‌ها');
 assert.equal(f.d.querySelector('[data-org-tab="people"]').textContent,'افراد و دسترسی');
 assert.equal(f.d.querySelectorAll('#orgAdminUnit option').length,3);
 assert.equal(f.d.querySelectorAll('[data-edit-unit]').length,3);
 f.d.querySelector('[data-new-department]').click();let dialog=f.d.querySelector('#orgAdminDialog');dialog.querySelector('[name=title]').value='معاونت جدید';dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>writes.some(x=>x.p_action==='department'));await until(()=>!dialog.open);
 f.d.querySelector('[data-org-tab=features]').click();
 f.d.querySelector('[data-toggle-feature=kanban]').click();
 f.d.querySelector('[data-save-features]').click();await until(()=>writes.some(x=>x.p_action==='features'));await pause(80);
 assert.deepEqual(writes.find(x=>x.p_action==='features').p_payload.features,['pettyCash']);
 f.d.querySelector('[data-org-tab=people]').click();f.d.querySelector('#orgSelectAll').click();f.d.querySelector('[data-bulk-assign]').click();await until(()=>writes.some(x=>x.p_action==='binding_batch'));await pause(80);
 assert.deepEqual(writes.find(x=>x.p_action==='binding_batch').p_payload.user_ids,['test-owner']);
 f.d.querySelector('[data-org-tab=packages]').click();f.d.querySelector('[data-package="1"]').click();assert.equal(f.d.querySelectorAll('[data-grant-feature]').length,10);f.d.querySelector('#orgAdminDialog [data-close]').click();
 f.d.querySelector('[data-org-tab=effective]').click();change(f,f.d.querySelector('#orgEffectivePerson'),'test-owner');f.d.querySelector('[data-effective]').click();await until(()=>f.d.querySelector('#orgAdminBody tbody').textContent.includes('✓'));
 change(f,f.d.querySelector('#orgAdminUnit'),'3');assert.equal(f.d.querySelector('#orgEffectivePerson option').textContent,'انتخاب فرد');
 assert.deepEqual(f.errors,[]);
});
test('ordinary user cannot load central snapshot, even with a forged admin feature grant',async t=>{
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'organizationAdmin',can_view:true,can_manage_access:true}]}:undefined});t.after(()=>f.dispose());
 f.d.querySelector('#nav [data-view=organizationAdmin]').click();await pause(80);
 assert.equal(f.w.BamcoAccess.can('organizationAdmin','manage_access'),false);
 assert.equal(f.calls.some(c=>c.endpoint==='admin_org_snapshot'),false);
 assert.equal(f.d.querySelector('#organizationAdminView').textContent,'');
});

test('central saves immediately update people, chart, roles and the effective access matrix',async t=>{
 const data=snapshot(),s=data.workspaces[0];s.structure_version=4;s.roles[0].active=true;
 s.positions=[{id:10,title:'سمت اولیه',role_id:1,unit_id:1,active:true}];s.assignments=[{position_id:10,user_id:'test-owner',is_primary:true}];let allowed=false;
 const f=await fixture({fetchResult:({endpoint,body,method})=>{
  if(endpoint==='admin_org_snapshot')return data;
  if(endpoint==='admin_org_effective')return [{feature_key:'pettyCash',title:'تنخواه',permissions:{view:allowed},unit_enabled:true,direct_grants:[]}];
  if(endpoint==='admin_org_prepare_workspace')return true;
  if(endpoint==='admin_org_save'){
   if(body.p_action==='unit')data.units[0].title=body.p_payload.title;
   if(body.p_action==='position'){s.positions[0].title=body.p_payload.title;s.structure_version++}
   return {ok:true};
  }
  if(endpoint==='org-admin-users'){s.people[0].name=s.people[0].full_name=body.profile.full_name;return {id:'test-owner',organization_saved:true}}
  if(endpoint==='organization_roles'&&method==='PATCH'){s.roles[0].title=body.title;return [s.roles[0]]}
  if(endpoint==='set_feature_access'){allowed=body.p_grants[0].can_view;return {changed:1}}
 }});t.after(()=>f.dispose());
 await f.open('people');await until(()=>f.d.querySelector('#peopleBody').textContent.includes('کارشناس'));
 await f.open('organization');await until(()=>f.d.querySelector('.organization-chart')?.textContent.includes('سمت اولیه'));
 await f.open('accessMatrix');await until(()=>f.d.querySelector('[data-access-unit]'));
 assert.equal(f.d.querySelector('[data-access-feature=pettyCash]').getAttribute('aria-pressed'),'false');
 await f.open('organizationAdmin');await until(()=>f.d.querySelector('[data-edit-unit="1"]'));
 f.d.querySelector('[data-edit-unit="1"]').click();let dialog=f.d.querySelector('#orgAdminDialog');dialog.querySelector('[name=title]').value='واحد اصلاح‌شده';dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!dialog.open);
 assert.match(f.d.querySelector('#peopleUnit').textContent,/واحد اصلاح‌شده/);
 assert.match(f.d.querySelector('[data-org-unit]').textContent,/واحد اصلاح‌شده/);
 f.d.querySelector('[data-org-tab=people]').click();f.d.querySelector('[data-person=test-owner]').click();dialog.querySelector('[name=full_name]').value='نام اصلاح‌شده';dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!dialog.open);
 assert.match(f.d.querySelector('#peopleBody').textContent,/نام اصلاح‌شده/);
 await until(()=>f.d.querySelector('.organization-chart').textContent.includes('نام اصلاح‌شده'));
 f.d.querySelector('[data-org-tab=positions]').click();f.d.querySelector('[data-edit-role="1"]').click();dialog.querySelector('[name=title]').value='نقش اصلاح‌شده';dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!dialog.open);
 assert.match(f.d.querySelector('#peopleBody').textContent,/نقش اصلاح‌شده/);
 await until(()=>f.d.querySelector('.organization-chart').textContent.includes('نقش اصلاح‌شده'));
 f.d.querySelector('[data-position="10"]').click();dialog.querySelector('[name=title]').value='سمت اصلاح‌شده';dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!dialog.open);
 assert.match(f.d.querySelector('#peopleBody').textContent,/سمت اصلاح‌شده/);
 await until(()=>f.d.querySelector('.organization-chart').textContent.includes('سمت اصلاح‌شده'));
 f.d.querySelector('[data-org-tab=people]').click();f.d.querySelector('[data-person-access=test-owner]').click();await until(()=>dialog.querySelector('[data-access-key=pettyCash]'));
 dialog.querySelector('[data-access-key=pettyCash]').click();dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!dialog.open);
 await f.open('accessMatrix');await until(()=>f.d.querySelector('[data-access-feature=pettyCash]')?.getAttribute('aria-pressed')==='true');
 assert.match(f.d.querySelector('[data-access-unit]').textContent,/واحد اصلاح‌شده/);
 assert.equal(f.w.bamcoAccessMatrix.state.central,true,'access uses the central unit and effective resolver');
 assert.deepEqual(f.errors,[]);
});

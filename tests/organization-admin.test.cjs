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
 assert.equal(f.calls.some(c=>c.endpoint==='admin_org_snapshot'),false);
 assert.equal(f.d.querySelector('#organizationAdminView').textContent,'');
});

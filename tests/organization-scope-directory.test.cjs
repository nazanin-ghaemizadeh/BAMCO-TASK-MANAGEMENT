const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,until}=require('./helpers/app-fixture.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('people is an independent scoped directory with department and unit selectors',()=>{
 const shell=read('assets/js/shell.js'),directory=read('assets/js/organization-directory.js');
 assert.match(shell,/id="peopleDepartment"/);
 assert.match(shell,/id="peopleUnit"/);
 assert.match(shell,/<th>معاونت<\/th><th>واحد<\/th>/);
 assert.match(shell,/این صفحه مستقل از مدیریت جامع سازمان است/);
 assert.match(directory,/admin_org_snapshot/);
 assert.match(directory,/organization_role/);
 assert.match(directory,/organization_position/);
});

test('organization is independently scoped and displays the real structure version',()=>{
 const organization=read('assets/js/organization-structure.js');
 const migration=read('supabase/migrations/20261022130000_admin_scope_directory_details.sql');
 assert.match(organization,/data-org-department/);
 assert.match(organization,/data-org-unit/);
 assert.match(organization,/نسخه ساختار/);
 assert.match(organization,/p_action:'position'/);
 assert.match(migration,/'structure_version'/);
 assert.match(migration,/private\.org_require_admin\(\)/);
 assert.match(migration,/revoke all on function public\.admin_org_snapshot\(\) from public,anon/);
});

test('central administration keeps configuration and access, not duplicate people or chart editors',()=>{
 const admin=read('assets/js/organization-admin.js');
 assert.match(admin,/این بخش فقط برای پیکربندی کل سامانه است/);
 assert.match(admin,/\['structure','محدوده‌ها'\]/);
 assert.match(admin,/\['people','تخصیص دسترسی'\]/);
 assert.doesNotMatch(admin,/\['people','افراد و سمت‌ها'\]/);
 assert.doesNotMatch(admin,/مدیریت تمام معاونت‌ها و واحدها؛ برای جزئیات پروفایل/);
});

test('administrator switches the independent people table and organization chart by unit',async t=>{
 const snapshot={departments:[{id:1,title:'معاونت فنی',active:true}],units:[{id:1,department_id:1,title:'محصول',schema_name:'public',local_unit_id:1,active:true},{id:2,department_id:1,title:'کیفیت',schema_name:'bamco_quality',local_unit_id:1,active:true}],members:[{schema_name:'public',user_id:'test-owner',unit_id:1},{schema_name:'bamco_quality',user_id:'quality-owner',unit_id:2}],packages:[],package_grants:[],bindings:[],unit_features:[],workspaces:[{schema_name:'public',structure_version:7,people:[{id:'test-owner',name:'کارشناس محصول',full_name:'کارشناس محصول',role:'owner',active:true}],roles:[{id:1,title:'کارشناس',level_no:1}],positions:[{id:1,title:'کارشناس محصول',role_id:1,unit_id:1,parent_position_id:null,active:true}],assignments:[{position_id:1,user_id:'test-owner',is_primary:true}],features:[]},{schema_name:'bamco_process',structure_version:2,people:[],roles:[],positions:[],assignments:[],features:[]},{schema_name:'bamco_quality',structure_version:11,people:[{id:'quality-owner',name:'کارشناس کیفیت',full_name:'کارشناس کیفیت',role:'owner',active:true}],roles:[{id:1,title:'کارشناس',level_no:1}],positions:[{id:1,title:'کارشناس کیفیت',role_id:1,unit_id:1,parent_position_id:null,active:true}],assignments:[{position_id:1,user_id:'quality-owner',is_primary:true}],features:[]}]};
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='admin_org_snapshot'?snapshot:undefined});t.after(()=>f.dispose());
 await f.open('people');await until(()=>f.d.querySelector('#peopleUnit option[value="2"]'));
 assert.match(f.d.querySelector('#peopleBody').textContent,/کارشناس محصول/);
 const unit=f.d.querySelector('#peopleUnit');unit.value='2';unit.dispatchEvent(new f.w.Event('change',{bubbles:true}));
 assert.match(f.d.querySelector('#peopleBody').textContent,/کارشناس کیفیت/);assert.doesNotMatch(f.d.querySelector('#peopleBody').textContent,/کارشناس محصول/);
 await f.open('organization');await until(()=>f.d.querySelector('.organization-version'));
 assert.match(f.d.querySelector('.organization-version').textContent,/۷/);
 const chartUnit=f.d.querySelector('[data-org-unit]');chartUnit.value='2';chartUnit.dispatchEvent(new f.w.Event('change',{bubbles:true}));
 await until(()=>f.d.querySelector('.organization-version')?.textContent.includes('۱۱'));
 assert.match(f.d.querySelector('.organization-chart').textContent,/کارشناس کیفیت/);
});

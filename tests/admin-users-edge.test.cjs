const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(path.join(__dirname,'../supabase/functions/admin-users/index.ts'),'utf8'));

function service(options={}){
 const calls=[],actorId=options.actorId||'manager-id',stored={id:'person-id',email:'person@example.test',full_name:'نام قبلی',role:'owner',active:true,cc_emails:['copy@example.test'],must_change_password:false};
 let handler;
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
 const fetch=async(url,init={})=>{
  const u=new URL(url),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
  calls.push({url:u,method,body,headers:new Headers(init.headers)});
  if(u.pathname==='/auth/v1/user')return options.unauthorized?response({error:'invalid token'},401):response({id:actorId,email:'manager@example.test'});
  if(u.pathname==='/rest/v1/profiles'&&u.searchParams.get('id')===`eq.${actorId}`)return response([{role:options.role||'manager',active:options.active!==false,must_change_password:!!options.mustChange}]);
  if(u.pathname==='/rest/v1/rpc/can_access_feature'){
   const enabled=options.peopleActions?.[body?.p_action]??((options.role||'manager')==='manager');
   return response(enabled);
  }
  if(u.pathname==='/rest/v1/rpc/bamco_can_direct_manage_organization_user')return response(options.subordinate===true);
  if(u.pathname==='/rest/v1/rpc/bamco_strict_descendant_user_ids')return response((options.descendants||[]).map(user_id=>({user_id})));
  if(u.pathname==='/rest/v1/profiles'&&method==='GET')return response([stored]);
  if(u.pathname==='/auth/v1/admin/users'&&method==='POST')return response({id:stored.id});
  if(u.pathname==='/auth/v1/admin/users/person-id'||u.pathname===`/auth/v1/admin/users/${actorId}`)return options.authFail&&method==='PUT'?response({code:'email_exists'},422):response({id:stored.id,email:stored.email});
  if(u.pathname==='/rest/v1/rpc/delete_person_account')return options.deleteFail?response({message:'synthetic delete rejected'},409):response(options.unconfirmedDeletion?{}:{ok:true,tasks_retained:2,active_tasks:[{id:901,owner_id:null,owner_deleted_at:'2026-09-10T00:00:00Z'}],avatar_paths:['person-id/avatar.png']});
  if(u.pathname==='/storage/v1/object/avatars')return response({},options.cleanupFail?500:200);
  if(u.pathname==='/rest/v1/profiles'&&method==='PATCH'){
   const auth=new Headers(init.headers).get('Authorization');
   if(auth==='Bearer manager-jwt'&&options.callerPatchDenied)return response({code:'42501',message:'ویرایش پایین‌دست به قرارداد جدید RLS نیاز دارد'},403);
   if(auth!=='Bearer manager-jwt'&&auth!=='Bearer private-service-key')return response({code:'P0001',message:'تغییر این فیلدها مجاز نیست'},400);
   if(auth==='Bearer private-service-key'&&!options.allowServicePatch)return response({code:'P0001',message:'تغییر این فیلدها مجاز نیست'},400);
   if(options.patchError)return response({code:'23505',message:'ایمیل تکراری است'},409);
   if(options.emptyWrite)return response([]);
   Object.assign(stored,body);return response([stored]);
  }
  if(u.pathname==='/rest/v1/audit_trail'&&method==='POST')return response({},201);
  throw new Error('Unexpected backend request '+method+' '+u.pathname);
 };
 vm.runInNewContext(source,{Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'private-service-key'})[key]},serve:fn=>handler=fn},fetch,Response,crypto,URLSearchParams});
 return {calls,stored,async remove(body={}){const r=await handler(new Request('https://fixture.test/functions/v1/admin-users',{method:'DELETE',headers:{Authorization:'Bearer manager-jwt','Content-Type':'application/json'},body:JSON.stringify({user_id:stored.id,...body})}));return {status:r.status,body:await r.json()}},async save(body={}){const r=await handler(new Request('https://fixture.test/functions/v1/admin-users',{method:'POST',headers:{Authorization:'Bearer manager-jwt','Content-Type':'application/json'},body:JSON.stringify({user_id:stored.id,full_name:'نام ویرایش‌شده',email:stored.email,role:'manager',gender:'خانم',salutation:'سرکار خانم',active:true,default_message_channel:'both',...body})}));return{status:r.status,body:await r.json()}},async list(){const r=await handler(new Request('https://fixture.test/functions/v1/admin-users',{method:'GET',headers:{Authorization:'Bearer manager-jwt'}}));return{status:r.status,body:await r.json()}}};
}

test('deployed people handler writes profiles as the authenticated manager and verifies a stored row',async()=>{
 const f=service(),r=await f.save();assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);
 assert.equal(f.stored.full_name,'نام ویرایش‌شده');assert.equal(f.stored.role,'manager');
 assert.deepEqual(f.stored.cc_emails,['copy@example.test'],'unexposed CC addresses must not be erased by an edit');
 const patch=f.calls.find(c=>c.method==='PATCH');assert.equal(patch.headers.get('apikey'),'public-key');assert.equal(patch.headers.get('Prefer'),'return=representation');
 assert.equal(r.body.profile.id,'person-id');assert.equal(r.body.profile.full_name,f.stored.full_name);
 const auth=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id');assert.equal(auth.headers.get('Authorization'),'Bearer private-service-key');
});

test('changing corporate email preserves the independent login and existing password',async()=>{
 const f=service(),r=await f.save({email:'changed@example.test'});assert.equal(r.status,200);
 const update=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id');assert(!('email' in update.body));assert(!('password' in update.body));assert.equal(f.stored.email,'changed@example.test');assert.equal(f.stored.must_change_password,false);
});

test('manager can inspect and edit login for an account with corporate email; current passwords are never returned',async()=>{
 const f=service(),read=await f.save({action:'get_credentials'});assert.equal(read.status,200);assert.equal(read.body.login_name,'person@example.test');assert.equal(read.body.credential_editable,true);assert(!('password' in read.body));assert(!('temporary_password' in read.body));
 const saved=await f.save({action:'save_credentials',login_name:'new.person',temporary_password:'A-long-fixture-pass9!'});assert.equal(saved.status,200);assert.equal(f.stored.email,'person@example.test');assert.equal(f.stored.must_change_password,true);
 const update=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id'&&c.method==='PUT');assert.equal(update.body.email,'new.person@no-email.invalid');assert.equal(update.body.password,'A-long-fixture-pass9!');assert(!('password' in saved.body));assert(!('temporary_password' in saved.body));
});

test('duplicate username does not report success or leave an unperformed password reset gate',async()=>{
 const f=service({authFail:true}),r=await f.save({action:'save_credentials',login_name:'duplicate',temporary_password:'A-long-fixture-pass9!'});assert.equal(r.status,422);assert.equal(f.stored.must_change_password,false);assert(!r.body.ok);
});

test('owners can only change their own username and cannot change another user or password with that action',async()=>{
 const f=service({role:'owner'}),r=await f.save({action:'save_own_login',user_id:'another-id',login_name:'my.login',temporary_password:'Ignore-this-pass9!'});assert.equal(r.status,200);
 const calls=f.calls.filter(c=>c.url.pathname.includes('/admin/users'));assert.equal(calls.length,1);assert.equal(calls[0].url.pathname,'/auth/v1/admin/users/manager-id');assert.deepEqual(calls[0].body,{email:'my.login@no-email.invalid',email_confirm:true});
 for(const opts of [{active:false},{mustChange:true},{unauthorized:true}]){const denied=service(opts),result=await denied.save({action:'save_own_login',login_name:'my.login'});assert([401,403].includes(result.status));assert(!denied.calls.some(c=>c.url.pathname.includes('/admin/users')))}
 const forbidden=service({role:'owner'}),r2=await forbidden.save({action:'save_credentials',login_name:'other.login'});assert.equal(r2.status,403);
});

test('a legacy corporate Auth email is never accepted as an unchanged login identity',async()=>{
 const f=service({role:'owner'}),legacy=await f.save({action:'save_own_login',login_name:'manager@example.test'});
 assert.equal(legacy.status,400);assert(!f.calls.some(c=>c.url.pathname==='/auth/v1/admin/users/manager-id'&&c.method==='PUT'));
 const repaired=await f.save({action:'save_own_login',login_name:'manager.login'});assert.equal(repaired.status,200,JSON.stringify(repaired.body));
 const update=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/manager-id'&&c.method==='PUT');
 assert.deepEqual(update.body,{email:'manager.login@no-email.invalid',email_confirm:true});
});

test('new accounts use the same manager profile-write context',async()=>{
 const f=service(),r=await f.save({user_id:null});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(f.stored.role,'manager');assert.equal(r.body.profile.id,'person-id');
 assert.equal(r.body.temporary_password.length,20);assert.equal(f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users').body.password,r.body.temporary_password);assert.equal(f.stored.must_change_password,true);
});

test('a new corporate email never becomes the Auth credential',async()=>{
 const f=service(),r=await f.save({user_id:null,email:'person@bamco.ir',login_name:'person.login'});assert.equal(r.status,200,JSON.stringify(r.body));
 const create=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users'&&c.method==='POST');
 assert.equal(create.body.email,'person.login@no-email.invalid');
 assert.notEqual(create.body.email,'person@bamco.ir');
 assert.equal(f.stored.email,'person@bamco.ir');
 assert.equal(r.body.login_name,'person.login');
});

test('ordinary person edits cannot smuggle a login change through corporate profile data',async()=>{
 const f=service(),r=await f.save({login_name:'forged.login',email:'updated@bamco.ir'});assert.equal(r.status,200,JSON.stringify(r.body));
 const update=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id'&&c.method==='PUT');
 assert.deepEqual(update.body,{user_metadata:{full_name:'نام ویرایش‌شده'}});
 const profilePatch=f.calls.find(c=>c.url.pathname==='/rest/v1/profiles'&&c.method==='PATCH');
 assert.equal(profilePatch.body.email,'updated@bamco.ir');
 assert.equal('login_name' in profilePatch.body,false);
});

test('saving a mirrored login repairs a legacy Auth corporate-email identity',async()=>{
 const f=service();f.stored.login_name='person.login';
 const r=await f.save({action:'save_credentials',login_name:'person.login'});assert.equal(r.status,200,JSON.stringify(r.body));
 const update=f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id'&&c.method==='PUT');
 assert.deepEqual(update.body,{email:'person.login@no-email.invalid',email_confirm:true});
 assert.equal(f.stored.email,'person@example.test','corporate profile email remains untouched');
});

test('no-email users retain internal delivery and removing an email preserves their login',async()=>{
 const f=service(),r=await f.save({email:null,default_message_channel:'both'});assert.equal(r.status,200);assert.equal(f.stored.messaging_enabled,true);assert.equal(f.stored.default_message_channel,'portal');
 assert(!('email' in f.calls.find(c=>c.url.pathname==='/auth/v1/admin/users/person-id').body));
 const created=service(),a=await created.save({user_id:null,email:null});assert.equal(a.status,200);assert.equal(created.calls.find(c=>c.url.pathname==='/auth/v1/admin/users').body.email,a.body.login_name+'@no-email.invalid');assert.equal(a.body.credential_editable,true);assert(a.body.temporary_password);assert.equal(created.stored.must_change_password,true);
});

test('an empty profile update or database rejection cannot report successful saving',async()=>{
 for(const options of [{emptyWrite:true},{patchError:true}]){const f=service(options),r=await f.save();assert(r.status>=400);assert(!r.body.ok);assert(r.body.error);}
 const f=service({patchError:true}),r=await f.save();assert.match(r.body.error,/ایمیل تکراری/);
});

test('unauthenticated, inactive and nonmanager callers cannot reach privileged account writes',async()=>{
 for(const options of [{unauthorized:true},{role:'owner'},{active:false}]){const f=service(options),r=await f.save();assert([401,403].includes(r.status));assert(!f.calls.some(c=>c.url.pathname.includes('/admin/users')||c.method==='PATCH'));}
});

test('a people editor can update only a strict subordinate through caller-JWT scope authorization',async()=>{
 const f=service({role:'owner',peopleActions:{edit:true,view:true},subordinate:true,callerPatchDenied:true,allowServicePatch:true});
 const r=await f.save({role:undefined,active:undefined,email:'subordinate@bamco.ir'});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(f.stored.email,'subordinate@bamco.ir');
 const can=f.calls.find(c=>c.url.pathname==='/rest/v1/rpc/can_access_feature');assert.deepEqual(can.body,{p_feature_key:'people',p_action:'edit'});
 const scope=f.calls.find(c=>c.url.pathname==='/rest/v1/rpc/bamco_can_direct_manage_organization_user');assert.deepEqual(scope.body,{p_target_user:'person-id'});
 const patches=f.calls.filter(c=>c.url.pathname==='/rest/v1/profiles'&&c.method==='PATCH');assert.equal(patches.length,2);assert.equal(patches[0].headers.get('Authorization'),'Bearer manager-jwt');assert.equal(patches[1].headers.get('Authorization'),'Bearer private-service-key');
 assert.deepEqual(patches[1].body.role,undefined);assert.deepEqual(patches[1].body.active,undefined);assert(f.calls.some(c=>c.url.pathname==='/rest/v1/audit_trail'));
});

test('a people editor cannot alter system-sensitive fields or a user outside their tree',async()=>{
 const sensitive=service({role:'owner',peopleActions:{edit:true},subordinate:true});
 const sensitiveResult=await sensitive.save({role:'manager'});assert.equal(sensitiveResult.status,403);assert(!sensitive.calls.some(c=>c.url.pathname==='/rest/v1/rpc/bamco_can_direct_manage_organization_user'));
 const outside=service({role:'owner',peopleActions:{edit:true},subordinate:false});
 const outsideResult=await outside.save({role:undefined,active:undefined});assert.equal(outsideResult.status,403);assert(outside.calls.some(c=>c.url.pathname==='/rest/v1/rpc/bamco_can_direct_manage_organization_user'));assert(!outside.calls.some(c=>c.method==='PATCH'));
});

test('people directory GET uses people:view and a caller-scoped descendant list',async()=>{
 const denied=service({role:'owner',peopleActions:{view:false}}),deniedResult=await denied.list();assert.equal(deniedResult.status,403);assert(!denied.calls.some(c=>c.url.pathname==='/rest/v1/rpc/bamco_strict_descendant_user_ids'));
 const scoped=service({role:'owner',peopleActions:{view:true},descendants:['person-id']}),result=await scoped.list();assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.profiles[0].id,'person-id');
 const descendants=scoped.calls.find(c=>c.url.pathname==='/rest/v1/rpc/bamco_strict_descendant_user_ids');assert(descendants);const read=scoped.calls.find(c=>c.url.pathname==='/rest/v1/profiles'&&c.method==='GET'&&c.url.searchParams.get('id')?.startsWith('in.('));assert(read);assert.equal(read.headers.get('Authorization'),'Bearer private-service-key');
});


test('delete uses the verified manager identity, server-only transaction and Storage API',async()=>{
 const f=service(),r=await f.remove({p_actor_id:'forged',actor_id:'forged'});assert.equal(r.status,200);assert.equal(r.body.tasks_retained,2);assert.equal(r.body.active_tasks[0].id,901);
 const call=f.calls.find(c=>c.url.pathname==='/rest/v1/rpc/delete_person_account');assert.deepEqual(call.body,{p_user_id:'person-id',p_actor_id:'manager-id'});assert.equal(call.headers.get('Authorization'),'Bearer private-service-key');
 const cleanup=f.calls.find(c=>c.url.pathname==='/storage/v1/object/avatars');assert.deepEqual(cleanup.body.prefixes,['person-id/avatar.png']);assert(!f.calls.some(c=>c.method==='DELETE'&&c.url.pathname.includes('/auth/v1/admin/users')));
});
test('deletion rejects nonmanagers and self deletion before the privileged transaction',async()=>{
 for(const options of [{unauthorized:true},{role:'owner'},{active:false}]){const f=service(options),r=await f.remove();assert([401,403].includes(r.status));assert(!f.calls.some(c=>c.url.pathname.includes('/rpc/')))}
 const f=service(),r=await f.remove({user_id:'manager-id'});assert.equal(r.status,400);assert(!f.calls.some(c=>c.url.pathname.includes('/rpc/')));
});
test('deletion failures cannot report success and photo cleanup failures remain distinguishable',async()=>{
 for(const options of [{deleteFail:true},{unconfirmedDeletion:true}]){const f=service(options),r=await f.remove();assert.equal(r.status,409);assert(!r.body.ok);assert(!f.calls.some(c=>c.url.pathname.includes('/storage/')))}
 const f=service({cleanupFail:true}),r=await f.remove();assert.equal(r.status,200);assert.equal(r.body.ok,true);assert(r.body.cleanup_warning);
});

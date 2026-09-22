const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

async function submitLogin(d,{email='manager@example.test',password='Synthetic-test-password'}={}){
 d.querySelector('#email').value=email;d.querySelector('#password').value=password;
 const code=d.querySelector('#loginVerification').dataset.code;
 [...d.querySelectorAll('.verification-digit')].forEach((input,i)=>{input.value=code[i];input.dispatchEvent(new d.defaultView.Event('input',{bubbles:true}))});
 d.querySelector('#loginForm').requestSubmit();
}

test('actual login module records one session, gates first entry, changes password, and revokes logout',async t=>{
 const f=await fixture({authUi:true,fetchResult:({endpoint})=>endpoint==='token'?{access_token:'signed-in',refresh_token:'refresh-fixture',expires_in:3600,user:{id:'test-manager'}}:undefined}),{w,d}=f;t.after(()=>f.dispose());
 f.profiles[0].must_change_password=true;w.eval('showLogin()');const start=f.calls.length;
 d.querySelector('#email').value='manager@example.test';d.querySelector('#password').value='Synthetic-test-password';
 const code=d.querySelector('#loginVerification').dataset.code;[...d.querySelectorAll('.verification-digit')].forEach((input,i)=>{input.value=code[i];input.dispatchEvent(new w.Event('input',{bubbles:true}))});
 d.querySelector('#loginForm').requestSubmit();await until(()=>d.querySelector('#passwordDialog').open);
 assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='token').length,1);assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='session-audit'&&c.body.action==='start').length,1);
 assert(!f.calls.slice(start).some(c=>c.endpoint==='tasks'||c.endpoint==='task_status_view'));
 d.querySelector('#newPassword').value='New-test-password-739!';d.querySelector('#confirmPassword').value='New-test-password-739!';d.querySelector('#passwordForm').requestSubmit();await until(()=>!d.querySelector('#passwordDialog').open);await pause(100);
 assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='user'&&c.method==='PUT').length,1);assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='profiles'&&c.method==='PATCH').length,1);assert.equal(f.profiles[0].must_change_password,false);
 d.querySelector('.home-welcome-dialog')?.close();d.querySelector('#logoutBtn').click();await until(()=>!d.querySelector('#loginView').classList.contains('hidden'));
 assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='session-audit'&&c.body.action==='end'&&c.body.session_id==='test-current-session').length,1);assert.equal(f.calls.slice(start).filter(c=>c.endpoint==='logout').length,1);assert.equal(w.eval('state.token'),'');assert.deepEqual(f.errors,[]);
});

test('a valid authenticated profile enters even when session-audit start is unavailable',async t=>{
 const f=await fixture({authUi:true,fetchResult:({endpoint})=>{
  if(endpoint==='token')return{access_token:'signed-in',refresh_token:'refresh-fixture',expires_in:3600,user:{id:'test-manager'}};
  // session-runtime rejects this because there is no committed session id. It
  // is presence telemetry, not the authority for password authentication.
  if(endpoint==='session-audit')return{ok:false,error:'ثبت نشست موقتاً در دسترس نیست'};
 }}),{w,d}=f;t.after(()=>f.dispose());
 w.eval('showLogin()');
 await submitLogin(d);
 await until(()=>!d.querySelector('#appView').classList.contains('hidden'));
 assert.equal(w.eval('state.token'),'signed-in');
 assert.equal(d.querySelector('#loginView').classList.contains('hidden'),true);
 assert.equal(d.querySelector('#loginError').textContent,'');
});

test('profile validation remains mandatory when session-audit is unavailable',async t=>{
 const f=await fixture({authUi:true,fetchResult:({endpoint})=>{
  if(endpoint==='token')return{access_token:'signed-in',refresh_token:'refresh-fixture',expires_in:3600,user:{id:'test-manager'}};
  if(endpoint==='session-audit')return{ok:false,error:'ثبت نشست موقتاً در دسترس نیست'};
 }}),{w,d,profiles}=f;t.after(()=>f.dispose());
 // The authenticated identity has no canonical application profile.  The
 // session-audit degradation must never turn that into an admitted account.
 profiles.splice(0,profiles.length);
 w.eval('showLogin()');
 await submitLogin(d);
 await until(()=>d.querySelector('#loginError').textContent.trim().length>0);
 assert.equal(d.querySelector('#appView').classList.contains('hidden'),true);
 assert.equal(w.eval('state.token'),'');
 assert.match(d.querySelector('#loginError').textContent,/پروفایل کاربر پیدا نشد/);
});

test('home and welcome appear before slow data/stickers and late callbacks cannot replace the chosen page',async t=>{
 let slow=false,releaseData,releaseStickers;const dataGate=new Promise(r=>releaseData=r),stickerGate=new Promise(r=>releaseStickers=r);
 const f=await fixture({fetchResult:async({endpoint})=>{if(!slow)return;if(endpoint==='task_status_view')await dataGate;if(endpoint==='sticker_sets')await stickerGate}}),{w,d}=f;
 t.after(async()=>{releaseData();releaseStickers();await f.dispose()});
 w.eval('showLogin()');await pause(20);slow=true;
 const entering=w.eval("state.token='test-token';state.user={id:'test-manager'};enterApp()");
 await until(()=>d.querySelector('.home-welcome-dialog').open);
 assert(!d.querySelector('#homeView').classList.contains('hidden'));assert(d.querySelector('#kanbanView').classList.contains('hidden'));assert.equal(w.eval('state.view'),'home');
 d.querySelector('.home-welcome-dialog').close();await f.open('people');w.bamcoOpenHomeWelcome();assert(!d.querySelector('#peopleView').classList.contains('hidden'));
 releaseData();releaseStickers();await entering;await pause(60);assert(!d.querySelector('#peopleView').classList.contains('hidden'));assert(!d.querySelector('.home-welcome-dialog').open);assert.deepEqual(f.errors,[]);
});

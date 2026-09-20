const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/auth-session.js'),'utf8');
const kernel=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/core/application.js'),'utf8');
function session(fetch){
 const state={token:'',user:{id:'test'},profile:{id:'test',must_change_password:true}};
 const context={state,fetch,SB_URL:'https://fixture.test',SB_KEY:'public',Headers,Request,AbortController,setTimeout,clearTimeout,Date,api:async()=>{},update:async()=>{},showLogin(){state.token='';state.user=null}};
 context.window=context;vm.runInNewContext(kernel+'\n'+source,context);return {...context,auth:context.window.bamcoAuth};
}
test('concurrent requests refresh once, replace the bearer token, and retry 401 once',async t=>{
 let refreshes=0;const calls=[];
 const s=session(async(url,init)=>{const token=new Headers(init.headers).get('Authorization');calls.push(token);
  if(url.includes('refresh_token')){refreshes++;await new Promise(r=>setTimeout(r,15));return Response.json({access_token:'fresh',refresh_token:'next',expires_in:3600})}
  return Response.json({}, {status:token==='Bearer fresh'?200:401});
 });t.after(()=>s.auth.clear());s.auth.accept({access_token:'old',refresh_token:'refresh',expires_in:3600});
 const responses=await Promise.all([1,2,3].map(()=>s.window.fetch('https://fixture.test/rest/v1/tasks',{headers:{Authorization:'Bearer old'}})));
 assert(responses.every(r=>r.ok));assert.equal(refreshes,1);assert.equal(s.state.token,'fresh');assert.equal(calls.filter(t=>t==='Bearer fresh').length,3);
});
test('clearing a session during refresh cannot restore the signed-out user',async()=>{
 let finish;const s=session(()=>new Promise(r=>finish=r));s.auth.accept({access_token:'old',refresh_token:'refresh',expires_in:3600});
 const pending=s.auth.ensureFresh(true);s.auth.clear();s.showLogin();finish(Response.json({access_token:'late',refresh_token:'late',expires_in:3600}));await pending;assert.equal(s.state.token,'');
});
test('logout still revokes native Auth when audit recording fails',async()=>{
 const calls=[];const s=session(async(url)=>{calls.push(url);return new Response(null,{status:204})});s.window.bamcoSession={end:async()=>{throw Error('audit unavailable')}};
 s.auth.accept({access_token:'old',expires_in:3600});await s.auth.signOut();assert(calls.some(u=>u.endsWith('/logout?scope=local')));assert.equal(s.state.token,'');
});
test('short and trivially weak replacement passwords never reach Auth',async()=>{
 const s=session(async()=>Response.json({}));for(const password of ['123456','aaaaaaaaaaaa','password12345678'])await assert.rejects(()=>s.auth.changePassword(password));
 assert.equal(s.state.profile.must_change_password,true);
});

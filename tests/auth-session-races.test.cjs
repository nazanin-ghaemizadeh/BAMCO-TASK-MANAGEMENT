const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}};
function auth(fetch){
 const timers=[],state={token:'',user:{id:'old'}};
 const c={state,fetch,Headers,Request,AbortController,SB_URL:'https://fixture.test',SB_KEY:'public',setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},Date,showLogin(){state.token='';state.user=null}};
 c.window=c;vm.runInNewContext(fs.readFileSync('assets/js/core/application.js','utf8')+'\n'+fs.readFileSync('assets/js/auth-session.js','utf8'),c);
 return{...c,auth:c.bamcoAuth,timers};
}
test('a failed old-session background refresh cannot expire a newly signed-in account',async()=>{
 const gate=deferred(),s=auth(()=>gate.promise);
 s.auth.accept({access_token:'old',refresh_token:'old-refresh',expires_in:3600});
 const running=s.timers[0]();s.auth.clear();s.auth.accept({access_token:'new',refresh_token:'new-refresh',user:{id:'new'},expires_in:3600});
 gate.reject(Error('old refresh disconnected'));await running;
 assert.equal(s.state.token,'new');assert.equal(s.state.user.id,'new');
});
test('a retry response from a previous account is rejected after a session switch',async()=>{
 const retry=deferred(),started=deferred();let calls=0;
 const s=auth(async url=>{if(url.includes('refresh_token'))return Response.json({access_token:'renewed',refresh_token:'renewed-refresh',expires_in:3600});if(++calls===1)return new Response('',{status:401});started.resolve();return retry.promise});
 s.auth.accept({access_token:'old',refresh_token:'old-refresh',expires_in:3600});
 const response=s.fetch('https://fixture.test/storage/v1/object/private/file');await started.promise;
 s.auth.clear();s.auth.accept({access_token:'new',user:{id:'new'},expires_in:3600});retry.resolve(new Response('old private data'));
 await assert.rejects(response,/حساب ورود تغییر کرده است/);
});

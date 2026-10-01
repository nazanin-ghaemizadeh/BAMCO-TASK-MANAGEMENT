const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
async function fixture(t,{syncError=false,heartbeatError=false,readError=false}={}){
 const dom=new JSDOM('<section id="activeSessionsView" class="view"></section><section id="loginActivityView" class="view"></section>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 t.after(()=>dom.window.close());
 const calls=[],flags={syncError,heartbeatError,readError},now=new Date().toISOString();
 w.state={token:'valid',user:{id:'manager'},profiles:[],view:'home'};
 w.BamcoAccess={can:()=>true,isReady:()=>true};w.bamcoLoadTaskOptions=async()=>{};
 w.rpc=async name=>{calls.push(name);if(flags.syncError)throw Error('Session reconciliation unavailable');return 0};
 w.bamcoSession={heartbeat:async()=>{calls.push('heartbeat');if(flags.heartbeatError)throw Error('Session audit unavailable')},currentId:()=> 'current'};
 w.selectAll=async()=>{calls.push('user_sessions');if(flags.readError)throw Error('permission denied');return[
  {id:'current',user_id:'manager',auth_session_id:'auth-current',login_at:now,last_activity_at:now},
  {id:'ended',user_id:'manager',auth_session_id:'auth-ended',login_at:'2026-09-30T08:00:00Z',logout_at:'2026-09-30T09:00:00Z'}
 ]};
 w.eval(fs.readFileSync('assets/js/tab-workspace.js','utf8'));await new Promise(r=>setImmediate(r));
 const render=async(id,background=false)=>{w.state.view=id;await w.bamcoTabs.render(id,background);return w.document.querySelector('#'+id+'View')};
 return{w,flags,calls,render};
}
for(const route of ['activeSessions','loginActivity'])for(const failure of ['syncError','heartbeatError'])test(`${route} still shows stored rows with an explicit warning when ${failure} fails`,async t=>{
 const f=await fixture(t,{[failure]:true}),view=await f.render(route);
 assert.ok(f.calls.includes('user_sessions'),'historical read should not depend on telemetry availability');
 assert.ok(view.querySelector('table'));
 assert.ok(view.querySelector('[data-session-warning]'));
 assert.match(view.textContent,route==='activeSessions'?/current/:/ended/);
 if(failure==='syncError'&&route==='activeSessions')assert.match(view.querySelector('tbody').textContent,/وضعیت تأییدنشده/);
});
test('a recovered sync clears warnings and reclassifies the same stored rows during background refresh',async t=>{
 const f=await fixture(t,{syncError:true}),view=await f.render('activeSessions');
 f.flags.syncError=false;await f.render('activeSessions',true);
 assert.equal(view.querySelector('[data-session-warning]'),null);
 assert.match(view.textContent,/نشست فعلی شما/);
});
test('denied underlying session reads still render an error, never a misleading empty table',async t=>{
 const f=await fixture(t,{syncError:true,readError:true}),view=await f.render('activeSessions');
 assert.equal(view.querySelector('table'),null);assert.match(view.querySelector('[role=alert]').textContent,/permission denied/);
});
test('background presence ticks do not supersede an in-flight report refresh',async t=>{
 const f=await fixture(t);await f.render('activeSessions');
 let release;const gate=new Promise(r=>release=r);let refreshCalls=0;
 f.w.rpc=async()=>{refreshCalls++;await gate;return 0};
 const pending=f.render('activeSessions');await new Promise(r=>setImmediate(r));
 const tick=f.render('activeSessions',true);await new Promise(r=>setImmediate(r));
 release();await Promise.all([pending,tick]);
 assert.equal(refreshCalls,1,'the five-second presence tick must not start and supersede a slow report');
});
test('a transient row-read failure recovers on background refresh even when the rows are unchanged',async t=>{
 const f=await fixture(t),view=await f.render('activeSessions');
 f.flags.readError=true;await f.render('activeSessions',true);assert.ok(view.querySelector('[role=alert]'));
 f.flags.readError=false;await f.render('activeSessions',true);
 assert.ok(view.querySelector('table'),'unchanged snapshot must not leave the previous error panel stuck');
 assert.equal(view.querySelector('[role=alert]'),null);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function runtime(respond){
 const handlers={},store=new Map(),calls=[],state={token:'token'},w={addEventListener:(type,fn)=>handlers[type]=fn};let logins=0;
 vm.runInNewContext(fs.readFileSync('assets/js/session-runtime.js','utf8'),{window:w,document:{addEventListener(){}},state,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},api:async(path,options)=>{calls.push(options);return respond(options.body,options)},setInterval(){},Date,console,showLogin:()=>logins++,toast(){}});
 return{session:w.bamcoSession,handlers,store,calls,state,get logins(){return logins}};
}
test('logout waits for pending start, closes that row and prevents a late ID from reappearing',async()=>{
 const gate=deferred(),f=runtime(body=>body.action==='start'?gate.promise:{ok:true,ended:true});
 const start=f.session.start(),end=f.session.end();gate.resolve({session:{id:'first'}});await Promise.all([start,end]);
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.session_id,'first');assert.equal(f.store.size,0);
});
test('failed session end retains the ID for retry; repeated start cannot create duplicate rows',async()=>{
 let fail=true;const f=runtime(body=>{if(body.action==='start')return{session:{id:'one'}};if(fail)throw Error('offline');return{ended:true}});
 await f.session.start();await f.session.start();assert.equal(f.calls.length,1);
 await assert.rejects(f.session.end(),/offline/);assert.equal(f.store.size,1);
 fail=false;await f.session.end();assert.equal(f.store.size,0);
});
test('a stale heartbeat after logout cannot log a later user out',async()=>{
 const gate=deferred(),f=runtime(body=>body.action==='start'?{session:{id:'one'}}:body.action==='end'?{ended:true}:gate.promise);
 await f.session.start();const beat=f.session.heartbeat();await f.session.end();f.state.token='new-user';gate.resolve({ended:true});await beat;assert.equal(f.logins,0);
});
test('closing the page uses keepalive while back-forward cache preserves its session',async()=>{
 const f=runtime(body=>body.action==='start'?{session:{id:'one'}}:{ended:true});await f.session.start();
 f.handlers.pagehide({persisted:true});assert.equal(f.calls.length,1);
 f.handlers.pagehide({persisted:false});await new Promise(r=>setImmediate(r));assert.equal(f.calls[1].keepalive,true);assert.equal(f.calls[1].body.reason,'closed');
});

const edgeSource=stripTypeScriptTypes(fs.readFileSync('supabase/functions/session-audit/index.ts','utf8').replace(/^import .*;\n/gm,''));
function edge(){
 const rows=[],native=new Set(['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']);let handler,failEnd=false;
 const admin={rpc:async(name,args)=>({data:native.has(args.p_session_id),error:null}),from:table=>{
  let op='read',body,filters=[];
  const query={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},neq(k,v){filters.push(r=>r[k]!==v);return this},is(k,v){filters.push(r=>r[k]==v);return this},lt(){return this},insert(v){op='insert';body=v;return this},update(v){op='update';body=v;return this},delete(){op='delete';return this},single(){return execute()},maybeSingle(){return execute()},then(a,b){return execute().then(a,b)}};
  async function execute(){
   if(table==='app_settings')return{data:null,error:null};
   if(op==='delete')return{data:null,error:null};
   if(op==='insert'){
    if(rows.some(r=>r.auth_session_id===body.auth_session_id))return{data:null,error:{code:'23505'}};
    const row={id:'row-'+rows.length,login_at:new Date().toISOString(),...body};rows.push(row);return{data:row,error:null};
   }
   const row=rows.find(r=>filters.every(fn=>fn(r)));
   if(op==='update'){
    if(failEnd&&body.logout_at)return{data:null,error:{message:'write failed'}};
    if(row)Object.assign(row,body);
   }
   return{data:row||null,error:null};
  }
  return query;
 }};
 vm.runInNewContext(edgeSource,{Deno:{env:{get:()=>''},serve:fn=>handler=fn},createClient:(_u,_k,options)=>options.global?{auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})}}:admin,Response,atob,console});
 return{rows,native,set failEnd(v){failEnd=v},async call(body,sid=[...native][0]){const token='header.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.signature',response=await handler(new Request('https://fixture.test',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)}));return{status:response.status,body:await response.json()}}};
}
test('server start is idempotent, separates devices and never revives a logged-out row',async()=>{
 const f=edge(),a=await f.call({action:'start'}),b=await f.call({action:'start'});assert.equal(a.body.session.id,b.body.session.id);assert.equal(f.rows.length,1);
 const other=await f.call({action:'start'},[...f.native][1]);assert.notEqual(other.body.session.id,a.body.session.id);
 const ended=await f.call({action:'end',session_id:a.body.session.id});assert.equal(ended.body.ended,true);assert(f.rows[0].logout_at);assert(!f.rows[1].logout_at);
 assert.equal((await f.call({action:'start'})).status,409);
});
test('server end verifies persistence and can recover a missing browser session ID',async()=>{
 const f=edge();await f.call({action:'start'});f.failEnd=true;const failed=await f.call({action:'end'});assert.equal(failed.status,500);assert(!failed.body.ended);assert(!f.rows[0].logout_at);
 f.failEnd=false;assert.equal((await f.call({action:'end'})).body.ended,true);assert(f.rows[0].logout_at);
});
test('server detects a removed Auth session and refuses another device session ID',async()=>{
 const f=edge(),sid=[...f.native][0],a=await f.call({action:'start'});
 const wrong=await f.call({action:'end',session_id:a.body.session.id},[...f.native][1]);assert.equal(wrong.status,403);assert(!f.rows[0].logout_at);
 f.native.delete(sid);const status=await f.call({action:'status',session_id:a.body.session.id},sid);assert.equal(status.body.ended,true);assert(f.rows[0].logout_at);
});

test('active-session screen reconciles before reading and removes a remote logout on refresh',async t=>{
 const {fixture,until}=require('./helpers/app-fixture.cjs');
 const now=new Date().toISOString(),rows=[{id:'test-current-session',auth_session_id:'current-auth',user_id:'test-manager',login_at:now,last_activity_at:now},{id:'other-device',auth_session_id:'other-auth',user_id:'test-owner',login_at:now,last_activity_at:now}];
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='user_sessions'?rows:undefined});t.after(()=>f.dispose());
 await f.open('activeSessions');await until(()=>f.d.querySelector('#activeSessionsView').textContent.includes('نشست فعلی شما'));
 const sync=f.calls.findIndex(c=>c.endpoint==='bamco_sync_sessions'),read=f.calls.findIndex(c=>c.endpoint==='user_sessions');assert(sync>=0&&read>sync);
 assert.match(f.d.querySelector('#activeSessionsView').textContent,/other-device/);
 rows[1].logout_at=new Date().toISOString();f.d.dispatchEvent(new f.w.Event('visibilitychange'));
 await until(()=>!f.d.querySelector('#activeSessionsView').textContent.includes('other-device'));
 assert.match(f.d.querySelector('#activeSessionsView').textContent,/نشست فعلی شما/);assert.deepEqual(f.errors,[]);
});

test('a connected legacy client is linked only by its verified native session',async()=>{
 const f=edge(),sid=[...f.native][0];
 f.rows.push({id:'legacy',user_id:'owner',auth_session_id:null,last_activity_at:new Date().toISOString()});
 const response=await f.call({action:'status',session_id:'legacy'},sid);
 assert.equal(response.status,200);assert.equal(response.body.ended,false);assert.equal(f.rows[0].auth_session_id,sid);
 f.native.delete(sid);const ended=await f.call({action:'status',session_id:'legacy'},sid);
 assert.equal(ended.body.ended,true);assert(f.rows[0].logout_at);
});
test('confirmed historical exits stay closed and are never adopted by a new login',async()=>{
 const f=edge(),time=new Date().toISOString();f.rows.push({id:'legacy',user_id:'owner',auth_session_id:null,last_activity_at:time,logout_at:time,ended_reason:'logout_confirmed'});
 const response=await f.call({action:'heartbeat',session_id:'legacy'});assert.equal(response.body.ended,true);assert.equal(f.rows[0].auth_session_id,null);assert.equal(f.rows[0].logout_at,time);
});
test('recent activity alone cannot assert that an unlinked legacy record is active',()=>{
 const {sessionState}=require('../assets/js/tab-workspace.js'),time=new Date().toISOString();
 const legacy={last_activity_at:time,auth_session_id:null};assert.equal(sessionState(legacy),'وضعیت تأییدنشده');
 assert.equal(sessionState({...legacy,auth_session_id:'verified'}),'فعال');
 assert.equal(sessionState({...legacy,logout_at:time,ended_reason:'logout_confirmed'}),'خارج‌شده');
});

test('parallel start maintenance replaces only an older session of the same device',async()=>{const f=edge(),device='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';f.rows.push({id:'old',user_id:'owner',auth_session_id:[...f.native][1],device_id:device},{id:'other',user_id:'owner',auth_session_id:'another',device_id:other});const result=await f.call({action:'start',device_id:device});assert.equal(result.status,200);assert.equal(f.rows[0].ended_reason,'replaced');assert(!f.rows[1].logout_at);assert.equal(result.body.session.device_id,device)});

test('session-audit deployment preserves verified production CORS and avoids the absent termination RPC',()=>{
 const source=fs.readFileSync('supabase/functions/session-audit/index.ts','utf8');
 assert.match(source,/'Access-Control-Allow-Origin':'https:\/\/nazanin-ghaemizadeh\.github\.io'/);
 assert.doesNotMatch(source,/bamco_terminate_auth_sessions/);
});

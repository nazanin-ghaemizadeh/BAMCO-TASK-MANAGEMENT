const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function network(fetch){const source=fs.readFileSync('assets/js/app.js','utf8'),a=source.indexOf('const safeReadRpcs='),b=source.indexOf('\nconst select=',a),context={fetch,window:{},state:{token:'test'},SB_KEY:'public',SB_URL:'https://server.test',navigator:{onLine:true},AbortController,setTimeout:(fn,ms)=>setTimeout(fn,ms===350?0:ms),clearTimeout,apiErrorMessage:()=> 'خطای سرور'};vm.createContext(context);vm.runInContext(source.slice(a,b),context);return context}
test('temporary fetch failure retries safe reads but never replays writes',async()=>{let calls=0;const c=network(async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return new Response('[]')});assert.equal((await c.api('/rest/v1/tasks')).length,0);assert.equal(calls,2);calls=0;await assert.rejects(c.api('/rest/v1/rpc/queue_message_batch',{method:'POST',body:{p_batch_id:'secret-test'}}),/نتیجه عملیات مشخص نیست/);assert.equal(calls,1);assert.equal(c.window.bamcoNetworkErrors.length,1);assert(!JSON.stringify(c.window.bamcoNetworkErrors).includes('secret-test'))});
test('permission errors are not retried and offline errors stay actionable',async()=>{let calls=0;const c=network(async()=>{calls++;return new Response('{"code":"42501"}',{status:403})});await assert.rejects(c.api('/rest/v1/tasks'),/خطای سرور/);assert.equal(calls,1);c.navigator.onLine=false;c.fetch=async()=>{calls++;throw new TypeError('Failed to fetch')};await assert.rejects(c.api('/rest/v1/tasks'),/اتصال اینترنت قطع است/);assert.equal(calls,2)});
test('password admission survives a mobile response arriving after the former 20-second deadline',async()=>{
 let now=0,nextId=0,signal;const timers=new Map();
 const c=network((_url,init)=>{signal=init.signal;return new Promise(resolve=>{timers.set(++nextId,{at:now+25000,fn:()=>resolve(Response.json({access_token:'synthetic'}))})})});
 c.setTimeout=(fn,ms)=>{const id=++nextId;timers.set(id,{at:now+ms,fn});return id};c.clearTimeout=id=>timers.delete(id);
 const advance=ms=>{now+=ms;for(const [id,timer] of timers)if(timer.at<=now){timers.delete(id);timer.fn()}};
 const result=c.api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:'synthetic@example.test',password:'synthetic'}});
 advance(20000);assert.equal(signal.aborted,false);advance(5000);
 assert.equal((await result).access_token,'synthetic');assert.equal(timers.size,0);
});
test('password transport retries once, but credential rejection and refresh rotation never retry',async()=>{
 let calls=0;const c=network(async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return Response.json({access_token:'synthetic'})});
 const path='/auth/v1/token?grant_type=password',options={method:'POST',auth:false,body:{password:'do-not-log'}};
 assert.equal((await c.api(path,options)).access_token,'synthetic');assert.equal(calls,2);
 calls=0;c.fetch=async()=>{calls++;return Response.json({code:'invalid_credentials'},{status:400})};
 await assert.rejects(c.api(path,options));assert.equal(calls,1);
 calls=0;c.fetch=async()=>{calls++;throw new TypeError('Failed to fetch')};
 await assert.rejects(c.api('/auth/v1/token?grant_type=refresh_token',options));assert.equal(calls,1);
 calls=0;await assert.rejects(c.api(path,options),error=>/سرور ورود/.test(error.message)&&!/نتیجه عملیات مشخص نیست/.test(error.message));assert.equal(calls,2);
 assert(!JSON.stringify(c.window.bamcoNetworkErrors).includes('do-not-log'));
});
test('workspace resolution retries a transient failure without retrying other RPC writes',async()=>{
 let calls=0;const c=network(async()=>{if(++calls===1)return new Response('',{status:503});return Response.json({key:'product',schema_name:'public'})});
 assert.equal((await c.api('/rest/v1/rpc/resolve_my_workspace',{method:'POST'})).key,'product');assert.equal(calls,2);
});
test('an unreachable password endpoint stops after two timeouts and offline login is never retried',async()=>{
 let calls=0;const c=network((_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true}))});
 const deadlines=[];c.setTimeout=(fn,ms)=>{deadlines.push(ms);return setTimeout(fn,0)};
 const options={method:'POST',auth:false};
 await assert.rejects(c.api('/auth/v1/token?grant_type=password',options),/سرور ورود/);
 assert.equal(calls,2);assert.equal(deadlines.filter(ms=>ms===45000).length,2);
 calls=0;c.navigator.onLine=false;c.fetch=async()=>{calls++;throw new TypeError('offline')};
 await assert.rejects(c.api('/auth/v1/token?grant_type=password',options),/اتصال اینترنت قطع است/);assert.equal(calls,1);
});
test('closing a deleted chat suppresses its late failed load',async()=>{const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',pretendToBeVisual:true});try{const w=dom.window;let reject;const errors=[];w.URL.revokeObjectURL=()=>{};w.state={user:{id:'self'}};w.isManager=()=>false;w.toast=msg=>errors.push(msg);w.selectAll=()=>new Promise((_,r)=>reject=r);w.rpc=async()=>[];w.bamcoMedia={avatars(){}};w.eval(fs.readFileSync('assets/js/chat-ui.js','utf8'));const mount=w.bamcoChat.mount(w.document.querySelector('#host'),{id:'old',title:'چت قدیمی'});w.bamcoChat.close();w.document.querySelector('#host').replaceChildren();reject(new Error('Failed to fetch'));await mount;assert.equal(errors.length,0);assert.equal(w.document.querySelector('#host').textContent,'')}finally{dom.window.close()}});
test('normal bearer refresh keeps a request valid, but an actual session change rejects it',async()=>{
 const c=network(async()=>{c.state.token='renewed';return Response.json({ok:true})});let epoch=1;c.window.bamcoAuth={snapshot:()=>epoch,isCurrent:s=>s===epoch};assert.equal((await c.api('/rest/v1/tasks')).ok,true);
 c.fetch=async()=>{epoch++;return Response.json({ok:true})};await assert.rejects(c.api('/rest/v1/tasks'),/نشست کاربری/);
});
test('simultaneous paginated reads share transport only while in flight',async()=>{
 const source=fs.readFileSync('assets/js/app.js','utf8');let release,calls=0;const c={window:{},state:{token:'test'},api:async()=>{calls++;await new Promise(r=>release=r);return[{id:1}]}};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('const selectAllPending='),source.indexOf('\nconst insert=',source.indexOf('const selectAllPending='))),c);
 const a=c.selectAll('tasks'),b=c.selectAll('tasks');assert.equal(calls,1);release();await Promise.all([a,b]);const next=c.selectAll('tasks');assert.equal(calls,2);release();await next;
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('only authorized child activity updates presence; renewal requests refresh the shared token',async t=>{
 const dom=new JSDOM('<body></body>',{url:'https://nazanin-ghaemizadeh.github.io/BAMCO-TASK-MANAGEMENT/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let activity=0,allowed=true;const refresh=[],sent=[];
 w.Bamco={state:{token:'current',user:{id:'current-user'}}};w.BamcoAccess={can:()=>allowed};w.bamcoSession={noteActivity:()=>activity++};w.bamcoAuth={ensureFresh:async force=>refresh.push(force)};
 w.eval(fs.readFileSync('assets/js/paint-shop-navigation.js','utf8'));
 const source={location:{origin:w.location.origin,pathname:'/BAMCO-EMISSION-TEST/'},opener:w,postMessage:message=>sent.push(message)};
 const send=(data,s=source,origin=w.location.origin)=>w.dispatchEvent(new w.MessageEvent('message',{data,source:s,origin}));
 send({type:'bamco.emission.activity',userId:'current-user'});assert.equal(activity,1);
 send({type:'bamco.emission.activity',userId:'another-user'});send({type:'bamco.emission.activity',userId:'current-user'},{...source,opener:null});send({type:'bamco.emission.activity',userId:'current-user'},source,'https://example.test');assert.equal(activity,1);
 allowed=false;send({type:'bamco.emission.activity',userId:'current-user'});assert.equal(activity,1);allowed=true;
 send({type:'bamco.emission.request-session',refresh:true});await tick();assert.deepEqual(refresh,[true]);assert.equal(sent[0].accessToken,'current');
});
test('module activity changes the next presence check from status to heartbeat',async()=>{
 let now=1000;const calls=[],store=new Map(),w={addEventListener(){}},state={token:'active'};
 vm.runInNewContext(fs.readFileSync('assets/js/session-runtime.js','utf8'),{window:w,document:{addEventListener(){}},state,Date:{now:()=>now},setInterval(){},console,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},api:async(path,{body})=>{calls.push(body.action);return body.action==='start'?{session:{id:'one'}}:{};},showLogin(){},toast(){}});
 await w.bamcoSession.start();await w.bamcoSession.heartbeat();assert.equal(calls.at(-1),'status');now=2000;w.bamcoSession.noteActivity();await w.bamcoSession.heartbeat();assert.equal(calls.at(-1),'heartbeat');
});

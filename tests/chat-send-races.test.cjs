const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
function chat(t,{rpc=async()=>[],fetch=async()=>new Response('{}')}={}){
 const dom=new JSDOM('<div id="host"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://fixture.test'}),w=dom.window,host=w.document.querySelector('#host');
 t.after(()=>dom.window.close());
 w.state={token:'token',user:{id:'self'}};w.SB_URL='https://server.test';w.SB_KEY='public';w.toast=()=>{};w.selectAll=async()=>[];w.rpc=rpc;w.fetch=fetch;w.bamcoMedia={avatars(){}};w.URL.revokeObjectURL=()=>{};
 w.eval(fs.readFileSync('assets/js/chat-ui.js','utf8'));
 const submit=()=>host.querySelector('form').onsubmit({preventDefault(){}});
 const settle=()=>new Promise(r=>setImmediate(r));
 return {w,host,submit,settle};
}
test('a completed old-thread send cannot clear reply controls in the newly opened thread',async t=>{
 const gate=deferred();
 const f=chat(t,{rpc:async name=>name==='chat_send_message'?gate.promise:[]});
 await f.w.bamcoChat.mount(f.host,{id:'old',title:'Old'});
 f.host.querySelector('textarea').value='old message';f.submit();
 await f.w.bamcoChat.mount(f.host,{id:'new',title:'New'});
 const reply=f.host.querySelector('.chat-reply');reply.classList.remove('hidden');reply.querySelector('span').textContent='New reply';
 gate.resolve({id:1});await f.settle();
 assert.equal(reply.classList.contains('hidden'),false);
 assert.equal(reply.querySelector('span').textContent,'New reply');
});
test('attachment remains stored when message succeeds but sidebar refresh fails',async t=>{
 const deleted=[];
 const f=chat(t,{fetch:async(url,init)=>{if(init.method==='DELETE')deleted.push(url);return new Response('{}')}});
 f.w.bamcoConversations={refresh:async()=>{throw Error('sidebar offline')}};
 await f.w.bamcoChat.mount(f.host,{id:'thread',title:'Thread'});
 const fileInput=f.host.querySelector('input[type=file]');
 Object.defineProperty(fileInput,'files',{value:[new f.w.File(['hello'],'report.txt',{type:'text/plain'})]});
 fileInput.onchange({target:fileInput});f.submit();await f.settle();await f.settle();
 assert.deepEqual(deleted,[]);
});
test('typing a new draft during send preserves that draft after delivery',async t=>{
 const gate=deferred();const f=chat(t,{rpc:async name=>name==='chat_send_message'?gate.promise:[]});
 await f.w.bamcoChat.mount(f.host,{id:'thread',title:'Thread'});
 const input=f.host.querySelector('textarea');input.value='first';f.submit();input.value='next draft';
 gate.resolve({id:1});await f.settle();
 assert.equal(input.value,'next draft');
});
for(const [label,failure,expectedDeletes] of [
 ['unknown network outcome',Object.assign(Error('result unknown'),{code:'NETWORK_ERROR'}),0],
 ['explicit permission rejection',Object.assign(Error('forbidden'),{status:403}),1]
])test(`attachment cleanup respects ${label}`,async t=>{
 const deleted=[];
 const f=chat(t,{rpc:async name=>{if(name==='chat_send_message')throw failure;return[]},fetch:async(url,init)=>{if(init.method==='DELETE')deleted.push(url);return new Response('{}')}});
 await f.w.bamcoChat.mount(f.host,{id:'thread',title:'Thread'});
 const fileInput=f.host.querySelector('input[type=file]');
 Object.defineProperty(fileInput,'files',{value:[new f.w.File(['hello'],'report.txt',{type:'text/plain'})]});
 fileInput.onchange({target:fileInput});f.submit();await f.settle();await f.settle();
 assert.equal(deleted.length,expectedDeletes);
});

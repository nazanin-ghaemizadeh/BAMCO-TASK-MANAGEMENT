const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('assets/js/section-report-data.js','utf8');
const payload=(feature,id)=>({schema:'bamco.section-report.v1',feature,tasks:[{id}],profiles:[],definition_events:[]});
function setup(){
 const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
 w.state={user:{id:'a'},token:'token-a',profile:{active:true},tasks:[{id:'personal'}],requests:[{id:'private'}],requestHistory:[{id:'history'}],definitionRequests:[{id:'definition'}]};
 const grants=new Set(['taskTimeline','performanceReport']),calls=[],pending=[];
 w.BamcoAccess={can:f=>grants.has(f),isReady:()=>true};w.BamcoData={rpc:(n)=>{calls.push(n);return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 w.eval(source);return{dom,w,api:w.BamcoSectionReports,grants,calls,pending};
}
test('independent feeds share no task/workflow state or cache key and dedupe in-flight requests',async t=>{
 const f=setup();t.after(()=>f.dom.window.close());const snapshot=JSON.stringify(f.w.state);
 const a=f.api.load('taskTimeline'),b=f.api.load('performanceReport'),again=f.api.load('taskTimeline');assert.equal(f.calls.length,2);
 f.pending[0].resolve(payload('taskTimeline','all-active'));f.pending[1].resolve(payload('performanceReport','all-history'));
 assert.equal((await a).tasks[0].id,'all-active');assert.equal((await again).tasks[0].id,'all-active');assert.equal((await b).tasks[0].id,'all-history');
 assert.equal(JSON.stringify(f.w.state),snapshot);assert.notEqual(f.api.peek('taskTimeline'),f.api.peek('performanceReport'));
});
test('account switch, revoke, force refresh and malformed response cannot revive stale cache',async t=>{
 const f=setup();t.after(()=>f.dom.window.close());const a=f.api.load('taskTimeline');f.w.state.token='token-b';f.w.state.user.id='b';f.pending[0].resolve(payload('taskTimeline','old'));await assert.rejects(a);assert.equal(f.api.peek('taskTimeline'),null);
 const b=f.api.load('performanceReport');f.grants.delete('performanceReport');f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));f.pending[1].resolve(payload('performanceReport','revoked'));await assert.rejects(b);assert.equal(f.api.peek('performanceReport'),null);
 const old=f.api.load('taskTimeline'),fresh=f.api.load('taskTimeline',{force:true});f.pending[3].resolve(payload('taskTimeline','fresh'));await fresh;f.pending[2].resolve(payload('taskTimeline','stale'));await assert.rejects(old);assert.equal(f.api.peek('taskTimeline').tasks[0].id,'fresh');
 const invalid=f.api.load('taskTimeline',{force:true});f.pending[4].resolve(payload('performanceReport','wrong-feed'));await assert.rejects(invalid);assert.equal(f.api.peek('taskTimeline'),null);
});
test('report gate is independent from Kanban and approvals, denies anonymous/inactive/ungranted',async t=>{
 const f=setup();t.after(()=>f.dom.window.close());assert(!f.grants.has('kanban'));assert(!f.grants.has('approvals'));assert(f.api.allowed('taskTimeline'));assert(f.api.allowed('performanceReport'));
 f.grants.delete('taskTimeline');await assert.rejects(f.api.load('taskTimeline'));assert.equal(f.calls.length,0);f.w.state.profile.active=false;await assert.rejects(f.api.load('performanceReport'));f.w.state.profile.active=true;f.w.state.token='';await assert.rejects(f.api.load('performanceReport'));assert.equal(f.calls.length,0);
});

test('superseded timeline refresh cannot erase a newer successful render',async t=>{
 const dom=new JSDOM('<nav id="nav"></nav><div class="workspace"></div>',{runScripts:'outside-only'}),w=dom.window;t.after(()=>dom.window.close());
 w.state={user:{id:'actor'},token:'token',profile:{active:true},view:'taskTimeline',tasks:[]};w.BamcoAccess={can:()=>true,isReady:()=>true};
 let activate;w.BamcoNavigation={registerView:(_,x)=>{activate=x.activate}};w.bamcoOptions={rows:()=>[],ordered:(_,x)=>x,label:(_,x)=>x,kind:()=> 'registered',color:()=> '#000'};
 const pending=[];w.BamcoData={rpc:()=>new Promise(resolve=>pending.push(resolve))};
 for(const file of ['section-report-data','timeline'])w.eval(fs.readFileSync('assets/js/'+file+'.js','utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.querySelector('#taskTimelineView').classList.remove('hidden');
 const old=activate({force:true}),fresh=activate({force:true}),feed=title=>({schema:'bamco.section-report.v1',feature:'taskTimeline',tasks:[{id:1,title,archived:false}],profiles:[],definition_events:[]});
 pending[1](feed('Fresh task'));await fresh;assert.match(w.document.querySelector('#ttUnscheduledList').textContent,/Fresh task/);
 pending[0](feed('Stale task'));await old;assert.match(w.document.querySelector('#ttUnscheduledList').textContent,/Fresh task/);assert.doesNotMatch(w.document.querySelector('#ttBody').textContent,/نشست یا دسترسی/);
});

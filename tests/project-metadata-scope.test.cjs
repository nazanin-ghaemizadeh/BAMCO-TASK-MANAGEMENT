const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const pause=()=>new Promise(r=>setTimeout(r,0));
async function setup(){
 const dom=new JSDOM('<section id="projectsView"><div id="projectFeatureRoot"></div></section>',{runScripts:'outside-only',url:'https://example.test'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.state={token:'token-a',user:{id:'actor-a'},profile:{id:'actor-a',active:true},profiles:[],view:'projects',organizationScope:{}};
 let allowed=true,handler=async()=>({projects:[{id:1,title:'Foreign title',owner_id:'foreign',manager_id:'foreign',status:'registered'}],items:[],dependencies:[]});
 const calls=[],notices=[];w.BamcoAccess={can:(f,a)=>allowed&&a==='view'};w.BamcoNavigation={registerView(){}};
 w.bamcoEnterprise={q:(s,r=w.document)=>r.querySelector(s),esc:s=>String(s??''),fa:String,date:String,dateTime:String,progress:()=>'',statusText:String,setBusy(){},notify:(m,e)=>notices.push([m,e]),rpc:async(n,p)=>{calls.push([n,p]);return handler(n,p)},update:async()=>[],insert:async()=>[]};
 w.eval(fs.readFileSync('assets/js/project-management.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await w.bamcoProjects.load();
 return{w,d:w.document,calls,notices,handler:f=>handler=f,deny:()=>{allowed=false},close:()=>dom.window.close()};
}
test('foreign metadata preserves owner; ordinary edit uses narrow RPC',async t=>{
 const f=await setup();t.after(f.close);f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-action="edit"]').click();
 const form=f.d.querySelector('#projectForm');assert.equal(form.elements.project_owner_id.value,'foreign');assert(form.elements.project_owner_id.disabled);assert.match(form.elements.project_owner_id.closest('label').textContent,/اختیار تغییر متولی/);assert.doesNotMatch(form.elements.project_owner_id.closest('label').textContent,/پس از ثبت اولین فعالیت/);assert(f.d.querySelector('[data-project-action="delete"]').disabled);
 f.handler(async(n)=>n==='save_project_metadata'?{id:1}:{projects:[],items:[],dependencies:[]});form.elements.title.value='Edited';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await pause();
 const call=f.calls.find(([n])=>n==='save_project_metadata');assert(call);assert.deepEqual(Object.keys(call[1].p_payload).sort(),['description','planned_end','planned_start','priority','status','title']);assert.equal(call[1].p_project_id,1);
});
test('project cache rejects stale account and permission responses and clears immediately',async t=>{
 const f=await setup();t.after(f.close);let resolve;f.handler(()=>new Promise(r=>resolve=r));const load=f.w.bamcoProjects.load();
 f.w.state.token='token-b';f.w.state.user.id='actor-b';f.w.state.view='dashboard';f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));assert.equal(f.w.bamcoProjects.model.projects.length,0);
 resolve({projects:[{id:999,title:'Old account'}],items:[],dependencies:[]});await load;assert.equal(f.w.bamcoProjects.model.projects.length,0);assert(!f.d.body.textContent.includes('Old account'));
 f.w.state.view='projects';let resolve2;f.handler(()=>new Promise(r=>resolve2=r));const pending=f.w.bamcoProjects.load();f.deny();f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));resolve2({projects:[{id:998,title:'Revoked data'}],items:[],dependencies:[]});await pending;assert.equal(f.w.bamcoProjects.model.projects.length,0);
});
test('zero-row metadata save is an error rather than success',async t=>{
 const f=await setup();t.after(f.close);f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-action="edit"]').click();f.handler(async()=>null);
 f.d.querySelector('#projectForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(f.notices.at(-1)[1],true);assert.match(f.notices.at(-1)[0],/هیچ رکوردی/);
});

test('stale mutation reply after account switch cannot select an old project or announce success',async t=>{
 const f=await setup();t.after(f.close);f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-action="edit"]').click();let resolve;
 f.handler(()=>new Promise(r=>resolve=r));f.d.querySelector('#projectForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 f.w.state.token='token-b';f.w.state.user.id='actor-b';f.w.state.view='dashboard';f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));resolve({id:1});await pause();assert.equal(f.w.bamcoProjects.model.selected,null);assert.equal(f.notices.length,0);assert.equal(f.w.bamcoProjects.model.projects.length,0);
});

test('rejected old-account mutation never displays obsolete server errors',async t=>{
 const f=await setup();t.after(f.close);f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-action="edit"]').click();let reject;
 f.handler(()=>new Promise((_,r)=>reject=r));f.d.querySelector('#projectForm').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 f.w.state.token='token-b';f.w.state.user.id='actor-b';f.w.state.view='dashboard';f.w.dispatchEvent(new f.w.Event('bamco:feature-access-changed'));reject(Error('Old account record detail'));await pause();assert.equal(f.notices.length,0);assert.equal(f.w.bamcoProjects.model.projects.length,0);
});


test('foreign view-only project keeps ordinary nodes but disables protected activity creation',async t=>{
 const f=await setup();t.after(f.close);f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-action="item"]').click();const form=f.d.querySelector('#projectItemForm');
 assert(form.querySelector('option[value="activity"]').disabled);assert(!form.querySelector('option[value="phase"]').disabled);assert(!form.querySelector('option[value="milestone"]').disabled);assert(!form.querySelector('[type="submit"]').disabled);
 const before=f.calls.length;form.elements.item_type.value='activity';form.elements.title.value='Blocked';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(f.calls.length,before);assert.equal(f.notices.at(-1)[1],true);
});

test('activity details remain readonly when server context denies edit and delete',async t=>{
 const f=await setup();t.after(f.close);f.handler(async()=>({create_owner_ids:['actor-a'],projects:[{id:1,title:'Project',owner_id:'foreign',protected:{can_delete:false,can_create_activity:false,can_change_owner:false,owner_lock_reason:'authority'}}],items:[{id:9,project_id:1,item_type:'activity',title:'Protected activity',owner_id:'foreign',task_id:9,protected:{can_edit:false,can_delete:false}}],dependencies:[]}));await f.w.bamcoProjects.load();
 f.d.querySelector('[data-project-select]').click();f.d.querySelector('[data-project-view="wbs"]').click();f.d.querySelector('[data-project-item-open="9"]').dispatchEvent(new f.w.MouseEvent('dblclick',{bubbles:true}));
 const form=f.d.querySelector('#projectItemForm');assert(form.querySelector('fieldset').disabled);assert(form.querySelector('[type="submit"]').disabled);assert(form.querySelector('[data-project-item-delete]').disabled);assert.match(form.textContent,/فقط قابل مشاهده/);
});

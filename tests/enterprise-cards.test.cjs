const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

for(const [route,script,dialog,create,table] of [
 ['projects','project-management.js','projectDialog','پروژه جدید','projects'],
 ['invoices','financial-obligations.js','invoiceDialog','صورتحساب جدید','invoices']
])test(`${route}: create opens and selecting a card reveals details`,async()=>{
 const dom=new JSDOM(`<section id="${route}View"><div id="${route==='projects'?'project':'invoice'}FeatureRoot"></div></section>`,{url:'https://example.test/',runScripts:'outside-only'});
 const w=dom.window,registered=new Map();w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.state={profile:{id:'a'},user:{id:'a'},profiles:[]};w.BamcoNavigation={registerView:(id,options)=>registered.set(id,options)};
 const data={projects:[{id:1,title:'پروژه نمونه',project_code:'P1',owner_id:'a',status:'draft'}],invoices:[{id:1,title:'صورت‌حساب نمونه',invoice_number:'I1',account_party:'طرف حساب',total_amount:100,status:'planned'}]};
 w.bamcoEnterprise={q:(s,r=w.document)=>r.querySelector(s),esc:String,fa:String,date:v=>v||'—',dateTime:v=>v||'—',money:String,progress:()=>'',statusText:String,personName:()=>'',fetchRows:async name=>data[name]||[],insert:async()=>[{id:2}],setBusy:()=>{},notify:()=>{}};
 w.eval(fs.readFileSync(`assets/js/${script}`,'utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert(registered.has(route));await registered.get(route).activate();
 assert.equal(w.document.querySelectorAll(`[data-${route==='projects'?'project':'invoice'}-select]`).length,1);
 const root=w.document.querySelector(`#${route==='projects'?'project':'invoice'}FeatureRoot`);
 assert(!root.querySelector('.enterprise-grid').classList.contains('detail-open'));
 root.querySelector('[data-'+(route==='projects'?'project':'invoice')+'-select]').click();assert(root.querySelector('.enterprise-grid').classList.contains('detail-open'));
 root.querySelector('[data-'+(route==='projects'?'project':'invoice')+'-action="back"]').click();
 assert(!root.querySelector('.enterprise-grid').classList.contains('detail-open'));
 [...root.querySelectorAll('button')].find(b=>b.textContent.includes(create)).click();
 assert(root.querySelector('#'+dialog).open);dom.window.close();
});

test('projects: a supervisor can assign only within their organizational branch',async()=>{
 const dom=new JSDOM('<section id="projectsView"><div id="projectFeatureRoot"></div></section>',{url:'https://example.test/',runScripts:'outside-only'});
 const w=dom.window,registered=new Map();w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.state={profile:{id:'lead',role:'supervisor'},user:{id:'lead'},organizationScope:{descendantUserIds:['expert']},profiles:[{id:'lead',display_name:'سرپرست'},{id:'expert',display_name:'کارشناس'},{id:'outside',display_name:'نامرتبط'}]};w.BamcoNavigation={registerView:(id,options)=>registered.set(id,options)};
 w.bamcoEnterprise={q:(s,r=w.document)=>r.querySelector(s),esc:String,fa:String,date:v=>v||'—',dateTime:v=>v||'—',progress:()=>'',statusText:String,personName:()=>'',fetchRows:async name=>name==='projects'?[]:[],insert:async()=>[{id:2}],setBusy:()=>{},notify:()=>{}};
 w.eval(fs.readFileSync('assets/js/project-management.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await registered.get('projects').activate();
 w.document.querySelector('[data-project-action="new"]').click();
 const owner=[...w.document.querySelector('[name="owner_id"]').options].map(option=>option.value);
 assert.deepEqual(owner,['lead','expert']);assert.match(w.document.querySelector('.panel-head h3').textContent,/زیرمجموعه/);dom.window.close();
});

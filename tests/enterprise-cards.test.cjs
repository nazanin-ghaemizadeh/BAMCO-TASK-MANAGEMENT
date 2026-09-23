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

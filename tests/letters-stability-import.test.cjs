const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('letters keep table, scroll and route through refresh, focus and access network errors',async t=>{
 const records=Array.from({length:30},(_,i)=>({id:'L'+i,letter_number:String(i),letter_date:'1405/06/22',subject:'نامه '+i,recipient:'فرد',version:1}));
 const f=await fixture({tables:{letters:records}});t.after(()=>f.dispose());await f.open('letters');await until(()=>f.d.querySelector('#lettersTable tbody tr').textContent.includes('نامه'));
 const table=f.d.querySelector('#lettersTable'),wrap=table.parentElement;wrap.scrollTop=120;f.d.querySelector('#refreshLetters').click();await until(()=>!f.d.querySelector('#refreshLetters').disabled);await new Promise(r=>setTimeout(r,80));assert.equal(f.d.querySelector('#lettersTable'),table);assert.equal(wrap.scrollTop,120);
 const before=f.calls.filter(c=>c.endpoint==='letters').length;f.w.dispatchEvent(new f.w.Event('focus'));await new Promise(r=>setTimeout(r,80));assert.equal(f.calls.filter(c=>c.endpoint==='letters').length,before);
 f.failures.add('can_access_letters');f.w.dispatchEvent(new f.w.Event('focus'));await until(()=>f.d.querySelector('#lettersError').textContent.includes('بررسی دسترسی'));assert.equal(f.w.eval('state.view'),'letters');assert.equal(f.d.querySelector('#lettersTable'),table);
});
test('partial import retains failed rows and retry submits only the remaining rows',async t=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<dialog id="importDialog"></dialog><input id="importFile">',{url:'https://example.test',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.state={profile:{id:'manager'},profiles:[{id:'owner',full_name:'فرد'}],tasks:[]};w.safe=String;w.fa=String;w.en=String;w.norm=String;w.toast=()=>{};w.refresh=async()=>{};
 w.bamcoOptions={load:async()=>{},normalizeTask:()=>{},status:()=>({archivable:true}),ordered:(_,v)=>v,label:(_,v)=>v};w.ensureBamcoXLSX=async()=>({read:()=>({Sheets:{S:{}},SheetNames:['S']}),utils:{sheet_to_json:()=>[{ID:1,title:'اول',owner:'فرد'},{ID:2,title:'دوم',owner:'فرد'}]}});
 const calls=[];let fail=true;w.insert=async(_,body)=>{calls.push(body.legacy_id);if(body.legacy_id===2&&fail)throw Error('خطای آزمایشی');return[{id:body.legacy_id}]};w.eval(fs.readFileSync('assets/js/tasks-io.js','utf8'));await w.BAMCO_DATA_IO.parse({arrayBuffer:async()=>new ArrayBuffer(0)});
 assert.deepEqual(calls,[1,2]);assert(w.document.querySelector('#importDialog').open);assert.equal(w.document.querySelectorAll('#importPreviewBody tr').length,1);assert(w.document.querySelector('#importPreviewBody').textContent.includes('خطای آزمایشی'));
 fail=false;w.document.querySelector('#commitImportBtn').click();await new Promise(r=>setTimeout(r,30));assert.deepEqual(calls,[1,2,2]);assert(!w.document.querySelector('#importDialog').open);
});

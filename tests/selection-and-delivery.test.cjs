const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
const {html}=require('../assets/js/message-renderer.js');
const {run,explain}=require('../supabase/functions/send-message-queue/worker.js');
async function workbookRows(f,index=f.downloads.length-1){const file=f.downloads[index],bytes=await file.blob.arrayBuffer(),book=f.w.XLSX.read(new Uint8Array(bytes),{type:'array'});return f.w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1})}

test('people toggle, Ctrl/Shift selection, single-edit warning, selected/all Excel and bulk delete',async t=>{
 const f=await fixture(),{w,d}=f;t.after(()=>f.dispose());f.profiles.push({id:'test-owner-2',full_name:'متولی دوم',role:'owner',active:true});await f.open('people');await until(()=>d.querySelectorAll('#peopleBody [data-id]').length===3);
 const row=id=>d.querySelector('#peopleBody [data-id="'+id+'"]'),selected=()=>w.bamcoSelection.ids('#peopleBody');
 row('test-owner').click();assert.deepEqual([...selected()],['test-owner']);row('test-owner').click();assert.equal(selected().length,0);
 row('test-owner').click();row('test-owner-2').dispatchEvent(new w.MouseEvent('click',{bubbles:true,ctrlKey:true}));assert.equal(selected().length,2);
 d.querySelector('#editPersonBtn').click();assert(!d.querySelector('#personDialog').open);assert(f.calls.some(c=>c.endpoint==='ui-notice'&&c.body.includes('فقط یک')));
 const exportButton=d.querySelector('#peopleView [data-management-export]');exportButton.click();await until(()=>f.downloads.length===1);let rows=await workbookRows(f);assert.equal(rows.length,3);assert(!rows.flat().includes('مدیر آزمایشی'));
 row('test-owner-2').dispatchEvent(new w.MouseEvent('click',{bubbles:true,ctrlKey:true}));assert.deepEqual([...selected()],['test-owner']);row('test-owner').click();assert.equal(selected().length,0);
 d.querySelector('#peopleSearch').value='مدیر';d.querySelector('#peopleSearch').dispatchEvent(new w.Event('input',{bubbles:true}));exportButton.click();await until(()=>f.downloads.length===2);rows=await workbookRows(f);assert.equal(rows.length,4,'no selection exports all records outside search');
 d.querySelector('#peopleSearch').value='';d.querySelector('#peopleSearch').dispatchEvent(new w.Event('input',{bubbles:true}));row('test-owner').click();row('test-owner-2').dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:true}));assert.equal(selected().length,2);
 w.bamcoConfirm=async()=>false;d.querySelector('#deletePersonBtn').click();await pause(40);assert.equal(f.profiles.length,3);
 w.bamcoConfirm=async()=>true;d.querySelector('#deletePersonBtn').click();await until(()=>f.profiles.length===1);assert.equal(f.profiles[0].id,'test-manager');assert.equal(f.calls.filter(c=>c.endpoint==='admin-users'&&c.method==='DELETE').length,2);assert.deepEqual(f.errors,[]);
});

test('kanban and reports export the selection, then every record when cleared',async t=>{
 const tasks=[1,2,3].map(id=>({id,title:'وظیفه '+id,status:'ثبت شده',priority:'متوسط',archived:false,owner_id:null}));const f=await fixture({tables:{tasks}}),{w,d}=f;t.after(()=>f.dispose());await f.open('kanban');await until(()=>d.querySelectorAll('#kanbanBody tr[data-task-id]').length===3);
 d.querySelector('#kanbanBody [data-task-id="2"]').click();d.querySelector('#kanbanExportBtn').click();await until(()=>f.downloads.length===1);let rows=await workbookRows(f);assert.equal(rows.length,2);assert(rows.flat().includes('وظیفه 2'));
 w.bamcoSelection.clear('#kanbanBody');d.querySelector('#kanbanExportBtn').click();await until(()=>f.downloads.length===2);assert.equal((await workbookRows(f)).length,4);
 await f.open('activeSessions');await until(()=>d.querySelector('#activeSessionsView tbody tr[data-workspace-index]'));d.querySelector('#activeSessionsView tbody tr').click();d.querySelector('#activeSessionsView [data-report-export]').click();await until(()=>f.downloads.length===3);assert.equal((await workbookRows(f)).length,2);assert.deepEqual(f.errors,[]);
});

test('centered custom confirmations are cancellable and replace browser-origin dialogs',async t=>{
 const f=await fixture({realNotices:true,styles:true}),{w,d}=f;t.after(()=>f.dispose());const result=w.bamcoConfirm('حذف دو ردیف؟');await until(()=>d.querySelector('#bamcoNoticeDialog')?.open);const dialog=d.querySelector('#bamcoNoticeDialog');assert(dialog.textContent.includes('حذف دو ردیف؟'));assert(!dialog.textContent.includes('says'));dialog.querySelector('[data-notice-cancel]').click();assert.equal(await result,false);assert(!dialog.open);
 const second=w.bamcoNotice('انجام شد');await until(()=>dialog.open);dialog.querySelector('[data-notice-ok]').click();assert.equal(await second,true);assert.equal(w.getComputedStyle(dialog).position,'fixed');assert.deepEqual(f.errors,[]);
});

test('sessions start at sign-in and repeated DPR-2 redraws keep chart height stable',async t=>{
 const f=await fixture(),{w,d}=f;t.after(()=>f.dispose());assert(f.calls.some(c=>c.endpoint==='session-audit'&&c.body?.action==='start'));
 Object.defineProperty(w,'devicePixelRatio',{value:2,configurable:true});await f.open('dashboard');const canvas=d.querySelector('#statusChart'),logical=Number(canvas.dataset.logicalHeight);for(let i=0;i<5;i++)w.renderDashboard();assert.equal(canvas.height,logical*2);assert.equal(canvas.style.height,logical+'px');
});

test('chat photos, search and own-message edit use real handlers without resending a message',async t=>{
 const f=await fixture(),{w,d}=f;t.after(()=>f.dispose());f.profiles[1].avatar_path='test-owner/avatar.png';await f.open('directMessages');await until(()=>d.querySelector('[data-person="test-owner"]'));await until(()=>d.querySelector('[data-person="test-owner"] .conversation-avatar img'));
 d.querySelector('[data-person="test-owner"]').click();await until(()=>d.querySelector('.messenger-compose'));const input=d.querySelector('.messenger-compose textarea');input.value='متن اولیه';d.querySelector('.messenger-compose').requestSubmit();await until(()=>d.querySelector('.message-edit'));
 d.querySelector('.message-edit').click();input.value='متن اصلاح‌شده';d.querySelector('.messenger-compose').requestSubmit();await until(()=>f.messages[0].body==='متن اصلاح‌شده');await until(()=>d.querySelector('.chat-bubble').textContent.includes('ویرایش‌شده'));assert.equal(f.messages.length,1);
 d.querySelector('.chat-search-toggle').click();const search=d.querySelector('.chat-search-bar input');search.value='ناموجود';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert(d.querySelector('.chat-bubble').hidden);search.value='اصلاح';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert(!d.querySelector('.chat-bubble').hidden);assert.deepEqual(f.errors,[]);
});

test('report rendering escapes content and supplies bright tables with independent Latin type',()=>{
 const snapshot={body_template:'گزارش BAMCO\n[جدول امور هشداری]\n[استیکر]',warning_task_ids:[1],tasks:[{id:1,title:'<img src=x onerror=alert(1)>',status:'در حال انجام',priority:'متوسط',due_date:'2026-09-10'}]};const result=html(snapshot,{stickerUrl:'javascript:alert(1)'});assert(!result.includes('<img src=x'));assert(result.includes('&lt;'));assert(result.includes('onerror'));assert(!result.includes('src="javascript:'));assert(result.includes("font-family:'Times New Roman'"));assert(result.includes('#fff8e5'));assert(result.includes('background:#fff'));assert(!result.includes('[جدول'));
});

function fakeDb(deliveries){const batches=[];return{deliveries,batches,from(table){let action='select',patch,filters=[];const query={select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},in(k,v){filters.push(r=>v.includes(r[k]));return this},lt(k,v){filters.push(r=>r[k]<v);return this},update(value){action='update';patch=value;return this},async maybeSingle(){const result=await this;return{...result,data:result.data[0]||null}},then(resolve,reject){try{const source=table==='message_batches'?[{id:'batch'}]:deliveries,rows=source.filter(r=>filters.every(fn=>fn(r)));if(action==='update'){rows.forEach(r=>Object.assign(r,patch));if(table==='message_batches')batches.push(patch)}return Promise.resolve({data:rows.map(r=>({...r})),error:null}).then(resolve,reject)}catch(err){return Promise.reject(err).then(resolve,reject)}}};return query}}}

test('email failures remain failed at retry limit and two workers claim a delivery only once',async()=>{
 const d={id:1,batch_id:'batch',channel:'email',status:'queued',attempt_count:0,thread_key:'BAMCO-test',message_snapshots:{recipient_email:'nobody@example.test',subject:'Reminder',final_text:'Original delivery context'}},db=fakeDb([d]);let calls=0;
 const send=async()=>{calls++;await pause(10);return{id:'accepted'}};await Promise.all([run(db,'batch',send),run(db,'batch',send)]);assert.equal(calls,1);assert.equal(d.status,'sent');
 d.status='failed';d.attempt_count=3;d.error_message='certificate NotValidForName';const failed=await run(db,'batch',send);assert.equal(failed.failed,1);assert.equal(failed.status,'failed');assert.equal(calls,1);assert.match(explain(new Error(d.error_message)),/گواهی امنیتی/);
 const empty=fakeDb([]);await assert.rejects(()=>run(empty,'batch',send),/پیدا نشد/);
});

test('current Persian month completion and create-request counts use the agreed denominator',async t=>{
 const f=await fixture({tables:{tasks:[],change_requests:[]}}),{w,d}=f;t.after(()=>f.dispose());
 const now=new Date(),month=new Intl.DateTimeFormat('fa-IR-u-nu-latn',{year:'numeric',month:'numeric',timeZone:'Asia/Tehran'}).formatToParts(now),y=Number(month.find(x=>x.type==='year').value),m=Number(month.find(x=>x.type==='month').value),from=w.jalaliToISO(y,m,1);
 f.tables.tasks.push({id:1,title:'فعال',owner_id:'test-owner',status:'در حال انجام',archived:false,due_date:from},{id:2,title:'تکمیل این ماه',owner_id:'test-owner',status:'انجام شده',archived:true,done_date:'2025-01-01',due_date:from},{id:3,title:'تکمیل قدیمی',owner_id:'test-owner',status:'انجام شده',archived:true,done_date:from,due_date:'2025-01-01'},{id:4,title:'در انتظار',owner_id:'test-owner',status:'منتظر پاسخ',archived:false});
 f.tables.change_requests.push({requested_by:'test-owner',request_type:'create',created_at:from+'T12:00:00Z'},{requested_by:'test-owner',request_type:'create',created_at:'2025-01-01T12:00:00Z'},{requested_by:'test-owner',request_type:'update',created_at:from+'T12:00:00Z'});
 await w.eval('refresh()');await f.open('performanceReport');await until(()=>d.querySelector('#performanceReportView tbody tr[data-workspace-index]'));
 const values=[...d.querySelector('#performanceReportView tbody tr').cells].map(c=>c.textContent.trim());assert.equal(values[1],'۴');assert.equal(values[5],'۲');assert.equal(values[6],'۱');assert.equal(values[7],'۵۰٪');assert.equal(values[8],'۱');assert.equal(d.querySelector('#performanceReportView .workspace-metrics'),null);
});

test('chain editing uses one atomic request and populates saved stage rules',async t=>{
 const f=await fixture({tables:{approval_chains:[{id:10,name:'زنجیره موجود',active:true,is_default:false}],approval_chain_members:[{chain_id:10,user_id:'test-owner'}],approval_chain_stages:[{id:20,chain_id:10,stage_no:1,title:'بررسی',approval_rule:'all'}],approval_stage_approvers:[{stage_id:20,approver_id:'test-manager'}]}}),{d}=f;t.after(()=>f.dispose());await f.open('approvalChains');await until(()=>d.querySelector('.chain-edit'));d.querySelector('.chain-edit').click();const form=d.querySelector('#approvalChainForm');assert.equal(form.elements.name.value,'زنجیره موجود');assert.equal(form.elements.stage1_rule.value,'all');assert.equal(form.elements.members.selectedOptions[0].value,'test-owner');form.elements.name.value='زنجیره اصلاح‌شده';form.requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='save_approval_chain'));const saved=f.calls.find(c=>c.endpoint==='save_approval_chain').body;assert.equal(saved.p_chain_id,10);assert.equal(saved.p_stages[0].rule,'all');await until(()=>f.tables.approval_chains.length===2);assert.equal(f.tables.approval_chain_stages[0].title,'بررسی');assert.deepEqual(f.errors,[]);
});

test('sticker switching reuses simultaneous authenticated downloads',async t=>{
 const stickers=['state1','state2'].flatMap((state_key,i)=>['female','male'].map(gender=>({id:i+gender,set_id:1,state_key,gender,storage_path:state_key+'_'+gender+'.png'})));
 const f=await fixture({tables:{sticker_sets:[{id:1,name:'بسته آزمون',active:true}],stickers}}),{w,d}=f;t.after(()=>f.dispose());await f.open('stickers');await until(()=>d.querySelectorAll('#stickerPair img').length===2);const downloads=()=>f.calls.filter(c=>c.url.includes('/storage/v1/object/authenticated/stickers/')).length;await pause(50);const before=downloads();d.querySelector('#stickerState').value='state2';d.querySelector('#stickerState').dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>d.querySelectorAll('#stickerPair img').length===2);d.querySelector('#stickerState').value='state1';d.querySelector('#stickerState').dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>d.querySelectorAll('#stickerPair img').length===2);assert.equal(downloads(),before);assert.deepEqual(f.errors,[]);
});

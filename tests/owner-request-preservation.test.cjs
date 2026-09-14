const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('owner sends actual selected dates and full details; failed request keeps the form intact',async t=>{
 const f=await fixture({role:'owner'});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('kanban');d.querySelector('#addTaskBtn').click();const form=d.querySelector('#taskForm');
 form.elements.title.value='Preserve task dates';form.elements.description.value='Full description';
 form.elements.status.value='در حال انجام';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));
 form.elements.reminder_days.value='4';
 for(const name of ['start_date_j','due_date_j']){d.querySelector('[data-date-input="'+name+'"]').click();d.querySelector('#calDay').value='10';d.querySelector('#setDateBtn').click()}
 const start=form.elements.start_date.value,due=form.elements.due_date.value;assert(start&&due);
 f.failures.add('submit_change_request');form.requestSubmit();await until(()=>f.calls.some(c=>c.endpoint==='submit_change_request'));await until(()=>!d.querySelector('#saveTaskBtn').disabled);
 assert(d.querySelector('#taskDialog').open);assert.equal(form.elements.start_date.value,start);assert.equal(form.elements.description.value,'Full description');
 f.failures.delete('submit_change_request');form.requestSubmit();await until(()=>!d.querySelector('#taskDialog').open);
 const calls=f.calls.filter(c=>c.endpoint==='submit_change_request'),payload=calls.at(-1).body.p_proposed_data;
 assert.equal(payload.start_date,start);assert.equal(payload.due_date,due);assert.equal(payload.reminder_days,4);assert.equal(payload.owner_id,'test-owner');assert.equal(payload.description,'Full description');assert.equal(payload.status,'در حال انجام');assert.deepEqual(f.errors,[]);
});

test('owner completion keeps the selected due date in the approval request',async t=>{
 const task={id:44,title:'Complete with corrected due date',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',archived:false,start_date:'2026-09-01',due_date:'2026-09-20'};
 const f=await fixture({role:'owner',tables:{tasks:[task]}});t.after(()=>f.dispose());const {d,w}=f;await f.open('kanban');await until(()=>d.querySelector('[data-task-id="44"]'));d.querySelector('[data-task-id="44"]').click();d.querySelector('#kanbanEditBtn').click();const form=d.querySelector('#taskForm');
 form.elements.status.value='انجام شده';form.elements.status.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>form.elements.status.dataset.archiveConfirmed==='1');assert.equal(d.querySelector('[data-date-input="due_date_j"]').disabled,false);assert.equal(d.querySelector('[data-date-input="done_date_j"]').disabled,false);
 w.eval("setJalaliField('due_date_j','2026-09-24')");form.requestSubmit();await until(()=>!d.querySelector('#taskDialog').open);const call=f.calls.filter(c=>c.endpoint==='submit_change_request').at(-1);assert.equal(call.body.p_request_type,'complete');assert.equal(call.body.p_proposed_data.due_date,'2026-09-24');assert(call.body.p_proposed_data.done_date);assert.deepEqual(f.errors,[]);
});

test('Kanban export, clear and message navigation share the task selection model',async t=>{
 const tasks=Array.from({length:40},(_,i)=>({id:i+1,title:'Task '+(i+1),status:'ثبت شده',priority:'متوسط',archived:false,owner_id:null}));
 const f=await fixture({tables:{tasks}});t.after(()=>f.dispose());const {d,w}=f;await f.open('kanban');
 d.querySelector('#kanbanBody [data-task-id="2"]').click();assert.deepEqual(Array.from(w.bamcoSelection.ids('#kanbanBody')),['2']);
 d.querySelector('#kanbanExportBtn').click();await until(()=>f.downloads.length===1);
 const bytes=await f.downloads[0].blob.arrayBuffer(),book=w.XLSX.read(new Uint8Array(bytes),{type:'array'}),rows=w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});assert.equal(rows.length,2);assert(rows.flat().includes('Task 2'));
 w.bamcoSelection.clear('#kanbanBody');assert.equal(w.bamcoTaskSelection.ids('kanban').length,0);
 d.querySelector('#kanbanSearch').value='Task 1';d.querySelector('#kanbanSearch').dispatchEvent(new w.Event('input',{bubbles:true}));
 w.BamcoMessageRender.openTaskInKanban(35);await until(()=>w.bamcoTaskSelection.ids('kanban').map(String).includes('35'));
 await new Promise(r=>setTimeout(r,100));const row=d.querySelector('#kanbanBody [data-task-id="35"]');assert.equal(row.getAttribute('aria-selected'),'true');assert(!row.classList.contains('table-page-hidden'));assert.equal(d.querySelector('#kanbanEditBtn').disabled,false);assert.deepEqual(f.errors,[]);
});

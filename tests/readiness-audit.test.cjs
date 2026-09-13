const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

test('vehicle creation ignores double submission and an unconfirmed update keeps the editor open',async t=>{
 let emptyUpdate=false;
 const f=await fixture({tables:{vehicle_temporary_records:[]},fetchResult:({endpoint,method})=>emptyUpdate&&endpoint==='vehicle_temporary_records'&&method==='PATCH'?[]:undefined});t.after(()=>f.dispose());
 const {d}=f;await f.open('vehicleTemporary');d.querySelector('#vehicleTemporaryView .vehicle-add').click();
 const form=d.querySelector('#vehicleRecordForm');form.elements.plate_number.value='QA-10';form.elements.notes.value='Preserve me';form.requestSubmit();form.requestSubmit();
 await until(()=>!d.querySelector('#vehicleRecordDialog').open);
 assert.equal(f.calls.filter(c=>c.endpoint==='vehicle_temporary_records'&&c.method==='POST').length,1,'double click created duplicate records');
 await until(()=>d.querySelector('#vehicleTemporaryView tbody tr[data-id]'));
 d.querySelector('#vehicleTemporaryView tbody tr[data-id]').click();d.querySelector('#vehicleTemporaryView .vehicle-edit').click();
 emptyUpdate=true;form.elements.notes.value='Keep this unsaved edit';form.requestSubmit();await until(()=>!form.querySelector('[type=submit]').disabled);await pause(50);
 assert(d.querySelector('#vehicleRecordDialog').open,'empty update was reported as success');assert.equal(form.elements.notes.value,'Keep this unsaved edit');
 assert.deepEqual(f.errors,[]);
});

test('a background response report cannot cancel the visible performance report',async t=>{
 let block=false;const releases=[];
 const f=await fixture({tables:{tasks:[{id:1,title:'QA',owner_id:'test-owner',status:'در حال انجام',archived:false}]},fetchResult:({endpoint})=>{
  if(block&&endpoint==='change_requests')return new Promise(r=>releases.push(r));
 }});t.after(()=>f.dispose());
 await pause(1200);await f.open('performanceReport');await until(()=>f.d.querySelector('#performanceReportView tbody [data-workspace-index]'));
 block=true;const pending=f.w.bamcoCanonicalReports.renderPerformance(true);await until(()=>releases.length);
 await f.w.bamcoCanonicalReports.renderResponse(true);block=false;releases.forEach(r=>r([]));await pending;
 assert(f.d.querySelector('#performanceReportView tbody [data-workspace-index]'),'visible report was cancelled by an unrelated report');
 assert.deepEqual(f.errors,[]);
});

test('ten selected recipients retain separate previews; queue failure can retry without duplicate preparation',async t=>{
 const recipients=Array.from({length:10},(_,i)=>({recipient_id:'qa-'+i,recipient_name:'گیرنده '+i,email:'qa'+i+'@example.test',sticker_state:i%5+1,active_count:i}));
 const snapshots=recipients.map((p,i)=>({...p,id:i+1,batch_id:'qa-batch',recipient_email:p.email,subject:'موضوع '+i,body_template:'خطاب اختصاصی '+i,tasks:[]}));
 const f=await fixture({tables:{message_recipient_live_state:recipients,message_snapshots:snapshots},fetchResult:({endpoint})=>endpoint==='prepare_workflow_messages'?'qa-batch':endpoint==='send-message-queue'?{sent:10,failed:0,pending:0}:undefined});t.after(()=>f.dispose());
 const {d,w}=f;await f.open('messageCenter');for(const row of d.querySelectorAll('#messageCenterBody [data-id]'))row.click();
 d.querySelector('#messageChannel').value='both';d.querySelector('#sendSelectedMessages').click();d.querySelector('#sendSelectedMessages').click();await until(()=>d.querySelector('#messagePreviewDialog').open);
 const prepared=f.calls.filter(c=>c.endpoint==='prepare_workflow_messages');assert.equal(prepared.length,1);assert.equal(prepared[0].body.p_recipient_ids.length,10);assert(Object.values(prepared[0].body.p_channels).every(x=>x==='both'));
 const cards=[...d.querySelectorAll('.snapshot-preview')];assert.equal(cards.length,10);cards.forEach((card,i)=>{assert(card.textContent.includes('خطاب اختصاصی '+i));for(let j=0;j<10;j++)if(j!==i)assert(!card.textContent.includes('خطاب اختصاصی '+j))});
 f.failures.add('queue_message_batch');d.querySelector('#confirmSendMessage').click();await until(()=>!d.querySelector('#confirmSendMessage').disabled);assert(d.querySelector('#messagePreviewDialog').open);assert(!f.calls.some(c=>c.endpoint==='send-message-queue'));
 f.failures.delete('queue_message_batch');d.querySelector('#confirmSendMessage').click();await until(()=>!d.querySelector('#messagePreviewDialog').open);assert.equal(f.calls.filter(c=>c.endpoint==='send-message-queue').length,1);assert.equal(f.calls.filter(c=>c.endpoint==='prepare_workflow_messages').length,1);
 assert.deepEqual(f.errors,[]);
});

test('buttons use regular labels, semantic action colors and evenly wrapped mobile command rows',async t=>{
 const f=await fixture({styles:true});t.after(()=>f.dispose());const {d,w}=f;await f.open('dashboard');
 const regular=d.querySelector('#clearPerf'),add=d.querySelector('#addTaskBtn'),remove=d.querySelector('#kanbanDeleteBtn'),tab=d.querySelector('#nav [data-view="dashboard"]');
 for(const button of [regular,add,remove,tab])assert.equal(w.getComputedStyle(button).fontWeight,'400');
 const root=path.join(__dirname,'..'),mobile=fs.readFileSync(path.join(root,'assets/css/mobile-compat-20260911.css'),'utf8'),ui=fs.readFileSync(path.join(root,'assets/css/unified-ui.css'),'utf8');
 assert.match(mobile,/justify-content:stretch!important;overflow-x:hidden!important/);
 assert.match(mobile,/flex:1 1 116px!important/);
 assert.match(mobile,/dashboard-chart-card canvas\{display:block!important;width:var\(--chart-width,640px\)!important;max-width:none!important/);
 assert.match(mobile,/dashboard-filter-actions,.performance-range-actions\).*background:transparent!important.*box-shadow:none!important/s);
 assert.match(ui,/#workloadChart\).*#performanceChart/s);assert.match(ui,/button\.danger.*background:#bd3535!important/s);assert.match(ui,/button\.primary.*background:#176b4d!important/s);
});

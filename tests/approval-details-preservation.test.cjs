const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
const proposed={title:'درخواست آزمایشی',description:'شرح کامل درخواست',manager_notes:'نظر ثبت‌کننده',status:'انجام‌شده',priority:'متوسط',owner_id:'test-owner',start_date:'2026-10-01',due_date:'2026-10-05',done_date:'2026-10-04',reminder_days:0};
const request={id:990,request_type:'create',request_status:'in_review',requested_by:'test-owner',proposed_data:proposed,created_at:'2026-10-06T01:00:00Z'};
test('reviewer edits an aliased status without losing fields or changing the requester',async t=>{
 const f=await fixture({tables:{change_requests:[request],request_routing_status:[{request_id:990,actionable:true}]}});t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>f.d.querySelector('[data-review-request="990"]'));
 f.d.querySelector('[data-review-request="990"]').click();
 assert.match(f.d.querySelector('#reviewDetails').textContent,/شرح کامل درخواست/);
 assert.match(f.d.querySelector('#reviewDetails').textContent,/نظر ثبت‌کننده/);
 f.d.querySelector('#editRequestBtn').click();
 await until(()=>f.d.querySelector('#taskDialog').open);
 const form=f.d.querySelector('#taskForm');
 assert.equal(form.elements.status.value,'انجام شده');
 assert.equal(form.elements.owner_id.value,'test-owner');
 assert.equal(form.elements.owner_id.disabled,true);
 assert.equal(form.elements.description.value,proposed.description);
 form.elements.title.value='عنوان اصلاح‌شده';form.requestSubmit();
 await until(()=>f.calls.some(c=>c.endpoint==='review_request_stage'));
 const payload=f.calls.find(c=>c.endpoint==='review_request_stage').body.p_final_data;
 assert.equal(payload.owner_id,'test-owner');assert.equal(payload.description,proposed.description);assert.equal(payload.manager_notes,proposed.manager_notes);assert.equal(payload.done_date,proposed.done_date);
});
test('review details preserve explicit null dates instead of displaying stale task dates',async t=>{
 const r={...request,request_type:'update',task_id:991,proposed_data:{...proposed,due_date:null}};
 const f=await fixture({tables:{tasks:[{id:991,...proposed,due_date:'2026-10-10'}],change_requests:[r],request_routing_status:[{request_id:990,actionable:true}]}});t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>f.d.querySelector('[data-review-request="990"]'));f.d.querySelector('[data-review-request="990"]').click();
 assert.match(f.d.querySelector('#reviewDetails').textContent,/تاریخ پایان:\s*—/);
});

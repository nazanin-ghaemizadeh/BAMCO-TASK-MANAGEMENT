const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

const request=(id,status,requested_by='test-owner',created_at=`2026-09-16T14:0${id % 10}:00Z`)=>({
 id,requested_by,requester_name_snapshot:requested_by==='test-owner'?'متولی آزمایشی':'کاربر دیگر',request_type:'update',request_status:status,
 task_id:id,proposed_data:{title:`درخواست ${id}`},created_at,reviewed_at:status==='approved'?'2026-09-17T08:00:00Z':null
});

test('manager sees every current request but only the assigned approver receives an action',async t=>{
 const current=[request(36,'in_review'),request(38,'in_review'),request(37,'in_review')];
 const approved=request(35,'approved');
 const routes=current.map(r=>({request_id:r.id,stage_no:1,stage_title:'بررسی سرپرست',approver_names:'سرپرست آزمایشی',actionable:false}));
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?{current_requests:current,history_requests:[current[0],approved],routes}:undefined}),{d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelectorAll('#approvalBody tr[data-request-id]').length===3);
 const rows=[...d.querySelectorAll('#approvalBody tr[data-request-id]')];
 assert.deepEqual(rows.map(row=>row.dataset.requestId),['38','37','36']);assert.deepEqual(rows.map(row=>row.cells[0].textContent),['۳','۲','۱']);
 assert(rows.every(row=>row.cells[5].textContent.includes('بررسی سرپرست')));assert.equal(d.querySelectorAll('#approvalBody [data-review-request]').length,0);
 await f.open('requestHistory');await until(()=>d.querySelectorAll('#requestHistoryBody tr[data-request-id]').length===1);
 assert.equal(d.querySelector('#requestHistoryBody tr').dataset.requestId,'35');assert.equal(d.querySelector('#requestHistoryBody tr').cells[5].textContent,'تأیید');
});

test('an approved request moves atomically from current requests to terminal history',async t=>{
 let approved=false;const open=request(41,'in_review'),done={...request(41,'approved'),reviewed_at:'2026-09-17T09:00:00Z'};
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?(approved?{current_requests:[],history_requests:[done],routes:[]}:{current_requests:[open],history_requests:[],routes:[{request_id:41,stage_no:1,stage_title:'بررسی سرپرست',approver_names:'مدیر آزمایشی',actionable:true}]}):undefined}),{w,d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelector('#approvalBody tr[data-request-id="41"]'));
 approved=true;await w.bamcoRequestSync.refresh();await until(()=>!d.querySelector('#approvalBody tr[data-request-id]'));
 await f.open('requestHistory');await until(()=>d.querySelector('#requestHistoryBody tr[data-request-id="41"]'));
 assert.equal(d.querySelector('#requestHistoryBody tr').cells[5].textContent,'تأیید');
});

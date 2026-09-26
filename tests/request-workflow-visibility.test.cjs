const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {fixture,until}=require('./helpers/app-fixture.cjs');

const request=(id,status,requested_by='test-owner',created_at=`2026-09-16T14:0${id % 10}:00Z`)=>({
 id,requested_by,requester_name_snapshot:requested_by==='test-owner'?'متولی آزمایشی':'کاربر دیگر',request_type:'update',request_status:status,
 task_id:id,proposed_data:{title:`درخواست ${id}`},created_at,reviewed_at:status==='approved'?'2026-09-17T08:00:00Z':null
});

test('approval workbench lists every active request and limits review to the server-assigned approver',async t=>{
 const current=[request(36,'in_review'),request(38,'in_review'),request(37,'in_review')];
 const approved=request(35,'approved');
 const routes=current.map(r=>({request_id:r.id,stage_no:1,stage_title:'بررسی سرپرست',approver_names:'سرپرست آزمایشی',actionable:r.id===38}));
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?{current_requests:current,history_requests:[current[0],approved],routes}:undefined}),{d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelectorAll('#approvalBody tr[data-request-id]').length===3);
 const rows=[...d.querySelectorAll('#approvalBody tr[data-request-id]')];
 assert.deepEqual(rows.map(row=>row.dataset.requestId),['38','37','36']);assert.deepEqual(rows.map(row=>row.cells[0].textContent),['۳۸','۳۷','۳۶']);
 assert(rows.every(row=>row.cells[5].textContent.includes('در انتظار تأیید سرپرست آزمایشی')));assert.equal(d.querySelectorAll('#approvalBody [data-review-request]').length,1);
 assert(d.querySelector('#approvalBody [data-request-id="36"]'));assert(d.querySelector('#approvalBody [data-request-id="37"]'));
 await f.open('requestHistory');await until(()=>d.querySelectorAll('#requestHistoryBody tr[data-request-id]').length===1);
 assert.equal(d.querySelector('#requestHistoryBody tr').dataset.requestId,'35');assert.equal(d.querySelector('#requestHistoryBody tr').cells[5].textContent,'تأیید');
});

test('an approved request moves atomically from current requests to terminal history',async t=>{
 let approved=false;const open=request(41,'in_review'),done={...request(41,'approved'),reviewed_at:'2026-09-17T09:00:00Z'};
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?(approved?{current_requests:[],history_requests:[done],routes:[]}:{current_requests:[open],history_requests:[],routes:[{request_id:41,stage_no:1,stage_title:'بررسی سرپرست',approver_names:'مدیر آزمایشی',actionable:true}]}):undefined}),{w,d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelector('#approvalBody tr[data-request-id="41"]'));
 approved=true;await w.bamcoApprovalCenter.refresh();await until(()=>!d.querySelector('#approvalBody tr[data-request-id]'));
 await f.open('requestHistory');await until(()=>d.querySelector('#requestHistoryBody tr[data-request-id="41"]'));
 assert.equal(d.querySelector('#requestHistoryBody tr').cells[5].textContent,'تأیید');
});

test('needs-revision is a red requester action and locked owner survives resubmission',async t=>{
 const task={id:77,legacy_id:1428,title:'فعالیت نیازمند اصلاح',description:'شرح',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-21',due_date:'2026-09-30',done_date:null,reminder_days:1,manager_notes:'',archived:false};
 const revision={...request(77,'needs_revision'),task_id:77,manager_note:'تاریخ پایان را اصلاح کنید.',proposed_data:{title:task.title,description:task.description,status:task.status,priority:task.priority,start_date:task.start_date,due_date:task.due_date,done_date:null,reminder_days:1,manager_notes:''}};
 const route={request_id:77,stage_no:1,stage_title:'بررسی مدیر',approver_names:'مدیر آزمایشی',actionable:false};
 const f=await fixture({role:'owner',tables:{tasks:[task]},fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?{current_requests:[revision],history_requests:[],routes:[route]}:undefined}),{d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelector('#approvalBody tr[data-request-id="77"]'));
 const row=d.querySelector('#approvalBody tr[data-request-id="77"]');
 assert.equal(d.querySelector('#approvalBadge').textContent,'۱');
 assert.equal(d.querySelector('#approvalBadge').classList.contains('hidden'),false);
 assert.match(row.cells[5].textContent,/در انتظار اصلاح متولی آزمایشی/);
 assert.doesNotMatch(row.cells[5].textContent,/در انتظار تأیید/);
 assert.ok(row.cells[5].querySelector('.request-revision-state>i'));
 row.querySelector('[data-revise-request]').click();
 await until(()=>d.querySelector('#taskDialog').open);
 const form=d.querySelector('#taskForm'),owner=form.elements.owner_id;
 assert.equal(owner.disabled,true);
 assert.equal(owner.value,'test-owner');
 form.requestSubmit();
 await until(()=>f.calls.some(call=>call.endpoint==='resubmit_change_request'));
 const submitted=f.calls.find(call=>call.endpoint==='resubmit_change_request');
 assert.equal(submitted.body.p_proposed_data.owner_id,'test-owner');
 assert.equal(f.calls.some(call=>call.endpoint==='ui-notice'&&/متولی برای این وضعیت الزامی است/.test(call.body)),false);
 assert.deepEqual(f.errors,[]);
});

test('project activity request type is distinct in approval, history, review and report',async t=>{
 const project={...request(81,'in_review','test-owner'),request_type:'create',proposed_data:{title:'فعالیت پروژه',owner_id:'test-owner',request_context:'project_activity'}};
 const normal={...request(82,'in_review','test-owner'),request_type:'create',proposed_data:{title:'وظیفه عادی',owner_id:'test-owner'}};
 const projectHistory={...project,id:83,request_status:'approved',reviewed_at:'2026-09-25T08:00:00Z'};
 const normalHistory={...normal,id:84,request_status:'approved',reviewed_at:'2026-09-25T08:01:00Z'};
 const routes=[
  {request_id:81,stage_no:1,stage_title:'بررسی مدیر',approver_names:'مدیر آزمایشی',actionable:true},
  {request_id:82,stage_no:1,stage_title:'بررسی مدیر',approver_names:'مدیر آزمایشی',actionable:false}
 ];
 const f=await fixture({tables:{change_requests:[project,normal,projectHistory,normalHistory],request_routing_status:routes}}),{w,d}=f;t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>d.querySelector('#approvalBody tr[data-request-id="81"]'));
 assert.equal(d.querySelector('#approvalBody tr[data-request-id="81"]').cells[2].textContent,'تعریف فعالیت در پروژه');
 assert.equal(d.querySelector('#approvalBody tr[data-request-id="82"]').cells[2].textContent,'تعریف فعالیت جدید');
 d.querySelector('#approvalBody tr[data-request-id="81"] [data-review-request]').click();
 await until(()=>d.querySelector('#reviewDialog').open);
 assert.match(d.querySelector('#reviewDetails').textContent,/نوع درخواست:\s*تعریف فعالیت در پروژه/);
 d.querySelector('#reviewDialog').close();
 await f.open('requestHistory');await until(()=>d.querySelector('#requestHistoryBody tr[data-request-id="83"]'));
 assert.equal(d.querySelector('#requestHistoryBody tr[data-request-id="83"]').cells[2].textContent,'تعریف فعالیت در پروژه');
 assert.equal(d.querySelector('#requestHistoryBody tr[data-request-id="84"]').cells[2].textContent,'تعریف فعالیت جدید');
 assert.equal(w.bamcoRequestTypeLabel(project),'تعریف فعالیت در پروژه');
 assert.equal(w.bamcoRequestTypeLabel(normal),'تعریف فعالیت جدید');

 const reportDom=new JSDOM('<section id="requestReportView"></section>',{runScripts:'outside-only',url:'https://bamco.test/'}),rw=reportDom.window;
 rw.state={token:'test-token',user:{id:'test-manager'},profile:{id:'test-manager'},profiles:f.profiles,tasks:[],requests:[],requestHistory:[],definitionRequests:[],view:'requestReport'};
 rw.BamcoAccess={can:()=>true,isReady:()=>true,refresh:async()=>{}};
 rw.BamcoProfiles={label:id=>f.profiles.find(p=>p.id===id)?.full_name||''};
 rw.bamcoAuth={snapshot:()=>null,isCurrent:()=>true};
 rw.bamcoRequestTypeLabel=w.bamcoRequestTypeLabel;
 rw.bamcoLoadRequestWorkflow=async()=>({requests:[project,normal],history:[],routes});
 rw.bamcoLoadTaskOptions=async()=>{};
 rw.console.warn=()=>{};
 rw.eval(fs.readFileSync('assets/js/tab-workspace.js','utf8'));
 rw.document.dispatchEvent(new rw.Event('DOMContentLoaded'));
 await until(()=>rw.bamcoTabs?.render);
 await rw.bamcoTabs.render('requestReport');
 const reportRows=[...rw.document.querySelectorAll('#requestReportView tbody tr')];
 assert.deepEqual(reportRows.map(row=>row.cells[2].textContent),['تعریف فعالیت در پروژه','تعریف فعالیت جدید']);
 reportDom.window.close();

 const revision={...project,id:85,task_id:null,request_status:'needs_revision',proposed_data:{...project.proposed_data,description:'شرح فعالیت پروژه',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-25',due_date:'2026-09-30',done_date:null,reminder_days:1,manager_notes:'',project_id:700,parent_item_id:701,item_type:'activity'}};
 const revisionFixture=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?{current_requests:[revision],history_requests:[],routes:[]}:undefined}),revisionDocument=revisionFixture.d;
 t.after(()=>revisionFixture.dispose());
 await revisionFixture.open('approvals');await until(()=>revisionDocument.querySelector('#approvalBody tr[data-request-id="85"]'));
 revisionDocument.querySelector('[data-revise-request="85"]').click();
 await until(()=>revisionDocument.querySelector('#taskDialog').open);
 revisionDocument.querySelector('#taskForm [name="title"]').value='فعالیت پروژه اصلاح‌شده';
 revisionDocument.querySelector('#taskForm').requestSubmit();
 await until(()=>revisionFixture.calls.some(call=>call.endpoint==='resubmit_change_request'));
 const resubmit=revisionFixture.calls.find(call=>call.endpoint==='resubmit_change_request').body.p_proposed_data;
 assert.equal(resubmit.request_context,'project_activity');
 assert.equal(resubmit.project_id,700);
 assert.equal(resubmit.parent_item_id,701);
 assert.equal(resubmit.item_type,'activity');
 assert.equal(resubmit.owner_id,'test-owner');
 assert.equal(resubmit.title,'فعالیت پروژه اصلاح‌شده');
 assert.deepEqual(f.errors,[]);
 assert.deepEqual(revisionFixture.errors,[]);
});

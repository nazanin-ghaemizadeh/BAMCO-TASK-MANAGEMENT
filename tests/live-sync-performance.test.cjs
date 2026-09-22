const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('task views refresh after a targeted domain invalidation without polling',async t=>{
 const tasks=[{id:1,legacy_id:1,title:'عنوان نخست',owner_id:'test-manager',archived:false,status:'در حال انجام',priority:'متوسط',row_version:1,last_updated_at:'2026-09-13T00:00:00Z'}];
 const f=await fixture({tables:{tasks}});t.after(()=>f.dispose());
 await f.open('kanban');await until(()=>f.w.eval('state.tasks.length')===1);
 const baseline=f.calls.filter(c=>c.endpoint==='task_status_view').length;
 tasks[0]={...tasks[0],title:'عنوان تازه',row_version:2,last_updated_at:'2026-09-13T00:01:00Z'};
 f.d.dispatchEvent(new f.w.CustomEvent('bamco:domain-invalidated',{detail:{domain:'tasks'}}));
 await until(()=>f.calls.filter(c=>c.endpoint==='task_status_view').length>baseline);
 assert.equal(f.calls.filter(c=>c.endpoint==='task_status_view').length,baseline+1);
 assert.match(f.d.querySelector('#kanbanBody').textContent,/عنوان تازه/);
 assert.equal(f.w.bamcoLiveSync.interval,null);
 assert.equal(f.calls.some(c=>c.endpoint==='task_dataset_version'),false);
 assert.deepEqual(f.errors,[]);
});

test('performance reports reload the canonical workflow snapshot after workflow invalidation',async t=>{
 const tasks=[{id:1,legacy_id:1,title:'عنوان نخست',owner_id:'test-owner',archived:false,status:'در حال انجام',priority:'متوسط',row_version:1,last_updated_at:'2026-09-13T00:00:00Z'}];
 const requests=[{id:11,requested_by:'test-owner',request_type:'create',request_status:'pending',proposed_data:{title:'درخواست نخست'},created_at:'2026-09-13T00:00:00Z'}];
 const f=await fixture({tables:{tasks,change_requests:requests}});t.after(()=>f.dispose());
 await f.open('performanceReport');
 await until(()=>f.calls.some(c=>c.endpoint==='request_workflow_snapshot'));
 const baseline=f.calls.filter(c=>c.endpoint==='request_workflow_snapshot').length;
 requests.push({id:12,requested_by:'test-owner',request_type:'create',request_status:'pending',proposed_data:{title:'درخواست دوم'},created_at:'2026-09-13T00:00:00Z'});
 f.d.dispatchEvent(new f.w.CustomEvent('bamco:domain-invalidated',{detail:{domain:'workflow'}}));
 await until(()=>f.calls.filter(c=>c.endpoint==='request_workflow_snapshot').length>baseline&&/۲/.test(f.d.querySelector('#performanceReportView').textContent));
 assert.equal(f.calls.some(c=>c.endpoint==='change_requests'),false,'reports must not read change_requests directly');
 assert.equal(f.calls.some(c=>c.endpoint==='sent_message_dataset_version'),false);
 assert.equal(f.w.bamcoLiveSync.interval,null);
 assert.deepEqual(f.errors,[]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const metrics=require('../assets/js/dashboard-metrics.js');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('project activity requests and direct subordinate tasks form one canonical definition count',()=>{
 const baseline='2026-09-01';
 const requests=[
  {id:1,requested_by:'manager',request_type:'create',request_status:'pending',created_at:'2026-09-10T08:00:00Z',proposed_data:{request_context:'project_activity',owner_id:'manager'}},
  {id:2,requested_by:'manager',request_type:'create',request_status:'pending',created_at:'2026-09-11T08:00:00Z',proposed_data:{request_context:'project_activity',owner_id:'owner'}},
  {id:3,requested_by:'manager',request_type:'create',request_status:'approved',created_at:'2026-09-12T08:00:00Z',applied_task_id:30,task_id:30,proposed_data:{request_context:'project_activity',owner_id:'manager'}},
  {id:4,requested_by:'manager',request_type:'update',request_status:'pending',created_at:'2026-09-13T08:00:00Z',task_id:31,proposed_data:{request_context:'project_activity',owner_id:'owner'}}
 ];
 const tasks=[
  {id:30,created_by:'manager',owner_id:'manager',created_at:'2026-09-12T09:00:00Z',source:'project'},
  {id:31,created_by:'manager',owner_id:'owner',created_at:'2026-09-13T09:00:00Z',source:'project'},
  {id:32,created_by:'manager',owner_id:'owner',created_at:'2026-09-14T09:00:00Z',source:'web'},
  {id:33,created_by:'manager',owner_id:'owner',created_at:'2026-09-14T09:00:00Z',source:'excel'}
 ];
 const events=metrics.definitionEvents({tasks,requests,baseline,from:'2026-09-01',to:'2026-09-30',taskSources:['web','project']});
 assert.equal(events.length,5,'pending requests count, an applied task is deduplicated and imported tasks are excluded');
 assert.equal(events.filter(event=>event.requestContext==='project_activity').length,4);
 assert.deepEqual(metrics.definitionBreakdown({actorId:'manager',tasks,requests,baseline,from:'2026-09-01',to:'2026-09-30',taskSources:['web','project']}),{self:2,others:3,total:5});
 assert.equal(metrics.definitionCountForSelection({ownerId:null,tasks,requests,baseline,from:'2026-09-01',to:'2026-09-30',taskSources:['web','project']}),5);
});

test('dashboard and performance report include pending project requests and direct assignments without double counting',async t=>{
 const now=new Date(),month=new Intl.DateTimeFormat('fa-IR-u-nu-latn',{year:'numeric',month:'numeric',timeZone:'Asia/Tehran'}).formatToParts(now),y=Number(month.find(part=>part.type==='year').value),m=Number(month.find(part=>part.type==='month').value);
 const f=await fixture({tables:{tasks:[],change_requests:[],app_settings:[]}}),{w,d}=f;t.after(()=>f.dispose());
 const from=w.jalaliToISO(y,m,1),createdAt=from+'T09:00:00Z';
 f.tables.app_settings.push({key:'performance_monitoring_started_at',value:{value:from+'T00:00:00Z'}});
 f.tables.change_requests.push(
  {id:101,requested_by:'test-manager',request_type:'create',request_status:'pending',created_at:createdAt,proposed_data:{request_context:'project_activity',owner_id:'test-manager'}},
  {id:102,requested_by:'test-manager',request_type:'create',request_status:'pending',created_at:createdAt,proposed_data:{request_context:'project_activity',owner_id:'test-owner'}},
  {id:103,requested_by:'test-manager',request_type:'create',request_status:'approved',created_at:createdAt,applied_task_id:30,task_id:30,proposed_data:{request_context:'project_activity',owner_id:'test-manager'}}
 );
 f.tables.tasks.push(
  {id:30,title:'فعالیت تأییدشده',owner_id:'test-manager',created_by:'test-manager',created_at:createdAt,source:'project',status:'در حال انجام',priority:'متوسط',archived:false,due_date:from},
  {id:31,title:'فعالیت مستقیم زیردست',owner_id:'test-owner',created_by:'test-manager',created_at:createdAt,source:'project',status:'در حال انجام',priority:'متوسط',archived:false,due_date:from}
 );
 await w.eval('refresh()');await f.open('dashboard');await until(()=>d.querySelector('#dashboardCards article[data-key="create_requests"] strong')?.textContent.trim()==='۴');
 assert.equal(d.querySelector('#dashboardCards article[data-key="create_requests"] strong').textContent.trim(),'۴');
 await f.open('performanceReport');await until(()=>[...d.querySelectorAll('#performanceReportView tbody tr[data-workspace-index]')].some(row=>row.cells[0].textContent.includes('مدیر')));
 const row=[...d.querySelectorAll('#performanceReportView tbody tr[data-workspace-index]')].find(item=>item.cells[0].textContent.includes('مدیر'));
 assert.equal(row.querySelector('[data-definition-metric="for-self"]').textContent.trim(),'۲');
 assert.equal(row.querySelector('[data-definition-metric="for-others"]').textContent.trim(),'۲');
 assert.equal(f.calls.some(call=>call.endpoint==='change_requests'),false,'the canonical workflow snapshot remains the only request source');
 assert.deepEqual(f.errors,[]);
});

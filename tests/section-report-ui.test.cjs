const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('timeline-only reader gets foreign report rows and readonly details without widening personal tasks',async t=>{
 const f=await fixture({role:'owner',tables:{tasks:[
  {id:1,title:'Personal task',owner_id:'test-owner',created_by:'test-owner',status:'ثبت شده',priority:'متوسط',archived:false},
  {id:2,title:'Foreign report task',description:'Readonly detail text',owner_id:'test-manager',created_by:'test-manager',status:'ثبت شده',priority:'متوسط',archived:false}
 ]},fetchResult:async({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'taskTimeline',can_view:true},{feature_key:'settings',can_view:true}]}:undefined});
 t.after(()=>f.dispose());await f.open('taskTimeline');await until(()=>f.d.querySelector('#ttUnscheduledList')?.textContent.includes('Foreign report task'));
 assert.equal(f.w.Bamco.state.tasks.some(x=>x.id===2),false);const before=JSON.stringify(f.w.Bamco.state.tasks);
 f.d.querySelector('#ttUnscheduledList [data-task="2"]').click();assert.equal(f.d.querySelector('#timelineReadonlyDetail').open,true);assert.match(f.d.querySelector('#timelineReadonlyDetail').textContent,/Readonly detail text/);assert.equal(f.w.Bamco.state.view,'taskTimeline');assert.equal(f.d.querySelector('#timelineReadonlyDetail input,#timelineReadonlyDetail textarea,#timelineReadonlyDetail select'),null);
 assert.equal(JSON.stringify(f.w.Bamco.state.tasks),before);assert(!f.calls.some(c=>c.endpoint==='save_project_activity'||c.method==='PATCH'&&c.endpoint==='tasks'));
});

test('performance-only reader uses independent feed without approvals snapshot or personal cache mutation',async t=>{
 const now=new Date().toISOString(),f=await fixture({role:'owner',tables:{tasks:[{id:3,title:'Foreign performance task',owner_id:'test-manager',created_by:'test-manager',status:'در حال انجام',priority:'متوسط',due_date:now.slice(0,10),created_at:now,source:'web',archived:false}],change_requests:[]},fetchResult:async({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'performanceReport',can_view:true},{feature_key:'settings',can_view:true}]}:undefined});
 t.after(()=>f.dispose());const state=f.w.Bamco.state,before=JSON.stringify({tasks:state.tasks,requests:state.requests,history:state.requestHistory}),offset=f.calls.length;
 await f.open('performanceReport');await until(()=>f.d.querySelector('#performanceReportView tbody')?.textContent.includes('مدیر آزمایشی'));
 assert(f.calls.slice(offset).some(c=>c.endpoint==='performance_report_feed'));assert(!f.calls.slice(offset).some(c=>c.endpoint==='request_workflow_snapshot'));assert.equal(JSON.stringify({tasks:state.tasks,requests:state.requests,history:state.requestHistory}),before);assert.equal(f.w.BamcoAccess.can('kanban','view'),false);assert.equal(f.w.BamcoAccess.can('approvals','view'),false);
});

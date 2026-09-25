/* Shared dashboard/performance-report metrics.  Keep the business rules in one place. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.bamcoDashboardMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const DEFAULT_MONITORING_START='2026-09-06T00:00:00Z';
  const asId=value=>String(value??'');
  const day=value=>String(value||'').slice(0,10);
  function within(value,from,to){
    const d=day(value),start=day(from),end=day(to);
    return !!d&&(!start||d>=start)&&(!end||d<=end);
  }
  function afterBaseline(value,baseline=DEFAULT_MONITORING_START){
    const stamp=String(value||''),start=String(baseline||DEFAULT_MONITORING_START);
    if(!stamp)return false;
    const actual=Date.parse(stamp),begin=Date.parse(start);
    return Number.isFinite(actual)&&Number.isFinite(begin)?actual>=begin:stamp>=start;
  }
  function matchesOwner(value,ownerId){return ownerId===null||ownerId===undefined||ownerId===''||asId(value)===asId(ownerId)}
  function uniqueRequests(requests=[]){
    const seen=new Set();
    return [...(requests||[])].filter(row=>{
      const key=row?.id==null?JSON.stringify([row?.requested_by,row?.request_type,row?.created_at,row?.request_status]):asId(row.id);
      if(seen.has(key))return false;seen.add(key);return true;
    });
  }
  function payload(value){
    if(value&&typeof value==='object'&&!Array.isArray(value))return value;
    try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}
  }
  function definitionRequest(request){return String(request?.request_type||'').toLowerCase()==='create'}
  function requestOwner(request){
    const proposed=payload(request?.proposed_data),finalData=payload(request?.final_data);
    return proposed.owner_id||finalData.owner_id||request?.requested_by||null;
  }
  function sourceAllowed(task,taskSources){
    if(!Array.isArray(taskSources)||!taskSources.length)return true;
    const allowed=new Set(taskSources.map(value=>String(value||'').toLowerCase()));
    return allowed.has(String(task?.source||'').toLowerCase());
  }
  function definitionEvents({tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to,taskSources=null}={}){
    const creates=uniqueRequests(requests).filter(definitionRequest);
    const linkedTaskIds=new Set();
    creates.forEach(request=>{
      for(const value of [request?.applied_task_id,request?.task_id])if(value!==null&&value!==undefined&&value!=='')linkedTaskIds.add(asId(value));
    });
    const requestEvents=creates.map(request=>({
      key:`request:${request?.id??JSON.stringify([request?.requested_by,request?.created_at,request?.proposed_data])}`,
      kind:'request',requestId:request?.id??null,taskId:request?.applied_task_id||request?.task_id||null,
      actorId:request?.requested_by||null,ownerId:requestOwner(request),createdAt:request?.created_at||null,
      requestContext:payload(request?.proposed_data).request_context||null,status:request?.request_status||null
    }));
    const taskEvents=(tasks||[]).filter(task=>task?.id!=null&&!linkedTaskIds.has(asId(task.id))&&sourceAllowed(task,taskSources)).map(task=>({
      key:`task:${task.id}`,kind:'task',requestId:null,taskId:task.id,actorId:task.created_by||null,
      ownerId:task.owner_id||task.created_by||null,createdAt:task.created_at||null,requestContext:String(task.source||'').toLowerCase()==='project'?'project_activity':null,status:null
    }));
    return [...requestEvents,...taskEvents].filter(event=>event.actorId&&afterBaseline(event.createdAt,baseline)&&within(event.createdAt,from,to));
  }
  function definitionBreakdown({actorId,tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to,taskSources=null}={}){
    if(actorId===null||actorId===undefined||actorId==='')return{self:0,others:0,total:0};
    const events=definitionEvents({tasks,requests,baseline,from,to,taskSources}).filter(event=>asId(event.actorId)===asId(actorId));
    const self=events.filter(event=>asId(event.ownerId||event.actorId)===asId(event.actorId)).length;
    return{self,others:events.length-self,total:events.length};
  }
  function definitionCount({ownerId,tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to,taskSources=null}={}){
    return definitionBreakdown({actorId:ownerId,tasks,requests,baseline,from,to,taskSources}).total;
  }
  function definitionCountForSelection({ownerId=null,tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to,taskSources=null}={}){
    if(ownerId!==null&&ownerId!==undefined&&ownerId!==''){
      return definitionCount({ownerId,tasks,requests,baseline,from,to,taskSources});
    }
    return definitionEvents({tasks,requests,baseline,from,to,taskSources}).length;
  }
  function pendingReviewCount({ownerId=null,requests=[]}={}){
    return uniqueRequests(requests).filter(request=>['pending','in_review','needs_revision'].includes(request.request_status)&&matchesOwner(request.requested_by,ownerId)).length;
  }
  function unscheduledCount({ownerId=null,tasks=[],isTerminal=()=>false}={}){
    return (tasks||[]).filter(task=>!task.archived&&!isTerminal(task)&&matchesOwner(task.owner_id,ownerId)&&!task.start_date&&!task.due_date).length;
  }
  return {DEFAULT_MONITORING_START,within,afterBaseline,uniqueRequests,definitionRequest,requestOwner,definitionEvents,definitionBreakdown,definitionCount,definitionCountForSelection,pendingReviewCount,unscheduledCount};
});

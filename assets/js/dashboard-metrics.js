/* Shared dashboard/performance-report metrics.  Keep the business rules in one place. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.bamcoDashboardMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  const DEFAULT_MONITORING_START='2026-09-14T00:00:00Z';
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
  function definitionCount({ownerId,role,tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to}={}){
    if(ownerId===null||ownerId===undefined||ownerId==='')return 0;
    if(role==='manager')return (tasks||[]).filter(task=>asId(task.created_by)===asId(ownerId)&&afterBaseline(task.created_at,baseline)&&within(task.created_at,from,to)).length;
    return uniqueRequests(requests).filter(request=>request.request_type==='create'&&asId(request.requested_by)===asId(ownerId)&&afterBaseline(request.created_at,baseline)&&within(request.created_at,from,to)).length;
  }
  function definitionCountForSelection({ownerId=null,profiles=[],tasks=[],requests=[],baseline=DEFAULT_MONITORING_START,from,to}={}){
    if(ownerId!==null&&ownerId!==undefined&&ownerId!==''){
      const profile=(profiles||[]).find(item=>asId(item.id)===asId(ownerId));
      return definitionCount({ownerId,role:profile?.role,tasks,requests,baseline,from,to});
    }
    const ids=new Set([...(tasks||[]).map(task=>task.created_by),...(tasks||[]).map(task=>task.owner_id),...uniqueRequests(requests).map(request=>request.requested_by)].filter(Boolean).map(asId));
    return [...ids].reduce((sum,id)=>sum+definitionCountForSelection({ownerId:id,profiles,tasks,requests,baseline,from,to}),0);
  }
  function pendingReviewCount({ownerId=null,requests=[]}={}){
    return uniqueRequests(requests).filter(request=>['pending','in_review'].includes(request.request_status)&&matchesOwner(request.requested_by,ownerId)).length;
  }
  function unscheduledCount({ownerId=null,tasks=[],isTerminal=()=>false}={}){
    return (tasks||[]).filter(task=>!task.archived&&!isTerminal(task)&&matchesOwner(task.owner_id,ownerId)&&!task.start_date&&!task.due_date).length;
  }
  return {DEFAULT_MONITORING_START,within,afterBaseline,uniqueRequests,definitionCount,definitionCountForSelection,pendingReviewCount,unscheduledCount};
});


/* Keep each open portal's approval queue in step with the server's stage. */
(()=>{'use strict';
 let pending=null,lastSnapshot='';
 const style=document.createElement('style');style.id='bamco-requested-kanban-polish';style.textContent=`
 #kanbanView .column-filters select,#archiveView .column-filters select,#kanbanView .column-filters option,#archiveView .column-filters option{direction:rtl!important;text-align:right!important;text-align-last:right!important;font-family:"B Nazanin",Tahoma,serif!important}
 #kanbanView tbody td:nth-child(2),#kanbanView tbody td:nth-child(3),#archiveView tbody td:nth-child(2),#archiveView tbody td:nth-child(3){text-align:justify!important;text-justify:inter-word!important;white-space:normal!important;line-height:1.75!important}
 #kanbanView tbody td.en-text:nth-child(2),#kanbanView tbody td.en-text:nth-child(3),#archiveView tbody td.en-text:nth-child(2),#archiveView tbody td.en-text:nth-child(3){font-family:"Times New Roman",Times,serif!important;direction:ltr!important}
 #kanbanView tbody td.fa-text:nth-child(2),#kanbanView tbody td.fa-text:nth-child(3),#archiveView tbody td.fa-text:nth-child(2),#archiveView tbody td.fa-text:nth-child(3){font-family:"B Nazanin",Tahoma,serif!important;direction:rtl!important}
 .task-preview-tip,.task-preview-tip>div,.task-preview-tip>strong,html body .task-preview-tip>[lang="en"]{text-align:justify!important;text-align-last:auto!important;text-justify:inter-word!important}
 .task-preview-tip .latin-run,.task-preview-tip [lang="en"]{font-family:"Times New Roman",Times,serif!important}
 .task-history-link{display:block!important;margin:5px auto 0!important;padding:2px 7px!important;font-size:12px!important;line-height:1.4!important}
 #importDialog .import-error-wrap{max-width:96vw!important;overflow:auto!important}#importDialog .import-error-table{min-width:1180px!important}#importDialog .import-error-table input,#importDialog .import-error-table select{width:100%!important;box-sizing:border-box!important;direction:rtl!important;text-align:right!important;font-family:"B Nazanin",Tahoma,serif!important}#importDialog .import-error-reason{min-width:210px!important;white-space:normal!important;color:#9b3429!important;text-align:right!important}
 `;document.head.append(style);
 /* Inline error rows validate on change/blur, not on every keystroke, so editing remains stable. */
 document.addEventListener('input',event=>{if(event.target.closest('#importPreviewBody [data-field]'))event.stopImmediatePropagation()},true);
 const ownRows=rows=>isManager()?rows:(rows||[]).filter(r=>String(r.requested_by)===String(state.user?.id));
 function renderScoped(){
  const allRequests=state.requests,allHistory=state.requestHistory;
  try{
   state.requests=ownRows(allRequests);state.requestHistory=ownRows(allHistory);
   renderRequests();renderRequestHistory();
  }finally{state.requests=allRequests;state.requestHistory=allHistory}
 }
 function enforceVisibleScope(){
  if(isManager())return;
  const own=new Set(ownRows(state.requestHistory).map(r=>String(r.id)));
  document.querySelectorAll('#requestHistoryBody tr[data-request-id]').forEach(row=>{if(!own.has(String(row.dataset.requestId)))row.remove()});
 }
 async function sync({force=false}={}){
  if(!state.token||!state.profile||document.hidden)return;
  if(!force&&document.querySelector('dialog[open]'))return;
  if(pending)return pending;
  const actor=state.user?.id,token=state.token;
  pending=(async()=>{
   const workflow=await window.bamcoLoadRequestWorkflow();
   const requests=workflow.requests,routes=workflow.routes,history=workflow.history;
   if(actor!==state.user?.id||token!==state.token)return;
   const next=JSON.stringify([requests,routes,history]);
   if(next===lastSnapshot){enforceVisibleScope();return}
   const definitions=await selectAll('change_requests','select=id,requested_by,request_type,created_at,request_status&order=created_at.desc').catch(()=>state.definitionRequests||[]);
   if(actor!==state.user?.id||token!==state.token)return;
   lastSnapshot=next;state.requests=requests;state.requestRoutes=routes;state.requestHistory=history;
   state.definitionRequests=definitions;
   renderScoped();enforceVisibleScope();
   if(state.view==='dashboard')window.renderDashboard?.();
  })();
  try{await pending}finally{pending=null}
 }
 const run=(force=false)=>sync({force}).catch(error=>console.warn('Approval queue refresh',error.message));
 const immediate=()=>{try{renderScoped();enforceVisibleScope()}catch{}void run(true)};
 setInterval(()=>run(false),10000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)immediate()});
 window.addEventListener('focus',immediate);
 document.addEventListener('click',event=>{if(event.target.closest('#nav [data-view="approvals"],#nav [data-view="requestHistory"],#homeView [data-view="approvals"],#homeView [data-view="requestHistory"]'))immediate()});
 const body=document.querySelector('#requestHistoryBody');if(body)new MutationObserver(enforceVisibleScope).observe(body,{childList:true});
 const app=document.querySelector('#appView');if(app)new MutationObserver(()=>{if(!app.classList.contains('hidden')&&state.profile)immediate()}).observe(app,{attributes:true,attributeFilter:['class']});
 queueMicrotask(()=>{if(state?.profile)immediate()});
 window.bamcoRequestSync={refresh:()=>sync({force:true})};
})();

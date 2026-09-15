(()=>{
'use strict';
if(window.__bamcoFinalProductionFixLoader20260911)return;
window.__bamcoFinalProductionFixLoader20260911=true;
const loadFinal=()=>{
  if(document.querySelector('script[data-bamco-final-production-fixes]'))return;
  const s=document.createElement('script');
  s.src='assets/js/final-production-fixes-20260911.js?v=profile-sync-20260915-43';
  s.dataset.bamcoFinalProductionFixes='1';
  s.async=false;
  document.head.appendChild(s);
};
const loadToolbarActions=()=>{
  const existing=document.querySelector('script[data-bamco-task-toolbar-actions]');
  if(existing){if(existing.dataset.loaded==='1')loadFinal();else existing.addEventListener('load',loadFinal,{once:true});return}
  const s=document.createElement('script');
  s.src='assets/js/task-toolbar-actions-20260912.js?v=20260912-1';
  s.dataset.bamcoTaskToolbarActions='1';
  s.async=false;
  s.addEventListener('load',()=>{s.dataset.loaded='1';loadFinal()},{once:true});
  s.addEventListener('error',loadFinal,{once:true});
  document.head.appendChild(s);
};
const load=()=>{
  const existing=document.querySelector('script[data-bamco-task-bulk-delete]');
  if(existing){if(existing.dataset.loaded==='1')loadToolbarActions();else existing.addEventListener('load',loadToolbarActions,{once:true});return}
  const s=document.createElement('script');
  s.src='assets/js/task-bulk-delete-20260912.js?v=20260912-6';
  s.dataset.bamcoTaskBulkDelete='1';
  s.async=false;
  s.addEventListener('load',()=>{s.dataset.loaded='1';loadToolbarActions()},{once:true});
  s.addEventListener('error',loadToolbarActions,{once:true});
  document.head.appendChild(s);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();

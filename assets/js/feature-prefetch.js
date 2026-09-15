/* Warm the two network-backed resource views after the first app paint. */
(()=>{
'use strict';
const q=(s,r=document)=>r?.querySelector?.(s)||null;
let frame=0,idle=0,timer=0,warmedUser='';
function userId(){return String(typeof state!=='undefined'&&state.user?.id||'')}
function ready(){const app=q('#appView');return !!(app&&!app.classList.contains('hidden')&&userId()&&state?.token&&window.bamcoDocumentsSites)}
function start(force=false){
  if(!ready())return;
  const user=userId(),changed=!!warmedUser&&warmedUser!==user;
  warmedUser=user;
  const api=window.bamcoDocumentsSites;
  void Promise.allSettled([
    api.refreshDocuments?.(force||changed),
    api.refreshSites?.(force||changed),
    window.bamcoFeatureStructure?.refreshCategories?.()
  ]);
}
function cancel(){
  if(frame){cancelAnimationFrame(frame);frame=0}
  if(idle&&window.cancelIdleCallback){cancelIdleCallback(idle);idle=0}
  if(timer){clearTimeout(timer);timer=0}
}
function schedule(){
  if(frame||idle||timer)return;
  frame=requestAnimationFrame(()=>{
    frame=0;
    if(!ready())return;
    if(window.requestIdleCallback){idle=requestIdleCallback(()=>{idle=0;start(false)},{timeout:500})}
    else timer=setTimeout(()=>{timer=0;start(false)},40);
  });
}
function onAppState(){
  const app=q('#appView');
  if(!app||app.classList.contains('hidden')){cancel();warmedUser='';return}
  schedule();
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('#nav button[data-view]');
  if(!button)return;
  if(button.dataset.view==='documents')void window.bamcoDocumentsSites?.refreshDocuments?.(warmedUser!==userId());
  else if(button.dataset.view==='sitesAccess')void window.bamcoDocumentsSites?.refreshSites?.(warmedUser!==userId());
},true);
const app=q('#appView');
if(app)new MutationObserver(onAppState).observe(app,{attributes:true,attributeFilter:['class']});
addEventListener('pageshow',schedule);
if(app&&!app.classList.contains('hidden'))schedule();
window.bamcoFeaturePrefetch={start,schedule};
})();

/* Small post-bundle UI adjustments requested for the operations home. */
(()=>{
 'use strict';
 const PAINT_URL='https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/';
 const SPC_URL='https://nazanin-ghaemizadeh.github.io/BAMCO-STATISTICAL-PROCESS-CONTROL/';
 const q=(selector,root=document)=>root.querySelector(selector);
 const style=document.createElement('style');
 style.textContent=`
  #homeFixedFooter{display:none!important}
  .card-topbar .brand-title-stack{grid-column:2!important;grid-row:1!important;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.35}
  .card-topbar .brand-title-stack>strong{display:block!important;grid-column:auto!important;grid-row:auto!important;margin:0!important;color:#fff!important;text-align:center!important;font-size:22px!important;line-height:1.35!important}
  .card-topbar .brand-department{display:block;margin-top:2px;color:#d8eee3;font-size:12px;line-height:1.25;white-space:nowrap;text-align:center}
  @media(max-width:700px){.card-topbar .brand-title-stack>strong{font-size:18px!important}.card-topbar .brand-department{font-size:11px}}
 `;
 (document.head||document.documentElement).append(style);
 function identityLabel(){
  if(window.BamcoAccess?.isSystemManager?.()===true)return 'ادمین سامانه';
  const profile=window.Bamco?.state?.profile||window.state?.profile||{};
  const user=window.Bamco?.state?.user||window.state?.user||{};
  const meta=user.user_metadata||{};
  const values=[profile.department_title,profile.division_title,profile.department_name,profile.department,meta.department_title,meta.division_title,meta.department,window.BamcoWorkspace?.title?.()];
  const department=String(values.find(value=>typeof value==='string'&&value.trim())||'').trim();
  return department?('معاونت: '+department):'';
 }
 function updateBrand(){
  const top=q('.card-topbar');
  if(!top)return;
  let stack=top.querySelector('.brand-title-stack');
  const title=top.querySelector(':scope > strong')||stack?.querySelector('strong');
  if(!stack&&!title)return;
  if(!stack){
   stack=document.createElement('div');stack.className='brand-title-stack';
   const label=document.createElement('span');label.className='brand-department';label.id='currentDepartmentName';
   title.replaceWith(stack);stack.append(title,label);
  }
  const label=stack.querySelector('.brand-department');
  const value=identityLabel();
  if(label&&label.textContent!==value)label.textContent=value;
 }
 function organizationRoots(){
  const explicit=[...document.querySelectorAll('#organizationAdminView,#organizationAdminRoot,#organizationAdminFeatureRoot,[data-feature-key="organizationAdmin"]')];
  if(explicit.length)return explicit;
  const title=q('#viewTitle')?.textContent||'';
  if(!title.includes('مدیریت جامع سازمان'))return [];
  const active=[...document.querySelectorAll('.view:not(.hidden)')];
  return active.filter(view=>!view.id||/organization|admin/i.test(view.id));
 }
 function fixQualityLabels(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))node.nodeValue=node.nodeValue.replace(/کنترل آماری فرایند ?\\(SPC\\)/g,'Statistical Process Control').replace(/کنترل آماری فرایند/g,'Statistical Process Control').replace(/کنترل آماری کیفیت/g,'Quality Control');
  document.body.querySelectorAll('*').forEach(element=>{for(const name of ['title','aria-label']){const value=element.getAttribute(name);if(value)element.setAttribute(name,value.replace(/کنترل آماری فرایند ?\\(SPC\\)/g,'Statistical Process Control').replace(/کنترل آماری فرایند/g,'Statistical Process Control').replace(/کنترل آماری کیفیت/g,'Quality Control'))}});
 }
 function fixThermalLabel(){
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))if(node.nodeValue.includes('پایش حرارتی سالن رنگ'))node.nodeValue=node.nodeValue.replace(/پایش حرارتی سالن رنگ/g,'پایش حرارتی');
  document.body.querySelectorAll('*').forEach(element=>{
   for(const name of ['title','aria-label']){
    const value=element.getAttribute(name);
    if(value?.includes('پایش حرارتی سالن رنگ'))element.setAttribute(name,value.replace(/پایش حرارتی سالن رنگ/g,'پایش حرارتی'));
   }
  });
 }
 function fixArabicHeh(){
  const roots=organizationRoots();
  for(const root of roots){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
   let node;
   while((node=walker.nextNode()))if(node.nodeValue.includes('ة'))node.nodeValue=node.nodeValue.replace(/ة/g,'ه');
   root.querySelectorAll('*').forEach(element=>{
    for(const name of ['placeholder','title','aria-label','alt']){
     const value=element.getAttribute(name);
     if(value?.includes('ة'))element.setAttribute(name,value.replace(/ة/g,'ه'));
    }
   });
  }
 }
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('[data-view="ovenAnalysis"],[data-route="ovenAnalysis"],[data-view="statisticalProcessControl"],[data-route="statisticalProcessControl"]'):null;
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  const isSpc=target.dataset.view==='statisticalProcessControl'||target.dataset.route==='statisticalProcessControl';
  window.open(isSpc?SPC_URL:PAINT_URL,'_blank','noopener,noreferrer');
  q('.home-launcher-dialog[open]')?.close();
  if(typeof window.bamcoShowHome==='function')window.bamcoShowHome();
  else q('.home-return')?.click();
 },true);
 const observer=new MutationObserver(()=>{updateBrand();fixThermalLabel();fixArabicHeh()});
 function start(){
  updateBrand();fixThermalLabel();fixArabicHeh();fixQualityLabels();
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden','title','aria-label','placeholder','alt']});
 }
 for(const eventName of ['bamco:department-selected','bamco:profile-updated','bamco:profiles-updated','bamco:auth-state','bamco:session-ready','bamco:authenticated']){
  document.addEventListener(eventName,updateBrand);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.setInterval(updateBrand,2000);
})();
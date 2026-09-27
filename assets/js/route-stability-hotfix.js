/* Route-stability hotfix: prevents shared UI engines from rebuilding feature-owned routes. */
(()=>{
  'use strict';
  const owned=['vehiclePermanentView','vehicleTemporaryView','pettyCashView','lettersIncomingView','lettersOutgoingView','invoicesView'];
  const mark=()=>owned.forEach(id=>document.getElementById(id)?.setAttribute('data-bamco-ui-owner','feature'));
  mark();
  try{
    localStorage.removeItem('bamco-vehicle-widths-vehiclePermanent-v3');
    localStorage.removeItem('bamco-vehicle-widths-vehicleTemporary-v3');
  }catch{}
  const navigation=window.BamcoNavigation;
  if(!navigation||navigation.__routeStabilityHotfix)return;
  const nativeNavigate=navigation.navigate.bind(navigation);
  Object.defineProperty(navigation,'__routeStabilityHotfix',{value:true});
  navigation.navigate=function(view){
    const access=window.BamcoAccess;
    const route=window.BamcoNavigationCatalog?.routeFor?.(view);
    const feature=route?.featureKey||window.BamcoNavigationCatalog?.featureForRoute?.(view);
    if(feature&&access&&access.isReady?.()===false&&typeof access.refresh==='function'){
      window.bamcoToast?.('در حال آماده‌سازی دسترسی بخش…');
      Promise.resolve(access.refresh()).catch(()=>null).then(()=>{
        if(access.can?.(feature,'view')===true)nativeNavigate(view);
        else access.denied?.(feature,'view',{route:view});
      });
      return true;
    }
    return nativeNavigate(view);
  };
})();
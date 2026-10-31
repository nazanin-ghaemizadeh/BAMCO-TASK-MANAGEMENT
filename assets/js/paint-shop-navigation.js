/* Open Paint Shop and SPC as standalone modules while sharing the active BAMCO session. */
(()=>{
  'use strict';
  const EMISSION_URL='https://nazanin-ghaemizadeh.github.io/BAMCO-EMISSION-TEST/';
  const PAINT_URL='https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/';
  const SPC_URL='https://nazanin-ghaemizadeh.github.io/BAMCO-STATISTICAL-PROCESS-CONTROL/';
  const SPC_PATH=new URL(SPC_URL).pathname;
  const SPC_TITLE='کنترل آماری فرایند';
  const SPC_OLD='کنترل آماری فرایند (SPC)';
  const labelOf=node=>[node.textContent,node.getAttribute?.('aria-label'),node.getAttribute?.('title'),node.getAttribute?.('href'),node.getAttribute?.('data-url')].filter(Boolean).join(' ');
  const isPaint=node=>/پینت[\s\u200c-]*شاپ|paint[\s_-]*shop|BAMCO-PAINT-SHOP/i.test(labelOf(node));
  const renameSPC=()=>{
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode()))if(node.nodeValue.includes(SPC_OLD))node.nodeValue=node.nodeValue.replaceAll(SPC_OLD,SPC_TITLE);
  };
  // Category buttons open the shared launcher. Only an explicit route button
  // may open the external SPC site; matching the category's text skips it.
  const targetSPC=event=>event.target instanceof Element
    ?event.target.closest('[data-view="statisticalProcessControl"],[data-route="statisticalProcessControl"]'):null;
  const targetPaint=event=>{
    const target=event.target instanceof Element?event.target.closest('a,button,[role="button"],[data-view]'):null;
    return target&&isPaint(target)?target:null;
  };
  document.addEventListener('click',event=>{
    const emission=event.target instanceof Element?event.target.closest('[data-view="emissionTests"],[data-route="emissionTests"]'):null;
    if(emission){
      event.preventDefault();event.stopImmediatePropagation();
      if(!window.BamcoAccess?.can?.('emissionTests','view'))return;
      window.open(EMISSION_URL,'_blank');
      document.querySelector('.home-launcher-dialog[open]')?.close();
      window.bamcoShowHome?.();
      return;
    }
    const spc=targetSPC(event);
    if(spc){
      event.preventDefault();event.stopImmediatePropagation();
      if(!window.BamcoAccess?.can?.('statisticalProcessControl','view'))return;
      window.open(SPC_URL,'_blank');
      document.querySelector('.home-launcher-dialog[open]')?.close();
      window.bamcoShowHome?.();
      return;
    }
    const paint=targetPaint(event);
    if(paint){event.preventDefault();event.stopImmediatePropagation();window.open(PAINT_URL,'_blank','noopener,noreferrer');}
  },true);
  const modules={
    'bamco.spc.request-session':{path:SPC_PATH,feature:'statisticalProcessControl',name:'spc'},
    'bamco.emission.request-session':{path:new URL(EMISSION_URL).pathname,feature:'emissionTests',name:'emission'}
  };
  window.addEventListener('message',async event=>{
    const module=modules[event.data?.type];if(event.origin!==location.origin||!module)return;
    try{
      const source=event.source;
      if(!source||source===window||source.location.origin!==location.origin||source.location.pathname!==module.path||source.opener!==window)return;
      await window.bamcoAuth?.ensureFresh?.();
      const state=window.Bamco?.state,token=state?.token,userId=state?.user?.id;
      if(!token||!userId||!window.BamcoAccess?.can?.(module.feature,'view')){
        source.postMessage({type:'bamco.'+module.name+'.revoked'},event.origin);return;
      }
      source.postMessage({type:'bamco.'+module.name+'.session',accessToken:token,userId},event.origin);
    }catch(error){console.warn('Could not share the active BAMCO session.',error)}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renameSPC,{once:true});else renameSPC();
  new MutationObserver(renameSPC).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();

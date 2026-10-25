/* Open Paint Shop and SPC as standalone modules while sharing the active BAMCO session. */
(()=>{
  'use strict';
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
    const spc=targetSPC(event);
    if(spc){
      event.preventDefault();event.stopImmediatePropagation();
      window.open(SPC_URL,'_blank');
      document.querySelector('.home-launcher-dialog[open]')?.close();
      window.bamcoShowHome?.();
      return;
    }
    const paint=targetPaint(event);
    if(paint){event.preventDefault();event.stopImmediatePropagation();window.open(PAINT_URL,'_blank','noopener,noreferrer');}
  },true);
  window.addEventListener('message',async event=>{
    if(event.origin!==location.origin||event.data?.type!=='bamco.spc.request-session')return;
    try{
      const source=event.source;
      if(!source||source===window||source.location.origin!==location.origin||source.location.pathname!==SPC_PATH)return;
      await window.bamcoAuth?.ensureFresh?.();
      const state=window.Bamco?.state,token=state?.token,userId=state?.user?.id;
      if(!token||!userId)return;
      source.postMessage({type:'bamco.spc.session',accessToken:token,userId},event.origin);
    }catch(error){console.warn('Could not share the active session with SPC.',error)}
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renameSPC,{once:true});else renameSPC();
  new MutationObserver(renameSPC).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();

/* Paint Shop: open external module in a new tab, compatible with script-src 'self'. */
(()=>{
  const URL='https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/';
  const matches=(node)=>{
    const label=[node.textContent,node.getAttribute('aria-label'),node.getAttribute('title'),node.getAttribute('href'),node.getAttribute('data-url')].filter(Boolean).join(' ');
    return /پینت[\s\u200c-]*شاپ|paint[\s_-]*shop|BAMCO-PAINT-SHOP/i.test(label);
  };
  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target.closest('a,button,[role="button"],[data-view]'):null;
    if(!target||!matches(target))return;
    event.preventDefault();event.stopImmediatePropagation();
    window.open(URL,'_blank','noopener,noreferrer');
  },true);
  const updateLinks=()=>{
    document.querySelectorAll('a[href]').forEach(a=>{if(matches(a)){a.href=URL;a.target='_blank';a.rel='noopener noreferrer';}});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateLinks);else updateLinks();
  new MutationObserver(updateLinks).observe(document.documentElement,{childList:true,subtree:true});
})();

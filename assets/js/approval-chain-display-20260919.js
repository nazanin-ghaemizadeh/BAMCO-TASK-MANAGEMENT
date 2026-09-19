(()=>{'use strict';
function repair(root=document){
  root.querySelectorAll?.('#approvalChainList ol').forEach(list=>{
    const items=[...list.children].filter(node=>node.tagName==='LI'),total=items.length;
    list.classList.add('approval-chain-stages');
    list.reversed=true;
    list.start=total||1;
    items.forEach((item,index)=>{item.value=total-index});
  });
}
function boot(){
  const list=document.querySelector('#approvalChainList');
  if(!list)return;
  repair(list.parentElement||document);
  new MutationObserver(()=>repair(list)).observe(list,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

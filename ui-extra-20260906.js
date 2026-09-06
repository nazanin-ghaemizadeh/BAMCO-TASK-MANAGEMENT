(()=>{
  const hasFa=s=>/[\u0600-\u06ff]/.test(String(s||''));
  const hasEn=s=>/[A-Za-z]/.test(String(s||''));

  function classifyEnglish(root=document){
    const nodes=root.querySelectorAll?.('td,th,button,label,input,select,option,textarea,small,span,strong,p,h1,h2,h3,h4')||[];
    nodes.forEach(el=>{
      const text=(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)
        ? `${el.value||''} ${el.placeholder||''}`
        : (el.textContent||'');
      el.classList.toggle('english-ui',hasEn(text)&&!hasFa(text));
    });
  }
  classifyEnglish();
  new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1)classifyEnglish(n)})))
    .observe(document.body,{childList:true,subtree:true});
  document.addEventListener('input',e=>{if(e.target.matches?.('input,textarea,select'))classifyEnglish(e.target.parentElement||document)},true);
  document.addEventListener('change',e=>{if(e.target.matches?.('input,textarea,select'))classifyEnglish(e.target.parentElement||document)},true);

  function clearSelection(scope){
    if(typeof state==='undefined'||!state.selected)return;
    if(scope){state.selected[scope]=null;renderTasks(scope==='archive');return}
    const current=state.view==='archive'?'archive':state.view==='kanban'?'kanban':null;
    if(current&&state.selected[current]!=null){state.selected[current]=null;renderTasks(current==='archive')}
  }

  // Clicking anywhere outside the table cancels the current row selection.
  // Button handlers run first, so toolbar actions still apply to the chosen row.
  document.addEventListener('click',e=>{
    const scope=typeof state!=='undefined'&&state.view==='archive'?'archive':typeof state!=='undefined'&&state.view==='kanban'?'kanban':null;
    if(!scope||state.selected[scope]==null)return;
    const view=document.querySelector(`#${scope}View`);
    const table=view?.querySelector('.table-wrap');
    if(table?.contains(e.target))return;
    setTimeout(()=>clearSelection(scope),0);
  });
})();
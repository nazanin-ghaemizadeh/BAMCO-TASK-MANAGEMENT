(()=>{
  const hasFa=s=>/[\u0600-\u06ff]/.test(String(s||''));
  const hasEn=s=>/[A-Za-z]/.test(String(s||''));

  document.documentElement.dataset.uiHotfix='20260906-1400';

  /* Apply Times New Roman to every Latin run, including Latin words inside Persian sentences. */
  function wrapLatinText(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node){
        const p=node.parentElement;
        if(!p||!hasEn(node.nodeValue))return NodeFilter.FILTER_REJECT;
        if(p.closest('script,style,textarea,input,select,option,pre,code,.latin-run,[contenteditable="true"]'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.nodeValue||'';
      const re=/([A-Za-z][A-Za-z0-9@._%+\-/:;#&()'\"]*)/g;
      if(!re.test(text))return;
      re.lastIndex=0;
      const frag=document.createDocumentFragment();let last=0,m;
      while((m=re.exec(text))){
        if(m.index>last)frag.append(document.createTextNode(text.slice(last,m.index)));
        const span=document.createElement('span');span.className='latin-run';span.textContent=m[0];frag.append(span);last=re.lastIndex;
      }
      if(last<text.length)frag.append(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    });
  }

  function classifyControls(root=document){
    const nodes=[];
    if(root.nodeType===1&&root.matches?.('input,textarea,select,option'))nodes.push(root);
    root.querySelectorAll?.('input,textarea,select,option,.english,.en-text,[dir="ltr"]')?.forEach(el=>nodes.push(el));
    nodes.forEach(el=>{
      const text=(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)?`${el.value||''} ${el.placeholder||''}`:(el.textContent||'');
      if((hasEn(text)&&!hasFa(text))||el.matches('.english,.en-text,[dir="ltr"]'))el.classList.add('english-ui');
      else el.classList.remove('english-ui');
    });
  }

  function applyTypography(root=document.body){classifyControls(root);wrapLatinText(root)}
  applyTypography();

  let typographyQueued=false;
  const scheduleTypography=root=>{
    if(typographyQueued)return;typographyQueued=true;
    requestAnimationFrame(()=>{typographyQueued=false;applyTypography(root?.nodeType===1?root:document.body)});
  };
  new MutationObserver(muts=>{
    for(const m of muts){
      if(m.type==='childList'&&m.addedNodes.length){scheduleTypography(m.target);break}
      if(m.type==='characterData'){scheduleTypography(m.target.parentElement);break}
    }
  }).observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('input',e=>{if(e.target.matches?.('input,textarea,select'))classifyControls(e.target.parentElement||document)},true);
  document.addEventListener('change',e=>{if(e.target.matches?.('input,textarea,select'))classifyControls(e.target.parentElement||document)},true);

  function clearSelection(scope){
    if(typeof state==='undefined'||!state.selected||!scope)return;
    state.selected[scope]=null;
    const view=document.querySelector(`#${scope}View`);
    view?.querySelectorAll('.task-pick').forEach(x=>x.checked=false);
    view?.querySelectorAll('tr.task-selected').forEach(x=>x.classList.remove('task-selected'));
    if(typeof updateTaskToolbar==='function')updateTaskToolbar(scope);
  }

  /* Robust deselection: any pointer press outside the task table cancels the row selection.
     The task toolbar is exempt so Edit / Archive / Restore / Delete can still use the selected row. */
  document.addEventListener('pointerdown',e=>{
    if(typeof state==='undefined')return;
    const scope=state.view==='archive'?'archive':state.view==='kanban'?'kanban':null;
    if(!scope||state.selected?.[scope]==null)return;
    const view=document.querySelector(`#${scope}View`);
    if(view?.querySelector('.table-wrap table')?.contains(e.target))return;
    if(view?.querySelector('.task-toolbar')?.contains(e.target))return;
    clearSelection(scope);
  },true);

  /* Force the same database resequence path for deletion from KANBAN and Archive,
     then reload both views so the new display IDs are visible immediately. */
  if(typeof window.deleteTask==='function'){
    window.deleteTask=async id=>{
      if(typeof isManager==='function'&&!isManager())return;
      const task=state.tasks.find(t=>String(t.id)===String(id));
      if(!task||!confirm(`تسک «${task.title}» برای همیشه حذف شود؟`))return;
      try{
        await rpc('delete_task_and_resequence',{p_task_id:Number(id)});
        state.selected.kanban=null;state.selected.archive=null;
        await refresh();
        toast('تسک حذف شد و شماره‌ها در کانبان و آرشیو بازشماری شدند.');
      }catch(err){toast(err.message,true)}
    };
  }

  /* Load the desktop-faithful sticker manager. During initial parsing, document.write keeps
     both scripts parser-ordered so the sticker module sees DOMContentLoaded reliably. */
  function loadStickerDesktopLate(){
    if(!document.querySelector('link[data-sticker-desktop]')){
      const link=document.createElement('link');
      link.rel='stylesheet';link.href='sticker-desktop.css?v=20260906-1';link.dataset.stickerDesktop='1';
      document.head.appendChild(link);
    }
    const first=document.createElement('script');
    first.src='sticker-default.js?v=20260906-1';
    first.onload=()=>{const second=document.createElement('script');second.src='sticker-desktop.js?v=20260906-3';document.body.appendChild(second)};
    document.body.appendChild(first);
  }
  if(document.readyState==='loading'){
    document.write('<link rel="stylesheet" href="sticker-desktop.css?v=20260906-1" data-sticker-desktop="1">');
    document.write('<script src="sticker-default.js?v=20260906-1"><\/script>');
    document.write('<script src="sticker-desktop.js?v=20260906-3"><\/script>');
  }else loadStickerDesktopLate();
})();

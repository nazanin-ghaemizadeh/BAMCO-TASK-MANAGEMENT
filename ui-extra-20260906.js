(()=>{
  const hasFa=s=>/[\u0600-\u06ff]/.test(String(s||''));
  const hasEn=s=>/[A-Za-z]/.test(String(s||''));
  document.documentElement.dataset.uiHotfix='20260907-user2';

  function wrapLatinText(root=document.body){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
      const p=node.parentElement;
      if(!p||!hasEn(node.nodeValue))return NodeFilter.FILTER_REJECT;
      if(p.closest('script,style,textarea,input,select,option,pre,code,.latin-run,[contenteditable="true"]'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.nodeValue||'',re=/([A-Za-z][A-Za-z0-9@._%+\-/:;#&()'\"]*)/g;
      if(!re.test(text))return;re.lastIndex=0;
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

  /* The previous implementation rescanned and rewrote the entire DOM after every mutation.
     Do the expensive Latin pass once, then only classify newly inserted control subtrees. */
  function installTypography(){
    classifyControls(document);
    wrapLatinText(document.body);
    const pending=new Set();let raf=0;
    new MutationObserver(muts=>{
      for(const m of muts){
        if(m.type!=='childList'||!m.addedNodes.length)continue;
        m.addedNodes.forEach(node=>{if(node.nodeType===1)pending.add(node)});
      }
      if(!pending.size||raf)return;
      raf=requestAnimationFrame(()=>{
        raf=0;
        const roots=[...pending];pending.clear();
        roots.forEach(root=>classifyControls(root));
      });
    }).observe(document.body,{childList:true,subtree:true});
  }

  function clearSelection(scope){
    if(typeof state==='undefined'||!state.selected||!scope)return;
    state.selected[scope]=null;
    const view=document.querySelector(`#${scope}View`);
    view?.querySelectorAll('.task-pick').forEach(x=>x.checked=false);
    view?.querySelectorAll('tr.task-selected').forEach(x=>x.classList.remove('task-selected'));
    if(typeof updateTaskToolbar==='function')updateTaskToolbar(scope);
  }

  function installOutsideSelectionClear(){
    document.addEventListener('pointerdown',e=>{
      if(typeof state==='undefined')return;
      const scope=state.view==='archive'?'archive':state.view==='kanban'?'kanban':null;
      if(!scope||state.selected?.[scope]==null)return;
      const view=document.querySelector(`#${scope}View`);
      if(view?.querySelector('.table-wrap table')?.contains(e.target)||view?.querySelector('.task-toolbar')?.contains(e.target))return;
      clearSelection(scope);
    },true);
  }

  function installDeleteResequence(){
    if(typeof window.deleteTask!=='function')return;
    window.deleteTask=async id=>{
      if(typeof isManager==='function'&&!isManager())return;
      const task=state.tasks.find(t=>String(t.id)===String(id));
      if(!task||!confirm(`وظیفه «${task.title}» برای همیشه حذف شود؟`))return;
      try{
        await rpc('delete_task_and_resequence',{p_task_id:Number(id)});
        state.selected.kanban=null;state.selected.archive=null;
        await refresh();toast('وظیفه حذف شد و شماره‌ها در کانبان و آرشیو بازشماری شدند.');
      }catch(err){toast(err.message,true)}
    };
  }

  function installFooter(){
    const app=document.querySelector('#appView');if(!app)return;
    let footer=document.querySelector('#appFooterCredit');
    if(!footer){
      footer=document.createElement('footer');footer.id='appFooterCredit';footer.className='app-footer-credit';
      footer.textContent='توسعه یافته توسط واحد مهندسی محصول شرکت خودروسازان بم | شهاب‌الدین تنهائیان و نازنین قائمی';
      app.appendChild(footer);
    }
  }

  function installSidebarHoverScroll(){
    const nav=document.querySelector('#sidebar nav');if(!nav||nav.dataset.hoverScroll==='1')return;
    nav.dataset.hoverScroll='1';let speed=0,raf=0;
    const tick=()=>{if(!speed){raf=0;return}nav.scrollTop+=speed;raf=requestAnimationFrame(tick)};
    const setSpeed=e=>{
      const r=nav.getBoundingClientRect();if(!r.height){speed=0;return}
      const y=(e.clientY-r.top)/r.height,edge=.22,max=5;
      if(y<edge)speed=-Math.max(1,Math.round((edge-y)/edge*max));
      else if(y>1-edge)speed=Math.max(1,Math.round((y-(1-edge))/edge*max));
      else speed=0;
      if(speed&&!raf)raf=requestAnimationFrame(tick);
    };
    nav.addEventListener('mousemove',setSpeed,{passive:true});
    nav.addEventListener('mouseleave',()=>{speed=0},{passive:true});
    nav.addEventListener('mouseenter',setSpeed,{passive:true});
  }

  function refreshStableLayout(){
    document.querySelectorAll('link[href*="stable-layout-20260906.css"]').forEach(x=>x.remove());
    const l=document.createElement('link');l.rel='stylesheet';l.href='stable-layout-20260906.css?v=20260907-user1';l.dataset.finalLayout='1';document.head.appendChild(l);
  }

  function installGroupedSidebar(){
    if(document.querySelector('script[data-sidebar-groups]'))return;
    const s=document.createElement('script');s.src='sidebar-groups-20260906.js?v=20260907-user1';s.dataset.sidebarGroups='1';document.body.appendChild(s);
  }

  function installUserRequestedFixes(){
    if(document.querySelector('script[data-user-request-fixes]'))return;
    const s=document.createElement('script');s.src='user-request-fixes-20260907.js?v=20260907-2';s.dataset.userRequestFixes='1';document.body.appendChild(s);
  }

  const boot=()=>{
    refreshStableLayout();
    installTypography();
    installOutsideSelectionClear();
    installDeleteResequence();
    installFooter();
    installSidebarHoverScroll();
    installGroupedSidebar();
    installUserRequestedFixes();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

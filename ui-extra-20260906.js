(()=>{
  const hasFa=s=>/[\u0600-\u06ff]/.test(String(s||''));
  const hasEn=s=>/[A-Za-z]/.test(String(s||''));

  document.documentElement.dataset.uiHotfix='20260906-1640';

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

  document.addEventListener('pointerdown',e=>{
    if(typeof state==='undefined')return;
    const scope=state.view==='archive'?'archive':state.view==='kanban'?'kanban':null;
    if(!scope||state.selected?.[scope]==null)return;
    const view=document.querySelector(`#${scope}View`);
    if(view?.querySelector('.table-wrap table')?.contains(e.target))return;
    if(view?.querySelector('.task-toolbar')?.contains(e.target))return;
    clearSelection(scope);
  },true);

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

  function installFooter(){
    const app=document.querySelector('#appView');
    if(!app||document.querySelector('#appFooterCredit'))return;
    const footer=document.createElement('footer');
    footer.id='appFooterCredit';
    footer.className='app-footer-credit';
    footer.textContent='توسعه یافته توسط واحد مهندسی محصول شرکت خودروسازان بم | شهاب‌الدین تنهائیان و نازنین قائمی';
    app.appendChild(footer);
  }

  const loadScript=(src,id)=>new Promise((resolve,reject)=>{
    const old=document.querySelector(`script[data-loader-id="${id}"]`);
    if(old)return resolve();
    const s=document.createElement('script');
    s.src=src;s.dataset.loaderId=id;s.onload=()=>resolve();s.onerror=reject;
    document.body.appendChild(s);
  });

  async function bootStickerManager(){
    if(window.__bamcoStickerBooted)return;
    window.__bamcoStickerBooted=true;
    if(!document.querySelector('link[data-sticker-desktop]')){
      const link=document.createElement('link');
      link.rel='stylesheet';link.href='sticker-desktop.css?v=20260906-3';link.dataset.stickerDesktop='1';document.head.appendChild(link);
    }
    try{
      /* The previous pack only contained part of the desktop set. These two compact files contain all ten stickers. */
      await loadScript('sticker-pack-small-01.js?v=20260906-2','sticker-pack-small-01');
      await loadScript('sticker-pack-small-02.js?v=20260906-2','sticker-pack-small-02');
      await loadScript('sticker-pack-small-loader.js?v=20260906-1','sticker-pack-small-loader');

      if((window.BAMCO_STICKER_ASSET_COUNT||0)<10)throw new Error(`Only ${window.BAMCO_STICKER_ASSET_COUNT||0} sticker assets loaded.`);

      const nativeAdd=document.addEventListener.bind(document);
      const currentAdd=document.addEventListener;
      if(document.readyState!=='loading'){
        document.addEventListener=function(type,listener,options){
          if(type==='DOMContentLoaded'){
            setTimeout(()=>listener.call(document,new Event('DOMContentLoaded')),0);
            return;
          }
          return nativeAdd(type,listener,options);
        };
      }
      try{await loadScript('sticker-desktop.js?v=20260906-6','sticker-desktop-final-v6')}finally{document.addEventListener=currentAdd}
      await loadScript('sticker-seed-final.js?v=20260906-2','sticker-seed-final-v2');
      setTimeout(()=>window.seedEngineeringStickerSet?.(),200);
    }catch(err){
      window.__bamcoStickerBooted=false;
      console.error('Final sticker manager boot failed',err);
    }
  }

  const boot=()=>{installFooter();bootStickerManager()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

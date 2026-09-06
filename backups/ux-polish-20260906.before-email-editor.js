(()=>{
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  function decorateWelcome(){
    const card=q('#welcomeView .welcome-card');
    if(!card||card.dataset.uxWelcome==='1')return;
    card.dataset.uxWelcome='1';
    card.innerHTML=`
      <div class="welcome-content">
        <img id="welcomeFemaleSticker" class="welcome-sticker is-missing" alt="استیکر وضعیت مطلوب خانم">
        <div class="welcome-copy">
          <h2>به سامانه مدیریت، پایش و پیگیری امور خوش آمدید</h2>
          <p>لطفاً از منوی سمت راست، بخش موردنظر خود را انتخاب کنید.</p>
        </div>
        <img id="welcomeMaleSticker" class="welcome-sticker is-missing" alt="استیکر وضعیت مطلوب آقا">
      </div>`;
    refreshWelcomeStickers();
  }

  function setWelcomeImage(selector,src){
    const img=q(selector);if(!img)return;
    if(!src){img.classList.add('is-missing');img.removeAttribute('src');return}
    img.onload=()=>img.classList.remove('is-missing');
    img.onerror=()=>img.classList.add('is-missing');
    img.src=src;
  }

  function refreshWelcomeStickers(){
    const assets=window.BAMCO_DESKTOP_ASSETS||{};
    setWelcomeImage('#welcomeFemaleSticker',assets['01_happy_female']||'');
    setWelcomeImage('#welcomeMaleSticker',assets['01_happy_male']||'');
  }

  function collapseGroupsForEntry(){
    qa('#nav .nav-group').forEach(g=>g.classList.add('collapsed-group'));
  }

  function installEntryCollapse(){
    const app=q('#appView');if(!app||app.dataset.uxEntryCollapse==='1')return;
    app.dataset.uxEntryCollapse='1';
    let wasHidden=app.classList.contains('hidden');
    const collapseSoon=()=>[80,250,600].forEach(ms=>setTimeout(collapseGroupsForEntry,ms));
    const applyIfEntered=()=>{
      const hidden=app.classList.contains('hidden');
      if(wasHidden&&!hidden)collapseSoon();
      wasHidden=hidden;
    };
    new MutationObserver(applyIfEntered).observe(app,{attributes:true,attributeFilter:['class']});
    if(!wasHidden)collapseSoon();
  }

  function polishSearchButtons(){
    const k=q('#kanbanView .task-search-toggle');
    const a=q('#archiveView .task-search-toggle');
    if(k){k.textContent='جست‌وجو در وظایف';k.title='جست‌وجو در وظایف';k.setAttribute('aria-label','جست‌وجو در وظایف')}
    if(a){a.textContent='جست‌وجو در آرشیو';a.title='جست‌وجو در آرشیو';a.setAttribute('aria-label','جست‌وجو در آرشیو')}
    const ki=q('#kanbanSearch'),ai=q('#archiveSearch');
    if(ki)ki.placeholder='جست‌وجو در وظایف…';
    if(ai)ai.placeholder='جست‌وجو در آرشیو…';
  }

  function cleanTaskTable(viewId){
    const view=q(`#${viewId}`);if(!view)return;
    view.querySelectorAll('tbody tr[data-task-id]').forEach(row=>{
      const cells=row.children;
      if(cells[0])cells[0].textContent=(cells[0].textContent||'').replace(/^\s*#\s*/,'').trim();
      if(cells[11]){
        const text=(cells[11].textContent||'').trim();
        cells[11].textContent=text;
      }
    });
  }

  function installTableCleaning(){
    ['kanbanView','archiveView'].forEach(id=>{
      const view=q(`#${id}`);if(!view||view.dataset.uxTableClean==='1')return;
      view.dataset.uxTableClean='1';
      cleanTaskTable(id);
      const body=view.querySelector('tbody');
      if(body)new MutationObserver(()=>requestAnimationFrame(()=>cleanTaskTable(id))).observe(body,{childList:true,subtree:true});
    });
  }

  function ensureSidebarLogo(){
    const brand=q('#sidebar .side-brand'),img=brand?.querySelector('img');
    if(!brand||!img)return;
    brand.querySelectorAll('strong').forEach(x=>{x.style.setProperty('display','none','important');x.style.setProperty('visibility','hidden','important')});
    img.style.setProperty('display','block','important');
    img.style.setProperty('visibility','visible','important');
    img.style.setProperty('opacity','1','important');
  }

  function refreshAll(){
    decorateWelcome();
    refreshWelcomeStickers();
    polishSearchButtons();
    installTableCleaning();
    ensureSidebarLogo();
  }

  function boot(){
    installEntryCollapse();
    refreshAll();
    let queued=false;
    new MutationObserver(()=>{
      if(queued)return;queued=true;
      requestAnimationFrame(()=>{queued=false;refreshAll()});
    }).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('bamco-stickers-ready',()=>setTimeout(refreshWelcomeStickers,30));
    [250,700,1400,2600].forEach(ms=>setTimeout(refreshAll,ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

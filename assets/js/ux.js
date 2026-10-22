/* module:ux:25 */
(()=>{
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];

  const ICONS={
    login:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z"/></svg>`,
    tasks:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10l1.6 1.6L13 8.8M8.5 15l1.6 1.6L13 13.8M15 10h1.5M15 15h1.5"/></svg>`,
    people:`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.5 2.6-5.2 5.5-5.2s5 1.7 5.5 5.2M15 6.5a2.5 2.5 0 0 1 0 5M16.5 14c2.3.4 3.7 2 4 5"/></svg>`,
    email:`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>`,
    vehicle:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16h14l-1.3-5.2A2.4 2.4 0 0 0 15.4 9H8.6a2.4 2.4 0 0 0-2.3 1.8L5 16Zm-1 0v2.2c0 .4.4.8.8.8H6m12 0h1.2c.4 0 .8-.4.8-.8V16M7 13h.01M17 13h.01"/></svg>`,
    settings:`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 3.8 10 2h4l.5 1.8 1.8.8 1.7-.9 2.8 2.8-.9 1.7.8 1.8 1.8.5v4l-1.8.5-.8 1.8.9 1.7-2.8 2.8-1.7-.9-1.8.8L14 22h-4l-.5-1.8-1.8-.8-1.7.9-2.8-2.8.9-1.7-.8-1.8-1.8-.5v-4l1.8-.5.8-1.8-.9-1.7L6 3.7l1.7.9 1.8-.8Z"/><circle cx="12" cy="12" r="3"/></svg>`
  };

  function injectStyle(){
    /* Layout and visual rules belong to bamco-unified.css only. */
    q('#bamcoFinalPolishStyle')?.remove();
    return;
    let style=q('#bamcoFinalPolishStyle');
    if(!style){style=document.createElement('style');style.id='bamcoFinalPolishStyle';document.head.appendChild(style)}
    style.textContent=`
      html body #appView #sidebar #nav>.nav-group,
      html body #appView #sidebar #nav>.nav-settings-root{border:0!important;border-top:0!important;border-bottom:0!important;box-shadow:none!important}
      html body #appView #sidebar #nav .nav-chevron{display:none!important;width:0!important;min-width:0!important;margin:0!important;padding:0!important}
      html body #appView #sidebar #nav>.nav-login-root::after,
      html body #appView #sidebar #nav>.nav-settings-root::after,
      html body #appView #sidebar #nav>.nav-group>.nav-group-toggle::before,
      html body #appView #sidebar #nav>.nav-group>.nav-group-toggle::after{content:none!important;display:none!important}
      html body #appView #sidebar #nav>.nav-login-root,
      html body #appView #sidebar #nav>.nav-settings-root,
      html body #appView #sidebar #nav>.nav-group>.nav-group-toggle{
        display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;gap:10px!important;
        width:100%!important;height:48px!important;min-height:48px!important;margin:0!important;padding:7px 10px!important;
        align-items:center!important;box-sizing:border-box!important;border:0!important;
        font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
        font-size:17px!important;line-height:1.25!important;font-weight:700!important;text-align:right!important
      }
      html body #appView #sidebar #nav>.nav-login-root>b,
      html body #appView #sidebar #nav>.nav-settings-root>b,
      html body #appView #sidebar #nav>.nav-group>.nav-group-toggle>.nav-group-icon{
        width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;
        display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important;
        font-size:0!important;line-height:1!important;color:currentColor!important
      }
      html body #appView #sidebar #nav .bamco-top-icon svg{
        width:20px!important;height:20px!important;display:block!important;fill:none!important;stroke:currentColor!important;
        stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important
      }
      html body #appView #sidebar #nav>.nav-group>.nav-group-items{
        padding-right:2.5em!important;
        padding-left:0!important;
      }
      html body #appView #sidebar #nav>.nav-group>.nav-group-items>button{
        display:grid!important;
        grid-template-columns:22px minmax(0,1fr)!important;
        align-items:center!important;
        gap:10px!important;
        direction:rtl!important;
        text-align:right!important;
        justify-items:stretch!important;
        padding-right:0!important;
      }
      html body #appView #sidebar #nav>.nav-group>.nav-group-items>button>span{
        display:block!important;
        width:100%!important;
        direction:rtl!important;
        text-align:right!important;
        justify-self:stretch!important;
      }

      html body #appView #welcomeView.bamco-welcome-view{
        overflow:visible!important;
      }
      html body #appView #welcomeView .bamco-welcome-layout{
        position:relative!important;
        display:block!important;
        width:min(900px,68vw)!important;
        max-width:900px!important;
        margin:0 auto!important;
        overflow:visible!important;
      }
      html body #appView #welcomeView .bamco-welcome-card{
        width:100%!important;
        min-height:270px!important;
        margin:0!important;
      }
      html body #appView #welcomeView .bamco-welcome-sticker{
        position:absolute!important;
        width:min(470px,34vw)!important;
        height:540px!important;
        max-width:none!important;
        bottom:-195px!important;
        z-index:4!important;
        object-fit:contain!important;
        pointer-events:none!important;
      }
      html body #appView #welcomeView .bamco-welcome-sticker-left{
        left:-260px!important;
        right:auto!important;
      }
      html body #appView #welcomeView .bamco-welcome-sticker-right{
        right:-260px!important;
        left:auto!important;
      }
      @media(max-width:1100px){
        html body #appView #welcomeView .bamco-welcome-layout{width:min(720px,65vw)!important}
        html body #appView #welcomeView .bamco-welcome-sticker{width:330px!important;height:400px!important;bottom:-145px!important}
        html body #appView #welcomeView .bamco-welcome-sticker-left{left:-185px!important}
        html body #appView #welcomeView .bamco-welcome-sticker-right{right:-185px!important}
      }

      html body #appView #kanbanView>.table-panel,
      html body #appView #archiveView>.table-panel{
        position:relative!important;margin:18px 0 14px!important;padding:28px 16px 16px!important;
        border:1px solid #b8c8c1!important;border-radius:10px!important;background:#f8faf9!important;overflow:visible!important
      }
      html body #appView #kanbanView .table-panel>.panel-head,
      html body #appView #archiveView .table-panel>.panel-head{
        position:static!important;display:block!important;height:0!important;min-height:0!important;
        margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;flex:0 0 0!important
      }
      html body #appView #kanbanView .table-panel>.panel-head>div:first-child,
      html body #appView #archiveView .table-panel>.panel-head>div:first-child{
        position:absolute!important;top:-15px!important;right:18px!important;z-index:6!important;
        display:block!important;width:auto!important;max-width:calc(100% - 36px)!important;
        margin:0!important;padding:0 10px!important;background:#eef3f0!important;overflow:visible!important
      }
      html body #appView #kanbanView .table-panel>.panel-head h3,
      html body #appView #archiveView .table-panel>.panel-head h3{
        position:static!important;margin:0!important;padding:0!important;color:#145741!important;
        font-size:18px!important;line-height:1.7!important;font-weight:700!important;white-space:nowrap!important;overflow:visible!important
      }
      html body #appView #kanbanView .table-panel>.panel-head small,
      html body #appView #archiveView .table-panel>.panel-head small{display:none!important}

      html body #appView #kanbanView .task-toolbar,
      html body #appView #archiveView .task-toolbar{
        display:flex!important;align-items:center!important;justify-content:flex-start!important;flex-wrap:nowrap!important;
        gap:10px!important;column-gap:10px!important;row-gap:10px!important;margin:0 0 12px!important;padding:0!important;
        overflow-x:auto!important;background:transparent!important;border:0!important
      }
      html body #appView #kanbanView .task-toolbar>*,
      html body #appView #archiveView .task-toolbar>*{margin:0!important}
      html body #appView #kanbanView .task-toolbar button,
      html body #appView #archiveView .task-toolbar button{flex:0 0 auto!important}
      html body #appView #kanbanView .toolbar-search:not(.search-open),
      html body #appView #archiveView .toolbar-search:not(.search-open){display:none!important}
      html body #appView #kanbanView .toolbar-search.search-open,
      html body #appView #archiveView .toolbar-search.search-open{
        display:block!important;flex:0 0 270px!important;width:270px!important;min-width:270px!important;max-width:270px!important;
        opacity:1!important;pointer-events:auto!important
      }
    `;
  }

  function setIcon(el,svg,key){
    if(!el||el.dataset.bamcoTopIcon===key)return;
    el.classList.add('bamco-top-icon');el.innerHTML=svg;el.dataset.bamcoTopIcon=key;
  }

  function polishSidebar(){
    const nav=q('#nav');if(!nav)return;
    qa('.nav-chevron',nav).forEach(x=>x.remove());
    setIcon(q(':scope>.nav-login-root>b',nav),ICONS.login,'login');
    qa(':scope>.nav-group',nav).forEach(g=>{
      const key=g.dataset.group||g.dataset.navGroup||'';
      const icon=q('.nav-group-toggle>.nav-group-icon',g);
      if(key==='tasks')setIcon(icon,ICONS.tasks,'tasks');
      if(key==='people')setIcon(icon,ICONS.people,'people');
      if(key==='messages')setIcon(icon,ICONS.email,'messages');
      if(key==='email')setIcon(icon,ICONS.email,'email');
      if(key==='vehicle')setIcon(icon,ICONS.vehicle,'vehicle');
    });
    setIcon(q(':scope>.nav-settings-root>b',nav),ICONS.settings,'settings');
  }

  function fixWording(){
    const add=q('#addTaskBtn');if(add)add.textContent='＋ افزودن وظیفه';
    for(const el of [q('#taskDialogTitle'),q('#saveTaskBtn')]){
      if(el&&el.textContent.includes('تسک'))el.textContent=el.textContent.replace(/تسک/g,'وظیفه');
    }
    const k=q('#kanbanView .panel-head h3');if(k)k.textContent='وظایف جاری';
    const a=q('#archiveView .panel-head h3');if(a)a.textContent='وظایف آرشیو شده';
    const footer=q('#appFooterCredit');if(footer)footer.textContent='توسعه یافته توسط واحد توسعه و تکوین محصول شرکت خودروسازان بم | شهاب‌الدین تنهائیان و نازنین قائمی';
  }

  function run(){injectStyle();polishSidebar();fixWording()}

  function installObservers(){
    const dialog=q('#taskDialog');if(dialog&&!dialog.dataset.bamcoWordingVerifyV4){
      dialog.dataset.bamcoWordingVerifyV4='1';
      let queued=false;
      new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;fixWording()})}).observe(dialog,{childList:true,subtree:true,characterData:true});
    }
    const nav=q('#nav');if(nav&&!nav.dataset.bamcoSidebarVerifyV4){
      nav.dataset.bamcoSidebarVerifyV4='1';
      let queued=false;
      new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;polishSidebar()})}).observe(nav,{childList:true,subtree:true});
    }
  }

  function boot(){
    run();installObservers();
    run();installObservers();requestAnimationFrame(run);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();



/* module:ux:26 */
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
          <h2>به سامانه یکپارچه مدیریت عملیات خوش آمدید</h2>
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
    if(img.getAttribute('src')!==src)img.src=src;
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
    if(k){if(k.textContent!=='جست‌وجو در وظایف')k.textContent='جست‌وجو در وظایف';k.title='جست‌وجو در وظایف';k.setAttribute('aria-label','جست‌وجو در وظایف')}
    if(a){if(a.textContent!=='جست‌وجو در آرشیو')a.textContent='جست‌وجو در آرشیو';a.title='جست‌وجو در آرشیو';a.setAttribute('aria-label','جست‌وجو در آرشیو')}
    const ki=q('#kanbanSearch'),ai=q('#archiveSearch');
    if(ki)ki.placeholder='جست‌وجو در وظایف…';
    if(ai)ai.placeholder='جست‌وجو در آرشیو…';
  }

  function cleanTaskTable(viewId){
    const view=q(`#${viewId}`);if(!view)return;
    view.querySelectorAll('tbody tr[data-task-id]').forEach(row=>{
      const cells=row.children;
      const offset=cells[0]?.classList.contains('unified-select-cell')?1:0;
      if(cells[offset]){const text=(cells[offset].textContent||'').replace(/^\s*#\s*/,'').trim();if(cells[offset].textContent!==text)cells[offset].textContent=text;}
      if(cells[offset+11]){
        const text=(cells[offset+11].textContent||'').trim();
        if(cells[offset+11].textContent!==text)cells[offset+11].textContent=text;
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
    refreshAll();requestAnimationFrame(refreshAll);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(()=>{
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];
  const STICKER_KEYS=['01_happy_female','01_happy_male','02_reminder_female','02_reminder_male','03_concerned_female','03_concerned_male','04_serious_female','04_serious_male','05_urgent_female','05_urgent_male'];
  const STICKER_MAP={state1:'01_happy',state2:'02_reminder',state3:'03_concerned',state4:'04_serious',state5:'05_urgent'};

  function addWelcomeView(){
    const workspace=q('.workspace');
    if(!workspace||q('#welcomeView'))return;
    workspace.insertAdjacentHTML('beforeend',`
      <section id="welcomeView" class="view hidden">
        <div class="welcome-card">
          <h2>به سامانه مدیریت، پایش و پیگیری امور خوش آمدید</h2>
          <p>لطفاً از منوی سمت راست، بخش موردنظر خود را انتخاب کنید.</p>
        </div>
      </section>`);
  }

  function showWelcome(){
    addWelcomeView();
    qa('.workspace>.view').forEach(v=>v.classList.add('hidden'));
    q('#welcomeView')?.classList.remove('hidden');
    qa('#nav button.active').forEach(b=>b.classList.remove('active'));
    if(typeof state!=='undefined')state.view='welcome';
    const title=q('#viewTitle');if(title)title.textContent='';
    const subtitle=q('#viewSubtitle');if(subtitle)subtitle.textContent='';
    q('#addTaskBtn')?.classList.add('hidden');
    document.body.classList.add('welcome-active');
  }

  function installWelcomeOnLogin(){
    addWelcomeView();
    const app=q('#appView');if(!app)return;
    let welcomed=false;
    const maybeShow=()=>{
      if(welcomed||app.classList.contains('hidden'))return;
      welcomed=true;
      setTimeout(showWelcome,0);
    };
    maybeShow();
    new MutationObserver(maybeShow).observe(app,{attributes:true,attributeFilter:['class']});
    q('#nav')?.addEventListener('click',e=>{
      const b=e.target.closest('button[data-view]');
      if(!b)return;
      document.body.classList.remove('welcome-active');
      q('#welcomeView')?.classList.add('hidden');
    },true);
  }

  function addVehicleViews(){
    const workspace=q('.workspace');
    if(!workspace||q('#vehiclePermanentView'))return;
    workspace.insertAdjacentHTML('beforeend',`
      <section id="vehiclePermanentView" class="view hidden manager-only vehicle-view"><div class="panel"><div class="panel-head"><div><h3>تحویل دائم</h3><small>مدیریت اطلاعات خودروهای تحویل دائم</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل دائم آماده است.</div></div></section>
      <section id="vehicleTemporaryView" class="view hidden manager-only vehicle-view"><div class="panel"><div class="panel-head"><div><h3>تحویل موقت</h3><small>مدیریت اطلاعات خودروهای تحویل موقت</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل موقت آماده است.</div></div></section>`);
  }

  function makeGroup(title,key,views,icon){
    const nav=q('#nav');
    const children=views.map(v=>q(`#nav button[data-view="${v}"]`)).filter(Boolean);
    if(!children.length)return null;
    const group=document.createElement('div');
    group.className='nav-group';group.dataset.group=key;
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='nav-group-toggle';toggle.title=title;toggle.setAttribute('aria-label',title);
    toggle.innerHTML=`<b class="nav-group-icon">${icon}</b><span>${title}</span><b class="nav-chevron">⌄</b>`;
    const items=document.createElement('div');items.className='nav-group-items';children.forEach(b=>items.appendChild(b));
    group.append(toggle,items);nav.appendChild(group);
    toggle.addEventListener('click',()=>{
      const sidebar=q('#sidebar');
      if(sidebar?.classList.contains('collapsed')){
        sidebar.classList.remove('collapsed');
        group.classList.remove('collapsed-group');
        return;
      }
      group.classList.toggle('collapsed-group');
    });
    return group;
  }

  function installGroupedNav(){
    const nav=q('#nav');if(!nav||nav.dataset.grouped==='1')return;
    nav.dataset.grouped='1';addVehicleViews();
    const settings=q('#nav button[data-view="settings"]');
    if(settings){
      settings.classList.add('nav-settings-root');
      settings.title='تنظیمات';
      if(!settings.querySelector('b'))settings.insertAdjacentHTML('afterbegin','<b>⚙</b>');
    }
    const permanent=document.createElement('button');permanent.dataset.view='vehiclePermanent';permanent.className='manager-only';permanent.innerHTML='<b>▣</b><span>تحویل دائم</span>';
    const temporary=document.createElement('button');temporary.dataset.view='vehicleTemporary';temporary.className='manager-only';temporary.innerHTML='<b>▤</b><span>تحویل موقت</span>';
    nav.append(permanent,temporary);qa('#nav>.nav-divider').forEach(x=>x.remove());

    const task=makeGroup('مدیریت وظایف','tasks',['kanban','archive','dashboard','approvals'],'☑');
    const email=makeGroup('مدیریت ایمیل','email',['people','send','templates','stickers','followup'],'✉');
    const vehicle=makeGroup('مدیریت خودرو','vehicle',['vehiclePermanent','vehicleTemporary'],'◇');
    if(settings)nav.appendChild(settings);

    const refreshVisibility=()=>[task,email,vehicle].forEach(g=>{
      if(!g)return;
      const visible=[...g.querySelectorAll('.nav-group-items>button')].some(b=>!b.classList.contains('hidden'));
      g.classList.toggle('hidden',!visible);
    });
    refreshVisibility();
    new MutationObserver(refreshVisibility).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});

    [permanent,temporary].forEach(b=>b.addEventListener('click',()=>{
      document.body.classList.remove('welcome-active');q('#welcomeView')?.classList.add('hidden');
      if(typeof showView==='function')showView(b.dataset.view);
      const h=q('#viewTitle');if(h)h.textContent=b.dataset.view==='vehiclePermanent'?'تحویل دائم':'تحویل موقت';
    }));
  }

  function installCollapseButton(){
    const btn=q('#collapseBtn'),account=q('#sidebar .account');
    if(!btn||!account)return;
    btn.textContent='';btn.title='باز و بسته کردن منو';btn.setAttribute('aria-label','باز و بسته کردن منو');
    account.appendChild(btn);
  }

  function installTaskTools(){
    const add=q('#addTaskBtn'),kanbanToolbar=q('#kanbanView .task-toolbar');
    if(add&&kanbanToolbar){add.textContent='＋ افزودن وظیفه';kanbanToolbar.prepend(add)}
    const configs=[['kanban','#kanbanSearch'],['archive','#archiveSearch']];
    configs.forEach(([scope,searchSel])=>{
      const toolbar=q(`#${scope}View .task-toolbar`),input=q(searchSel);
      if(!toolbar||!input||toolbar.querySelector('.task-search-toggle'))return;
      const toggle=document.createElement('button');
      toggle.type='button';toggle.className='ghost task-search-toggle';toggle.textContent='⌕';toggle.title='جست‌وجو';toggle.setAttribute('aria-label','باز کردن جست‌وجو');
      input.classList.add('toolbar-search');
      toolbar.insertBefore(toggle,toolbar.firstChild?.nextSibling||null);
      toolbar.insertBefore(input,toggle.nextSibling);
      toggle.addEventListener('click',()=>{
        const open=input.classList.toggle('search-open');
        toggle.classList.toggle('active',open);
        if(open)setTimeout(()=>input.focus(),20);
      });
      input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.classList.remove('search-open');toggle.classList.remove('active');input.blur()}});
    });
  }

  function markSelectionColumns(){
    ['kanbanView','archiveView'].forEach(id=>{
      const view=q(`#${id}`);if(!view)return;
      const top=[...view.querySelectorAll('thead>tr:first-child>th')];
      const idx=top.findIndex(th=>th.textContent.trim()==='انتخاب');
      if(idx>=0){
        top[idx].classList.add('task-select-column');
        view.querySelector('.column-filters')?.children[idx]?.classList.add('task-select-column');
      }
      view.querySelectorAll('td').forEach(td=>{if(td.querySelector('.task-pick'))td.classList.add('task-select-column')});
    });
  }

  function markTaskRows(){
    const tasks=typeof state!=='undefined'&&Array.isArray(state.tasks)?state.tasks:[];
    const byId=new Map(tasks.map(t=>[String(t.id),t]));
    [q('#kanbanBody'),q('#archiveBody')].filter(Boolean).forEach(body=>body.querySelectorAll('tr[data-task-id]').forEach(row=>{
      row.classList.remove('row-overdue','row-warning','row-waiting','row-registered','row-normal');
      const t=byId.get(String(row.dataset.taskId));if(!t)return;
      const due=String(t.due_state||'').trim(),status=String(t.status||'').trim();
      if(status==='منتظر پاسخ')row.classList.add('row-waiting');
      else if(due==='دیرکرد')row.classList.add('row-overdue');
      else if(due.includes('هشدار'))row.classList.add('row-warning');
      else row.classList.add('row-normal');
    }));
  }

  function installTaskOrder(){
    if(typeof renderTasks!=='function'||renderTasks.__ascendingWrapped)return;
    const original=renderTasks;
    const wrapped=function(archived){
      if(typeof state!=='undefined'&&Array.isArray(state.tasks))state.tasks.sort((a,b)=>Number(typeof displayId==='function'?displayId(a):(a.legacy_id||a.id||0))-Number(typeof displayId==='function'?displayId(b):(b.legacy_id||b.id||0)));
      const out=original(archived);
      requestAnimationFrame(()=>{markSelectionColumns();markTaskRows()});
      return out;
    };
    wrapped.__ascendingWrapped=true;window.renderTasks=wrapped;
    try{wrapped(false);wrapped(true)}catch{}
    [q('#kanbanBody'),q('#archiveBody')].filter(Boolean).forEach(body=>new MutationObserver(()=>requestAnimationFrame(()=>{markSelectionColumns();markTaskRows()})).observe(body,{childList:true,subtree:true}));
  }

  function removeSubtitle(){const p=q('#viewSubtitle');if(p){p.textContent='';p.style.display='none'}}

  const appendScript=src=>new Promise(resolve=>{
    const s=document.createElement('script');s.src=src;s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.body.appendChild(s);
  });
  const imageWorks=src=>new Promise(resolve=>{
    if(!src)return resolve(false);
    const img=new Image();let done=false;
    const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v)};
    const timer=setTimeout(()=>finish(false),3500);
    img.onload=()=>finish(img.naturalWidth>10&&img.naturalHeight>10);img.onerror=()=>finish(false);img.src=src;
  });

  async function loadStickerAssets(){
    /* Keep the existing small-pack candidates, then build and validate a second full-pack candidate set. */
    window.BAMCO_DESKTOP_ASSETS=window.BAMCO_DESKTOP_ASSETS||{};
    const smallCandidates={...window.BAMCO_DESKTOP_ASSETS};

    window.BAMCO_STICKER_PACK='';
    await appendScript('sticker-pack-01.js?v=20260906-verified4');
    await appendScript('sticker-pack-02.js?v=20260906-verified4');
    await appendScript('sticker-pack-loader.js?v=20260906-verified4');
    const fullCandidates={...window.BAMCO_DESKTOP_ASSETS};

    const beforeExact={...window.BAMCO_DESKTOP_ASSETS};
    const exact=['01_happy_female.js','01_happy_male.js','02_reminder_female.js','02_reminder_male.js','03_concerned_female.js','03-04-pair.js'];
    for(const name of exact)await appendScript(`sticker-assets-exact/${name}?v=20260906-verified4`);
    const afterExact={...window.BAMCO_DESKTOP_ASSETS};

    let valid=0;
    for(const key of STICKER_KEYS){
      const exactCandidate=afterExact[key]!==beforeExact[key]?afterExact[key]:'';
      const candidates=[exactCandidate,fullCandidates[key],smallCandidates[key],afterExact[key]].filter((x,i,a)=>x&&a.indexOf(x)===i);
      let chosen='';
      for(const src of candidates){if(await imageWorks(src)){chosen=src;break}}
      if(chosen){window.BAMCO_DESKTOP_ASSETS[key]=chosen;valid++}
    }
    window.BAMCO_STICKER_ASSET_COUNT=valid;
    window.dispatchEvent(new CustomEvent('bamco-stickers-ready',{detail:{count:valid}}));
    repairStickerPreview(true);
  }

  function defaultStickerSrc(){
    const stateKey=q('#desktopStickerState')?.value||'state1';
    const gender=q('input[name="desktopStickerGender"]:checked')?.value||'female';
    return window.BAMCO_DESKTOP_ASSETS?.[`${STICKER_MAP[stateKey]}_${gender}`]||'';
  }

  function selectedEngineeringSet(){
    const select=q('#desktopStickerSet');
    const text=select?.selectedOptions?.[0]?.textContent||'';
    return text.includes('واحد مهندسی محصول');
  }

  function repairStickerPreview(forceEngineering=false){
    const img=q('#desktopStickerPreview');if(!img)return;
    const fallback=defaultStickerSrc();if(!fallback)return;
    if(img.dataset.repairBound!=='1'){
      img.dataset.repairBound='1';
      img.addEventListener('error',()=>{const src=defaultStickerSrc();if(src&&img.src!==src)img.src=src});
    }
    const broken=img.complete&&img.naturalWidth===0;
    if(broken||(forceEngineering&&selectedEngineeringSet())||!img.getAttribute('src'))img.src=fallback;
  }

  function installStickerRepair(){
    const view=q('#stickersView');if(!view)return;
    new MutationObserver(()=>setTimeout(()=>repairStickerPreview(true),60)).observe(view,{childList:true,subtree:true});
    q('#nav')?.addEventListener('click',e=>{
      if(e.target.closest('button[data-view="stickers"]')){
        setTimeout(()=>repairStickerPreview(true),150);
        setTimeout(()=>repairStickerPreview(true),700);
      }
    });
    document.addEventListener('change',e=>{
      if(e.target.matches?.('#desktopStickerState,input[name="desktopStickerGender"],#desktopStickerSet'))setTimeout(()=>repairStickerPreview(selectedEngineeringSet()),180);
    },true);
  }

  function installSidebarHoverScroll(){
    const nav=q('#sidebar nav');if(!nav||nav.dataset.hoverScroll==='1')return;
    nav.dataset.hoverScroll='1';let speed=0,raf=0;
    const tick=()=>{if(!speed){raf=0;return}nav.scrollTop+=speed;raf=requestAnimationFrame(tick)};
    const setSpeed=e=>{const r=nav.getBoundingClientRect();if(!r.height){speed=0;return}const y=(e.clientY-r.top)/r.height,edge=.2,max=5;if(y<edge)speed=-Math.max(1,Math.round((edge-y)/edge*max));else if(y>1-edge)speed=Math.max(1,Math.round((y-(1-edge))/edge*max));else speed=0;if(speed&&!raf)raf=requestAnimationFrame(tick)};
    nav.addEventListener('mousemove',setSpeed,{passive:true});nav.addEventListener('mouseenter',setSpeed,{passive:true});nav.addEventListener('mouseleave',()=>{speed=0},{passive:true});
  }

  const boot=()=>{
    installGroupedNav();
    installCollapseButton();
    installTaskTools();
    installTaskOrder();
    markSelectionColumns();
    markTaskRows();
    removeSubtitle();
    installWelcomeOnLogin();
    installStickerRepair();
    installSidebarHoverScroll();
    loadStickerAssets().catch(console.error);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

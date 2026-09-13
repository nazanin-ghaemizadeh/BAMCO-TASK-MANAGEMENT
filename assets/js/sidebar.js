(()=>{
  'use strict';
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  function installHeaderStyles(){
    if(q('#bamcoVerticalSidebarStyles'))return;
    const link=document.createElement('link');
    link.id='bamcoVerticalSidebarStyles';
    link.rel='stylesheet';
    link.href='assets/css/vertical-sidebar.css?v=mobile-actions-20260913-1';
    document.head.appendChild(link);
  }

  function clearEditorOverrides(){
    document.documentElement.classList.remove('bve-design-access','bamco-visual-editing');
    try{localStorage.removeItem('bamco.visual.layout.v1');localStorage.removeItem('bamco.visual.layout.v2')}catch{}
    q('#bamcoVisualEditor')?.remove();
    q('#bamcoVisualEditorStyles')?.remove();
    q('#bamcoVisualEditorScript')?.remove();
    qa('script[data-bamco-layout-editor],link[data-bamco-layout-editor]').forEach(x=>x.remove());
    const sels=['.side-brand img','.header-system-title','.header-tools','.header-tools .account','.header-tools .account .avatar','.header-tools .account-copy strong','.header-tools .account-copy small','#logoutBtn','#notificationBell','#headerSettingsBtn','#nav','.nav-group','.nav-group-toggle','.nav-group-items'];
    qa(sels.join(',')).forEach(el=>{
      ['translate','transform','z-index','position','width','height','font-size','text-align','padding','margin'].forEach(p=>el.style.removeProperty(p));
      delete el.dataset.bveX;delete el.dataset.bveY;
    });
  }

  function blockProductionEditor(){
    const remove=()=>{q('#bamcoVisualEditor')?.remove();q('#bamcoVisualPanel')?.remove();document.documentElement.classList.remove('bve-design-access','bamco-visual-editing')};
    remove();new MutationObserver(remove).observe(document.documentElement,{childList:true,subtree:true});
  }

  function addVehicleViews(){
    const workspace=q('.workspace');
    if(!workspace||q('#vehiclePermanentView'))return;
    workspace.insertAdjacentHTML('beforeend',`
      <section id="vehiclePermanentView" class="view hidden manager-only vehicle-view"><div class="panel"><div class="panel-head"><div><h3>تحویل دائم</h3><small>مدیریت اطلاعات خودروهای تحویل دائم</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل دائم آماده است.</div></div></section>
      <section id="vehicleTemporaryView" class="view hidden manager-only vehicle-view"><div class="panel"><div class="panel-head"><div><h3>تحویل موقت</h3><small>مدیریت اطلاعات خودروهای تحویل موقت</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل موقت آماده است.</div></div></section>`);
  }

  function closeAllGroups(except=null){
    qa('#nav .nav-group.open').forEach(g=>{if(g!==except){g.classList.remove('open');g.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded','false')}});
  }

  function positionDropdown(group){
    const items=group?.querySelector('.nav-group-items');
    if(!items)return;
    items.style.removeProperty('left');items.style.removeProperty('top');
  }

  function makeGroup(title,key,views,icon){
    const nav=q('#nav');
    const children=views.map(v=>q(`#nav button[data-view="${v}"]`)).filter(Boolean);
    if(!children.length)return null;
    const group=document.createElement('div');group.className='nav-group';group.dataset.group=key;
    const toggle=document.createElement('button');toggle.type='button';toggle.className='nav-group-toggle';toggle.title=title;toggle.setAttribute('aria-label',title);toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML=`<b class="nav-group-icon">${icon}</b><span>${title}</span><b class="nav-chevron">⌄</b>`;
    const items=document.createElement('div');items.className='nav-group-items';children.forEach(b=>items.appendChild(b));
    group.append(toggle,items);nav.appendChild(group);
    toggle.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      const willOpen=!group.classList.contains('open');
      closeAllGroups(group);
      group.classList.toggle('open',willOpen);
      toggle.setAttribute('aria-expanded',willOpen?'true':'false');
      if(willOpen)positionDropdown(group);
    });
    items.addEventListener('click',e=>{const btn=e.target.closest('button[data-view]');if(btn){group.classList.remove('open');toggle.setAttribute('aria-expanded','false')}});
    return group;
  }

  function installGroupedNav(){
    const nav=q('#nav');if(!nav||nav.dataset.grouped==='1')return;
    nav.dataset.grouped='1';addVehicleViews();
    const sidebar=q('#sidebar'),brand=q('.side-brand'),systemTitle=brand?.querySelector('strong');
    if(sidebar&&systemTitle&&!systemTitle.classList.contains('header-system-title')){systemTitle.classList.add('header-system-title');sidebar.appendChild(systemTitle)}
    const settings=q('#nav button[data-view="settings"]');
    if(settings){settings.classList.add('nav-settings-root');settings.title='تنظیمات';if(!settings.querySelector('b'))settings.insertAdjacentHTML('afterbegin','<b>⚙</b>')}
    const permanent=document.createElement('button');permanent.dataset.view='vehiclePermanent';permanent.className='manager-only';permanent.innerHTML='<b>▣</b><span>تحویل دائم</span>';
    const temporary=document.createElement('button');temporary.dataset.view='vehicleTemporary';temporary.className='manager-only';temporary.innerHTML='<b>▤</b><span>تحویل موقت</span>';
    nav.append(permanent,temporary);qa('#nav>.nav-divider').forEach(x=>x.remove());
    const task=makeGroup('مدیریت وظایف','tasks',['kanban','archive','taskTimeline','approvals','requestHistory','approvalChains'],'☑');
    const people=makeGroup('مدیریت افراد','people',['people'],'♙');
    const email=makeGroup('مدیریت پیام','messages',['messageCenter','sentMessages','messages','templates','stickers'],'✉');
    const vehicle=makeGroup('مدیریت خودرو','vehicle',['vehiclePermanent','vehicleTemporary'],'◇');
    const reports=makeGroup('گزارش‌ها','reports',['dashboard'],'▦');
    const configuration=makeGroup('تنظیمات','configuration',['systemOptions'],'⚙');
    const resources=makeGroup('منابع و دسترسی‌ها','resources',['documents','letters','sitesAccess'],'▧');
    if(settings)nav.appendChild(settings);
    const groups=[task,email,people,vehicle,reports,configuration,resources];
    const refreshVisibility=()=>groups.forEach(g=>{
      if(!g)return;
      const visible=[...g.querySelectorAll('.nav-group-items>button')].some(b=>!b.classList.contains('hidden'));
      if(g.classList.contains('hidden')===visible)g.classList.toggle('hidden',!visible);
    });
    refreshVisibility();
    new MutationObserver(refreshVisibility).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});

    [permanent,temporary].forEach(b=>b.addEventListener('click',()=>{
      closeAllGroups();
      document.body.classList.remove('welcome-active');q('#welcomeView')?.classList.add('hidden');
      if(typeof showView==='function')showView(b.dataset.view);
      const h=q('#viewTitle');if(h)h.textContent=b.dataset.view==='vehiclePermanent'?'تحویل دائم':'تحویل موقت';
    }));
    document.addEventListener('click',e=>{if(!e.target.closest('#nav .nav-group'))closeAllGroups()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAllGroups()});
    window.addEventListener('resize',()=>qa('#nav .nav-group.open').forEach(positionDropdown));
  }

  function installHeaderTools(){
    const sidebar=q('#sidebar');if(!sidebar||q('.header-tools'))return;
    const tools=document.createElement('div');tools.className='header-tools';tools.setAttribute('aria-label','ابزارهای کاربری');
    const account=q('.account');if(account)tools.appendChild(account);
    const bell=document.createElement('button');bell.type='button';bell.id='notificationBell';bell.className='header-tool-btn header-notification-bell';bell.title='پیام‌های من';bell.setAttribute('aria-label','پیام‌ها');bell.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg><span class="header-notification-count" aria-hidden="true"></span>`;
    const settingsProxy=document.createElement('button');settingsProxy.type='button';settingsProxy.id='headerSettingsBtn';settingsProxy.className='header-tool-btn header-settings-btn';settingsProxy.title='تنظیمات';settingsProxy.setAttribute('aria-label','تنظیمات');settingsProxy.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.02 15a1.7 1.7 0 0 0-1.56-1.03H5.4v-3h.06A1.7 1.7 0 0 0 7.02 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.68 5.34a1.7 1.7 0 0 0 1.03-1.56V3.7h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03h.06v3h-.06A1.7 1.7 0 0 0 19.4 15Z"></path></svg>`;
    tools.append(bell,settingsProxy);sidebar.appendChild(tools);

    const logout=q('#logoutBtn');
    if(logout){logout.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"></path><path d="M14 8l4 4-4 4"></path><path d="M18 12H9"></path></svg>`;logout.title='خروج';logout.setAttribute('aria-label','خروج');tools.appendChild(logout)}

    const syncBell=()=>{const badge=q('#messageBadge'),count=bell.querySelector('.header-notification-count'),value=(badge?.textContent||'').trim();count.textContent=value;bell.classList.toggle('has-unread',!!value);bell.setAttribute('aria-label',value?`پیام‌ها، ${value} پیام خوانده‌نشده`:'پیام‌ها')};
    const bindMessageBadge=()=>{const badge=q('#messageBadge');if(!badge||badge.dataset.headerBellBound==='1')return false;badge.dataset.headerBellBound='1';new MutationObserver(syncBell).observe(badge,{childList:true,characterData:true,subtree:true,attributes:true});syncBell();return true};
    if(!bindMessageBadge()){const nav=q('#nav');if(nav){const observer=new MutationObserver(()=>{if(bindMessageBadge())observer.disconnect()});observer.observe(nav,{childList:true,subtree:true})}}
    bell.addEventListener('click',()=>{closeAllGroups();const source=q('#nav button[data-view="messages"]');if(source)source.click();else if(typeof showView==='function')showView('messages')});
    settingsProxy.addEventListener('click',()=>{closeAllGroups();const source=q('#nav button[data-view="settings"]');if(source)source.click();else if(typeof showView==='function')showView('settings')});
  }

  function installCollapseButton(){
    const btn=q('#collapseBtn'),sidebar=q('#sidebar');if(!btn||!sidebar)return;
    btn.hidden=false;btn.removeAttribute('aria-hidden');btn.innerHTML='‹';
    const sync=()=>{const closed=sidebar.classList.contains('collapsed');btn.innerHTML=closed?'›':'‹';btn.setAttribute('aria-label',closed?'باز کردن منو':'بستن منو');btn.title=closed?'باز کردن منو':'بستن منو'};
    btn.addEventListener('click',()=>requestAnimationFrame(sync));sync();
  }
  function installTaskTools(){
    const add=q('#addTaskBtn'),kanbanToolbar=q('#kanbanView .task-toolbar');if(add&&kanbanToolbar&&!kanbanToolbar.contains(add)){add.textContent='＋ افزودن وظیفه';kanbanToolbar.prepend(add)}
    [['kanban','#kanbanSearch'],['archive','#archiveSearch']].forEach(([scope,searchSel])=>{const toolbar=q(`#${scope}View .task-toolbar`),input=q(searchSel);if(!toolbar||!input||toolbar.querySelector('.task-search-toggle'))return;const toggle=document.createElement('button');toggle.type='button';toggle.className='ghost task-search-toggle';toggle.textContent='⌕';toggle.title='جست‌وجو';toggle.setAttribute('aria-label','باز کردن جست‌وجو');input.classList.add('toolbar-search');toolbar.insertBefore(toggle,toolbar.firstChild?.nextSibling||null);toolbar.insertBefore(input,toggle.nextSibling);toggle.addEventListener('click',()=>{const open=input.classList.toggle('search-open');toggle.classList.toggle('active',open);if(open)setTimeout(()=>input.focus(),20)});input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.classList.remove('search-open');toggle.classList.remove('active');input.blur()}})});
  }
  function removeSubtitle(){const p=q('#viewSubtitle');if(p){p.textContent='';p.style.display='none'}}
  function forceNormalScale(){document.documentElement.style.setProperty('zoom','1');document.body.style.setProperty('zoom','1')}

  const boot=()=>{forceNormalScale();blockProductionEditor();installHeaderStyles();clearEditorOverrides();installGroupedNav();installHeaderTools();installCollapseButton();installTaskTools();removeSubtitle();requestAnimationFrame(clearEditorOverrides)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(()=>{
  const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
  const faToEn=s=>Number(String(s||'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^0-9.-]/g,''))||0;

  function makeGroup(title,key,buttons,managerOnly=false){
    const group=document.createElement('div');
    group.className=`nav-group${key==='tasks'?' open':''}${managerOnly?' manager-only':''}`;
    group.dataset.navGroup=key;
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='nav-group-toggle';
    toggle.innerHTML=`<span class="nav-group-label">${title}</span><span class="nav-group-chevron">⌄</span>`;
    const wrap=document.createElement('div');wrap.className='nav-group-items';
    const inner=document.createElement('div');inner.className='nav-group-items-inner';
    buttons.filter(Boolean).forEach(b=>inner.appendChild(b));
    wrap.appendChild(inner);group.append(toggle,wrap);
    toggle.addEventListener('click',()=>{
      const open=!group.classList.contains('open');
      qsa('#nav .nav-group').forEach(g=>g.classList.remove('open'));
      if(open)group.classList.add('open');
    });
    return group;
  }

  function labelButton(button,label){
    const span=button?.querySelector('span');if(span)span.textContent=label;
  }

  function ensureVehicleViews(){
    const workspace=qs('.workspace');if(!workspace)return;
    if(!qs('#vehiclePermanentView'))workspace.insertAdjacentHTML('beforeend',`
      <section id="vehiclePermanentView" class="view hidden manager-only">
        <div class="vehicle-placeholder"><div class="vehicle-placeholder-inner"><h3>تحویل دائم خودرو</h3><p>این بخش برای فرآیند تحویل دائم خودرو در نظر گرفته شده است. ساختار اطلاعات و گردش کار این ماژول می‌تواند مستقل از مدیریت وظایف و ایمیل توسعه داده شود.</p></div></div>
      </section>`);
    if(!qs('#vehicleTemporaryView'))workspace.insertAdjacentHTML('beforeend',`
      <section id="vehicleTemporaryView" class="view hidden manager-only">
        <div class="vehicle-placeholder"><div class="vehicle-placeholder-inner"><h3>تحویل موقت خودرو</h3><p>این بخش برای فرآیند تحویل موقت خودرو در نظر گرفته شده است. ساختار اطلاعات و گردش کار این ماژول می‌تواند مستقل از مدیریت وظایف و ایمیل توسعه داده شود.</p></div></div>
      </section>`);
  }

  function showCustomVehicle(view,title){
    if(typeof isManager==='function'&&!isManager())return;
    if(typeof state!=='undefined')state.view=view;
    qsa('.view').forEach(v=>v.classList.add('hidden'));
    qs(`#${view}View`)?.classList.remove('hidden');
    qsa('#nav button').forEach(b=>b.classList.remove('active'));
    qs(`#nav [data-custom-view="${view}"]`)?.classList.add('active');
    if(qs('#viewTitle'))qs('#viewTitle').textContent=title;
    if(qs('#viewSubtitle'))qs('#viewSubtitle').textContent='';
    qs('#addTaskBtn')?.classList.add('hidden');
  }

  function buildNavigation(){
    const nav=qs('#nav');if(!nav||nav.dataset.grouped==='1')return;
    nav.dataset.grouped='1';
    qsa('#nav .nav-divider').forEach(x=>x.remove());

    const get=v=>nav.querySelector(`button[data-view="${v}"]`);
    const tasks=[get('kanban'),get('archive'),get('dashboard'),get('approvals')];
    const email=[get('people'),get('send'),get('templates'),get('stickers'),get('followup')];
    const settings=get('settings');
    labelButton(get('templates'),'متن ایمیل');
    labelButton(get('stickers'),'استیکر');
    labelButton(get('followup'),'پیگیری پاسخ');

    nav.innerHTML='';
    nav.appendChild(makeGroup('مدیریت وظایف','tasks',tasks,false));
    nav.appendChild(makeGroup('مدیریت ایمیل','email',email,true));

    const carPermanent=document.createElement('button');
    carPermanent.type='button';carPermanent.className='manager-only';carPermanent.dataset.customView='vehiclePermanent';carPermanent.innerHTML='<b>▣</b><span>تحویل دائم</span>';
    const carTemporary=document.createElement('button');
    carTemporary.type='button';carTemporary.className='manager-only';carTemporary.dataset.customView='vehicleTemporary';carTemporary.innerHTML='<b>▤</b><span>تحویل موقت</span>';
    nav.appendChild(makeGroup('مدیریت خودرو','vehicle',[carPermanent,carTemporary],true));

    if(settings){settings.classList.add('nav-settings-direct');labelButton(settings,'تنظیمات');nav.appendChild(settings)}

    carPermanent.addEventListener('click',()=>showCustomVehicle('vehiclePermanent','تحویل دائم خودرو'));
    carTemporary.addEventListener('click',()=>showCustomVehicle('vehicleTemporary','تحویل موقت خودرو'));

    // Preserve role visibility after moving nodes into groups.
    if(typeof isManager==='function')qsa('.manager-only').forEach(x=>x.classList.toggle('hidden',!isManager()));

    // Open the group that owns the active page.
    const syncOpen=()=>{
      const active=nav.querySelector('button.active');
      if(!active)return;
      const group=active.closest('.nav-group');
      if(group){qsa('#nav .nav-group').forEach(g=>g.classList.remove('open'));group.classList.add('open')}
    };
    nav.addEventListener('click',e=>{if(e.target.closest('.nav-group-items button,.nav-settings-direct'))setTimeout(syncOpen,0)});
    new MutationObserver(syncOpen).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    syncOpen();
  }

  function hideSelectionColumn(view){
    const table=qs(`#${view}View .table-wrap table`);if(!table)return;
    const headers=[...table.querySelectorAll('thead tr:first-child th')];
    const idx=headers.findIndex(th=>th.textContent.trim()==='انتخاب');
    if(idx<0)return;
    headers[idx].classList.add('hidden-pick-col');
    const filterRow=table.querySelector('thead .column-filters');
    if(filterRow?.children[idx])filterRow.children[idx].classList.add('hidden-pick-col');
    table.querySelectorAll('tbody tr').forEach(tr=>tr.children[idx]?.classList.add('hidden-pick-col'));
  }

  function justifyColumns(view){
    const table=qs(`#${view}View .table-wrap table`);if(!table)return;
    const headers=[...table.querySelectorAll('thead tr:first-child th')];
    const indices=headers.map((th,i)=>({i,t:th.textContent.trim()})).filter(x=>x.t==='توضیحات'||x.t==='توضیحات مدیر').map(x=>x.i);
    table.querySelectorAll('tbody tr').forEach(tr=>indices.forEach(i=>tr.children[i]?.classList.add('justify-cell')));
  }

  function sortTaskRows(view){
    const body=qs(`#${view}Body`);if(!body)return;
    const rows=[...body.querySelectorAll('tr[data-task-id]')];
    if(rows.length<2)return;
    const table=body.closest('table');
    const headers=[...table.querySelectorAll('thead tr:first-child th')];
    const idIdx=headers.findIndex(th=>th.textContent.trim()==='شناسه');
    if(idIdx<0)return;
    rows.sort((a,b)=>faToEn(a.children[idIdx]?.textContent)-faToEn(b.children[idIdx]?.textContent));
    rows.forEach(r=>body.appendChild(r));
  }

  function normalizeTaskTables(){
    for(const view of ['kanban','archive']){
      hideSelectionColumn(view);justifyColumns(view);sortTaskRows(view);
    }
  }

  function watchTaskTables(){
    let queued=false;
    const run=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;normalizeTaskTables()})};
    for(const id of ['kanbanBody','archiveBody']){const el=qs(`#${id}`);if(el)new MutationObserver(run).observe(el,{childList:true,subtree:true})}
    run();
  }

  function ensureFooter(){
    const app=qs('#appView');if(!app)return;
    let footer=qs('#appFooterCredit');
    if(!footer){footer=document.createElement('footer');footer.id='appFooterCredit';footer.className='app-footer-credit';app.appendChild(footer)}
    footer.textContent='توسعه یافته توسط واحد مهندسی محصول شرکت خودروسازان بم | شهاب‌الدین تنهائیان و نازنین قائمی';
  }

  function boot(){ensureVehicleViews();buildNavigation();watchTaskTables();ensureFooter()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

(()=>{
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  function addVehicleViews(){
    const workspace=q('.workspace');
    if(!workspace||q('#vehiclePermanentView'))return;
    workspace.insertAdjacentHTML('beforeend',`
      <section id="vehiclePermanentView" class="view hidden manager-only vehicle-view">
        <div class="panel"><div class="panel-head"><div><h3>تحویل دائم</h3><small>مدیریت اطلاعات خودروهای تحویل دائم</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل دائم آماده است.</div></div>
      </section>
      <section id="vehicleTemporaryView" class="view hidden manager-only vehicle-view">
        <div class="panel"><div class="panel-head"><div><h3>تحویل موقت</h3><small>مدیریت اطلاعات خودروهای تحویل موقت</small></div></div><div class="empty vehicle-empty">این بخش برای ثبت و مدیریت اطلاعات تحویل موقت آماده است.</div></div>
      </section>`);
  }

  function makeGroup(title,key,views){
    const nav=q('#nav');
    const children=views.map(v=>q(`#nav button[data-view="${v}"]`)).filter(Boolean);
    if(!children.length)return null;
    const group=document.createElement('div');
    group.className='nav-group';
    group.dataset.group=key;
    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='nav-group-toggle';
    toggle.innerHTML=`<span>${title}</span><b class="nav-chevron">⌄</b>`;
    const items=document.createElement('div');
    items.className='nav-group-items';
    children.forEach(b=>items.appendChild(b));
    group.append(toggle,items);
    nav.appendChild(group);
    toggle.addEventListener('click',()=>group.classList.toggle('collapsed-group'));
    return group;
  }

  function installGroupedNav(){
    const nav=q('#nav');
    if(!nav||nav.dataset.grouped==='1')return;
    nav.dataset.grouped='1';
    addVehicleViews();

    const settings=q('#nav button[data-view="settings"]');
    const vehiclePermanent=document.createElement('button');
    vehiclePermanent.dataset.view='vehiclePermanent';
    vehiclePermanent.className='manager-only';
    vehiclePermanent.innerHTML='<b>▣</b><span>تحویل دائم</span>';
    const vehicleTemporary=document.createElement('button');
    vehicleTemporary.dataset.view='vehicleTemporary';
    vehicleTemporary.className='manager-only';
    vehicleTemporary.innerHTML='<b>▤</b><span>تحویل موقت</span>';
    nav.append(vehiclePermanent,vehicleTemporary);

    qa('#nav>.nav-divider').forEach(x=>x.remove());
    const task=makeGroup('مدیریت وظایف','tasks',['kanban','archive','dashboard','approvals']);
    const email=makeGroup('مدیریت ایمیل','email',['people','send','templates','stickers','followup']);
    const vehicle=makeGroup('مدیریت خودرو','vehicle',['vehiclePermanent','vehicleTemporary']);
    if(settings){settings.classList.add('nav-settings-root');nav.appendChild(settings)}

    const refreshVisibility=()=>{
      [task,email,vehicle].forEach(g=>{
        if(!g)return;
        const visible=[...g.querySelectorAll('.nav-group-items>button')].some(b=>!b.classList.contains('hidden'));
        g.classList.toggle('hidden',!visible);
      });
    };
    refreshVisibility();
    new MutationObserver(refreshVisibility).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});

    [vehiclePermanent,vehicleTemporary].forEach(b=>b.addEventListener('click',()=>{
      if(typeof showView==='function')showView(b.dataset.view);
      const h=q('#viewTitle');if(h)h.textContent=b.dataset.view==='vehiclePermanent'?'تحویل دائم':'تحویل موقت';
    }));
  }

  function installTaskOrder(){
    if(typeof renderTasks!=='function'||renderTasks.__ascendingWrapped)return;
    const original=renderTasks;
    const wrapped=function(archived){
      if(typeof state!=='undefined'&&Array.isArray(state.tasks)){
        state.tasks.sort((a,b)=>{
          const av=Number(typeof displayId==='function'?displayId(a):(a.legacy_id||a.id||0));
          const bv=Number(typeof displayId==='function'?displayId(b):(b.legacy_id||b.id||0));
          return av-bv;
        });
      }
      const out=original(archived);
      requestAnimationFrame(markSelectionColumns);
      return out;
    };
    wrapped.__ascendingWrapped=true;
    window.renderTasks=wrapped;
    try{wrapped(false);wrapped(true)}catch{}
  }

  function markSelectionColumns(){
    ['kanbanView','archiveView'].forEach(id=>{
      const view=q(`#${id}`);if(!view)return;
      const top=[...view.querySelectorAll('thead>tr:first-child>th')];
      const idx=top.findIndex(th=>th.textContent.trim()==='انتخاب');
      if(idx>=0){
        top[idx].classList.add('task-select-column');
        const filter=view.querySelector('.column-filters');
        filter?.children[idx]?.classList.add('task-select-column');
      }
      view.querySelectorAll('td').forEach(td=>{if(td.querySelector('.task-pick'))td.classList.add('task-select-column')});
    });
  }

  function installCollapseLabel(){
    const btn=q('#collapseBtn');
    if(btn){btn.textContent='';btn.setAttribute('aria-label','باز و بسته کردن منو')}
  }

  function loadExactStickerOverrides(){
    const scripts=[
      'sticker-assets-exact/01_happy_female.js',
      'sticker-assets-exact/01_happy_male.js',
      'sticker-assets-exact/02_reminder_female.js',
      'sticker-assets-exact/02_reminder_male.js',
      'sticker-assets-exact/03_concerned_female.js',
      'sticker-assets-exact/03-04-pair.js'
    ];
    let left=scripts.length;
    const finish=()=>{
      if(--left>0)return;
      const img=q('#desktopStickerPreview');
      const map={state1:'01_happy',state2:'02_reminder',state3:'03_concerned',state4:'04_serious',state5:'05_urgent'};
      const refresh=()=>{
        const stateKey=q('#desktopStickerState')?.value||'state1';
        const gender=q('input[name="desktopStickerGender"]:checked')?.value||'female';
        const src=window.BAMCO_DESKTOP_ASSETS?.[`${map[stateKey]}_${gender}`];
        if(img&&src)img.src=src;
      };
      refresh();
      q('#desktopStickerState')?.addEventListener('change',()=>setTimeout(refresh,0));
      qa('input[name="desktopStickerGender"]').forEach(x=>x.addEventListener('change',()=>setTimeout(refresh,0)));
    };
    scripts.forEach(src=>{
      const s=document.createElement('script');s.src=`${src}?v=20260906-2`;s.onload=finish;s.onerror=finish;document.body.appendChild(s);
    });
  }

  const boot=()=>{
    installGroupedNav();
    installTaskOrder();
    installCollapseLabel();
    markSelectionColumns();
    loadExactStickerOverrides();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
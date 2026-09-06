(()=>{
  'use strict';
  const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];

  /* The old version of this file shifted task filters by one column to make room for
     a Selection column. Selection is now row-based, so never reorder or offset filters. */
  function repairTaskFilters(){
    ['kanban','archive'].forEach(scope=>{
      const view=q(`#${scope}View`),table=view?.querySelector('table');
      if(!table)return;
      const heads=qa('thead>tr:first-child>th',table);
      const selection=heads.find(th=>(th.textContent||'').trim()==='انتخاب');
      const selectionIndex=selection?heads.indexOf(selection):-1;
      if(selection){
        selection.remove();
        const filterRow=q('thead .column-filters',table);
        if(selectionIndex>=0&&filterRow?.children[selectionIndex])filterRow.children[selectionIndex].remove();
        qa('tbody tr',table).forEach(row=>{
          const pick=row.querySelector('.task-pick')?.closest('td');if(pick)pick.remove();
        });
      }
      const filterRow=q('thead .column-filters',table);if(!filterRow)return;
      const expected=scope==='archive'?15:13;
      while(filterRow.children.length>expected)filterRow.lastElementChild.remove();
      while(filterRow.children.length<expected)filterRow.insertAdjacentHTML('beforeend','<th><select><option value="">همه</option></select></th>');
      qa('th',filterRow).forEach((th,i)=>{
        th.dataset.columnIndex=String(i);
        const sel=th.querySelector('select');if(sel){sel.disabled=false;sel.dataset.columnIndex=String(i)}
      });
    });
  }

  /* Enforce exact logical filter mapping: filter N always belongs to header N. */
  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('#kanbanView .column-filters select,#archiveView .column-filters select');
    if(!sel||typeof tableFilters==='undefined'||typeof renderTasks!=='function')return;
    e.stopImmediatePropagation();
    const scope=sel.closest('.view').id.startsWith('archive')?'archive':'kanban';
    const index=Number(sel.dataset.columnIndex??sel.closest('th')?.cellIndex??0);
    tableFilters[scope][index]=sel.value;
    renderTasks(scope==='archive');
  },true);

  /* Settings stays a right-aligned root item and gets a Login section first. */
  function repairSettings(){
    const settingsBtn=q('#nav button[data-view="settings"]');
    if(settingsBtn){
      settingsBtn.classList.add('nav-settings-root');
      settingsBtn.style.setProperty('text-align','right','important');
    }
    const view=q('#settingsView');if(!view||q('#loginSettingsPanel'))return;
    const panel=document.createElement('div');
    panel.id='loginSettingsPanel';panel.className='panel login-settings-panel';
    panel.innerHTML=`<div class="panel-head"><div><h3>صفحه ورود</h3><small></small></div></div><div class="login-settings-copy"><p>ورود به سامانه با نام کاربری و رمز عبور انجام می‌شود.</p><p class="login-settings-second">در اولین ورود، تغییر رمز عبور الزامی است و پنجره تغییر رمز بلافاصله نمایش داده می‌شود.</p></div>`;
    view.prepend(panel);
  }

  /* Owners must never see or enter approvals. */
  function enforceRoleAccess(){
    if(typeof state==='undefined'||!state.profile)return;
    const manager=state.profile.role==='manager';
    q('#approvalsNav')?.classList.toggle('hidden',!manager);
    if(!manager){
      q('#approvalsView')?.classList.add('hidden');
      if(state.view==='approvals'&&typeof showView==='function')showView('kanban');
    }
  }

  /* Show mandatory first-login password dialog immediately after profile lookup,
     without waiting for tasks/dashboard data to finish loading. */
  function installImmediatePasswordPrompt(){
    if(typeof refresh!=='function'||refresh.__bamcoImmediatePassword)return;
    const original=refresh;
    const wrapped=async function(){
      if(state?.profile?.must_change_password&&!window.__bamcoInitialRefreshStarted){
        window.__bamcoInitialRefreshStarted=true;
        q('#cancelPasswordBtn')?.classList.add('hidden');
        const dlg=q('#passwordDialog');
        queueMicrotask(()=>{try{if(dlg&&!dlg.open)dlg.showModal()}catch{}});
        original().catch(err=>console.warn('Background initial refresh failed',err));
        return;
      }
      return original();
    };
    wrapped.__bamcoImmediatePassword=true;
    window.refresh=refresh=wrapped;
  }

  function keepMandatoryDialogLocked(){
    if(typeof state==='undefined'||!state.profile?.must_change_password)return;
    q('#cancelPasswordBtn')?.classList.add('hidden');
    const dlg=q('#passwordDialog');
    if(dlg&&!dlg.open){try{dlg.showModal()}catch{}}
  }

  function boot(){
    repairTaskFilters();repairSettings();installImmediatePasswordPrompt();enforceRoleAccess();
    const app=q('#appView');if(app)new MutationObserver(()=>{repairTaskFilters();repairSettings();enforceRoleAccess();keepMandatoryDialogLocked()}).observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    [0,100,300,800].forEach(ms=>setTimeout(()=>{repairTaskFilters();repairSettings();enforceRoleAccess();keepMandatoryDialogLocked()},ms));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
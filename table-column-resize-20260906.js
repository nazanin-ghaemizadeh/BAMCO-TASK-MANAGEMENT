(function(){
  'use strict';

  /*
   * 2026-09-07 task-table stabilization + performance patch.
   * - removes the old Selection column from Kanban and Archive
   * - gives every task column an intentional width and keeps manual resizing
   * - keeps long cell text wrapped instead of ellipsized
   * - right-aligns the ID column
   * - fixes the lower edge/height of both task tables
   * - avoids a full table rebuild when a row is selected
   * - lazily builds filter option lists and renders only the active task view
   * - loads the three post-login data requests in parallel
   */

  window.BAMCO_FAST_TASK_TABLES=true;

  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  /* Load the final unified visual layer after older responsive/final overrides. */
  setTimeout(()=>{
    if(!document.getElementById('bamcoUnifiedUi')){
      const link=document.createElement('link');
      link.id='bamcoUnifiedUi';
      link.rel='stylesheet';
      link.href='unified-ui-20260907.css?v=20260907-3';
      document.head.appendChild(link);
    }
    if(!document.getElementById('bamcoUnifiedUiPatch')){
      const style=document.createElement('style');
      style.id='bamcoUnifiedUiPatch';
      style.textContent=`
        #appView .column-filters select{min-width:0!important;width:100%!important;height:32px!important;min-height:32px!important;padding:2px 20px 2px 4px!important;background-position:3px center!important;background-size:12px!important;font-size:14px!important}
        #appView #kanbanView .column-filters th:first-child select,#appView #archiveView .column-filters th:first-child select{min-width:0!important;width:100%!important;max-width:100%!important;padding-right:2px!important;padding-left:15px!important}
        #templatesView .desktop-template-shell{padding:0 4px!important;background:transparent!important}
        #templatesView .desktop-template-fieldset{border:1px solid #b8c8c1!important;border-radius:10px!important;padding:24px!important;margin:18px 0 14px!important;background:#f8faf9!important;box-shadow:none!important}
        #templatesView .desktop-template-fieldset legend{padding:0 10px!important;background:#eef3f0!important;color:#145741!important;font-weight:700!important}

        /* Task-table geometry: reserve a real bottom edge above the fixed footer. */
        html body #appView #kanbanView,
        html body #appView #archiveView{
          height:calc(100dvh - 58px - var(--footer-h,34px))!important;
          max-height:calc(100dvh - 58px - var(--footer-h,34px))!important;
          overflow:hidden!important;
          box-sizing:border-box!important;
        }
        html body #appView #kanbanView>.table-panel,
        html body #appView #archiveView>.table-panel{
          height:calc(100% - 32px)!important;
          max-height:calc(100% - 32px)!important;
          min-height:0!important;
          display:flex!important;
          flex-direction:column!important;
          overflow:hidden!important;
          box-sizing:border-box!important;
        }
        html body #appView #kanbanView .table-panel>.panel-head,
        html body #appView #archiveView .table-panel>.panel-head,
        html body #appView #kanbanView .task-toolbar,
        html body #appView #archiveView .task-toolbar{
          flex:0 0 auto!important;
        }
        html body #appView #kanbanView .table-wrap,
        html body #appView #archiveView .table-wrap{
          flex:1 1 auto!important;
          min-height:0!important;
          height:auto!important;
          max-height:none!important;
          overflow:auto!important;
          box-sizing:border-box!important;
          border-bottom:1px solid #b8c8c1!important;
        }

        /* No Selection column; the row itself is the selector. */
        html body #appView #kanbanView .task-select-column,
        html body #appView #archiveView .task-select-column,
        html body #appView #kanbanView .task-pick,
        html body #appView #archiveView .task-pick{display:none!important}

        /* Intentional widths + full wrapped content. */
        html body #appView #kanbanView table.resizable-task-table,
        html body #appView #archiveView table.resizable-task-table{
          width:max-content!important;
          min-width:0!important;
          table-layout:fixed!important;
          direction:rtl!important;
        }
        html body #appView #kanbanView table.resizable-task-table th,
        html body #appView #archiveView table.resizable-task-table th{
          min-width:0!important;
          max-width:none!important;
          white-space:nowrap!important;
          overflow:visible!important;
          text-overflow:clip!important;
          vertical-align:middle!important;
          box-sizing:border-box!important;
        }
        html body #appView #kanbanView table.resizable-task-table td,
        html body #appView #archiveView table.resizable-task-table td{
          min-width:0!important;
          max-width:none!important;
          white-space:normal!important;
          overflow:visible!important;
          text-overflow:clip!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
          line-height:1.75!important;
          vertical-align:top!important;
          box-sizing:border-box!important;
        }
        html body #appView #kanbanView table.resizable-task-table th:first-child,
        html body #appView #kanbanView table.resizable-task-table td:first-child,
        html body #appView #archiveView table.resizable-task-table th:first-child,
        html body #appView #archiveView table.resizable-task-table td:first-child{
          text-align:right!important;
          direction:rtl!important;
          white-space:nowrap!important;
          padding-right:8px!important;
          padding-left:5px!important;
        }
        html body #appView #kanbanView tbody tr[data-task-id],
        html body #appView #archiveView tbody tr[data-task-id]{cursor:pointer!important}
      `;
      document.head.appendChild(style);
    }
  },0);

  /* Keep the email editor's intentional font chooser functional. */
  document.addEventListener('change',event=>{
    if(event.target?.id!=='dteFont')return;
    const body=qs('#dteBody');
    if(body)body.style.setProperty('font-family',`"${event.target.value}",sans-serif`,'important');
  });

  const WIDTHS={
    'شناسه':68,
    'عنوان فعالیت':220,
    'توضیحات':340,
    'متولی':175,
    'وضعیت':135,
    'اولویت':90,
    'تاریخ شروع':118,
    'تاریخ انجام':118,
    'تاریخ پایان':118,
    'یادآور':82,
    'آخرین به‌روزرسانی':165,
    'وضعیت دیرکرد':138,
    'توضیحات مدیر':285,
    'تأخیر':82,
    'تعجیل':82
  };
  const MIN_WIDTHS={
    'شناسه':52,'عنوان فعالیت':150,'توضیحات':190,'متولی':120,'وضعیت':100,'اولویت':72,
    'تاریخ شروع':96,'تاریخ انجام':96,'تاریخ پایان':96,'یادآور':68,'آخرین به‌روزرسانی':125,
    'وضعیت دیرکرد':105,'توضیحات مدیر':170,'تأخیر':64,'تعجیل':64
  };

  function removeSelectionHeader(scope){
    const table=qs(`#${scope}View table`);if(!table)return;
    const top=qsa('thead>tr:first-child>th',table);
    const idx=top.findIndex(th=>(th.textContent||'').trim()==='انتخاب');
    if(idx<0)return;
    top[idx].remove();
    const filter=qs('thead .column-filters',table);
    if(filter?.children[idx])filter.children[idx].remove();
    qsa('tbody tr',table).forEach(row=>{
      const cell=row.children[idx];
      if(cell&&(cell.querySelector('.task-pick')||idx===row.children.length-1))cell.remove();
    });
  }

  function installResizableTable(scope){
    removeSelectionHeader(scope);
    const table=qs(`#${scope}View table`),heads=qsa('thead>tr:first-child>th',table||document);
    if(!table||!heads.length||table.dataset.bamcoResized==='1')return;
    table.dataset.bamcoResized='1';
    table.classList.add('resizable-task-table');
    table.style.direction='rtl';

    const key=`bamco-${scope}-column-widths-v4`;
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{saved={}}
    const widths=heads.map(head=>{
      const name=(head.textContent||'').trim();
      const stored=Number(saved[name]);
      return Number.isFinite(stored)&&stored>0?stored:(WIDTHS[name]||140);
    });

    table.querySelector(':scope > colgroup')?.remove();
    const colgroup=document.createElement('colgroup');
    const cols=heads.map((head,index)=>{
      const col=document.createElement('col');
      colgroup.appendChild(col);
      return col;
    });
    table.insertBefore(colgroup,table.firstChild);

    const apply=()=>{
      let total=0;
      heads.forEach((head,index)=>{
        const name=(head.textContent||'').trim();
        const min=MIN_WIDTHS[name]||70;
        widths[index]=Math.max(min,Math.min(560,Number(widths[index])||WIDTHS[name]||140));
        cols[index].style.width=`${widths[index]}px`;
        total+=widths[index];
      });
      table.style.setProperty('width',`${total}px`,'important');
      table.style.setProperty('min-width',`${total}px`,'important');
    };
    apply();

    heads.forEach((head,index)=>{
      head.style.position='sticky';
      const old=head.querySelector('.column-resize-handle');if(old)old.remove();
      const handle=document.createElement('span');
      handle.className='column-resize-handle';
      handle.title='برای تغییر عرض بکشید؛ برای بازنشانی دوبار کلیک کنید';
      head.appendChild(handle);
      handle.addEventListener('dblclick',event=>{
        event.preventDefault();event.stopPropagation();
        const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
        widths[index]=WIDTHS[name]||140;
        const next={};heads.forEach((h,i)=>next[(h.childNodes[0]?.textContent||h.textContent||'').trim()]=widths[i]);
        localStorage.setItem(key,JSON.stringify(next));
        apply();
      });
      handle.addEventListener('pointerdown',event=>{
        event.preventDefault();event.stopPropagation();
        const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
        const min=MIN_WIDTHS[name]||70,startX=event.clientX,startWidth=widths[index];
        handle.setPointerCapture?.(event.pointerId);
        handle.classList.add('dragging');document.body.classList.add('column-resizing');
        const move=moveEvent=>{widths[index]=Math.max(min,Math.min(560,startWidth+startX-moveEvent.clientX));apply()};
        const up=()=>{
          handle.classList.remove('dragging');document.body.classList.remove('column-resizing');
          const next={};heads.forEach((h,i)=>next[(h.childNodes[0]?.textContent||h.textContent||'').trim()]=widths[i]);
          localStorage.setItem(key,JSON.stringify(next));
          handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);
        };
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
      });
    });
  }

  removeSelectionHeader('kanban');
  removeSelectionHeader('archive');
  installResizableTable('kanban');
  installResizableTable('archive');

  /* The rest of this patch needs app.js globals; safely no-op on incomplete pages. */
  if(typeof state==='undefined'||typeof tableFilters==='undefined'||typeof renderTasks!=='function')return;

  let dataVersion=0;
  const rendered={kanban:false,archive:false,dashboard:false};
  const latestRows={kanban:[],archive:[]};
  const latestArchived={kanban:false,archive:true};
  const optionCache={kanban:new Map(),archive:new Map()};
  let valueCache=new WeakMap();
  let idleToken=0;

  function resetRenderCaches(){
    rendered.kanban=false;rendered.archive=false;rendered.dashboard=false;
    optionCache.kanban.clear();optionCache.archive.clear();
    valueCache=new WeakMap();idleToken++;
  }

  /* Cache Persian date formatting because the same values are used in cells and filters repeatedly. */
  if(typeof jalaliText==='function'&&!jalaliText.__bamcoCached){
    const originalJalaliText=jalaliText,cache=new Map();
    jalaliText=function(value){const key=String(value??'');if(cache.has(key))return cache.get(key);const out=originalJalaliText(value);if(cache.size>2048)cache.clear();cache.set(key,out);return out};
    jalaliText.__bamcoCached=true;
  }
  if(typeof jalaliDateTime==='function'&&!jalaliDateTime.__bamcoCached){
    const originalJalaliDateTime=jalaliDateTime,cache=new Map();
    jalaliDateTime=function(value){const key=String(value??'');if(cache.has(key))return cache.get(key);const out=originalJalaliDateTime(value);if(cache.size>2048)cache.clear();cache.set(key,out);return out};
    jalaliDateTime.__bamcoCached=true;
  }

  taskColumnValues=function(t,archived){
    let entry=valueCache.get(t);
    if(!entry||entry.version!==dataVersion){entry={version:dataVersion};valueCache.set(t,entry)}
    const key=archived?'archive':'kanban';
    if(entry[key])return entry[key];
    const waiting=norm(t.status)==='منتظر پاسخ',due=norm(t.due_state);
    const dueText=waiting?'فاقد شرایط دیرکرد':due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد';
    const base=[fa(displayId(t)),t.title||'',t.description||'',ownerName(t),t.status||'',t.priority||'',jalaliText(t.start_date),jalaliText(t.done_date),jalaliText(waiting?null:t.due_date),fa(waiting?0:t.reminder_days),jalaliDateTime(t.last_updated_at),dueText,t.manager_notes||''];
    entry[key]=archived?[...base,fa(t.delay_days||0),fa(t.advance_days||0)]:base;
    return entry[key];
  };

  function filterValues(scope,index){
    const cache=optionCache[scope],cached=cache.get(index);
    if(cached?.version===dataVersion)return cached.values;
    const archived=latestArchived[scope];
    const values=[...new Set(latestRows[scope].map(t=>String(taskColumnValues(t,archived)[index]??'')).filter(v=>v&&v!=='—'))]
      .sort((a,b)=>a.localeCompare(b,'fa',{numeric:true,sensitivity:'base'}));
    cache.set(index,{version:dataVersion,values});
    return values;
  }

  function populateFilter(selectEl,scope,index){
    if(!selectEl||selectEl.dataset.bamcoPopulated===String(dataVersion))return;
    const current=tableFilters[scope][index]||selectEl.value||'';
    const values=filterValues(scope,index);
    selectEl.innerHTML='<option value="">همه</option>'+values.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
    selectEl.value=current;
    selectEl.dataset.bamcoPopulated=String(dataVersion);
  }

  function scheduleCommonFilterWarmup(scope){
    const token=idleToken;
    const work=()=>{
      if(token!==idleToken)return;
      const tr=qs(`#${scope}View .column-filters`);if(!tr)return;
      /* Low-cardinality columns first: owner, status, priority, reminder and delay-state. */
      for(const index of [3,4,5,9,11]){
        const selectEl=tr.children[index]?.querySelector('select');
        if(selectEl)populateFilter(selectEl,scope,index);
      }
    };
    if('requestIdleCallback'in window)requestIdleCallback(work,{timeout:1200});else setTimeout(work,250);
  }

  updateColumnFilters=function(scope,rows,archived){
    latestRows[scope]=rows;latestArchived[scope]=archived;
    const tr=qs(`#${scope}View .column-filters`);if(!tr)return;
    const filters=tableFilters[scope],count=archived?15:13;
    while(tr.children.length>count)tr.lastElementChild.remove();
    while(tr.children.length<count)tr.insertAdjacentHTML('beforeend','<th><select><option value="">همه</option></select></th>');
    [...tr.children].forEach((th,index)=>{
      const selectEl=th.querySelector('select');if(!selectEl)return;
      const current=filters[index]||'';
      if(selectEl.dataset.bamcoVersion!==String(dataVersion)){
        selectEl.innerHTML='<option value="">همه</option>'+(current?`<option value="${safe(current)}">${safe(current)}</option>`:'');
        selectEl.dataset.bamcoVersion=String(dataVersion);
        selectEl.dataset.bamcoPopulated='';
      }
      selectEl.value=current;
      selectEl.className=languageClass(current);
      if(selectEl.dataset.bamcoLazyBound!=='1'){
        selectEl.dataset.bamcoLazyBound='1';
        const warm=()=>populateFilter(selectEl,scope,index);
        selectEl.addEventListener('pointerenter',warm,{passive:true});
        selectEl.addEventListener('focus',warm,{passive:true});
        selectEl.addEventListener('pointerdown',warm,{passive:true});
      }
    });
    scheduleCommonFilterWarmup(scope);
  };

  renderTasks=function(archived){
    const scope=archived?'archive':'kanban';
    const searchEl=archived?qs('#archiveSearch'):qs('#kanbanSearch');
    const query=(searchEl?.value||'').trim().toLowerCase();
    const allRows=state.tasks.filter(t=>!!t.archived===archived).sort((a,b)=>Number(displayId(a))-Number(displayId(b)));
    const filters=tableFilters[scope];
    updateColumnFilters(scope,allRows,archived);
    const rows=allRows.filter(t=>!query||[t.title,t.description,ownerName(t),t.status,t.priority,displayId(t)].some(v=>String(v??'').toLowerCase().includes(query)))
      .filter(t=>taskColumnValues(t,archived).every((v,index)=>!filters[index]||String(v??'')===filters[index]));
    const body=archived?qs('#archiveBody'):qs('#kanbanBody');if(!body)return;
    if(!rows.some(t=>String(t.id)===String(state.selected[scope])))state.selected[scope]=null;
    if(!rows.length){
      body.innerHTML=`<tr><td colspan="${archived?15:13}" class="empty">موردی برای نمایش وجود ندارد.</td></tr>`;
      updateTaskToolbar(scope);rendered[scope]=true;return;
    }
    body.innerHTML=rows.map(t=>{
      const due=norm(t.due_state),status=norm(t.status),rowClass=status==='منتظر پاسخ'?'row-waiting':due==='دیرکرد'?'row-overdue':due.includes('هشدار')?'row-warning':'row-normal';
      const values=taskColumnValues(t,archived);
      const selected=String(state.selected[scope])===String(t.id);
      return `<tr class="${rowClass}${selected?' task-selected':''}" data-task-id="${t.id}" data-scope="${scope}" aria-selected="${selected?'true':'false'}">${values.map(v=>cell(v)).join('')}</tr>`;
    }).join('');
    updateTaskToolbar(scope);rendered[scope]=true;
  };
  /* Prevent the older post-loader from wrapping renderTasks with full-table MutationObservers. */
  renderTasks.__ascendingWrapped=true;

  chooseTask=function(scope,id){
    state.selected[scope]=Number(id);
    const body=scope==='archive'?qs('#archiveBody'):qs('#kanbanBody');
    if(body){
      qsa('tr.task-selected',body).forEach(row=>{row.classList.remove('task-selected');row.setAttribute('aria-selected','false')});
      const row=qsa('tr[data-task-id]',body).find(r=>String(r.dataset.taskId)===String(id));
      if(row){row.classList.add('task-selected');row.setAttribute('aria-selected','true')}
    }
    updateTaskToolbar(scope);
  };

  renderAll=function(){
    const initial=qs('#appView')?.classList.contains('hidden');
    const target=initial?'kanban':state.view;
    if(target==='archive')renderTasks(true);
    else if(target==='dashboard'){window.renderDashboard?.();rendered.dashboard=true}
    else renderTasks(false);
    if(isManager())renderRequests();
  };

  refresh=async function(){
    try{
      const profilesPromise=isManager()?select('profiles','select=id,email,full_name,excel_name,role,active&active=eq.true&order=full_name'):Promise.resolve([state.profile]);
      const tasksPromise=select('task_status_view','select=*&order=id.desc');
      const requestsPromise=isManager()?select('change_requests','select=*&request_status=eq.pending&order=created_at.asc'):Promise.resolve([]);
      const [profiles,tasks,requests]=await Promise.all([profilesPromise,tasksPromise,requestsPromise]);
      state.profiles=profiles;state.tasks=tasks;state.requests=requests;
      dataVersion++;resetRenderCaches();
      renderAll();
    }catch(err){toast(err.message,true);throw err}
  };

  const originalShowView=showView;
  showView=function(view){
    const out=originalShowView(view);
    if(view==='kanban'&&!rendered.kanban)requestAnimationFrame(()=>renderTasks(false));
    else if(view==='archive'&&!rendered.archive)requestAnimationFrame(()=>renderTasks(true));
    else if(view==='dashboard'&&!rendered.dashboard)requestAnimationFrame(()=>{window.renderDashboard?.();rendered.dashboard=true});
    return out;
  };

  /* If an older renderer already created a Selection cell before this patch, clean it once. */
  removeSelectionHeader('kanban');removeSelectionHeader('archive');
})();

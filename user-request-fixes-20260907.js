(()=>{
  'use strict';
  const q=s=>document.querySelector(s);
  const qa=s=>[...document.querySelectorAll(s)];

  function injectStyle(){
    if(q('#bamcoUserRequestFixes20260907'))return;
    const style=document.createElement('style');
    style.id='bamcoUserRequestFixes20260907';
    style.textContent=`
      /* Sticker preview: roughly double the previous visual allowance. */
      #appView #stickersView .desktop-sticker-preview-stage{
        height:clamp(480px,72vh,820px)!important;
        min-height:480px!important;
        max-height:820px!important;
      }
      #appView #stickersView #desktopStickerPreview{
        max-width:min(1240px,96%)!important;
        max-height:98%!important;
        width:auto!important;
        height:auto!important;
        object-fit:contain!important;
      }

      /* Email editor: Save/Cancel at the far left, formatting controls on the right. */
      #desktopTemplateEditor .dte-toolbar{
        direction:ltr!important;
        justify-content:flex-start!important;
      }
      #desktopTemplateEditor #dteSave,
      #desktopTemplateEditor #dteCancel{direction:rtl!important;text-align:center!important;flex:0 0 auto!important}
      #desktopTemplateEditor #dteCancel{margin-right:auto!important}

      /* Sidebar open/close control: arrow only, no box/background. */
      #appView #collapseBtn.collapse,
      #appView .collapse{
        background:transparent!important;
        border:0!important;
        box-shadow:none!important;
        outline:0!important;
        border-radius:0!important;
      }
      #appView #collapseBtn.collapse:hover,
      #appView .collapse:hover{background:transparent!important;border:0!important;box-shadow:none!important}
      #appView .collapse::after{content:"◀"!important;font-size:18px!important;color:#e5f1ed!important}
      #appView .sidebar.collapsed .collapse::after{content:"▶"!important}

      /* Login icons are independent sibling SVGs so browser autofill cannot hide them. */
      #loginView .bamco-login-field{position:relative!important;width:100%!important;display:block!important}
      #loginView .bamco-login-field>input{
        width:100%!important;
        box-sizing:border-box!important;
        padding-left:54px!important;
        background-image:none!important;
      }
      #loginView .bamco-login-icon{
        position:absolute!important;
        left:17px!important;
        top:50%!important;
        transform:translateY(-50%)!important;
        width:25px!important;
        height:25px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        pointer-events:none!important;
        z-index:5!important;
        color:#7b8683!important;
      }
      #loginView .bamco-login-icon svg{width:25px!important;height:25px!important;display:block!important;fill:currentColor!important}

      /* Search input must reserve zero space while closed. */
      #appView #kanbanView .toolbar-search:not(.search-open),
      #appView #archiveView .toolbar-search:not(.search-open){display:none!important;width:0!important;min-width:0!important;max-width:0!important;margin:0!important;padding:0!important;border:0!important}
      #appView #kanbanView .toolbar-search.search-open,
      #appView #archiveView .toolbar-search.search-open{display:block!important}

      /* Dashboard performance range: dates on the right, actions flush left with clear spacing. */
      #appView .dashboard-performance-range>div{
        display:flex!important;
        align-items:flex-end!important;
        justify-content:flex-start!important;
        flex-wrap:nowrap!important;
        gap:12px!important;
        width:100%!important;
        direction:rtl!important;
      }
      #appView .dashboard-performance-range>div>label{
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        gap:6px!important;
        margin:0!important;
        flex:0 0 220px!important;
      }
      #appView .dashboard-performance-range>div>.dashboard-calendar-btn{margin:0 2px 0 8px!important;flex:0 0 145px!important}
      #appView .dashboard-performance-range>div>span{display:block!important;flex:1 1 auto!important;min-width:28px!important}
      #appView .dashboard-performance-range #clearPerf,
      #appView .dashboard-performance-range #applyPerf{margin:0!important;flex:0 0 135px!important;min-width:135px!important}

      /* Kanban bottom outline must always be visible. */
      #appView #kanbanView>.table-panel,
      #appView #kanbanView .table-wrap{border-bottom:1px solid #b8c8c1!important}

      /* Fully resizable Kanban/Archive tables with wrapped, never-ellipsized cell text. */
      #appView #kanbanView table.bamco-resizable-table,
      #appView #archiveView table.bamco-resizable-table{
        table-layout:fixed!important;
        width:var(--bamco-table-width)!important;
        min-width:var(--bamco-table-width)!important;
        max-width:none!important;
      }
      #appView #kanbanView table.bamco-resizable-table th,
      #appView #kanbanView table.bamco-resizable-table td,
      #appView #archiveView table.bamco-resizable-table th,
      #appView #archiveView table.bamco-resizable-table td{
        min-width:0!important;
        max-width:none!important;
        width:auto!important;
        overflow:visible!important;
        text-overflow:clip!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
        word-break:normal!important;
        box-sizing:border-box!important;
        vertical-align:top!important;
      }

      /* The first DOM column is always شناسه. Never hide it: keep it narrow, RTL and B Nazanin. */
      #appView #kanbanView table.bamco-resizable-table thead>tr:first-child>th:first-child,
      #appView #kanbanView table.bamco-resizable-table .column-filters>th:first-child,
      #appView #kanbanView table.bamco-resizable-table tbody>tr>td:first-child,
      #appView #archiveView table.bamco-resizable-table thead>tr:first-child>th:first-child,
      #appView #archiveView table.bamco-resizable-table .column-filters>th:first-child,
      #appView #archiveView table.bamco-resizable-table tbody>tr>td:first-child{
        display:table-cell!important;
        visibility:visible!important;
        width:40px!important;
        min-width:40px!important;
        max-width:40px!important;
        padding-left:4px!important;
        padding-right:4px!important;
        text-align:right!important;
        direction:rtl!important;
        white-space:nowrap!important;
        font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
      }
      #appView .bamco-resizable-table thead>tr:first-child>th{position:sticky!important;overflow:visible!important}
      #appView .bamco-resizable-table .column-resize-handle{
        position:absolute!important;
        top:0!important;
        bottom:0!important;
        left:-5px!important;
        width:10px!important;
        cursor:col-resize!important;
        z-index:30!important;
        touch-action:none!important;
        user-select:none!important;
        background:transparent!important;
      }
      #appView .bamco-resizable-table .column-resize-handle::after{
        content:"";
        position:absolute;
        top:8px;
        bottom:8px;
        left:4px;
        width:1px;
        background:transparent;
      }
      #appView .bamco-resizable-table .column-resize-handle:hover::after,
      #appView .bamco-resizable-table .column-resize-handle.dragging::after{background:#4f8d77!important}
      body.column-resizing,body.column-resizing *{cursor:col-resize!important;user-select:none!important}

      @media(max-width:1050px){
        #appView .dashboard-performance-range>div{flex-wrap:wrap!important}
        #appView .dashboard-performance-range>div>span{display:none!important}
        #appView .dashboard-performance-range #clearPerf{margin-right:auto!important}
      }
      @media(max-width:760px){
        #appView #stickersView .desktop-sticker-preview-stage{min-height:400px!important;height:58vh!important;max-height:620px!important}
        #appView #stickersView #desktopStickerPreview{max-width:96%!important}
      }
    `;
    document.head.appendChild(style);
  }

  function installLoginIcons(){
    const specs=[
      ['#email','user',`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/></svg>`],
      ['#password','lock',`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm3 9.73V18h-2v-2.27a2 2 0 1 1 2 0Z"/></svg>`]
    ];
    specs.forEach(([selector,kind,svg])=>{
      const input=q(selector);if(!input||input.closest('.bamco-login-field'))return;
      const wrap=document.createElement('div');wrap.className=`bamco-login-field bamco-login-${kind}`;
      input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
      const icon=document.createElement('span');icon.className='bamco-login-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=svg;wrap.appendChild(icon);
    });
  }

  function replaceTaskWord(el){
    if(!el)return;
    const value=el.textContent||'';
    const next=value.replaceAll('تسک','وظیفه');
    if(next!==value)el.textContent=next;
  }

  function fixTaskWording(){
    ['#addTaskBtn','#taskDialogTitle','#saveTaskBtn','#kanbanScope','#archiveScope'].forEach(sel=>replaceTaskWord(q(sel)));
    qa('#approvalsView th').forEach(replaceTaskWord);
    const form=q('#taskForm');
    if(form){
      const titleInput=form.elements?.title;
      const label=titleInput?.closest('label');
      if(label){
        const textNode=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
        if(textNode&&textNode.nodeValue.trim()!=='عنوان وظیفه')textNode.nodeValue='عنوان وظیفه';
      }
    }
  }

  function installTaskWordingObserver(){
    fixTaskWording();
    const dialog=q('#taskDialog');if(!dialog||dialog.dataset.taskWordObserver==='1')return;
    dialog.dataset.taskWordObserver='1';
    let queued=false;
    new MutationObserver(()=>{
      if(queued)return;queued=true;
      requestAnimationFrame(()=>{queued=false;fixTaskWording()});
    }).observe(dialog,{childList:true,subtree:true,characterData:true});
  }

  function repairSelectionClasses(view,table,heads,selectionIndex){
    heads.forEach((head,index)=>head.classList.toggle('task-select-column',index===selectionIndex));
    const filterCells=[...(view.querySelector('.column-filters')?.children||[])];
    filterCells.forEach((cell,index)=>cell.classList.toggle('task-select-column',index===selectionIndex));
    view.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].forEach((cell,index)=>{
        const isSelection=index===selectionIndex&&!!cell.querySelector('.task-pick');
        cell.classList.toggle('task-select-column',isSelection);
      });
    });
    heads[0]?.classList.remove('task-select-column');
    filterCells[0]?.classList.remove('task-select-column');
    view.querySelectorAll('tbody tr>td:first-child').forEach(cell=>cell.classList.remove('task-select-column'));
    const cols=[...(table.querySelector(':scope > colgroup')?.children||[])];
    if(cols[0]){cols[0].style.visibility='visible';cols[0].style.width='40px';cols[0].style.minWidth='40px';cols[0].style.maxWidth='40px'}
  }

  function installResizableTable(scope,defaults,key){
    const view=q(`#${scope}View`),table=view?.querySelector('table'),heads=table?[...table.querySelectorAll('thead>tr:first-child>th')]:[];
    if(!table||!heads.length)return;
    const selectionIndex=heads.findIndex(h=>(h.textContent||'').trim()==='انتخاب');
    table.querySelector(':scope > colgroup')?.remove();
    table.querySelectorAll('.column-resize-handle').forEach(h=>h.remove());

    let saved=[];
    try{saved=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
    const widths=defaults.map((fallback,index)=>{
      if(index===selectionIndex)return 0;
      const candidate=Number(saved[index]);
      const min=index===0?34:56;
      return Math.max(min,Number.isFinite(candidate)&&candidate>0?candidate:fallback);
    });
    widths[0]=Math.max(34,Math.min(60,widths[0]||40));

    const colgroup=document.createElement('colgroup');
    const cols=heads.map((_,index)=>{
      const col=document.createElement('col');
      colgroup.appendChild(col);return col;
    });
    table.insertBefore(colgroup,table.firstChild);
    table.classList.add('bamco-resizable-table','resizable-task-table');

    const apply=()=>{
      const total=widths.reduce((sum,w,index)=>sum+(index===selectionIndex?0:w),0);
      table.style.setProperty('--bamco-table-width',`${Math.max(total,1)}px`);
      cols.forEach((col,index)=>{
        if(index===selectionIndex){
          col.style.width='0px';col.style.minWidth='0px';col.style.maxWidth='0px';col.style.visibility='collapse';
        }else{
          col.style.width=`${widths[index]}px`;col.style.minWidth='0';col.style.maxWidth='none';col.style.visibility='visible';
        }
      });
      if(cols[0]){cols[0].style.visibility='visible';cols[0].style.width=`${widths[0]}px`}
      repairSelectionClasses(view,table,heads,selectionIndex);
    };

    apply();

    heads.forEach((head,index)=>{
      if(index===selectionIndex)return;
      const handle=document.createElement('span');
      handle.className='column-resize-handle';
      handle.title='برای تغییر عرض ستون بکشید؛ برای بازنشانی دوبار کلیک کنید';
      head.appendChild(handle);
      handle.addEventListener('dblclick',event=>{
        event.preventDefault();event.stopPropagation();
        widths[index]=defaults[index];
        if(index===0)widths[index]=40;
        apply();localStorage.setItem(key,JSON.stringify(widths));
      });
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0&&event.pointerType!=='touch')return;
        event.preventDefault();event.stopPropagation();
        const startX=event.clientX,startWidth=widths[index],min=index===0?34:56,max=index===0?80:760;
        handle.classList.add('dragging');document.body.classList.add('column-resizing');
        let raf=0,pending=startWidth;
        const flush=()=>{raf=0;widths[index]=pending;apply()};
        const move=moveEvent=>{
          pending=Math.max(min,Math.min(max,startWidth+(startX-moveEvent.clientX)));
          if(!raf)raf=requestAnimationFrame(flush);
        };
        const up=()=>{
          if(raf){cancelAnimationFrame(raf);raf=0;widths[index]=pending;apply()}
          handle.classList.remove('dragging');document.body.classList.remove('column-resizing');
          localStorage.setItem(key,JSON.stringify(widths));
          window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);
        };
        window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
      });
    });

    const body=view.querySelector('tbody');
    if(body&&!body.dataset.idColumnGuard){
      body.dataset.idColumnGuard='1';
      let queued=false;
      new MutationObserver(()=>{
        if(queued)return;queued=true;
        requestAnimationFrame(()=>{queued=false;repairSelectionClasses(view,table,heads,selectionIndex)});
      }).observe(body,{childList:true,subtree:true});
    }
  }

  function installResizableTables(){
    installResizableTable('kanban',[40,190,280,145,115,90,110,110,110,82,150,110,210,0],'bamco-kanban-column-widths-v4');
    installResizableTable('archive',[40,190,280,145,115,90,110,110,110,82,150,110,210,80,80,0],'bamco-archive-column-widths-v4');
  }

  function applyAll(){
    injectStyle();
    installLoginIcons();
    installTaskWordingObserver();
    installResizableTables();
    const collapse=q('#collapseBtn');if(collapse){collapse.title='باز و بسته کردن منو';collapse.setAttribute('aria-label','باز و بسته کردن منو')}
  }

  function boot(){
    applyAll();
    [120,450,1000,1800].forEach(ms=>setTimeout(()=>{
      injectStyle();installLoginIcons();fixTaskWording();
      if(!q('#kanbanView table.bamco-resizable-table')||!q('#archiveView table.bamco-resizable-table'))installResizableTables();
      else{
        ['kanban','archive'].forEach(scope=>{
          const view=q(`#${scope}View`),table=view?.querySelector('table'),heads=table?[...table.querySelectorAll('thead>tr:first-child>th')]:[];
          const selectionIndex=heads.findIndex(h=>(h.textContent||'').trim()==='انتخاب');
          if(view&&table&&heads.length)repairSelectionClasses(view,table,heads,selectionIndex);
        });
      }
    },ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

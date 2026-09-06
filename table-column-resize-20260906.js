(function(){
  'use strict';

  /* Load the final unified visual layer after the older responsive/final overrides. */
  setTimeout(()=>{
    if(!document.getElementById('bamcoUnifiedUi')){
      const link=document.createElement('link');
      link.id='bamcoUnifiedUi';
      link.rel='stylesheet';
      link.href='unified-ui-20260907.css?v=20260907-2';
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
      `;
      document.head.appendChild(style);
    }
  },0);

  /* Keep the email editor's intentional font chooser functional even though the surrounding UI defaults to B Nazanin. */
  document.addEventListener('change',event=>{
    if(event.target?.id!=='dteFont')return;
    const body=document.querySelector('#dteBody');
    if(body)body.style.setProperty('font-family',`"${event.target.value}",sans-serif`,'important');
  });

  const table=document.querySelector('#kanbanView table'),heads=[...document.querySelectorAll('#kanbanView thead>tr:first-child>th')];
  if(!table||!heads.length)return;

  /* Source/header order is fixed to the real Kanban structure. The hidden selection column must not reserve width. */
  const defaults=[44,180,260,140,110,90,105,105,105,80,145,100,200,0];
  const key='bamco-kanban-column-widths-v2';
  const selectionIndex=heads.findIndex(h=>(h.textContent||'').trim()==='انتخاب');
  let saved=[];
  try{saved=JSON.parse(localStorage.getItem(key)||'[]')}catch{}

  const widths=defaults.map((value,index)=>{
    if(index===selectionIndex)return 0;
    const candidate=Number(saved[index]);
    const fallback=value;
    const min=index===0?42:54;
    return Math.max(min,Number.isFinite(candidate)&&candidate>0?candidate:fallback);
  });

  table.querySelector(':scope > colgroup')?.remove();
  const colgroup=document.createElement('colgroup');
  const cols=heads.map((_,index)=>{
    const col=document.createElement('col');
    if(index===selectionIndex){
      col.style.width='0px';
      col.style.minWidth='0px';
      col.style.maxWidth='0px';
      col.style.visibility='collapse';
    }else{
      col.style.width=`${widths[index]}px`;
    }
    colgroup.appendChild(col);
    return col;
  });
  table.insertBefore(colgroup,table.firstChild);
  table.classList.add('resizable-task-table');
  table.style.direction='rtl';

  const apply=()=>{
    const total=widths.reduce((sum,value,index)=>sum+(index===selectionIndex?0:value),0);
    table.style.width=`${total}px`;
    table.style.minWidth=table.style.width;
    cols.forEach((col,index)=>{
      if(index===selectionIndex){
        col.style.width='0px';
        col.style.minWidth='0px';
        col.style.maxWidth='0px';
        col.style.visibility='collapse';
      }else{
        col.style.width=`${widths[index]}px`;
      }
    });
  };
  apply();

  heads.forEach((head,index)=>{
    head.style.position='sticky';
    if(index===selectionIndex)return;
    const handle=document.createElement('span');
    handle.className='column-resize-handle';
    handle.title='برای تغییر عرض بکشید؛ برای بازنشانی دوبار کلیک کنید';
    head.appendChild(handle);
    handle.addEventListener('dblclick',event=>{
      event.preventDefault();event.stopPropagation();
      widths[index]=defaults[index];
      apply();
      localStorage.setItem(key,JSON.stringify(widths));
    });
    handle.addEventListener('pointerdown',event=>{
      event.preventDefault();event.stopPropagation();
      const startX=event.clientX,startWidth=widths[index],min=index===0?42:54;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('dragging');document.body.classList.add('column-resizing');
      const move=moveEvent=>{
        widths[index]=Math.max(min,Math.min(520,startWidth+startX-moveEvent.clientX));
        apply();
      };
      const up=()=>{
        handle.classList.remove('dragging');document.body.classList.remove('column-resizing');
        localStorage.setItem(key,JSON.stringify(widths));
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',up);
        handle.removeEventListener('pointercancel',up);
      };
      handle.addEventListener('pointermove',move);
      handle.addEventListener('pointerup',up);
      handle.addEventListener('pointercancel',up);
    });
  });
})();

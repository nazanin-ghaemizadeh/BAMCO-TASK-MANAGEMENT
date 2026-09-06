(function(){
  'use strict';

  /* Load the final unified visual layer after the older responsive/final overrides. */
  setTimeout(()=>{
    if(document.getElementById('bamcoUnifiedUi'))return;
    const link=document.createElement('link');
    link.id='bamcoUnifiedUi';
    link.rel='stylesheet';
    link.href='unified-ui-20260907.css?v=20260907-2';
    document.head.appendChild(link);
  },0);

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

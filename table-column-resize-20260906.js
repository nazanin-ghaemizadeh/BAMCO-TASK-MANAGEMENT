(function(){
  'use strict';
  const table=document.querySelector('#kanbanView table'),heads=[...document.querySelectorAll('#kanbanView thead>tr:first-child>th')];
  if(!table||!heads.length)return;
  const defaults=[64,150,210,125,105,82,105,105,105,72,145,96,170,68],key='bamco-kanban-column-widths-v1';
  let saved=[];try{saved=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
  const widths=defaults.map((value,index)=>Math.max(54,Number(saved[index])||value));
  const colgroup=document.createElement('colgroup'),cols=heads.map((_,index)=>{const col=document.createElement('col');col.style.width=`${widths[index]}px`;colgroup.appendChild(col);return col});
  table.insertBefore(colgroup,table.firstChild);table.classList.add('resizable-task-table');
  const apply=()=>{table.style.width=`${widths.reduce((sum,value)=>sum+value,0)}px`;table.style.minWidth=table.style.width;cols.forEach((col,index)=>col.style.width=`${widths[index]}px`)};apply();
  heads.forEach((head,index)=>{head.style.position='sticky';const handle=document.createElement('span');handle.className='column-resize-handle';handle.title='برای تغییر عرض بکشید؛ برای بازنشانی دوبار کلیک کنید';head.appendChild(handle);handle.addEventListener('dblclick',event=>{event.preventDefault();event.stopPropagation();widths[index]=defaults[index];apply();localStorage.setItem(key,JSON.stringify(widths))});handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();const startX=event.clientX,startWidth=widths[index];handle.setPointerCapture?.(event.pointerId);handle.classList.add('dragging');document.body.classList.add('column-resizing');const move=moveEvent=>{widths[index]=Math.max(54,Math.min(520,startWidth+startX-moveEvent.clientX));apply()};const up=()=>{handle.classList.remove('dragging');document.body.classList.remove('column-resizing');localStorage.setItem(key,JSON.stringify(widths));handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up)};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up)})});
})();

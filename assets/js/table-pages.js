/* Shared client-side pagination for rendered table datasets.
   Archive retains its existing data-level pager. No requests or record mutations. */
(function(){
 'use strict';
 function pageWindow(total,size,page){
  total=Math.max(0,Math.floor(Number(total)||0));size=Math.max(1,Math.floor(Number(size)||25));
  const pages=Math.max(1,Math.ceil(total/size));page=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
  const start=(page-1)*size,end=Math.min(total,start+size);
  return {total,size,page,pages,start,end};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={pageWindow};
 if(typeof document==='undefined')return;
 function install(){
  const workspace=document.querySelector('.workspace'),footer=document.querySelector('#homeFixedFooter');if(!workspace)return;
  const registry=new WeakMap(),viewBindings=new WeakSet();let serial=0,pending=false;
  const number=n=>Number(n).toLocaleString('fa-IR');
  const scrollTop=wrap=>{wrap.scrollTop=0};
  function addPager(table,wrap){
   if(registry.has(table)||table.closest('#archiveView'))return;
   const view=table.closest('.view'),model={page:1,size:25},pager=document.createElement('div');
   if(!table.id)table.id='pagedTable'+(++serial);
   pager.className='table-pagination';pager.setAttribute('role','navigation');pager.setAttribute('aria-label','صفحه‌بندی '+(view.querySelector('h3')?.textContent||'جدول'));
   pager.innerHTML='<span class="page-range" aria-live="polite"></span><div class="page-controls"><label>تعداد ردیف <select aria-label="تعداد ردیف در هر صفحه"><option value="10">۱۰</option><option value="25" selected>۲۵</option><option value="50">۵۰</option><option value="100">۱۰۰</option><option value="200">۲۰۰</option></select></label><button type="button" data-page="first" aria-label="صفحه اول">اول</button><button type="button" data-page="prev">قبل</button><span class="page-position"></span><button type="button" data-page="next">بعد</button><button type="button" data-page="last" aria-label="صفحه آخر">آخر</button></div>';
   pager.querySelectorAll('button,select').forEach(el=>el.setAttribute('aria-controls',table.id));wrap.after(pager);
   function rows(){return [...(table.tBodies[0]?.rows||[])].filter(row=>!row.hidden&&!row.classList.contains('hidden')&&!row.classList.contains('suite-filtered-out')&&row.style.display!=='none'&&!(row.cells.length===1&&row.cells[0].colSpan>1))}
   function update(){
    const data=rows(),range=pageWindow(data.length,model.size,model.page);model.page=range.page;
    data.forEach((row,i)=>{const hidden=i<range.start||i>=range.end;if(row.classList.contains('table-page-hidden')!==hidden)row.classList.toggle('table-page-hidden',hidden)});
    const rangeText=`${number(range.total?range.start+1:0)} تا ${number(range.end)} از ${number(range.total)} ردیف`,positionText=`${number(range.page)} / ${number(range.pages)}`;
    const rangeNode=pager.querySelector('.page-range'),positionNode=pager.querySelector('.page-position');
    if(rangeNode.textContent!==rangeText)rangeNode.textContent=rangeText;
    if(positionNode.textContent!==positionText)positionNode.textContent=positionText;
    pager.querySelectorAll('[data-page]').forEach(b=>b.disabled=['first','prev'].includes(b.dataset.page)?range.page===1:range.page===range.pages);
    return range;
   }
   pager.addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(!b||b.disabled)return;const range=update();model.page=({first:1,prev:range.page-1,next:range.page+1,last:range.pages})[b.dataset.page];update();scrollTop(wrap)});
   pager.querySelector('select').addEventListener('change',e=>{model.size=Number(e.target.value);model.page=1;update();scrollTop(wrap)});
   const observer=new MutationObserver(()=>update());observer.observe(table,{childList:true,subtree:true});
   registry.set(table,{reveal(id){const data=rows(),index=data.findIndex(r=>String(r.dataset.taskId)===String(id));if(index>=0){model.page=Math.floor(index/model.size)+1;update()}},reset(){model.page=1;update();scrollTop(wrap)},observer});update();
  }
  window.bamcoRevealTask=id=>{const table=document.querySelector('#kanbanView table');registry.get(table)?.reveal(id)};
  function backButton(view){
   if(window.bamcoInteriorUI){window.bamcoInteriorUI.decorateView(view);return}
   const toolbar=[...view.querySelectorAll('.task-toolbar,.vehicle-toolbar,.prod-toolbar')].find(el=>!el.closest('details,dialog,form'));
   let back=view.querySelector('.content-back');
   if(!back){back=document.createElement('button');back.type='button';back.className='content-back';back.textContent='⌂ بازگشت به خانه';back.addEventListener('click',()=>window.bamcoShowHome?.())}
   if(toolbar){if(back.parentElement!==toolbar)toolbar.prepend(back);view.querySelector(':scope>.content-actions')?.remove()}
   else{let bar=view.querySelector(':scope>.content-actions');if(!bar){bar=document.createElement('div');bar.className='content-actions';view.prepend(bar)}if(back.parentElement!==bar)bar.append(back)}
  }
  function scan(){
   pending=false;
   workspace.querySelectorAll(':scope>.view:not(#homeView):not(#welcomeView)').forEach(view=>{
    backButton(view);
    if(!viewBindings.has(view)){
     viewBindings.add(view);
     const reset=e=>{if(!e.target.matches('input:not([type=checkbox]):not([type=radio]),select')||e.target.closest('.table-pagination,#archivePager'))return;view.querySelectorAll('table').forEach(table=>registry.get(table)?.reset())};
     view.addEventListener('input',reset);view.addEventListener('change',reset);
    }
    const tables=[...view.querySelectorAll('table')].filter(t=>!t.closest('dialog'));
    if(tables.length===1){
     const table=tables[0];let wrap=table.parentElement;
     if(wrap.tagName==='TD'||wrap===view)return;
     if(wrap.classList.contains('panel')){const box=document.createElement('div');table.before(box);box.append(table);wrap=box}
     if(!view.classList.contains('focus-table-view'))view.classList.add('focus-table-view');
     if(!wrap.classList.contains('focus-scroll'))wrap.classList.add('focus-scroll');
     addPager(table,wrap);
    }else if(tables.length>1){
     tables.forEach(table=>{const wrap=table.parentElement;if(wrap.classList.contains('table-wrap')||wrap.classList.contains('prod-table-wrap')){wrap.classList.add('focus-scroll');addPager(table,wrap)}});
    }
   });
  }
  function schedule(records){if(records?.every(r=>r.target.nodeType===1&&r.target.closest('.table-pagination,#archivePager')))return;if(!pending){pending=true;queueMicrotask(scan)}}
  new MutationObserver(schedule).observe(workspace,{childList:true,subtree:true});scan();
  if(footer&&typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{document.documentElement.style.setProperty('--home-footer-height',footer.offsetHeight+'px')}).observe(footer);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

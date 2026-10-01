/* Paging and column filters for feature-owned tables. The shared table suite
   intentionally leaves these tables alone because their renderers own the rows. */
(()=>{
  'use strict';
  const models=new WeakMap();
  let sequence=0;
  const fa=value=>Number(value).toLocaleString('fa-IR');
  const rows=table=>[...(table.tBodies[0]?.rows||[])].filter(row=>row.cells.length>1&&!row.querySelector('td[colspan]'));
  const pagerMarkup='<span class="page-range" aria-live="polite"></span><div class="page-controls"><label>تعداد ردیف <select aria-label="تعداد ردیف در هر صفحه"><option value="10">۱۰</option><option value="25" selected>۲۵</option><option value="50">۵۰</option><option value="100">۱۰۰</option></select></label><button type="button" data-page="first">اول</button><button type="button" data-page="prev">قبل</button><span class="page-position"></span><button type="button" data-page="next">بعد</button><button type="button" data-page="last">آخر</button></div>';

  function modelFor(table){
    let model=models.get(table);
    if(model)return model;
    const wrap=table.parentElement;
    if(!wrap)return null;
    const pager=document.createElement('div');
    pager.className='table-pagination reference-pagination';
    pager.setAttribute('role','navigation');
    pager.setAttribute('aria-label','صفحه‌بندی جدول');
    pager.innerHTML=pagerMarkup;
    table.id ||= `referenceTable${++sequence}`;
    pager.querySelectorAll('button,select').forEach(control=>control.setAttribute('aria-controls',table.id));
    wrap.after(pager);
    model={page:1,size:25,filters:{},pager};
    models.set(table,model);
    table.dataset.referenceTable="true";
    pager.addEventListener('click',event=>{
      const button=event.target.closest('[data-page]');
      if(!button||button.disabled)return;
      const pages=Math.max(1,Math.ceil(visibleRows(table,model).length/model.size));
      model.page=({first:1,prev:model.page-1,next:model.page+1,last:pages})[button.dataset.page];
      update(table,model);
      wrap.scrollTop=0;
    });
    pager.querySelector('select').addEventListener('change',event=>{
      model.size=Number(event.target.value)||25;
      model.page=1;
      update(table,model);
      wrap.scrollTop=0;
    });
    table.addEventListener('change',event=>{
      const select=event.target.closest('.reference-filters select');
      if(!select)return;
      model.filters[Number(select.dataset.column)]=select.value;
      model.page=1;
      update(table,model);
    });
    return model;
  }

  function ensureFilters(table,model){
    const head=table.tHead?.rows[0];
    if(!head)return;
    let filterRow=table.tHead.querySelector('.reference-filters');
    if(!filterRow||filterRow.cells.length!==head.cells.length){
      filterRow?.remove();
      filterRow=document.createElement('tr');
      filterRow.className='reference-filters';
      [...head.cells].forEach((cell,index)=>{
        const th=document.createElement('th'),select=document.createElement('select');
        select.dataset.column=String(index);
        select.setAttribute('aria-label','فیلتر '+cell.textContent.trim());
        th.append(select);
        filterRow.append(th);
      });
      table.tHead.append(filterRow);
    }
    const data=rows(table);
    [...filterRow.querySelectorAll('select')].forEach((select,index)=>{
      const values=[...new Set(data.map(row=>row.cells[index]?.textContent.trim()||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa',{numeric:true}));
      const signature=JSON.stringify(values);
      if(select.dataset.values===signature)return;
      select.replaceChildren(new Option('همه',''),...values.map(value=>new Option(value,value)));
      select.dataset.values=signature;
      if(!values.includes(model.filters[index]))model.filters[index]='';
      select.value=model.filters[index]||'';
    });
  }

  function visibleRows(table,model){
    const data=rows(table);
    data.forEach(row=>{
      const filtered=Object.entries(model.filters).some(([column,value])=>value&&row.cells[Number(column)]?.textContent.trim()!==value);
      row.classList.toggle('reference-filtered-out',filtered);
    });
    return data.filter(row=>!row.classList.contains('reference-filtered-out')&&!row.hidden&&!row.classList.contains('hidden'));
  }

  function update(table,model){
    const data=visibleRows(table,model);
    const pages=Math.max(1,Math.ceil(data.length/model.size));
    model.page=Math.max(1,Math.min(model.page,pages));
    const start=(model.page-1)*model.size,end=Math.min(data.length,start+model.size);
    rows(table).forEach(row=>row.classList.remove('reference-page-hidden'));
    data.forEach((row,index)=>row.classList.toggle('reference-page-hidden',index<start||index>=end));
    const range=`${fa(data.length?start+1:0)} تا ${fa(end)} از ${fa(data.length)} ردیف`;
    const position=`${fa(model.page)} / ${fa(pages)}`;
    const rangeNode=model.pager.querySelector('.page-range'),positionNode=model.pager.querySelector('.page-position');
    if(rangeNode.textContent!==range)rangeNode.textContent=range;
    if(positionNode.textContent!==position)positionNode.textContent=position;
    model.pager.querySelectorAll('[data-page]').forEach(button=>button.disabled=['first','prev'].includes(button.dataset.page)?model.page===1:model.page===pages);
  }

  function refresh(table,{filters=false}={}){
    if(!table?.tBodies[0])return;
    const model=modelFor(table);
    if(!model)return;
    if(filters)ensureFilters(table,model);
    window.bamcoTableSuite?.refresh(table,{filters:false,onRowsChanged:()=>{model.page=1;update(table,model)}});
    update(table,model);
  }
  window.bamcoReferenceTable=Object.freeze({refresh});
  document.addEventListener('bamco-table-suite-ready',()=>document.querySelectorAll('table[data-reference-table]').forEach(table=>refresh(table)));
})();

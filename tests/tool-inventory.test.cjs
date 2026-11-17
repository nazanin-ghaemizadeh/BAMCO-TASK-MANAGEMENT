const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture,until} = require('./helpers/app-fixture.cjs');

function seed() {
  const tool={id:'asset-1',name:'جعبه بکس ۱/۲',asset_code:'۲',purchased_on:'2026-11-11',purchase_receiver:'کامیاب شاه‌آبادی',revision:1};
  const components=[
    {id:'part-10',tool_id:tool.id,component_no:1,component_code:'۲-C-0001',component_name:'بکس شماره ۱۰',serial_number:null,description:null,is_primary:true,is_container:false,active:true,revision:1},
    {id:'part-11',tool_id:tool.id,component_no:2,component_code:'۲-C-0002',component_name:'بکس شماره ۱۱',serial_number:null,description:null,is_primary:false,is_container:false,active:true,revision:1},
    {id:'part-12',tool_id:tool.id,component_no:3,component_code:'۲-C-0003',component_name:'بکس شماره ۱۲',serial_number:'S-12',description:null,is_primary:false,is_container:false,active:true,revision:1}
  ];
  return {tool,components};
}
function fakeDatabase(tables) {
  let batchNo=0,movementNo=0;
  return ({endpoint,method,body,data})=>{
    if(endpoint==='effective_feature_access')return {...data,grants:[...(data?.grants||[]),{feature_key:'tools',can_view:true,can_create:true,can_edit:true,can_delete:true,can_export:true,can_manage_access:false,can_bypass_approval:false}]};
    if(method==='POST'&&endpoint==='tool_components'){
      data.forEach(row=>{
        row.id='component-'+(tables.tool_components.length);
        row.component_no=Math.max(0,...tables.tool_components.filter(x=>x.tool_id===row.tool_id).map(x=>Number(x.component_no||0)))+1;
        row.component_code='۲-C-'+String(row.component_no).padStart(4,'0');
        row.revision=1;
      });
    }
    if(method==='PATCH'&&endpoint==='tool_components')data.forEach(row=>row.revision++);
    if(method==='POST'&&endpoint==='tool_assets'){
      data.forEach(row=>{
        row.revision=1;
        tables.tool_components.push({id:'primary-'+row.id,tool_id:row.id,component_no:1,component_code:row.asset_code+'-C-0001',component_name:row.name,is_primary:true,is_container:false,active:true,revision:1});
      });
    }
    if(method==='PATCH'&&endpoint==='tool_assets')data.forEach(row=>row.revision++);
    if(endpoint==='checkout_tool_components'){
      const batch={id:'batch-'+(++batchNo),tool_id:body.p_tool_id,action:'exit',occurred_at:body.p_occurred_at,receiver:body.p_receiver,deliverer:body.p_deliverer,kind:body.p_kind,reason:body.p_reason};
      tables.tool_movement_batches.push(batch);
      const rows=body.p_component_ids.map(id=>{
        const row={id:'movement-'+(++movementNo),tool_id:body.p_tool_id,component_id:id,exit_batch_id:batch.id,entry_batch_id:null,kind:body.p_kind,exited_at:body.p_occurred_at,exit_receiver:body.p_receiver,exit_deliverer:body.p_deliverer,reason:body.p_reason,entered_at:null,entry_receiver:null,entry_deliverer:null,revision:1};
        tables.tool_movements.push(row);return row;
      });
      return rows;
    }
    if(endpoint==='return_tool_components'){
      const batch={id:'batch-'+(++batchNo),tool_id:body.p_tool_id,action:'return',occurred_at:body.p_occurred_at,receiver:body.p_receiver,deliverer:body.p_deliverer,reason:body.p_reason};
      tables.tool_movement_batches.push(batch);
      return tables.tool_movements.filter(row=>row.tool_id===body.p_tool_id&&body.p_component_ids.includes(row.component_id)&&!row.entered_at).map(row=>{
        Object.assign(row,{entered_at:body.p_occurred_at,entry_receiver:body.p_receiver,entry_deliverer:body.p_deliverer,entry_batch_id:batch.id,revision:row.revision+1});return row;
      });
    }
  };
}
async function select(view,ids) {
  for(const id of ids){const checkbox=view.querySelector('[data-component-select][value="'+id+'"]');assert.ok(checkbox,'missing component '+id);checkbox.checked=true;checkbox.dispatchEvent(new view.ownerDocument.defaultView.Event('change',{bubbles:true}))}
}
async function submit(f,values) {
  const form=f.d.querySelector('#toolInventoryEditor[open] form');assert.ok(form,'editor is open');
  for(const [name,value] of Object.entries(values)){const field=form.elements.namedItem(name);assert.ok(field,'field '+name);if(field.type==='checkbox')field.checked=!!value;else field.value=value}
  form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>!f.d.querySelector('#toolInventoryEditor[open]'));
}
async function openCard(f) {
  await f.open('tools');
  const view=f.d.querySelector('#toolsView');
  await until(()=>view.querySelector('.tool-card[data-tool="asset-1"]'));
  view.querySelector('.tool-card[data-tool="asset-1"]').click();
  await until(()=>view.querySelector('[data-component="part-10"]'));
  return view;
}

test('each component can be checked out and returned independently; one grouped checkout shares a batch',async t=>{
  const {tool,components}=seed();
  const tables={tool_assets:[tool],tool_components:components,tool_movements:[],tool_movement_batches:[]};
  const f=await fixture({styles:true,tables,fetchResult:fakeDatabase(tables)});
  t.after(()=>f.dispose());
  const view=await openCard(f);
  assert.match(view.querySelector('.tool-component-summary').textContent,/۳/);
  await select(view,['part-10','part-11']);
  assert.equal(view.querySelector('[data-action=exit]').hidden,false);
  view.querySelector('[data-action=exit]').click();
  await submit(f,{dateText:'۱۴۰۵/۰۸/۲۶',time:'۰۸:۳۰',receiver:'کامیاب شاه‌آبادی',deliverer:'انباردار',kind:'outside',reason:'تحویل جهت استفاده'});
  assert.equal(tables.tool_movements.length,2);
  assert.equal(new Set(tables.tool_movements.map(row=>row.exit_batch_id)).size,1);
  assert.equal(tables.tool_movements[0].component_id,'part-10');
  assert.equal(tables.tool_movements[1].component_id,'part-11');

  await select(view,['part-10']);
  assert.equal(view.querySelector('[data-action=return]').hidden,false);
  view.querySelector('[data-action=return]').click();
  await submit(f,{dateText:'۱۴۰۵/۰۸/۲۶',time:'۱۲:۰۰',receiver:'انباردار',deliverer:'کامیاب شاه‌آبادی',reason:'عودت قطعه'});
  assert.ok(tables.tool_movements.find(row=>row.component_id==='part-10').entered_at);
  assert.equal(tables.tool_movements.find(row=>row.component_id==='part-11').entered_at,null);
  assert.equal(tables.tool_movements.find(row=>row.component_id==='part-12'),undefined);

  await select(view,['part-10']);
  view.querySelector('[data-action=history]').click();
  await until(()=>!view.querySelector('.tool-history-panel').hidden);
  assert.equal(view.querySelectorAll('.tool-history-table tbody tr').length,2);
  assert.match(view.querySelector('[data-history-title]').textContent,/بکس شماره ۱۰/);
  assert.equal(tables.tool_movement_batches.filter(row=>row.action==='exit').length,1);
  assert.equal(tables.tool_movement_batches.filter(row=>row.action==='return').length,1);
});

test('a kit container remains editable while only real child components can be checked out',async t=>{
  const {tool,components}=seed();
  const tables={tool_assets:[tool],tool_components:components,tool_movements:[],tool_movement_batches:[]};
  const f=await fixture({styles:true,tables,fetchResult:fakeDatabase(tables)});
  t.after(()=>f.dispose());
  const view=await openCard(f);
  await select(view,['part-10']);
  view.querySelector('[data-action=componentEdit]').click();
  await submit(f,{component_name:'جعبه مجموعه',serial_number:'BOX-1',description:'محفظه اصلی',is_container:true});
  const container=view.querySelector('[data-component="part-10"]');
  assert.match(container.textContent,/محفظه/);
  await select(view,['part-10']);
  assert.equal(view.querySelector('[data-action=componentEdit]').hidden,false);
  assert.equal(view.querySelector('[data-action=exit]').hidden,true);

  view.querySelector('[data-action=componentAdd]').click();
  await submit(f,{component_name:'بکس شماره ۱۵',serial_number:'SOCKET-15',description:'قطعه افزوده',is_container:false});
  const added=tables.tool_components.find(row=>row.component_name==='بکس شماره ۱۵');
  assert.ok(added.component_code);
  assert.equal(added.component_no,4);
  await select(view,[added.id]);
  assert.equal(view.querySelector('[data-action=exit]').hidden,false);
  view.querySelector('[data-action=exit]').click();
  await submit(f,{dateText:'۱۴۰۵/۰۸/۲۶',time:'۰۹:۰۰',receiver:'متولی',deliverer:'انبار',kind:'repair',reason:'ارسال برای تعمیر'});
  assert.equal(tables.tool_movements.length,1);
  assert.equal(tables.tool_movements[0].component_id,added.id);
  assert.equal(tables.tool_movements[0].kind,'repair');
});

test('new parent tool cards receive a primary individually tracked component',async t=>{
  const tables={tool_assets:[],tool_components:[],tool_movements:[],tool_movement_batches:[]};
  const f=await fixture({styles:true,tables,fetchResult:fakeDatabase(tables)});
  t.after(()=>f.dispose());
  await f.open('tools');
  const view=f.d.querySelector('#toolsView');
  await until(()=>view.querySelector('[data-action=asset]:not([hidden])'));
  view.querySelector('[data-action=asset]').click();
  await submit(f,{name:'دریل شارژی',asset_code:'T-77',purchase_receiver:'کامیاب شاه‌آبادی'});
  await until(()=>view.querySelector('.tool-card[data-tool="1000"]'));
  assert.equal(tables.tool_components.length,1);
  assert.equal(tables.tool_components[0].component_name,'دریل شارژی');
  assert.equal(tables.tool_components[0].is_primary,true);
});
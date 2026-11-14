const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture,until} = require('./helpers/app-fixture.cjs');

test('tool cards follow the four custody roles across a checkout, repair and receipt', async t => {
  const f = await fixture({styles:true,tables:{tool_assets:[],tool_movements:[]},fetchResult({endpoint,method,data,tables}) {
    if (method==='POST' && ['tool_assets','tool_movements'].includes(endpoint)) Object.assign(data[0],{id:String(data[0].id),revision:1});
    if (method==='PATCH' && endpoint.startsWith('tool_')) data.forEach(row=>{row.revision++});
    if (method==='GET' && endpoint==='tool_movements') return data.slice().reverse();
    if (method==='GET' && endpoint==='tool_assets') return data.map(tool=>({...tool,latest:tables.tool_movements.filter(row=>row.tool_id===tool.id).slice(-1)}));
  }});
  t.after(()=>f.dispose());
  await f.open('tools');
  const {d,w}=f, view=d.querySelector('#toolsView');
  const find=selector=>until(()=>view.querySelector(selector+':not([hidden])'));
  async function click(selector) { await find(selector); view.querySelector(selector).click(); }
  async function submit(values) {
    const form=d.querySelector('.tool-editor[open] form');assert.ok(form);
    for(const [name,value] of Object.entries(values)) form.elements.namedItem(name).value=value;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>!d.querySelector('.tool-editor[open]'));
  }
  await click('[data-action=asset]');
  await submit({name:'آچار',asset_code:'T-24',purchase_receiver:'خریدار',dateText:'۱۴۰۴/۰۶/۰۱'});
  await find('.tool-card[data-state=stock]');
  const style=element=>w.getComputedStyle(element);
  const toolbar=view.querySelector('.vehicle-toolbar'), reference=d.querySelector('#vehicleTemporaryView .vehicle-toolbar');
  for (const key of ['backgroundColor','padding','gap','minHeight','borderTopWidth','borderBottomWidth']) assert.equal(style(toolbar)[key],style(reference)[key],key);
  for (const key of ['backgroundColor','color','borderRadius','fontFamily']) assert.equal(style(toolbar.querySelector('button'))[key],style(reference.querySelector('button'))[key],key);
  assert.ok(parseFloat(style(view.querySelector('.tool-grid')).paddingTop)>0);
  const card = view.querySelector('.tool-card');
  assert.match(card.textContent,/۱۴۰۴\/۰۶\/۰۱/);
  assert.match(card.textContent,/اکنون در اختیار—/);
  const search = view.querySelector('[data-tool-search]');
  search.focus();search.value='T-24';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  const filteredCard=view.querySelector('.tool-card');
  w.dispatchEvent(new w.Event('bamco:feature-access-changed'));
  assert.equal(view.querySelector('.tool-card'),filteredCard);assert.equal(d.activeElement,search);
  assert.equal(view.querySelector('.vehicle-toolbar [data-home-action]').textContent,'بازگشت به خانه');
  for(const [kind,from,to] of [['outside','08:30','12:45'],['repair','14:00','16:00']]) {
    await click('.tool-card');await find('[data-action=exit]');
    const activeTable=view.querySelector('table');
    w.dispatchEvent(new w.Event('bamco:feature-access-changed'));
    d.dispatchEvent(new w.CustomEvent('bamco:department-selected',{detail:{resolved:true}}));
    assert.equal(view.querySelector('table'),activeTable);
    assert.equal(view.querySelector('[data-home-action]'),null);
    assert.equal(view.querySelector('.vehicle-toolbar button').textContent,'بازگشت به کارت‌ها');
    await click('[data-action=exit]');
    const form=d.querySelector('.tool-editor[open] form');
    assert.equal(form.elements.time.type,'text');
    assert.equal(style(form.elements.kind).height,style(form.elements.reason).height);
    assert.equal(style(form.elements.reason).height,'42px');
    for(const [name,value] of Object.entries({time:'۲۴:۶۰',receiver:'متولی',deliverer:'انبار',reason:'تست'}))form.elements[name].value=value;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    assert.match(form.querySelector('[role=alert]').textContent,/۲۴ ساعته/);
    await submit({dateText:'۱۴۰۵/۰۸/۲۳',time:kind==='outside'?'۸:۳۰':from,kind,reason:'تست',receiver:'متولی',deliverer:'انباردار اول'});
    await find('[data-action=return]');assert.equal(view.querySelector('[data-action=exit]').hidden,true);
    await click('[data-action=list]');await find(`.tool-card[data-state=${kind}]`);assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیارمتولی/);
    await click('.tool-card');await click('[data-action=return]');
    await submit({dateText:'۱۴۰۵/۰۸/۲۳',time:to,receiver:'انباردار دوم',deliverer:'نماینده'});
    await find('[data-action=exit]');
    const table=view.querySelector('.vehicle-table-wrap .vehicle-data-table');
    assert.equal(table.tHead.rows[0].cells.length,10);assert.equal(table.querySelectorAll('.vehicle-filters select').length,10);assert.ok(view.querySelector('.reference-pagination'));
    const cells=[...table.tBodies[0].rows[0].cells].map(cell=>cell.textContent);
    assert.deepEqual([cells[3],cells[4],cells[8],cells[9]],['متولی','انباردار اول','انباردار دوم','نماینده']);
    await click('[data-action=list]');await find('.tool-card[data-state=stock]');assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیار—/);
  }
  assert.equal(f.tables.tool_movements.length,2);
});

test('edit cards from the grid, correct open and closed history rows, and confirm deletion', async t => {
  const tool = {id:'asset',name:'دریل',asset_code:'T-1',purchased_on:null,revision:1};
  const closed = {id:'closed',tool_id:tool.id,kind:'outside',exited_at:'2026-11-14T07:00:00',entered_at:'2026-11-14T09:00:00',exit_receiver:'الف',exit_deliverer:'ب',entry_receiver:'ج',entry_deliverer:'د',reason:'بازدید',revision:1};
  const open = {...closed,id:'open',exited_at:'2026-11-14T11:00:00',entered_at:null,entry_receiver:null,entry_deliverer:null};
  const f = await fixture({tables:{tool_assets:[tool],tool_movements:[open,closed]},fetchResult({endpoint,method,data,tables}) {
    if (method==='GET' && endpoint==='tool_assets') return data.map(asset=>({...asset,latest:tables.tool_movements.filter(row=>row.tool_id===asset.id && !row.entered_at)}));
    if (method==='PATCH') data.forEach(row=>{row.revision++});
  }});
  t.after(()=>f.dispose());
  await f.open('tools');
  const {d,w} = f, view = d.querySelector('#toolsView');
  const wait = selector => until(()=>view.querySelector(selector));
  const click = async selector => {await wait(selector+':not([hidden]):not(:disabled)');view.querySelector(selector).click()};
  async function edit(values) {
    const form=d.querySelector('.tool-editor[open] form');assert.ok(form);
    for (const [name,value] of Object.entries(values)) form.elements.namedItem(name).value=value;
    form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>!d.querySelector('.tool-editor[open]'));
  }
  await click('[data-action=edit]');await edit({name:'دریل برقی',asset_code:'T-2'});
  await until(()=>view.querySelector('.tool-card')?.textContent.includes('T-2'));
  await click('.tool-card');await wait('[data-movement=open]');
  assert.equal(view.querySelector('[data-action=editRow]').disabled,true);
  await click('[data-movement=open] input');await click('[data-action=editRow]');
  assert.equal(d.querySelector('.tool-editor [name=entry_time]'),null);
  await edit({kind:'repair',receiver:'تعمیرکار',time:'۱۱:۳۰',reason:'تعمیر موتور'});
  await until(()=>view.querySelector('[data-movement=open]')?.textContent.includes('تعمیر موتور'));
  await click('[data-action=list]');await wait('.tool-card[data-state=repair]');
  assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیارتعمیرکار/);
  await click('.tool-card');await click('[data-movement=closed]');await click('[data-action=editRow]');
  const form = d.querySelector('.tool-editor[open] form');
  assert.equal(form.elements.entry_time.value,'۰۹:۰۰');
  assert.equal(form.elements.entry_receiver.value,'ج');
  await edit({entry_time:'۰۹:۱۵',entry_deliverer:'پیمانکار',deliverer:'انباردار'});
  await until(()=>view.querySelector('[data-movement=closed]')?.textContent.includes('پیمانکار'));
  await click('[data-movement=open]');
  let prompt = '', confirmed = false;
  w.bamcoConfirm=async message=>{prompt=message;return confirmed};
  await click('[data-action=deleteRow]');await until(()=>prompt.includes('ردیف خروج'));
  assert.equal(f.tables.tool_movements.length,2);
  confirmed=true;await click('[data-action=deleteRow]');await until(()=>!view.querySelector('[data-movement=open]'));
  assert.ok(view.querySelector('[data-movement=closed]'));
  await click('[data-action=list]');await wait('.tool-card[data-state=stock]');
  assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیار—/);
  confirmed=false;await click('[data-action=deleteAsset]');await until(()=>prompt.includes('تمام سوابق'));
  assert.ok(view.querySelector('.tool-card'));
  confirmed=true;await click('[data-action=deleteAsset]');await until(()=>view.querySelector('.tool-empty')?.textContent.includes('هنوز ابزاری'));
  assert.equal(f.tables.tool_assets.length,0);
});

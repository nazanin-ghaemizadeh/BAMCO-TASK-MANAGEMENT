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

test('one toolbar handles card edits and deletes, and row corrections keep the other rows in place', async t => {
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
  assert.equal(view.querySelector('[data-action=edit],[data-action=deleteAsset]'),null);
  await click('.tool-card');await wait('[data-movement=open]');
  assert.equal(view.querySelectorAll('[data-action=edit]').length,1);
  assert.equal(view.querySelectorAll('[data-action=deleteAsset]').length,1);
  const reads = () => f.calls.filter(c=>c.method==='GET' && ['tool_movements','tool_assets'].includes(c.endpoint)).length;
  const initialReads = reads(), closedElement = view.querySelector('[data-movement=closed]');
  await click('[data-action=edit]');await edit({name:'دریل برقی',asset_code:'T-2'});
  assert.match(view.querySelector('h3').textContent,/دریل برقی · T-2/);
  assert.equal(view.querySelector('[data-action=editRow]').disabled,true);
  assert.equal(view.querySelector('tbody input'),null);
  await click('[data-movement=open] td');
  const active = view.querySelector('[data-movement=open]');
  assert.ok(active.classList.contains('vehicle-selected') && active.classList.contains('task-selected'));
  assert.equal(active.getAttribute('aria-selected'),'true');
  assert.equal(active.tabIndex,0);
  await click('[data-movement=closed] td');
  assert.equal(view.querySelectorAll('tr[aria-selected=true]').length,2);
  assert.equal(view.querySelector('[data-action=editRow]').disabled,true);
  assert.equal(view.querySelector('[data-action=deleteRow]').disabled,false);
  view.querySelector('[data-movement=closed]').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
  assert.equal(view.querySelector('[data-movement=closed]').getAttribute('aria-selected'),'false');
  await click('[data-action=editRow]');
  assert.equal(d.querySelector('.tool-editor [name=entry_time]'),null);
  await edit({kind:'repair',receiver:'تعمیرکار',time:'۱۱:۳۰',reason:'تعمیر موتور'});
  await until(()=>view.querySelector('[data-movement=open]')?.textContent.includes('تعمیر موتور'));
  assert.equal(view.querySelector('[data-movement=closed]'),closedElement);
  assert.equal(reads(),initialReads);
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
  await click('.tool-card');
  confirmed=false;await click('[data-action=deleteAsset]');await until(()=>prompt.includes('تمام سوابق'));
  assert.match(view.querySelector('h3').textContent,/دریل برقی/);
  confirmed=true;await click('[data-action=deleteAsset]');await until(()=>view.querySelector('.tool-empty')?.textContent.includes('هنوز ابزاری'));
  assert.equal(f.tables.tool_assets.length,0);
});

test('return form and save work while the initial history request is still pending', async t => {
  const row = {id:'movement',tool_id:'tool',revision:3,kind:'repair',exited_at:'2026-01-01T08:00:00',entered_at:null,exit_receiver:'تعمیرکار',exit_deliverer:'انبار',reason:'تعمیر'};
  const asset = {id:'tool',revision:1,name:'دریل',asset_code:'T2',latest:[row]};
  let release, historyReads=0;
  const f=await fixture({tables:{tool_assets:[asset],tool_movements:[row]},fetchResult({endpoint,method,data}) {
    if(endpoint==='tool_movements' && method==='GET'){
      historyReads++;
      const old=structuredClone(data);
      return new Promise(resolve=>{release=()=>resolve(old)});
    }
    if(endpoint==='tool_movements' && method==='PATCH') data[0].revision++;
  }});
  t.after(()=>{release?.();return f.dispose()});
  await f.open('tools');
  const {w,d}=f, view=d.querySelector('#toolsView');
  view.querySelector('.tool-card').click();
  await until(()=>release);
  const button=view.querySelector('[data-action=return]');
  assert.equal(button.hidden,false);
  button.click();
  const form=d.querySelector('.tool-editor[open] form');
  assert.equal(form.elements.deliverer.value,row.exit_receiver);
  form.elements.receiver.value='انباردار';
  form.requestSubmit();
  await until(()=>!d.querySelector('.tool-editor[open]') && !view.querySelector('[data-action=exit]').hidden);
  release();await until(()=>view.querySelector('tr[data-revision="4"]'));
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.equal(historyReads,1);
  assert.equal(view.querySelectorAll('[data-movement]').length,1);
  assert.match(view.querySelector('tbody').textContent,/انباردار/);
  assert.equal(view.querySelector('[data-action=return]').hidden,true);
  assert.equal(f.calls.filter(c=>c.endpoint==='tool_movements'&&c.method==='PATCH').length,1);
});

test('confirmed batch deletion uses just the selected movement IDs and their displayed revisions', async t => {
  const asset = {id:'tool',name:'آچار',asset_code:'T-2',revision:1,latest:[]};
  const movements = ['a','b','c'].map((id,index)=>({id,tool_id:asset.id,exited_at:`2026-01-0${index+1}T08:35:00`,entered_at:`2026-01-0${index+1}T09:35:00`,exit_receiver:'الف',exit_deliverer:'ب',reason:'پایش',kind:'outside',revision:1}));
  const f=await fixture({tables:{tool_assets:[asset],tool_movements:movements}});
  t.after(()=>f.dispose());
  await f.open('tools');
  const view=f.d.querySelector('#toolsView'), button=view.querySelector('.tool-card');
  button.click();await until(()=>view.querySelector('[data-movement=c]'));
  const choose = id=>view.querySelector(`[data-movement="${id}"] td`).click();
  choose('a');choose('c');
  const remove = view.querySelector('[data-action=deleteRow]');
  let confirmed = false;
  f.w.bamcoConfirm = async prompt=>{assert.match(prompt,/۲ ردیف انتخاب‌شده/);return confirmed};
  remove.click();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.calls.filter(c=>c.method==='DELETE' && c.endpoint==='tool_movements').length,0);
  f.tables.tool_movements.find(m=>m.id==='c').revision=2;
  confirmed = true;remove.click();await until(()=>!view.querySelector('[data-movement=a]'));
  assert.deepEqual(f.tables.tool_movements.map(r=>r.id),['b','c']);
  assert.equal(view.querySelector('[data-movement=c]').dataset.revision,'2');
  const calls = f.calls.filter(c=>c.method==='DELETE' && c.endpoint==='tool_movements');
  assert.equal(calls.length,1);
  const params = new URL(calls[0].url).searchParams;
  assert.equal(params.get('tool_id'),'eq.tool');
  assert.equal(params.get('or'),'(and(id.eq.a,revision.eq.1),and(id.eq.c,revision.eq.1))');
});

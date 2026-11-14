const {test} = require('node:test');
const assert = require('node:assert/strict');
const {fixture,until} = require('./helpers/app-fixture.cjs');

test('tool cards follow the four custody roles across a checkout, repair and receipt', async t => {
  const f = await fixture({tables:{tool_assets:[],tool_movements:[]},fetchResult({endpoint,method,data,tables}) {
    if (method==='POST' && ['tool_assets','tool_movements'].includes(endpoint)) data[0].id=String(data[0].id);
    if (method==='GET' && endpoint==='tool_movements') return data.slice().reverse();
    if (method==='GET' && endpoint==='tool_assets') return data.map(tool=>({...tool,latest:tables.tool_movements.filter(row=>row.tool_id===tool.id).slice(-1)}));
  }});
  t.after(()=>f.dispose());
  await f.open('tools');
  const {d,w}=f, view=d.querySelector('#toolsView');
  const find=selector=>until(()=>view.querySelector(selector));
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
  assert.match(view.querySelector('.tool-card').textContent,/۱۴۰۴\/۰۶\/۰۱/);
  for(const [kind,from,to] of [['outside','08:30','12:45'],['repair','14:00','16:00']]) {
    await click('.tool-card');await click('[data-action=exit]');
    await submit({dateText:'۱۴۰۵/۰۸/۲۳',time:from,kind,reason:'تست',receiver:'متولی',deliverer:'انباردار اول'});
    await find('[data-action=return]');assert.equal(view.querySelector('[data-action=exit]'),null);
    await click('[data-action=list]');await find(`.tool-card[data-state=${kind}]`);assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیارمتولی/);
    await click('.tool-card');await click('[data-action=return]');
    await submit({dateText:'۱۴۰۵/۰۸/۲۳',time:to,receiver:'انباردار دوم',deliverer:'نماینده'});
    await find('[data-action=exit]');
    const table=view.querySelector('.vehicle-table-wrap .vehicle-data-table');
    assert.equal(table.tHead.rows[0].cells.length,10);assert.equal(table.querySelectorAll('.vehicle-filters select').length,10);assert.ok(view.querySelector('.reference-pagination'));
    const cells=[...table.tBodies[0].rows[0].cells].map(cell=>cell.textContent);
    assert.deepEqual([cells[3],cells[4],cells[8],cells[9]],['متولی','انباردار اول','انباردار دوم','نماینده']);
    await click('[data-action=list]');await find('.tool-card[data-state=stock]');assert.match(view.querySelector('.tool-card').textContent,/اکنون در اختیارانباردار دوم/);
  }
  assert.equal(f.tables.tool_movements.length,2);
});

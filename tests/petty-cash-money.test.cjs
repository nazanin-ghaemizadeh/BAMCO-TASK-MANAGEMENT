const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('petty cash edits retain every large rial digit and send an exact ungrouped string', async t => {
  const row = { id: 'cash-exact', version: 1, entry_no: 1, event_date: '2026-10-01', entry_type: 'receipt', amount: '999999999999999999', status: 'active', category: 'Office', description: 'Large exact entry', responsible_id: 'test-manager' };
  const f = await fixture({ tables: { petty_cash_entries: [row], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); await until(() => f.d.querySelector('[data-detail="cash-exact"]'));
  assert.match(f.d.querySelector('#pettyCashBody').textContent, /۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹/);
  assert(f.calls.some(call => call.endpoint === 'petty_cash_entries' && new URL(call.url).searchParams.get('select')?.includes('amount::text')));
  f.d.querySelector('[data-detail="cash-exact"]').click(); f.d.querySelector('#pettyCashDetail [data-edit]').click();
  const form = f.d.querySelector('#pettyCashDialog form');
  assert.equal(form.elements.amount.value, '۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹');
  await form.onsubmit({ preventDefault() {} });
  const saved = f.calls.findLast(call => call.endpoint === 'petty_cash_entries' && call.method === 'PATCH');
  assert.equal(saved.body.amount, '999999999999999999'); assert.equal(typeof saved.body.amount, 'string');
  assert.equal(f.d.querySelector('#pettyCashDialog').open, false); assert.deepEqual(f.errors, []);
});

test('petty cash entry validation rejects decimal rial and retains typed text without a write', async t => {
  const f = await fixture({ tables: { petty_cash_entries: [], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); f.d.querySelector('#addCashEntry').click();
  const form = f.d.querySelector('#pettyCashDialog form'); form.elements.category.value = 'بنزین'; form.elements.description.value = 'Expense';
  for (const value of ['1,200.50', '-1', '0', '1000000000000000000', '12oops']) {
    form.elements.amount.value = value; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
    await form.onsubmit({ preventDefault() {} });
    assert.ok(form.querySelector('.form-error').textContent); assert.equal(f.d.querySelector('#pettyCashDialog').open, true);
  }
  assert.equal(f.calls.filter(call => call.endpoint === 'petty_cash_entries' && call.method === 'POST').length, 0);
  form.elements.amount.value = '۱۲۳۴۵۶۷'; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '۱,۲۳۴,۵۶۷');
  assert.equal(form.elements.amount.dir, 'ltr', 'shared text-direction inference must not flip a money field');
  form.elements.amount.setSelectionRange(3, 3); form.elements.amount.setRangeText('۹', 3, 3, 'end');
  form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '۱۲,۹۳۴,۵۶۷'); assert.equal(form.elements.amount.selectionStart, 4); assert.equal(form.elements.amount.dir, 'ltr');
  form.elements.amount.value = '۱۲۳۴۵۶۷'; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await form.onsubmit({ preventDefault() {} });
  assert.equal(f.calls.findLast(call => call.endpoint === 'petty_cash_entries' && call.method === 'POST').body.amount, '1234567');
  assert.deepEqual(f.errors, []);
});

test('petty cash categories are Persian sorted and a receipt saves without a description or removed fields', async t => {
  const f = await fixture({ tables: { petty_cash_entries: [], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); f.d.querySelector('#addCashEntry').click();
  const form = f.d.querySelector('#pettyCashDialog form');
  assert.equal(form.elements.category.tagName, 'SELECT');
  assert.deepEqual([...form.elements.category.options].slice(1).map(option => option.value), ['آموزش','اثاثه','ایاب و ذهاب','بنزین','تنخواه ماموریت','خدمات','ملزومات مصرفی','نگهداری و تعمیرات','هوش مصنوعی']);
  for (const name of ['counterparty','cost_center','document_no','notes']) assert.equal(form.elements.namedItem(name), null);
  assert.equal(form.elements.description.required, false);
  form.elements.category.value = 'آموزش';
  form.elements.amount.value = '1234567'; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '۱,۲۳۴,۵۶۷');
  await form.onsubmit({ preventDefault() {} });
  const saved = f.calls.findLast(call => call.endpoint === 'petty_cash_entries' && call.method === 'POST');
  assert.equal(saved.body.description, ''); assert.equal(saved.body.category, 'آموزش'); assert.equal(saved.body.amount, '1234567');
  for (const name of ['counterparty','cost_center','document_no','notes']) assert.equal(name in saved.body, false);
  assert.equal(f.d.querySelector('#pettyCashDialog').open, false); assert.deepEqual(f.errors, []);
});

test('petty cash sorts by expense date before assigning sequential display rows and exports a real category workbook',async t=>{
 const rows=[
  {id:'gas-later',entry_no:99,event_date:'2026-10-03',entry_type:'expense',amount:'800',category:'بنزین',responsible_id:'test-manager',payment_method:'کارت',description:'بنزین دوم',status:'active'},
  {id:'gas-earlier',entry_no:7,event_date:'2026-10-01',entry_type:'expense',amount:'100',category:'بنزین',responsible_id:'test-manager',payment_method:'نقدی',description:'بنزین اول',status:'active'},
  {id:'received',entry_no:12,event_date:'2026-10-02',entry_type:'receipt',amount:'1500',category:'خدمات',responsible_id:'test-manager',payment_method:'کارت',description:'دریافت',status:'active'},
  {id:'void',entry_no:44,event_date:'2026-10-04',entry_type:'expense',amount:'900',category:'بنزین',responsible_id:'test-manager',payment_method:'نقدی',description:'باطل',status:'void'},
  {id:'training',entry_no:60,event_date:'2026-10-02',entry_type:'expense',amount:'200',category:'آموزش',responsible_id:'test-manager',payment_method:'کارت',description:'آموزش',status:'active'}
 ];
 const f=await fixture({tables:{petty_cash_entries:rows,petty_cash_attachments:[{id:'doc',entry_id:'gas-earlier'}]}});t.after(()=>f.dispose());
 await f.open('pettyCash');await until(()=>f.d.querySelectorAll('#pettyCashBody tr[data-entry]').length===5);
 const table=[...f.d.querySelectorAll('#pettyCashBody tr[data-entry]')];
 assert.deepEqual(table.map(tr=>tr.dataset.entry),['gas-earlier','received','training','gas-later','void']);
 assert.deepEqual(table.map(tr=>tr.cells[0].textContent),['۱','۲','۳','۴','۵']);
 assert.deepEqual(table.map(tr=>tr.cells[1].textContent),['۷','۱۲','۶۰','۹۹','۴۴']);
 assert.equal(table[0].cells[10].textContent,'۱');
 assert.equal(table[4].cells[11].textContent,'باطل‌شده');
 let exported;
 f.w.ensureBamcoXLSX=async()=>({
  utils:{
   aoa_to_sheet:rows=>({rows}),
   book_new:()=>({SheetNames:[],Sheets:{}}),
   book_append_sheet:(wb,ws,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=ws;}
  },
  writeFile:(wb,name)=>{exported={wb,name};}
 });
 f.d.querySelector('#exportCash').click();
 await until(()=>exported);
 assert.match(exported.name,/\.xlsx$/);
 assert.deepEqual(exported.wb.SheetNames,['ریز تنخواه','جمع‌بندی دسته‌بندی']);
 const detail=exported.wb.Sheets['ریز تنخواه'].rows;
 assert.deepEqual(detail.slice(1).map(row=>row[1]),[7,12,60,99,44]);
 assert.deepEqual(detail.slice(1).map(row=>row[0]),[1,2,3,4,5]);
 assert.deepEqual(detail.slice(1).map(row=>row[5]),[-100,1400,1200,400,400]);
 assert.equal(detail[1][10],1);
 assert.equal(detail[5][11],'باطل‌شده');
 const summary=exported.wb.Sheets['جمع‌بندی دسته‌بندی'].rows;
 assert(summary.some(row=>row[1]==='بنزین'&&row[2]===2&&row[3]===900));
 assert(summary.some(row=>row[1]==='آموزش'&&row[2]===1&&row[3]===200));
 assert(summary.some(row=>row[1]==='جمع کل هزینه‌ها'&&row[2]===3&&row[3]===1100));
 assert(summary.some(row=>row[1]==='جمع دریافت‌ها'&&row[3]===1500));
 assert(summary.some(row=>row[1]==='مانده تنخواه'&&row[3]===400));
 assert.deepEqual(f.errors,[]);
});

test('petty cash Excel keeps amounts above the safe numeric limit lossless',async t=>{
 const amount='999999999999999999';
 const f=await fixture({tables:{petty_cash_entries:[{id:'huge',entry_no:1,event_date:'2026-10-01',entry_type:'expense',amount,category:'بنزین',status:'active',responsible_id:'test-manager'}],petty_cash_attachments:[]}});
 t.after(()=>f.dispose());await f.open('pettyCash');
 let wb;
 f.w.ensureBamcoXLSX=async()=>({utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(book,sheet,name)=>{book.SheetNames.push(name);book.Sheets[name]=sheet;}},writeFile:book=>{wb=book;}});
 f.d.querySelector('#exportCash').click();await until(()=>wb);
 assert.equal(wb.Sheets['ریز تنخواه'].rows[1][4],amount);
 assert.equal(wb.Sheets['جمع‌بندی دسته‌بندی'].rows[1][3],amount);
});

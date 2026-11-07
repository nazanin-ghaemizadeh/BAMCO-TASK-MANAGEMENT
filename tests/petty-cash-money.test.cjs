const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('petty cash report dialog defaults to Tehran week and exports inclusive custom date ranges',async t=>{
 const rows=[
  {id:'opening',entry_no:1,event_date:'2026-10-30',entry_type:'receipt',amount:'1000',status:'active'},
  {id:'previous-friday',entry_no:2,event_date:'2026-11-06',entry_type:'expense',amount:'100',status:'active'},
  {id:'saturday',entry_no:3,event_date:'2026-11-07',entry_type:'receipt',amount:'500',status:'active'},
  {id:'friday',entry_no:4,event_date:'2026-11-13',entry_type:'expense',amount:'200',status:'active'},
  {id:'void',entry_no:5,event_date:'2026-11-10',entry_type:'expense',amount:'999',status:'void'},
  {id:'next-saturday',entry_no:6,event_date:'2026-11-14',entry_type:'expense',amount:'50',status:'active'}
 ].map(row=>({...row,category:'بنزین',description:row.id,responsible_id:'test-manager'}));
 const f=await fixture({tables:{petty_cash_entries:rows,petty_cash_attachments:[{id:'weekly-file',entry_id:'friday'}]}});t.after(()=>f.dispose());
 await f.open('pettyCash');await until(()=>f.d.querySelectorAll('#pettyCashBody tr[data-entry]').length===5);
 const weekly=f.d.querySelector('#exportWeeklyCash');
 assert.equal(f.d.querySelector('#exportCash').nextElementSibling,weekly);
 assert.equal(weekly.textContent,'گزارش هفتگی');assert.equal(weekly.disabled,false);
 const NativeDate=f.w.Date;let instant;
 f.w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return new NativeDate(instant).getTime();}};
 let exported;
 f.w.ensureBamcoXLSX=async()=>({utils:{aoa_to_sheet:rows=>({rows:JSON.parse(JSON.stringify(rows))}),book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(wb,sheet,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=sheet;}},writeFile:(wb,name,options)=>{exported={wb,name,options};}});
 // Every day in the week, including the exact Tehran midnight boundaries.
 for(const now of ['2026-11-06T20:30:00Z','2026-11-08T08:00:00Z','2026-11-09T08:00:00Z','2026-11-10T08:00:00Z','2026-11-11T08:00:00Z','2026-11-12T08:00:00Z','2026-11-13T20:29:59Z']){
  instant=now;exported=null;weekly.click();
  const report=f.d.querySelector('#cashReportDialog');assert.equal(report.open,true);assert.equal(exported,null);
  await report.querySelector('form').onsubmit({preventDefault(){}});await until(()=>exported);assert.equal(report.open,false);
  assert.deepEqual(exported.wb.SheetNames,['ریز تنخواه','جمع‌بندی دسته‌بندی']);
  const detail=exported.wb.Sheets['ریز تنخواه'];
  assert.deepEqual(detail.rows.slice(1).map(row=>[row[0],row[4],row[8],row[9]]),[[4,1200,'friday',1],[3,1400,'saturday',0]]);
  assert.equal(detail.rows[0].length,10);assert.equal(detail['!views'][0].rightToLeft,true);
  const summary=exported.wb.Sheets['جمع‌بندی دسته‌بندی'].rows;
  assert(summary.some(row=>row[1]==='جمع کل هزینه‌ها'&&row[2]===1&&row[3]===200));
  assert(summary.some(row=>row[1]==='جمع دریافت‌ها'&&row[3]===500));
  assert(summary.some(row=>row[1]==='مانده تنخواه'&&row[3]===1200));
  assert.match(exported.name,/^گزارش هفتگی تنخواه_.+_.+\.xlsx$/);
 }
 for(const [now,expected] of [['2026-11-06T20:29:59Z',['previous-friday']],['2026-11-13T20:30:00Z',['next-saturday']],['2026-12-01T08:00:00Z',[]]]){
  instant=now;exported=null;weekly.click();
  const report=f.d.querySelector('#cashReportDialog');assert.equal(report.open,true);assert.equal(exported,null);
  await report.querySelector('form').onsubmit({preventDefault(){}});await until(()=>exported);assert.equal(report.open,false);
  assert.deepEqual(exported.wb.Sheets['ریز تنخواه'].rows.slice(1).map(row=>row[8]),expected);
 }
 // Select a custom range with the same Persian calendar used for entry dates.
 instant='2026-11-07T08:00:00Z';exported=null;weekly.click();
 const report=f.d.querySelector('#cashReportDialog'),form=report.querySelector('form');
 const pick=(name,iso)=>{
  form.querySelector(`[name="${name}_text"]`).click();assert.equal(f.d.querySelector('#calendarDialog').open,true);
  const parts=new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(iso+'T12:00:00Z'));
  const part=type=>parts.find(p=>p.type===type).value;
  f.d.querySelector('#calYear').value=part('year');f.d.querySelector('#calMonth').value=part('month');
  f.w.eval('fillCalendarDays()');f.d.querySelector('#calDay').value=part('day');f.d.querySelector('#setDateBtn').click();
  assert.equal(form.elements[name].value,iso);assert.equal(f.d.querySelector('#calendarDialog').open,false);
 };
 pick('from_date','2026-11-06');pick('to_date','2026-11-07');
 await form.onsubmit({preventDefault(){}});assert.equal(report.open,false);
 assert.deepEqual(exported.wb.Sheets['ریز تنخواه'].rows.slice(1).map(row=>row[8]),['saturday','previous-friday']);
 assert(exported.wb.Sheets['جمع‌بندی دسته‌بندی'].rows.some(row=>row[1]==='مانده تنخواه'&&row[3]===1400));
 // Missing or reversed dates keep the dialog open and do not download.
 exported=null;weekly.click();
 let current=report.querySelector('form');current.elements.from_date.value='';
 await current.onsubmit({preventDefault(){}});assert.equal(exported,null);assert.equal(report.open,true);assert.ok(current.querySelector('.form-error').textContent);
 current.elements.from_date.value='2026-11-14';current.elements.to_date.value='2026-11-07';
 await current.onsubmit({preventDefault(){}});assert.equal(exported,null);assert.equal(report.open,true);assert.match(current.querySelector('.form-error').textContent,/نباید/);
 current.elements.from_date.value='2026-11-13';current.elements.to_date.value='2026-11-13';
 await current.onsubmit({preventDefault(){}});
 assert.deepEqual(exported.wb.Sheets['ریز تنخواه'].rows.slice(1).map(row=>row[8]),['friday']);
 exported=null;weekly.click();report.querySelector('[data-close]').click();assert.equal(report.open,false);assert.equal(exported,null);
 // Running a weekly report never filters the table or the full export.
 exported=null;f.d.querySelector('#exportCash').click();await until(()=>exported);
 assert.equal(exported.wb.Sheets['ریز تنخواه'].rows.length,6);
 assert.match(exported.name,/^گزارش تنخواه_/);
 assert.equal(f.d.querySelectorAll('#pettyCashBody tr[data-entry]').length,5);
 assert.deepEqual(f.errors,[]);
});

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

test('petty cash displays newest active events first with matching sequential rows and category workbook',async t=>{
 const rows=[
  {id:'gas-later',entry_no:99,event_date:'2026-10-03',entry_type:'expense',amount:'800',category:'بنزین',responsible_id:'test-manager',payment_method:'کارت',description:'بنزین دوم',status:'active'},
  {id:'gas-earlier',entry_no:7,event_date:'2026-10-01',entry_type:'expense',amount:'100',category:'بنزین',responsible_id:'test-manager',payment_method:'نقدی',description:'بنزین اول',status:'active'},
  {id:'received',entry_no:12,event_date:'2026-10-02',entry_type:'receipt',amount:'1500',category:'خدمات',responsible_id:'test-manager',payment_method:'کارت',description:'دریافت',status:'active'},
  {id:'void',entry_no:44,event_date:'2026-10-04',entry_type:'expense',amount:'900',category:'بنزین',responsible_id:'test-manager',payment_method:'نقدی',description:'باطل',status:'void'},
  {id:'training',entry_no:60,event_date:'2026-10-02',entry_type:'expense',amount:'200',category:'آموزش',responsible_id:'test-manager',payment_method:'کارت',description:'آموزش',status:'active'}
 ];
 const f=await fixture({tables:{petty_cash_entries:rows,petty_cash_attachments:[{id:'doc',entry_id:'gas-earlier'}]}});t.after(()=>f.dispose());
 await f.open('pettyCash');await until(()=>f.d.querySelectorAll('#pettyCashBody tr[data-entry]').length===4);
 const table=[...f.d.querySelectorAll('#pettyCashBody tr[data-entry]')];
 assert.deepEqual(table.map(tr=>tr.dataset.entry),['gas-later','training','received','gas-earlier']);
 assert.deepEqual(table.map(tr=>tr.cells[0].textContent),['۴','۳','۲','۱']);
 assert.equal(table[3].cells[9].textContent,'۱');
 assert.equal(table[0].cells.length,11);
 assert.equal(f.d.querySelector('[data-entry=void]'),null);
 let exported;
 f.w.ensureBamcoXLSX=async()=>({
  utils:{
   aoa_to_sheet:rows=>({rows:JSON.parse(JSON.stringify(rows))}),
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
 assert.deepEqual(detail[0],['ردیف','تاریخ','نوع','مبلغ (ریال)','مانده (ریال)','دسته‌بندی','متولی','روش پرداخت','شرح','ضمیمه']);
 assert.deepEqual(detail.slice(1).map(row=>row[8]),['بنزین دوم','آموزش','دریافت','بنزین اول']);
 assert.deepEqual(detail.slice(1).map(row=>row[0]),[4,3,2,1]);
 assert.deepEqual(detail.slice(1).map(row=>row[4]),[400,1200,1400,-100]);
 assert.equal(detail[4][9],1);
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
 f.w.ensureBamcoXLSX=async()=>({utils:{aoa_to_sheet:rows=>({rows:JSON.parse(JSON.stringify(rows))}),book_new:()=>({SheetNames:[],Sheets:{}}),book_append_sheet:(book,sheet,name)=>{book.SheetNames.push(name);book.Sheets[name]=sheet;}},writeFile:book=>{wb=book;}});
 f.d.querySelector('#exportCash').click();await until(()=>wb);
 assert.equal(wb.Sheets['ریز تنخواه'].rows[1][3],amount);
 assert.equal(wb.Sheets['جمع‌بندی دسته‌بندی'].rows[1][3],amount);
});


test('deleting a middle petty cash event removes it and resequences the table and Excel balances',async t=>{
 const rows=[
  {id:'first',version:1,entry_no:1,event_date:'2026-10-01',entry_type:'receipt',amount:'1000',category:'خدمات',responsible_id:'test-manager',status:'active'},
  {id:'middle',version:1,entry_no:2,event_date:'2026-10-02',entry_type:'expense',amount:'100',category:'بنزین',responsible_id:'test-manager',status:'active'},
  {id:'last',version:1,entry_no:3,event_date:'2026-10-03',entry_type:'expense',amount:'200',category:'آموزش',responsible_id:'test-manager',status:'active'}
 ];
 const f=await fixture({tables:{petty_cash_entries:rows,petty_cash_attachments:[]}});t.after(()=>f.dispose());
 await f.open('pettyCash');await until(()=>f.d.querySelector('[data-detail="middle"]'));
 f.d.querySelector('[data-detail="middle"]').click();
 const button=f.d.querySelector('#pettyCashDetail [data-delete]');assert.equal(button.textContent,'حذف رویداد');button.click();
 await until(()=>f.d.querySelectorAll('#pettyCashBody tr[data-entry]').length===2);
 const displayed=[...f.d.querySelectorAll('#pettyCashBody tr[data-entry]')];
 assert.deepEqual(displayed.map(row=>row.dataset.entry),['last','first']);
 assert.deepEqual(displayed.map(row=>row.cells[0].textContent),['۲','۱']);
 assert.deepEqual(displayed.map(row=>row.cells[4].textContent),['۸۰۰','۱,۰۰۰']);
 let wb;f.w.ensureBamcoXLSX=async()=>({utils:{aoa_to_sheet:rows=>({rows:JSON.parse(JSON.stringify(rows))}),book_new:()=>({Sheets:{}}),book_append_sheet:(book,sheet,name)=>book.Sheets[name]=sheet},writeFile:book=>wb=book});
 f.d.querySelector('#exportCash').click();await until(()=>wb);
 assert.deepEqual(wb.Sheets['ریز تنخواه'].rows.slice(1).map(row=>[row[0],row[4]]),[[2,800],[1,1000]]);
 assert(wb.Sheets['جمع‌بندی دسته‌بندی'].rows.some(row=>row[1]==='جمع کل هزینه‌ها'&&row[3]===200));
 assert.deepEqual(f.errors,[]);
});

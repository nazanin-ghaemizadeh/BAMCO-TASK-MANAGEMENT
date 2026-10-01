const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

async function setup(t,{canEdit=true}={}){
 const dom=new JSDOM('<div id="appView"><nav id="nav"></nav><main class="workspace"></main></div>',{url:'https://example.test/',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,d=w.document;
 w.HTMLElement.prototype.scrollTo=function(){};
 const units=['office','factory','external'].map((category,index)=>({id:index+1,category,title:category}));
 const contacts=units.flatMap(unit=>Array.from({length:52},(_,index)=>({id:unit.id*100+index+1,category:unit.category,unit_id:unit.id,full_name:`فرد ${52-index}`,internal_extension:String(52-index),role_title:index%2?'ناظر':'کارشناس'})));
 w.Bamco={state:{token:'test',user:{id:'user-1'}}};
 w.BamcoData={select:async table=>table==='contact_directory'?contacts:units};
 w.BamcoAccess={can:(_feature,action)=>canEdit||!['edit','delete'].includes(action)};
 w.BamcoNavigation={configure(){},registerView(){},navigate(){return true}};
 w.BamcoNavigationCatalog={isFeatureOwnedRoute:route=>route==='phoneBook'};
 for(const name of ['phonebook-directory-v2','table-suite'])w.eval(fs.readFileSync(`assets/js/${name}.js`,'utf8'));
 d.dispatchEvent(new w.Event('DOMContentLoaded'));
 async function open(category='office'){
  w.bamcoPhonebook.open(category);
  await new Promise(resolve=>setTimeout(resolve,0));
  d.querySelector(`[data-phonebook-unit-select="${units.find(unit=>unit.category===category).id}"]`).click();
 }
 await open();
 return {w,d,open,table:()=>d.querySelector('.phonebook-table'),ids:()=>[...d.querySelectorAll('[data-phonebook-contact-select]')].map(row=>Number(row.dataset.phonebookContactSelect))};
}

test('phonebook shared sort orders the full filtered model before paging and clears back to source order',async t=>{
 const f=await setup(t),{d,w}=f;
 assert.equal(d.querySelectorAll('.suite-table-options').length,1);
 assert.equal(d.querySelectorAll('.suite-resize').length,6);
 assert.equal(f.table().tHead.rows.length,2);
 assert.equal(d.querySelectorAll('.phonebook-table-pagination').length,1);
 assert.equal(d.querySelectorAll('.suite-filters,.reference-pagination,.reference-filters').length,0);
 f.table().tHead.rows[0].cells[2].click();
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>152-index));
 assert.equal(f.table().tHead.rows[0].cells[2].getAttribute('aria-sort'),'ascending');
 d.querySelector('[data-phonebook-page="next"]').click();
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>127-index));
 // Sorting while on the second page resets to the first page of all results.
 f.table().tHead.rows[0].cells[2].click();
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>101+index));
 assert.match(d.querySelector('.page-position').textContent,/۱ \/ ۳/);
 const filter=d.querySelector('[data-phonebook-filter="1"]');
 filter.value='ناظر';filter.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>102+index*2));
 f.table().tHead.rows[0].cells[2].click();
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>152-index*2));
 d.querySelector('[data-phonebook-page="next"]').click();
 assert.deepEqual(f.ids(),[102]);
 d.querySelector('.suite-clear-sort').click();
 assert.deepEqual(f.ids(),Array.from({length:25},(_,index)=>102+index*2));
 assert.equal(f.table().querySelector('[aria-sort]'),null);
 assert.match(d.querySelector('.page-position').textContent,/۱ \/ ۲/);
});

test('phonebook widths and sorting survive selection, rerenders and all category switches',async t=>{
 const f=await setup(t),{d,w}=f;
 const head=f.table().tHead.rows[0].cells[0];
 head.getBoundingClientRect=()=>({width:140});
 head.querySelector('.suite-resize').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
 assert.equal(head.style.width,'152px');
 f.table().tHead.rows[0].cells[2].click();
 d.querySelector('[data-phonebook-contact-select]').click();
 assert.equal(f.table().tHead.rows[0].cells[0].style.width,'152px');
 assert.equal(d.querySelector('[data-phonebook-contact-edit]').disabled,false);
 for(const [category,start] of [['factory',252],['external',352],['office',152]]){
  await f.open(category);
  assert.equal(f.table().dataset.tableKey,'phonebook.contacts');
  assert.equal(f.table().tHead.rows[0].cells[0].style.width,'152px');
  assert.equal(f.ids()[0],start);
  assert.equal(d.querySelectorAll('.suite-table-options').length,1);
  assert.equal(d.querySelectorAll('.suite-resize').length,6);
 }
 d.querySelector('.suite-reset').click();
 assert.equal(f.table().tHead.rows[0].cells[0].style.width,'');
 d.querySelector('[data-phonebook-page="next"]').click();
 assert.equal(f.table().tHead.rows[0].cells[0].style.width,'');
});

test('shared table controls do not elevate phonebook edit or delete permissions',async t=>{
 const {d}=await setup(t,{canEdit:false});
 d.querySelector('[data-phonebook-contact-select]').click();
 assert.equal(d.querySelector('[data-phonebook-contact-edit]').disabled,true);
 assert.equal(d.querySelector('[data-phonebook-contact-delete]').disabled,true);
 assert.equal(d.querySelectorAll('.suite-table-options').length,1);
});

test('phonebook column visibility and density remain selected when the table is recreated',async t=>{
 const f=await setup(t),{d,w}=f;
 const column=d.querySelectorAll('.suite-columns input')[1];
 column.checked=false;column.dispatchEvent(new w.Event('change',{bubbles:true}));
 const density=d.querySelector('.suite-density');
 density.checked=false;density.dispatchEvent(new w.Event('change',{bubbles:true}));
 const check=()=>{
  assert.equal(d.querySelectorAll('.suite-columns input')[1].checked,false);
  assert.equal(d.querySelector('.suite-density').checked,false);
  assert.equal(f.table().classList.contains('suite-compact'),false);
  for(const row of f.table().rows)assert.equal(row.cells[1].classList.contains('suite-column-hidden'),true);
 };
 d.querySelector('[data-phonebook-page="next"]').click();check();
 d.querySelector('[data-phonebook-contact-select]').click();check();
 await f.open('factory');check();
 await f.open('external');check();
});

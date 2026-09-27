const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('feature-owned register filters and pages the full rendered dataset without duplicate controls',()=>{
  const dom=new JSDOM('<div id="appView"><section class="view"><div class="table-wrap"><table><thead><tr><th>شناسه</th><th>وضعیت</th></tr></thead><tbody></tbody></table></div></section></div>',{url:'https://example.test/',runScripts:'outside-only'});
  const {window}=dom,table=window.document.querySelector('table');
  table.tBodies[0].innerHTML=Array.from({length:52},(_,i)=>`<tr><td>${i+1}</td><td>${i%2?'باز':'بسته'}</td></tr>`).join('');
  window.eval(fs.readFileSync('assets/js/reference-tables.js','utf8'));
  window.bamcoReferenceTable.refresh(table,{filters:true});
  window.bamcoReferenceTable.refresh(table,{filters:true});
  assert.equal(window.document.querySelectorAll('.reference-pagination').length,1);
  assert.equal(table.querySelectorAll('.reference-filters').length,1);
  const visible=()=>[...table.tBodies[0].rows].filter(row=>!row.classList.contains('reference-page-hidden')&&!row.classList.contains('reference-filtered-out'));
  assert.equal(visible().length,25);
  const filter=table.querySelector('.reference-filters select[data-column="1"]');
  filter.value='باز';filter.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(visible().length,25);
  assert(visible().every(row=>row.cells[1].textContent==='باز'));
  window.document.querySelector('[data-page="next"]').click();
  assert.equal(visible().length,1);
  assert.match(window.document.querySelector('.page-range').textContent,/۲۶ تا ۲۶ از ۲۶/);
  filter.value='';filter.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(visible().length,25);
  assert.match(window.document.querySelector('.page-position').textContent,/۱ \/ ۳/);
  dom.window.close();
});

test('primary and destructive buttons on a register use the same neutral palette',()=>{
  const css=fs.readFileSync('assets/css/reference-tables.css','utf8');
  const dom=new JSDOM(`<style>.primary{background:green!important}.danger{background:red!important}${css}</style><div id="appView"><section class="view"><table><tr><td><button class="primary">افزودن</button><button class="danger">حذف</button></td></tr></table></section></div>`);
  for(const button of dom.window.document.querySelectorAll('button')){
    assert.equal(dom.window.getComputedStyle(button).backgroundColor,'rgb(255, 255, 255)');
  }
  dom.window.close();
});

test('phonebook column filters count all unit contacts before paging',async()=>{
  const dom=new JSDOM('<div id="appView"><nav id="nav"></nav><main class="workspace"></main></div>',{url:'https://example.test/',runScripts:'outside-only'});
  const {window}=dom;
  window.HTMLElement.prototype.scrollTo=function(){};
  const contacts=Array.from({length:52},(_,index)=>({id:index+1,category:'office',unit_id:1,full_name:`فرد ${index+1}`,role_title:index%2?'ناظر':'کارشناس'}));
  window.Bamco={state:{token:'test',user:{id:'user-1'}}};
  window.BamcoData={select:async table=>table==='contact_directory'?contacts:[{id:1,category:'office',title:'واحد'}]};
  window.BamcoAccess={can:()=>true};
  window.BamcoNavigation={configure(){},registerView(){},navigate(){return true}};
  window.eval(fs.readFileSync('assets/js/phonebook-directory-v2.js','utf8'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  window.bamcoPhonebook.open('office');
  await new Promise(resolve=>setTimeout(resolve,25));
  window.document.querySelector('[data-phonebook-unit-select="1"]').click();
  const view=window.document.querySelector('#phoneBookView');
  assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,25);
  const filter=view.querySelector('[data-phonebook-filter="1"]');
  filter.value='ناظر';filter.dispatchEvent(new window.Event('change',{bubbles:true}));
  assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,25);
  assert.match(view.querySelector('.page-range').textContent,/از ۲۶ ردیف/);
  view.querySelector('[data-phonebook-page="next"]').click();
  assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,1);
  dom.window.close();
});

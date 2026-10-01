const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM('<div id="appView"><section id="vehiclePermanentView" class="view"><div class="vehicle-table-wrap"><table data-table-suite="off" data-table-key="vehicles"><thead><tr><th>شناسه</th><th>نوع</th></tr></thead><tbody><tr data-id="a"><td>۱۰</td><td>A</td></tr><tr data-id="b"><td>۲</td><td>B</td></tr></tbody></table></div></section></div>',{url:'https://example.test',runScripts:'outside-only'});
 const w=dom.window;
 w.BamcoNavigationCatalog={isFeatureOwnedRoute:()=>true};
 for(const name of ['reference-tables','table-suite'])w.eval(fs.readFileSync(`assets/js/${name}.js`,'utf8'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return dom;
}
test('explicit feature register gets shared settings, full-dataset sorting, resize and retained visibility',()=>{
 const dom=setup(),w=dom.window,d=w.document,table=d.querySelector('table');
 w.bamcoReferenceTable.refresh(table);
 assert.equal(d.querySelectorAll('.suite-table-options').length,1);
 assert.equal(d.querySelectorAll('.reference-pagination').length,1);
 assert.equal(table.querySelectorAll('.suite-filters').length,0);
 table.tHead.rows[0].cells[0].click();
 assert.equal(table.tBodies[0].rows[0].dataset.id,'b');
 assert.equal(table.tHead.rows[0].cells[0].getAttribute('aria-sort'),'ascending');
 const handle=table.querySelector('.suite-resize');
 table.tHead.rows[0].cells[0].getBoundingClientRect=()=>({width:155});
 handle.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
 assert.equal(table.querySelector('col').style.width,'167px');
 assert.equal(table.style.width,'322px');
 const toggle=d.querySelector('.suite-columns input');toggle.checked=false;toggle.dispatchEvent(new w.Event('change'));
 assert(table.tBodies[0].rows[0].cells[0].classList.contains('suite-column-hidden'));
 table.tHead.innerHTML='<tr><th>شناسه</th><th>نوع</th></tr>';
 table.tBodies[0].innerHTML='<tr data-id="c"><td>۱۱</td><td>C</td></tr><tr data-id="d"><td>۱</td><td>D</td></tr>';
 w.bamcoReferenceTable.refresh(table);
 assert.equal(table.tBodies[0].rows[0].dataset.id,'d');
 assert.equal(table.querySelector('col').style.width,'167px');
 assert(table.tBodies[0].rows[0].cells[0].classList.contains('suite-column-hidden'));
 d.querySelector('.suite-reset').click();assert.equal(table.tHead.rows[0].cells[0].style.width,'');
 d.querySelector('.suite-clear-sort').click();assert.equal(table.tBodies[0].rows[0].dataset.id,'c');
 dom.window.close();
});
test('model-owned sort callback and keyed preferences survive a replaced table',()=>{
 const dom=setup(),w=dom.window,d=w.document;let table=d.querySelector('table'),requested;
 const config={filters:false,sort:null,onSort:sort=>requested=sort};
 w.bamcoTableSuite.refresh(table,config);
 table.tHead.rows[0].cells[1].click();assert.equal(requested.index,1);assert.equal(requested.direction,1);
 assert.equal(table.tBodies[0].rows[0].dataset.id,'a');
 const toggle=d.querySelector('.suite-columns input');toggle.checked=false;toggle.dispatchEvent(new w.Event('change'));
 d.querySelector('.suite-density').checked=false;d.querySelector('.suite-density').dispatchEvent(new w.Event('change'));
 const html=table.outerHTML;d.querySelector('.suite-table-options').remove();table.outerHTML=html;table=d.querySelector('table');
 w.bamcoTableSuite.refresh(table,{...config,sort:{index:1,direction:1}});
 assert.equal(d.querySelector('.suite-columns input').checked,false);
 assert.equal(d.querySelector('.suite-density').checked,false);
 assert.equal(table.tHead.rows[0].cells[1].getAttribute('aria-sort'),'ascending');
 dom.window.close();
});
test('message registers reuse their native command row instead of adding an empty toolbar',()=>{
 const dom=new JSDOM('<div id="appView"><section id="messageCenterView" class="view"><div class="panel"><div class="panel-head"><h3>پیام</h3></div><div class="message-command-row bamco-command-bar"><button>خروجی اکسل</button></div><div class="table-wrap"><table><thead><tr><th>نام</th></tr></thead><tbody><tr><td>فرد</td></tr></tbody></table></div></div></section></div>',{url:'https://example.test',runScripts:'outside-only'});
 const w=dom.window;w.bamcoInteriorUI={};w.eval(fs.readFileSync('assets/js/table-suite.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(w.document.querySelectorAll('.suite-toolbar').length,0);
 assert.equal(w.document.querySelectorAll('.bamco-command-bar').length,1);
 assert.equal(w.document.querySelectorAll('.suite-table-options').length,1);
 dom.window.close();
});
test('message history leaves register settings intact and shared settings expand in flow',()=>{
 const source=fs.readFileSync('assets/js/message-history.js','utf8'),css=fs.readFileSync('assets/css/interface-refinement.css','utf8');
 assert.doesNotMatch(source,/#(?:messageCenter|sentMessages)View \.suite-table-options/);
 assert.match(source,/#messagesView \.suite-table-options/);
 assert.match(source,/\.conversation-panel \[data-management-export\]/);
 assert.match(css,/\.suite-options-panel\{position:relative;inset:auto;max-height:min\(320px,40dvh\);overflow:auto/);
});

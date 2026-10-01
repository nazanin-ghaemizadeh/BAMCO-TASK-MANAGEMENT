const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const unified=fs.readFileSync('assets/css/unified-ui.css','utf8');
const reference=fs.readFileSync('assets/css/reference-tables.css','utf8');
const toolbars=['task-toolbar','people-actions','manager-toolbar','vehicle-toolbar','cash-toolbar','letter-toolbar','prod-toolbar','table-toolbar','feature-toolbar-actions','bamco-management-toolbar','bamco-command-bar','suite-toolbar','workspace-actions','workspace-report-tools'];
function setup(){
  return new JSDOM(`<style>${unified}\n${reference}</style><main id="appView">${toolbars.map((name,index)=>`<section class="view" id="route${index}"><div class="enterprise-feature-root"><div class="${name}" data-toolbar><button class="ghost" disabled>ویرایش</button><input type="search" value="فیلتر" aria-label="جستجو"></div><div data-content></div></div></section>`).join('')}<section id="homeView" class="view"><input type="search" data-home-search></section></main>`);
}
function searchStyle(window,input){
  const style=window.getComputedStyle(input);
  return Object.fromEntries(['display','width','height','minHeight','boxSizing','flexBasis','order','borderRadius','padding'].map(key=>[key,style[key]]));
}

test('all register toolbar searches share geometry before and after table data appears',()=>{
  const dom=setup(),{window}=dom;
  for(const toolbar of window.document.querySelectorAll('[data-toolbar]')){
    const input=toolbar.querySelector('input'),before=searchStyle(window,input);
    assert.equal(before.width,'270px',toolbar.className);
    assert.equal(before.height,'40px',toolbar.className);
    assert.equal(before.minHeight,'40px',toolbar.className);
    assert.equal(before.boxSizing,'border-box',toolbar.className);
    assert.equal(before.order,'100',toolbar.className);
    toolbar.nextElementSibling.innerHTML='<table><thead><tr><th>عنوان</th></tr></thead><tbody><tr><td>رکورد</td></tr></tbody></table>';
    assert.deepEqual(searchStyle(window,input),before,`${toolbar.className}: table load must not resize search`);
    assert.equal(input.value,'فیلتر');
  }
  assert.notEqual(window.getComputedStyle(window.document.querySelector('[data-home-search]')).width,'270px');
  dom.window.close();
});

test('feature-owned sibling and nested command bars inherit shared layout and disabled state without a table',()=>{
  const dom=new JSDOM(`<style>${unified}</style><main id="appView"><section class="view"><div class="enterprise-feature-root"><div class="enterprise-toolbar"><div><h3>عنوان</h3></div></div><div class="bamco-command-bar" data-bar><button disabled>ذخیره</button><input type="search"><input type="checkbox"><select><option>همه</option></select></div><section><div class="bamco-command-bar" data-bar><button disabled>ویرایش</button></div></section></div></section></main>`);
  const {window}=dom;
  for(const bar of window.document.querySelectorAll('[data-bar]')){
    assert.equal(window.getComputedStyle(bar).display,'flex');
    assert.equal(window.getComputedStyle(bar).flexWrap,'wrap');
    assert.equal(window.getComputedStyle(bar).minHeight,'48px');
    assert.equal(window.getComputedStyle(bar.querySelector('button')).opacity,'0.4');
    assert.equal(window.getComputedStyle(bar.querySelector('button')).cursor,'default');
  }
  assert.equal(window.getComputedStyle(window.document.querySelector('select')).height,'36px');
  assert.notEqual(window.getComputedStyle(window.document.querySelector('[type=checkbox]')).height,'36px');
  const focusRule=[...window.document.styleSheets[0].cssRules].find(rule=>rule.selectorText?.includes('.enterprise-feature-root :is(button,input,select,textarea,a):focus-visible'));
  assert.equal(focusRule.style.getPropertyValue('outline'),'2px solid #327c5c');
  dom.window.close();
});

test('the shared mobile rule covers every toolbar without depending on table presence',()=>{
  // jsdom does not lay out media queries. Check selector coverage/declarations;
  // viewport overflow and screenshots remain part of the browser CI suite.
  const dom=setup(),{window}=dom;
  const rule=[...window.document.styleSheets[0].cssRules].filter(rule=>rule.conditionText==='(max-width:760px)').flatMap(rule=>[...rule.cssRules]).find(rule=>rule.selectorText?.includes('.workspace-report-tools)>:is(input[type=search]'));
  assert.ok(rule);
  assert.equal(rule.style.getPropertyValue('width'),'100%');
  assert.equal(rule.style.getPropertyValue('min-width'),'0px');
  assert.equal(rule.style.getPropertyValue('flex'),'1 1 100%');
  for(const input of window.document.querySelectorAll('[data-toolbar] input'))assert.ok(input.matches(rule.selectorText));
  assert.ok(!reference.includes('>:is(input[type=search],input.search,.toolbar-search,.vehicle-search)'),'register layer must not reintroduce competing search geometry');
  dom.window.close();
});

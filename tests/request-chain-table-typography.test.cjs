'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

test('approval chain display numbers the existing execution order as 3 2 1',()=>{
  const source=fs.readFileSync('assets/js/approval-chain-display-20260919.js','utf8');
  const dom=new JSDOM('<div id="approvalChainList"><ol><li>A</li><li>B</li><li>C</li></ol></div>',{runScripts:'outside-only'});
  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const list=dom.window.document.querySelector('ol'),values=[...list.children].map(x=>x.value);
  assert.equal(list.reversed,true);
  assert.equal(list.start,3);
  assert.deepEqual(values,[3,2,1]);
  assert.deepEqual([...list.children].map(x=>x.textContent),['A','B','C']);
  dom.window.close();
});

test('dynamic Latin typography is rescanned and Times New Roman is enforced',()=>{
  const helper=fs.readFileSync('assets/js/ui-helpers.js','utf8');
  const css=fs.readFileSync('assets/css/app.css','utf8');
  assert.match(helper,/const scope=document\.body/);
  assert.match(helper,/wrapLatinText\(root\)/);
  assert.match(helper,/characterData:true/);
  assert.match(css,/\.latin-run,[\s\S]*table \.suite-english[\s\S]*font-family:"Times New Roman",Times,serif!important/);
});

test('production index loads the descending chain display module',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/assets\/js\/approval-chain-display-20260919\.js/);
});

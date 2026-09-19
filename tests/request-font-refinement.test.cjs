'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const {fixture,until}=require('./helpers/app-fixture.cjs');
const request=(id,day,status='in_review')=>({id,task_id:500+id,requested_by:'test-owner',request_type:'update',request_status:status,created_at:`2026-09-${day}T09:00:00Z`,proposed_data:{title:`ECU-${id} تست`}});
test('descending labels survive refresh and history filtering while action IDs stay real',async t=>{
 const current=[request(12,17),request(91,19),request(35,18)];
 const history=[request(8,16,'approved'),request(6,15,'rejected'),request(10,17,'cancelled'),request(99,19)];
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='request_workflow_snapshot'?{current_requests:current,history_requests:history,routes:current.map(r=>({request_id:r.id,stage_no:1,stage_title:'سرپرست',actionable:true}))}:undefined});t.after(()=>f.dispose());
 await f.open('approvals');await until(()=>f.d.querySelectorAll('#approvalBody tr[data-request-id]').length===3);
 const rows=id=>[...f.d.querySelectorAll(`#${id} tr[data-request-id]`)];
 assert.deepEqual(rows('approvalBody').map(r=>r.cells[0].textContent),['۳','۲','۱']);
 assert.deepEqual(rows('approvalBody').map(r=>r.dataset.requestId),['91','35','12']);
 assert.deepEqual(rows('approvalBody').map(r=>r.querySelector('[data-review-request]').dataset.reviewRequest),['91','35','12']);
 const table=rows('approvalBody')[0].closest('table'),titleHead=table.tHead.rows[0].cells[3];
 titleHead.click();await until(()=>titleHead.getAttribute('aria-sort')==='ascending');
 const labelsById=Object.fromEntries(rows('approvalBody').map(r=>[r.dataset.requestId,r.cells[0].textContent]));
 assert.deepEqual(labelsById,{'91':'۳','35':'۲','12':'۱'});
 f.d.querySelector('#approvalsView .suite-clear-sort').click();
 await until(()=>rows('approvalBody')[0].dataset.requestId==='91');
 assert.deepEqual(rows('approvalBody').map(r=>r.cells[0].textContent),['۳','۲','۱']);
 current.push(request(115,20));await f.w.bamcoRequestSync.refresh();await until(()=>rows('approvalBody').length===4);
 assert.deepEqual(rows('approvalBody').map(r=>r.cells[0].textContent),['۴','۳','۲','۱']);
 assert.equal(rows('approvalBody')[0].dataset.requestId,'115');
 await f.open('requestHistory');await until(()=>rows('requestHistoryBody').length===3);
 assert.deepEqual(rows('requestHistoryBody').map(r=>r.cells[0].textContent),['۳','۲','۱']);
 assert.deepEqual(rows('requestHistoryBody').map(r=>r.dataset.requestId),['10','8','6']);
 assert.deepEqual(rows('requestHistoryBody').map(r=>r.querySelector('[data-request]').dataset.request),['10','8','6']);
});
test('mixed table typography preserves descendants, text, links and attached handlers',()=>{
 const dom=new JSDOM('<table><tbody><tr><td id="cell">بررسی ECU <a href="#test">ABS-123</a> نسخه ۲</td></tr></tbody></table>',{runScripts:'outside-only'}),w=dom.window;
 try{
  const source=fs.readFileSync('assets/js/usability.js','utf8');
  w.eval("function important(el,name,value){el.style.setProperty(name,value,'important')}\n"+source.slice(source.indexOf('function mixedFontCell('),source.indexOf('function polishTaskText(')));
  const cell=w.document.querySelector('#cell'),link=cell.querySelector('a'),before=cell.textContent;let clicks=0;link.addEventListener('click',e=>{e.preventDefault();clicks++});
  w.mixedFontCell(cell);w.mixedFontCell(cell);link.click();
  assert.equal(cell.textContent,before);assert.equal(cell.querySelector('a'),link);assert.equal(clicks,1);
  assert.match(cell.style.fontFamily,/BamcoTablePersian/);assert.match(cell.style.fontFamily,/Times New Roman/);
  assert.equal(cell.querySelectorAll('.latin-run').length,0);
 }finally{w.close()}
});
test('all table kinds share the Persian-only face followed by Times without script observers',()=>{
 const css=fs.readFileSync('assets/css/unified-ui.css','utf8').split('/* Table typography is character-scoped')[1];
 assert.match(css,/@layer bamco-table-typography/);assert.match(css,/\[role="table"\]/);assert.match(css,/\[role="grid"\]/);
 assert.match(css,/select,optgroup,option/);assert.match(css,/font-family:BamcoTablePersian,'Times New Roman',Times,serif!important/);
 for(const face of css.matchAll(/@font-face\{([^}]+)\}/g)){
  assert.match(face[1],/unicode-range:U\+0600/);assert.doesNotMatch(face[1],/U\+0000|U\+0020|U\+0041/);
 }
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('chat refresh restores the reading anchor without smooth scrolling',()=>{
  const ui=fs.readFileSync('assets/js/chat-ui.js','utf8');
  const css=fs.readFileSync('assets/css/unified-ui.css','utf8');
  assert.match(ui,/bottomGap=Math\.max\(0,box\.scrollHeight-box\.clientHeight-oldTop\),atBottom=bottomGap<12/);
  assert.match(ui,/getBoundingClientRect\(\)\.top-viewportTop/);
  assert.match(ui,/box\.style\.setProperty\('scroll-behavior','auto','important'\)/);
  assert.match(ui,/mediaJobs\.push\(attach\(m,body\)\)/);
  assert.match(ui,/await Promise\.allSettled\(mediaJobs\)/);
  assert.match(css,/\.conversation-stage\.messenger-host\{[^}]*overflow:hidden!important;overscroll-behavior:none!important/s);
  assert.match(css,/\.messenger-messages\{[^}]*scroll-behavior:auto!important;overflow-anchor:none!important;overscroll-behavior:contain!important/s);
});

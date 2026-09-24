const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('chat refresh restores the reading anchor without smooth scrolling',()=>{
  const ui=fs.readFileSync('assets/js/chat-ui.js','utf8');
  const css=fs.readFileSync('assets/css/unified-ui.css','utf8');
  assert.match(ui,/const oldTop=box\.scrollTop,atBottom=/);
  assert.match(ui,/box\.style\.setProperty\('scroll-behavior','auto','important'\)/);
  assert.match(ui,/anchor\?anchor\.offsetTop-snapshot\.anchorOffset:snapshot\.oldTop/);
  assert.match(css,/\.messenger-messages\{[^}]*scroll-behavior:auto!important;overflow-anchor:none!important/s);
});

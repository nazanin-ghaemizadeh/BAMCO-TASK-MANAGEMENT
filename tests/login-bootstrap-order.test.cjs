'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('login UI is independent of the large application bundle',()=>{
  const html=read('index.html');
  const ui=html.indexOf('assets/js/auth-ui.js');
  const bundle=html.indexOf('assets/js/bamco.bundle.js');
  const session=html.indexOf('assets/js/auth-session.js');
  assert.ok(ui>=0&&bundle>ui&&session>bundle,'expected auth-ui -> app bundle -> auth-session order');
  assert.match(html,/<link rel="preload" href="assets\/css\/bamco\.bundle\.css[^"]+" as="style">/);
  assert.match(html,/<link id="bamcoAppStyles" rel="stylesheet" href="assets\/css\/bamco\.bundle\.css[^"]+" media="print">/);
  const builder=read('scripts/build-static-bundles.mjs');
  assert.doesNotMatch(builder,/['"]assets\/js\/auth-session\.js['"]/,'auth-session must remain a separate script');
  const authUi=read('assets/js/auth-ui.js');
  assert.ok(authUi.includes('bamco\\.bundle\\.js'));
  assert.match(authUi,/appStyles\.addEventListener\('load',activate/);
  assert.match(authUi,/bamco\\\.bundle\\\.js/);
  const sessionSource=read('assets/js/auth-session.js');
  assert.match(sessionSource,/window\.bamcoAuth=\{snapshot,isCurrent,accept/);
  assert.match(sessionSource,/bamco:auth-core-ready/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));

test('the generated entrypoint has one kernel, one network owner, and one navigation owner',()=>{
 const build=read('scripts/build-static-bundles.mjs');
 assert.match(build,/['"]assets\/js\/core\/application\.js['"]/);
 assert.equal(build.indexOf('assets/js/core/application.js')<build.indexOf('assets/js/app.js'),true);
 assert.match(read('assets/js/core/application.js'),/__bamcoNetworkPipeline/);
 assert.match(read('assets/js/app.js'),/BamcoNavigation\?\.navigate|BamcoNavigation\.navigate/);
 assert.doesNotMatch(read('assets/js/app.js'),/window\.fetch\s*=/);
 assert.doesNotMatch(read('assets/js/auth-session.js'),/window\.fetch\s*=/);
});

test('removed patch layers are not part of the source graph',()=>{
 const html=read('index.html'),build=read('scripts/build-static-bundles.mjs');
 assert.doesNotMatch(html,/root-sync-hotfix|final-production-fixes|app-update-v2/);
 assert.doesNotMatch(build,/root-sync-hotfix|final-production-fixes|app-update-v2|mobile-compat-20260911|release-fixes\.css/);
 for(const file of [
  'assets/js/root-sync-hotfix-20260917.js',
  'assets/js/final-production-fixes-20260911.js',
  'assets/js/layout-editor-v2.js',
  'assets/js/report-root-fixes-20260911.js',
  'assets/js/task-terminal-columns-20260912.js',
  'assets/css/mobile-compat-20260911.css',
  'assets/css/release-fixes.css'
 ])assert.equal(exists(file),false,file);
});

test('responsive CSS is bundled once instead of injected after render',()=>{
 const renderer=read('assets/js/message-renderer.js'),build=read('scripts/build-static-bundles.mjs');
 assert.doesNotMatch(renderer,/lateMobileCss|bamcoMobileFinalCss|mobile-compat-20260911/);
 assert.match(build,/assets\/css\/responsive\.css/);
});

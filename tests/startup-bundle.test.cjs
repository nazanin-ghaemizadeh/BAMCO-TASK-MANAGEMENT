const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('startup uses one stylesheet and four scripts with a single updater',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
 const styles=[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(scripts.length,4);
 assert.equal(styles.length,1);
 assert(scripts.some(path=>path.startsWith('assets/js/app-update.js?v=')));
 assert(scripts.some(path=>path.startsWith('assets/js/bamco.bundle.js?v=')));
 assert(styles[0].startsWith('assets/css/bamco.bundle.css?v='));
 assert(!html.includes('setTimeout(() => location.reload'));
});

test('generated bundles retain source order and avoid nested CSS imports',()=>{
 const js=fs.readFileSync('assets/js/bamco.bundle.js','utf8');
 const css=fs.readFileSync('assets/css/bamco.bundle.css','utf8');
 assert(js.indexOf('source: assets/js/app.js')<js.indexOf('source: assets/js/auth-session.js'));
 assert(js.indexOf('source: assets/js/card-home.js')<js.indexOf('source: assets/js/feature-structure.js'));
 assert.match(css,/source: assets\/css\/responsive\.css/);
 assert.doesNotMatch(css,/@import\s+url/);
});

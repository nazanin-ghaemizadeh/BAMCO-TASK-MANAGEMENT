const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');

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

test('the shipped concatenated bundle reaches the authentication bootstrap at defer timing',()=>{
 // A deferred bundle executes after parsing, while document.readyState is
 // "interactive".  That differs from a source-by-source fixture: a feature
 // placed before app.js can accidentally touch app.js's lexical `state` while
 // it is still in its temporal dead zone and prevent every later module,
 // including authentication, from being created.
 const html=fs.readFileSync('index.html','utf8')
  .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g,'')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'');
 const errors=[],console=new VirtualConsole();
 console.on('jsdomError',error=>errors.push(error.message));
 console.on('error',error=>errors.push(String(error)));
 const dom=new JSDOM(html,{url:'https://bamco.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;
 // JSDOM's outside evaluator keeps the document in a different lifecycle
 // state; model the browser state in which defer scripts actually run.
 Object.defineProperty(w.document,'readyState',{configurable:true,get:()=> 'interactive'});
 let timer=0;
 w.setTimeout=()=>++timer;w.clearTimeout=()=>{};
 w.setInterval=()=>++timer;w.clearInterval=()=>{};
 w.requestAnimationFrame=()=>++timer;w.cancelAnimationFrame=()=>{};
 w.Response=Response;w.Request=Request;w.Headers=Headers;w.AbortController=AbortController;w.Blob=Blob;w.TextEncoder=TextEncoder;
 // Startup must not send a real request.  Keep any intentional background
 // fetch pending so no continuation runs after this isolated window closes.
 w.CSS={escape:value=>String(value)};w.fetch=()=>new Promise(()=>{});
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]||(()=>{})});
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.confirm=()=>true;
 w.eval(fs.readFileSync('assets/js/bamco.bundle.js','utf8'));
 assert.ok(w.Bamco?.state,'the canonical shared state is available');
 assert.equal(typeof w.BamcoData?.select,'function');
 assert.equal(typeof w.bamcoAuth?.accept,'function');
 assert.equal(errors.length,0,errors.join('\n'));
 // Do not call window.close(): JSDOM schedules its own microtasks for the
 // parsed document and closing it immediately makes those internals read a
 // detached location.  All app timers above are inert, so this isolated
 // window cannot keep the test runner alive.
});

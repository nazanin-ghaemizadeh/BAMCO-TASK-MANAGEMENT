const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const emoji=require('../assets/js/chat-emoji-renderer.js');
test('emoji sequences preserve skin tone, ZWJ, flags and keycaps as single images',()=>{
 assert.deepEqual(emoji.segments('👩🏽‍💻🇮🇷1️⃣'),['👩🏽‍💻','🇮🇷','1️⃣']);
 assert.equal(emoji.code('👩🏽‍💻'),'1f469-1f3fd-200d-1f4bb');assert.equal(emoji.code('❤️'),'2764');assert.equal(emoji.code('1️⃣'),'31-20e3');
 const dom=new JSDOM('<p id="x"></p>',{runScripts:'outside-only'}),w=dom.window;w.Intl.Segmenter=Intl.Segmenter;w.eval(fs.readFileSync('assets/js/chat-emoji-renderer.js','utf8'));
 const p=w.document.querySelector('p');p.textContent='سلام 👩🏽‍💻 🇮🇷 <script>';w.bamcoEmoji.render(p);assert.equal(p.querySelectorAll('img').length,2);assert.equal(p.querySelector('script'),null);assert(p.textContent.includes('<script>'));assert.equal(p.querySelector('img').alt,'👩🏽‍💻');dom.window.close();
});
test('service worker receives background push, keeps destination within app and focuses existing tab',async()=>{
 const listeners={},shown=[],opened=[],self={location:{href:'https://example.test/BAMCO/push-sw.js'},addEventListener:(n,f)=>listeners[n]=f,registration:{scope:'https://example.test/BAMCO/',showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync('push-sw.js','utf8'),{self,URL});let job;listeners.push({data:{json:()=>({id:'42',title:'عنوان',body:'متن',url:'https://evil.test/'})},waitUntil:p=>job=p});await job;assert.equal(shown[0][1].data.url,'https://example.test/BAMCO/');assert.equal(shown[0][1].tag,'bamco-42');
 listeners.notificationclick({notification:{data:shown[0][1].data,close(){}},waitUntil:p=>job=p});await job;assert.deepEqual(opened,['https://example.test/BAMCO/']);assert(!listeners.fetch);
});
test('letters tab is available to owners; missing files cannot be downloaded and edits carry revision',async()=>{
 const dom=new JSDOM('<section id="documentsView"><div class="feature-toolbar"></div><div id="documentsFeatureBody"></div></section><nav id="nav"></nav>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.state={token:'test',profile:{role:'owner'}};w.SB_URL='https://example.test';w.SB_KEY='test';w.toast=()=>{};w.selectAll=async()=>[{id:'letter-1',letter_number:'1405/01',letter_date:'1405/01/01',recipient:'گیرنده',subject:'موضوع',version:4,storage_path:null}];
 let payload;w.fetch=async(url,options)=>{payload=options.body;return {ok:false,json:async()=>({error:'نامه هم‌زمان تغییر کرده؛ تازه‌سازی کنید.'})}};
 w.eval(fs.readFileSync('assets/js/letters.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.document.querySelector('[data-document-tab=letters]').click();await new Promise(r=>setTimeout(r,20));
 assert(w.document.querySelector('[data-letter-download]').disabled);assert(!w.document.querySelector('[data-letter-delete]'));w.document.querySelector('[data-letter-edit]').click();const form=w.document.querySelector('#letterDialog form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));assert.equal(payload.get('version'),'4');assert(w.document.querySelector('#letterDialog').open);assert.match(w.document.querySelector('#letterDialog .letter-error').textContent,/هم‌زمان/);dom.window.close();
});

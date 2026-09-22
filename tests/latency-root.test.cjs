const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {fixture}=require('./helpers/app-fixture.cjs');
const read=file=>fs.readFileSync('assets/js/'+file,'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function media(disk=new Map(),fetch=async()=>new Response('image')){
 const dom=new JSDOM('',{url:'https://app.test/',runScripts:'outside-only'}),w=dom.window;
 w.state={user:{id:'one'},token:'valid'};w.SB_URL='https://db.test';w.SB_KEY='public';w.fetch=fetch;w.Response=Response;w.AbortController=AbortController;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.caches={open:async()=>({match:async k=>disk.get(k)?.clone(),put:async(k,v)=>disk.set(k,v.clone()),keys:async()=>[...disk.keys()],delete:async k=>disk.delete(k)}),delete:async()=>disk.clear()};
 w.eval(read('media-cache.js'));return {w,dom,disk};
}
test('sticker bytes survive reload, share simultaneous reads and remain isolated by account',async()=>{
 let calls=0;const disk=new Map(),fetch=async()=>{calls++;return new Response('image')};let f=media(disk,fetch);
 try{await Promise.all([f.w.bamcoMedia.get('stickers','pack/f.png'),f.w.bamcoMedia.get('stickers','pack/f.png')]);assert.equal(calls,1);f.dom.window.close();f=media(disk,fetch);await f.w.bamcoMedia.get('stickers','pack/f.png');assert.equal(calls,1);f.w.state.user.id='two';await f.w.bamcoMedia.get('stickers','pack/f.png');assert.equal(calls,2);f.w.bamcoMedia.clear();await tick();assert.equal(disk.size,0)}finally{f.dom.window.close()}
});
test('late image downloads cannot repopulate cache after logout',async()=>{
 let release;const f=media(new Map(),()=>new Promise(r=>release=r));try{const pending=f.w.bamcoMedia.get('stickers','pack/f.png');await tick();f.w.bamcoMedia.clear();f.w.state.token='';release(new Response('old'));await assert.rejects(pending,/نشست/);assert.equal(f.disk.size,0)}finally{f.dom.window.close()}
});
test('welcome validates metadata concurrently while showing cached pair, and token renewal does not restart it',async()=>{
 const dom=new JSDOM('<div id="appView" class="hidden"><div class="workspace"><nav id="nav"></nav></div></div>',{url:'https://app.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.state={user:{id:'one'},token:'first'};w.bamcoAuth={snapshot:()=>({id:'one'}),isCurrent:s=>s.id===w.state.user.id};
  w.sessionStorage.setItem('bamco.stickers.welcome.one',JSON.stringify({id:3,female:'f',male:'m'}));
  let requests=[],resolvers={},images=0;w.select=(table)=>{requests.push(table);return new Promise(r=>resolvers[table]=r)};w.bamcoMedia={get:async(b,p)=>{images++;return 'https://image.test/'+p}};
  w.eval(read('card-home.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const pending=w.bamcoPrepareWelcomeStickers();await tick();assert.deepEqual(requests,['sticker_sets','stickers']);assert.equal(w.document.querySelectorAll('.home-sticker[src]').length,2);
  w.state.token='renewed';resolvers.sticker_sets([{id:3}]);resolvers.stickers(['female','male'].map((gender,i)=>({set_id:3,gender,storage_path:i?'m':'f'})));await pending;const before=images;await w.bamcoPrepareWelcomeStickers();assert.equal(images,before);
 }finally{w.close()}
});
test('Persian date formatting reuses two formatters across a large table without changing dates',()=>{
 const src=read('app.js'),part=src.slice(src.indexOf('const persianDateFormatter='),src.indexOf('function jalaliToISO('));let constructed=0;
 const c={Intl:{DateTimeFormat:function(...args){constructed++;return new Intl.DateTimeFormat(...args)}},fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])};vm.createContext(c);vm.runInContext(part,c);
 for(let i=0;i<1249;i++)assert.equal(c.jalaliText('2026-09-13'),'۱۴۰۵/۰۶/۲۲');assert.equal(constructed,2);assert.equal(c.jalaliText('bad'),'—');assert.equal(c.jalaliText(null),'—');
});
test('archive computes display cells only for the visible page when no filter is selected',async t=>{
 const tasks=Array.from({length:129},(_,i)=>({id:i+1,legacy_id:i+1,title:'آرشیو '+i,archived:true,status:'done',priority:'عادی',start_date:'2026-09-01',done_date:'2026-09-13',due_date:'2026-09-13',owner_id:'test-owner'}));
 const f=await fixture({tables:{tasks},fetchResult:({endpoint,url,data})=>endpoint==='task_status_view'?data.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000)):undefined});t.after(()=>f.dispose());f.w.__formatted=new Set();f.w.eval('const originalColumns=taskColumnValues;taskColumnValues=function(t,a){if(a)window.__formatted.add(t.id);return originalColumns(t,a)}');await f.open('archive');assert.equal(f.d.querySelectorAll('#archiveBody tr[data-task-id]').length,50);assert.equal(f.w.__formatted.size,50);assert.equal(f.d.querySelector('#welcomeView'),null);assert.deepEqual(f.errors,[]);
});
test('slow workflow/history responses do not hold back task data',async t=>{
 // The workbench is now deliberately sourced from the one protected workflow
 // snapshot RPC, rather than permissive `change_requests` REST reads.  Hold
 // that RPC open and prove the independent task branch still renders.
 const releases=[];const f=await fixture({tables:{tasks:[{id:1,title:'Ready',archived:false,status:'doing',owner_id:'test-owner'}]},fetchResult:({endpoint,data})=>endpoint==='request_workflow_snapshot'?new Promise(resolve=>releases.push(()=>resolve(data))):undefined});t.after(()=>f.dispose());
 try{assert.equal(f.w.eval('state.tasks.length'),1);assert(releases.length>0)}finally{releases.forEach(release=>release())}
});
test('on-demand DOCX loader shares work and starts the renderer only after ZIP is ready',async()=>{
 const src=read('documents-sites.js'),loader=src.slice(src.indexOf('let docxViewerPromise='),src.indexOf('async function previewDocument(')),scripts=[];
 const c={window:{},setTimeout,clearTimeout,document:{createElement:()=>({remove(){}}),head:{append:el=>scripts.push(el)}}};vm.createContext(c);vm.runInContext(loader,c);
 const a=c.ensureDocxViewer(),b=c.ensureDocxViewer();assert.equal(a,b);assert.equal(scripts.length,1);assert.match(scripts[0].src,/jszip/);c.window.JSZip={};scripts[0].onload();await tick();assert.equal(scripts.length,2);assert.match(scripts[1].src,/docx-preview/);c.window.docx={renderAsync(){}};scripts[1].onload();await a;
});

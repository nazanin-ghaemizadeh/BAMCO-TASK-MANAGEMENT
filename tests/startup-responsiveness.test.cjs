const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const sourcePaths=[...fs.readFileSync('assets/js/bamco.bundle.js','utf8').matchAll(/\/\* source: (assets\/js\/[^ ]+) \*\//g)].map(match=>match[1]);

test('startup reaches an idle browser turn without a self-triggering DOM observer',async()=>{
 const html=fs.readFileSync('index.html','utf8')
  .replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/g,'')
  .replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/g,'')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g,'');
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));vc.on('error',error=>errors.push(String(error)));
 const dom=new JSDOM(html,{url:'https://bamco.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,limit=Number(process.env.BAMCO_SOURCE_LIMIT||sourcePaths.length);
 const intervals=new Set(),timeouts=new Set(),frames=new Set(),nativeSetInterval=w.setInterval.bind(w),nativeClearInterval=w.clearInterval.bind(w),nativeSetTimeout=w.setTimeout.bind(w),nativeClearTimeout=w.clearTimeout.bind(w);
 w.setInterval=(callback,delay,...args)=>{const id=nativeSetInterval(callback,delay,...args);intervals.add(id);return id};
 w.clearInterval=id=>{intervals.delete(id);nativeClearInterval(id)};
 w.setTimeout=(callback,delay,...args)=>{let id;id=nativeSetTimeout(()=>{timeouts.delete(id);callback(...args)},delay);timeouts.add(id);return id};
 w.clearTimeout=id=>{timeouts.delete(id);nativeClearTimeout(id)};
 try{
  w.Response=Response;w.Request=Request;w.Headers=Headers;w.AbortController=AbortController;w.Blob=Blob;w.TextEncoder=TextEncoder;
  w.CSS={escape:value=>String(value)};w.fetch=()=>new Promise(()=>{});
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  const NativeObserver=w.MutationObserver,observerStats=[],mutationCounts=new Map();let observerCallbacks=0;
  w.MutationObserver=class extends NativeObserver{
   constructor(callback){
    const stat={callbacks:0,stack:new Error().stack,samples:new Set()};
    super(records=>{for(const record of records){const sample=`${record.type}:${record.attributeName||''}:${record.target?.tagName||''}#${record.target?.id||''}.${record.target?.className||''}`;mutationCounts.set(sample,(mutationCounts.get(sample)||0)+1);if(stat.samples.size<8)stat.samples.add(sample)}stat.callbacks++;observerCallbacks++;if(stat.callbacks>50||observerCallbacks>500)this.disconnect();else callback(records)});
    observerStats.push(stat);
   }
  };
  const nativeRaf=w.requestAnimationFrame.bind(w);let animationFrames=0;
  w.requestAnimationFrame=callback=>{let id;id=nativeRaf(time=>{frames.delete(id);animationFrames++;if(animationFrames<500)callback(time)});frames.add(id);return id};
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]||(()=>{})});
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.confirm=()=>true;
  w.eval(sourcePaths.slice(0,limit).map(path=>`${fs.readFileSync(path,'utf8')}\n;`).join('\n'));
  await new Promise(resolve=>setTimeout(resolve,80));
  const busy=observerStats.filter(stat=>stat.callbacks>10).map(stat=>({callbacks:stat.callbacks,at:stat.stack.split('\n').slice(2,4),samples:[...stat.samples]}));
  const mutations=[...mutationCounts].sort((a,b)=>b[1]-a[1]).slice(0,20);
  assert(observerCallbacks<500,`observer callbacks: ${observerCallbacks}\nmutations: ${JSON.stringify(mutations,null,2)}\n${JSON.stringify(busy,null,2)}`);
  assert(animationFrames<500,`animation frames: ${animationFrames}`);
  assert(Math.max(0,...observerStats.map(stat=>stat.callbacks))<50,JSON.stringify(observerStats,null,2));
  assert.equal(errors.length,0,errors.join('\n'));
  assert.equal(w.document.querySelector('#departmentEntry')?.hidden,false);
 }finally{for(const id of intervals)nativeClearInterval(id);for(const id of timeouts)nativeClearTimeout(id);for(const id of frames)w.cancelAnimationFrame(id)}
});

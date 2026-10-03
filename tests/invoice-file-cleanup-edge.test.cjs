const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../supabase/functions/invoice-file-cleanup/worker.mjs')));
const key='test-server-only-key';
const request=(auth=`Bearer ${key}`,method='POST',body)=>new Request('https://example.test/cleanup',{method,headers:{Authorization:auth},...(body?{body:JSON.stringify(body)}:{})});
const job=(id='1')=>({file_id:id,bucket_id:'invoices-private',storage_path:`1/invoice/proforma/10000000-0000-0000-0000-${id.padStart(12,'0').slice(-12)}.pdf`});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
test('cleanup requires exact service credential and POST, before any external request',async()=>{
 const {createInvoiceCleanupHandler}=await load();let calls=0;
 const handler=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async()=>{calls++;return json([]);}});
 assert.equal((await handler(request('Bearer user-session'))).status,401);
 assert.equal((await handler(request('', 'GET'))).status,405);
 assert.equal(calls,0);
 const unavailable=createInvoiceCleanupHandler({url:'https://project.test',fetchImpl:async()=>{calls++;}});
 assert.equal((await unavailable(request())).status,503);assert.equal(calls,0);
});
test('cleanup consumes only server outbox paths, removes bytes via API, then acknowledges',async()=>{
 const {createInvoiceCleanupHandler}=await load();const calls=[];
 const handler=createInvoiceCleanupHandler({url:'https://project.test/',serviceKey:key,fetchImpl:async(url,options)=>{
  calls.push({url,method:options.method,body:JSON.parse(options.body)});
  if(url.endsWith('invoice_file_cleanup_batch'))return json([job('9007199254740993')]);
  return json(url.includes('/storage/')?[]:true);
 }});
 const result=await handler(request(undefined,'POST',{bucket_id:'other',storage_path:'malicious/path'}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{scanned:1,completed:1,failed:0,deferred:0});
 assert.equal(calls.length,3);assert.deepEqual(calls[0].body,{p_limit:20});
 assert.equal(calls[1].url,'https://project.test/storage/v1/object/invoices-private');assert.equal(calls[1].method,'DELETE');
 assert.deepEqual(calls[1].body,{prefixes:[job('9007199254740993').storage_path]});
 assert.deepEqual(calls[2].body,{p_file_id:'9007199254740993'});
});
test('failed object removal is never acknowledged; an already-absent retry succeeds',async()=>{
 const {createInvoiceCleanupHandler}=await load();let failed=true,acks=0;
 const handler=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async(url)=>{
  if(url.endsWith('invoice_file_cleanup_batch'))return json([job()]);
  if(url.includes('/storage/'))return failed?json({message:'secret upstream details'},500):json([]);
  acks++;return json(true);
 }});
 let result=await handler(request());assert.equal(result.status,207);assert.equal((await result.json()).failed,1);assert.equal(acks,0);
 failed=false;result=await handler(request());assert.equal(result.status,200);assert.equal(acks,1);
});
test('unsafe queue data cannot delete another bucket, arbitrary path or URL',async()=>{
 const {createInvoiceCleanupHandler}=await load();let deletes=0;
 const rows=[{...job(),bucket_id:'public'}, {...job(),storage_path:'https://evil.test/a'}, {...job(),storage_path:'1/../secret'}, {...job(),file_id:'1 OR true'}];
 const handler=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async(url)=>{
  if(url.endsWith('invoice_file_cleanup_batch'))return json(rows);deletes++;return json(true);
 }});
 const result=await handler(request());assert.equal((await result.json()).failed,4);assert.equal(deletes,0);
});
test('batch is bounded and credentials/upstream details never appear in errors',async()=>{
 const {createInvoiceCleanupHandler}=await load();let deletes=0;
 const handler=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async(url)=>{
  if(url.endsWith('invoice_file_cleanup_batch'))return json(Array.from({length:70},(_,i)=>job(String(i+1))));
  if(url.includes('/storage/'))deletes++;return json(true);
 }});
 const result=await handler(request());assert.equal((await result.json()).scanned,20);assert.equal(deletes,20);
 const broken=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async()=>{throw new Error(key)}});
 const response=await broken(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes(key));
});
test('failed acknowledgement and exhausted run budget retain work',async()=>{
 const {createInvoiceCleanupHandler}=await load();
 const handler=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,fetchImpl:async(url)=>{
  if(url.endsWith('invoice_file_cleanup_batch'))return json([job()]);
  return json(url.includes('/storage/')?[]:false);
 }});
 assert.equal((await (await handler(request())).json()).failed,1);
 let ticks=0,deletes=0;
 const bounded=createInvoiceCleanupHandler({url:'https://project.test',serviceKey:key,now:()=>ticks++?45001:0,fetchImpl:async(url)=>{
  if(url.endsWith('invoice_file_cleanup_batch'))return json([job()]);deletes++;return json(true);
 }});
 const summary=await (await bounded(request())).json();assert.equal(summary.deferred,1);assert.equal(deletes,0);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {stripTypeScriptTypes}=require('node:module');

const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/smart-assistant/index.ts','utf8').replace(/^import[^\n]*\n/,''));
const grants=['voiceAssistant','kanban','archive','projects','approvals','notes','organization','messages'];
const access=allowed=>({schema:'bamco.feature-access.v1',grants:grants.map(feature_key=>({feature_key,can_view:allowed.includes(feature_key)}))});
const post=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json',...headers},body:JSON.stringify(body)});

function harness({allowed=grants,tables={},rpc={},auth=true,dbError=null,openaiError=false,speechError=false}={}){
  let handler;
  const queries=[],calls=[],upstream=[];
  const row={id:'user-1',full_name:'کاربر نمونه',role:'expert',primary_position_id:2};
  const data={profiles:row,task_status_view:[{id:7,title:'وظیفه من',owner_id:'user-1',due_state:'دیرکرد'}],projects:[{id:4,title:'پروژه نمونه'}],project_items:[{id:8,project_id:4,title:'گام یک'}],project_dependencies:[{predecessor_item_id:8,successor_item_id:9}],notifications:[],...tables};
  const client={
    auth:{getUser:async()=>auth?{data:{user:{id:'user-1'}},error:null}:{data:{user:null},error:{message:'invalid'}}},
    rpc:async name=>{calls.push(name);return{data:name==='effective_feature_access'?access(allowed):rpc[name]??(name==='organization_scope_directory'?[]:{schema:'bamco.workflow.v2',routes:[],current_requests:[]}),error:null}},
    from:name=>{
      const query={table:name,select:'',filters:[]};queries.push(query);
      const result=()=>dbError===name?{data:null,error:{message:'database unavailable'}}:{data:data[name],error:null};
      const chain={select(value){query.select=value;return this},eq(...args){query.filters.push(['eq',...args]);return this},is(...args){query.filters.push(['is',...args]);return this},in(...args){query.filters.push(['in',...args]);return this},lte(...args){query.filters.push(['lte',...args]);return this},order(){return this},limit:async()=>result(),single:async()=>result()};
      return chain;
    }
  };
  const context={Deno:{env:{get:key=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',OPENAI_API_KEY:'key'})[key]},serve:fn=>{handler=fn}},createClient:()=>client,Response,Request,FormData,File,AbortSignal,crypto:webcrypto,TextEncoder,Uint8Array,
    console:{warn(){},info(){}},fetch:async(url,options)=>{
      upstream.push({url,options});
      if(url.endsWith('/audio/speech')&&speechError)return new Response('{}',{status:503});
      if(openaiError)return new Response('{}',{status:503});
      if(url.endsWith('/audio/speech'))return new Response('mp3-bytes',{headers:{'Content-Type':'audio/mpeg'}});
      return new Response(JSON.stringify(url.endsWith('/transcriptions')?{text:'سلام'}:{id:'resp_1',output_text:'پاسخ واقعی'}),{headers:{'Content-Type':'application/json'}});
    }};
  vm.runInNewContext(source,context);
  return {call:request=>handler(request),queries,calls,upstream};
}

test('task answer uses the authenticated identity and caller-scoped task view',async()=>{
  const h=harness();const result=await h.call(post({message:'من چه وظایفی دارم؟'}));
  assert.equal(result.status,200);const answer=await result.json();assert.equal(answer.text,'پاسخ واقعی');assert.match(answer.speech_token,/^[0-9a-f]{64}$/);
  const task=h.queries.find(query=>query.table==='task_status_view');assert(task);
  assert.deepEqual(task.filters.map(value=>Array.from(value)),[['eq','archived',false],['eq','owner_id','user-1']]);
  assert.doesNotMatch(task.select,/owner_name|description/);
  const prompt=JSON.parse(h.upstream[0].options.body);
  assert.equal(prompt.store,false);assert.equal(prompt.input[0].content.includes('وظیفه من'),true);
  assert.equal(h.queries.some(query=>query.table==='projects'),false);
});

test('unauthorized data is rejected before querying that table or contacting AI',async()=>{
  const h=harness({allowed:['voiceAssistant']});const result=await h.call(post({message:'پروژه‌های من؟'}));
  assert.equal(result.status,403);assert.equal(h.queries.length,0);assert.equal(h.upstream.length,0);
});

test('project follow-up retrieves fresh permitted activities and dependencies',async()=>{
  const h=harness();const result=await h.call(post({message:'کار عقب‌افتاده‌ش کدام است؟',history:[{role:'user',text:'پروژه نمونه چه وضعیتی دارد؟'},{role:'assistant',text:'پاسخ قبلی'}]}));
  assert.equal(result.status,200);
  assert(h.queries.some(query=>query.table==='projects'));
  assert(h.queries.some(query=>query.table==='project_items'));
  assert(h.queries.some(query=>query.table==='project_dependencies'));
});

test('a personal briefing joins every granted workspace source without bypassing caller scope',async()=>{
 const h=harness({allowed:[...grants,'archive','notes'],tables:{personal_notes:[{id:'n1',title:'یادداشت من',body:'پیگیری',inactive:false}]}});
 assert.equal((await h.call(post({message:'یک مرور کامل از وضعیت کارهایم بده'}))).status,200);
 for(const table of ['task_status_view','projects','project_items','project_dependencies','personal_notes'])assert(h.queries.some(query=>query.table===table),table);
 assert(h.calls.includes('request_workflow_snapshot'));
 const prompt=JSON.parse(h.upstream[0].options.body).input[0].content;
 assert.match(prompt,/یادداشت من/);assert.match(prompt,/archive/);
});

test('a rejected deadline request is supplied to the assistant as factual request history',async()=>{
 const h=harness({rpc:{request_workflow_snapshot:{schema:'bamco.workflow.v2',routes:[],current_requests:[],history_requests:[{id:12,request_type:'update',request_status:'rejected',task_id:7,proposed_data:{title:'وظیفه من',due_date:'2026-10-10'},review_note:'با تمدید موافقت نشد'}]}}});
 assert.equal((await h.call(post({message:'درخواست تمدید زمانم چه شد؟'}))).status,200);
 const prompt=JSON.parse(h.upstream[0].options.body).input[0].content;
 assert.match(prompt,/rejected/);assert.match(prompt,/2026-10-10/);assert.match(prompt,/با تمدید موافقت نشد/);
});

test('today planning retrieves only granted work and organizational scope never expands on its own',async()=>{
  const h=harness({allowed:['voiceAssistant','kanban','projects']});
  assert.equal((await h.call(post({message:'امروز از کجا شروع کنم؟'}))).status,200);
  const task=h.queries.find(query=>query.table==='task_status_view');assert(task.filters.some(filter=>filter[0]==='lte'&&filter[1]==='due_date'));
  assert(h.queries.some(query=>query.table==='projects'));
  assert.equal(h.calls.includes('request_workflow_snapshot'),false);
  const denied=harness({allowed:['voiceAssistant','kanban']});
  assert.equal((await denied.call(post({message:'وظایف تیم من چیست؟'}))).status,403);
  assert.equal(denied.queries.length,0);
});

test('organization answer receives only the canonical scoped directory',async()=>{
  const h=harness({rpc:{organization_scope_directory:[{position_id:2,position_title:'کارشناس',occupant_id:'user-1',occupant_full_name:'کاربر نمونه',is_current_position:true}]}});
  assert.equal((await h.call(post({message:'جایگاه من در سازمان چیست؟'}))).status,200);
  assert(h.calls.includes('organization_scope_directory'));
  assert.equal(h.queries.some(query=>query.table==='organization_positions'),false);
  assert.match(JSON.parse(h.upstream[0].options.body).input[0].content,/کارشناس/);
});

test('approval tool sends only requests actionable by the current user',async()=>{
  const h=harness({rpc:{request_workflow_snapshot:{schema:'bamco.workflow.v2',routes:[{request_id:1,actionable:true},{request_id:2,actionable:false}],current_requests:[{id:1,request_type:'update',proposed_data:{title:'مجاز'}},{id:2,request_type:'delete',proposed_data:{title:'غیرمجاز'}}]}}});
  assert.equal((await h.call(post({message:'درخواست‌های منتظر تأیید من'}))).status,200);
  const prompt=JSON.parse(h.upstream[0].options.body).input[0].content;
  assert.match(prompt,/مجاز/);assert.doesNotMatch(prompt,/غیرمجاز/);
  assert(h.calls.includes('request_workflow_snapshot'));
});

test('database failure returns an honest error without a generated answer',async()=>{
  const h=harness({dbError:'task_status_view'});const result=await h.call(post({message:'کارهایم؟'}));
  assert.equal(result.status,503);assert.match((await result.json()).error,/اطلاعات موردنیاز/);assert.equal(h.upstream.length,0);
});

test('AI service failure gives a clear error without fabricated data',async()=>{
  const h=harness({openaiError:true});const result=await h.call(post({message:'سلام'}));
  assert.equal(result.status,502);assert.match((await result.json()).error,/پاسخ دستیار/);
  assert.equal(h.upstream.length,1);
});

test('speech synthesis failure leaves the text answer intact',async()=>{
  const h=harness({speechError:true});const answer=await (await h.call(post({message:'سلام'}))).json();
  assert.equal(answer.text,'پاسخ واقعی');
  const speech=await h.call(post({action:'speech',text:answer.text,issued:answer.issued,speech_token:answer.speech_token}));
  assert.equal(speech.status,502);assert.equal(answer.text,'پاسخ واقعی');
});

test('speech requires a short-lived token bound to the server answer and user',async()=>{
  const h=harness();const answer=await (await h.call(post({message:'سلام'}))).json();
  const speech=await h.call(post({action:'speech',text:answer.text,issued:answer.issued,speech_token:answer.speech_token}));
  assert.equal(speech.status,200);assert.equal(speech.headers.get('Content-Type'),'audio/mpeg');assert.equal(await speech.text(),'mp3-bytes');
  const altered=await h.call(post({action:'speech',text:'متن تغییریافته',issued:answer.issued,speech_token:answer.speech_token}));assert.equal(altered.status,403);
  assert.equal(h.upstream.filter(call=>call.url.endsWith('/audio/speech')).length,1);
});

test('voice recording is transcribed only for an authenticated user',async()=>{
  const h=harness(),body=new FormData();body.append('audio',new File(['recording'],'voice.webm',{type:'audio/webm'}));
  const result=await h.call(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer token'},body}));
  assert.equal(result.status,200);assert.equal((await result.json()).transcript,'سلام');
  assert.match(h.upstream[0].url,/\/v1\/audio\/transcriptions$/);
  assert.equal(h.upstream[0].options.body.get('language'),'fa');
  const invalid=harness({auth:false});assert.equal((await invalid.call(post({message:'سلام'}))).status,401);assert.equal(invalid.upstream.length,0);
});

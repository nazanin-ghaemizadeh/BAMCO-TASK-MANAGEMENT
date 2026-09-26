const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/smart-assistant/index.ts','utf8').replace(/^import[^\n]*\n/,''));
function harness(){
  let handler,selected,upstream;
  const client={auth:{getUser:async()=>({data:{user:{id:'user-1'}},error:null})},from:()=>({
    select(columns){selected=columns;return this},eq(){return this},order(){return this},
    limit:async()=>({data:[{legacy_id:7,title:'نمونه',status:'باز',priority:'بالا'}],error:null})
  })};
  const context={Deno:{env:{get:key=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',OPENAI_API_KEY:'key'})[key]},serve:fn=>{handler=fn}},createClient:()=>client,Response,Request,FormData,File,AbortSignal,crypto,TextEncoder,Uint8Array,fetch:async(url,options)=>{upstream={url,options};return new Response(JSON.stringify(url.includes('/transcriptions')?{text:'سلام'}:{id:'resp_1',output_text:'پاسخ'}),{headers:{'Content-Type':'application/json'}})}};
  vm.runInNewContext(source,context);
  return {call:request=>handler(request),get selected(){return selected},get upstream(){return upstream}};
}

test('assistant reads valid scoped task columns and returns the model answer',async()=>{
  const h=harness();
  const result=await h.call(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify({message:'کارهایم؟'})}));
  assert.equal(result.status,200);assert.equal((await result.json()).text,'پاسخ');
  assert.doesNotMatch(h.selected,/owner_name/);
  assert.match(h.upstream.url,/\/v1\/responses$/);
});

test('assistant transcribes an authenticated voice recording',async()=>{
  const h=harness(),body=new FormData();body.append('audio',new File(['recording'],'voice.webm',{type:'audio/webm'}));
  const result=await h.call(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer token'},body}));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{transcript:'سلام'});
  assert.match(h.upstream.url,/\/v1\/audio\/transcriptions$/);
  assert.equal(h.upstream.options.body.get('language'),'fa');
});

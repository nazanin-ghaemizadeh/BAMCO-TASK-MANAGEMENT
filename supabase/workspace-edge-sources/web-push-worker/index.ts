import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

async function service(action:string,data:any={}){const r=await db.rpc('push_service',{p_action:action,p_data:data});if(r.error)throw r.error;return r.data}
function endpointAllowed(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))}catch{return false}}

Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
  const data=await req.json().catch(()=>({}));
  if(data.action!=='deliver')return json({error:'Invalid action'},400);
  let config=await service('config');
  const supplied=req.headers.get('x-push-worker-key')||'';
  if(!supplied||supplied!==config.worker_key)return json({error:'Unauthorized'},401);
  if(!config.private_key)config=await service('keys',webpush.generateVAPIDKeys());
  webpush.setVapidDetails('mailto:ghaemizadeh@bamco.ir',config.public_key,config.private_key);
  const jobs=await service('claim');let accepted=0,failed=0;
  await Promise.all((jobs||[]).map(async(job:any)=>{
   try{
    if(!endpointAllowed(job.subscription.endpoint))throw Error('Invalid push endpoint');
    await webpush.sendNotification(job.subscription,JSON.stringify({
      id:String(job.notification_id),title:job.title||'BAMCO',
      body:String(job.body||'اعلان جدید در سامانه').slice(0,700),
      url:'./?notification='+job.notification_id
    }),{TTL:86400,urgency:'normal',timeout:10000});
    await service('finish',{id:job.id,ok:true});accepted++;
   }catch(error:any){
    await service('finish',{id:job.id,subscription_id:job.subscription_id,ok:false,expired:[404,410].includes(error.statusCode),error:'Push delivery status '+(error.statusCode||'network error')});failed++;
   }
  }));
  return json({accepted,failed});
 }catch(error){console.error('web-push-worker',error);return json({error:'Worker failed'},500)}
});

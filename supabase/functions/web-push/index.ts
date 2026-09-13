import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://nazanin-ghaemizadeh.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function service(action:string,data:any={}){const r=await db.rpc('push_service',{p_action:action,p_data:data});if(r.error)throw r.error;return r.data}
function endpointAllowed(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)$/.test(u.hostname)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))}catch{return false}}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'روش مجاز نیست.'},405);
 try{
  const data=await req.json();let config=await service('config');
  if(data.action==='deliver'){
   if(!req.headers.get('x-push-worker-key')||req.headers.get('x-push-worker-key')!==config.worker_key)return reply({error:'Unauthorized'},401);
   if(!config.private_key)config=await service('keys',webpush.generateVAPIDKeys());
   webpush.setVapidDetails('mailto:ghaemizadeh@bamco.ir',config.public_key,config.private_key);
   const jobs=await service('claim');let accepted=0,failed=0;
   await Promise.all(jobs.map(async(job:any)=>{
    try{
     if(!endpointAllowed(job.subscription.endpoint))throw Error('Invalid push endpoint');
     await webpush.sendNotification(job.subscription,JSON.stringify({id:String(job.notification_id),title:job.title||'BAMCO',body:String(job.body||'اعلان جدید در سامانه').slice(0,700),url:'./?notification='+job.notification_id}),{TTL:86400,urgency:'normal',timeout:10000});
     await service('finish',{id:job.id,ok:true});accepted++;
    }catch(error:any){await service('finish',{id:job.id,subscription_id:job.subscription_id,ok:false,expired:[404,410].includes(error.statusCode),error:'Push delivery status '+(error.statusCode||'network error')});failed++}
   }));return reply({accepted,failed});
  }
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return reply({error:'نشست معتبر نیست.'},401);
  const {data:profile}=await db.from('profiles').select('active').eq('id',user.id).single();if(!profile?.active)return reply({error:'حساب فعال نیست.'},403);
  if(!config.public_key)config=await service('keys',webpush.generateVAPIDKeys());
  if(data.action==='config')return reply({publicKey:config.public_key});
  if(data.action==='subscribe'){
   const s=data.subscription;if(!s||!endpointAllowed(s.endpoint)||s.endpoint.length>4096||!/^[A-Za-z0-9_-]{87,88}$/.test(s.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22,24}$/.test(s.keys?.auth||''))return reply({error:'اشتراک اعلان معتبر نیست.'},400);
   await service('subscribe',{user_id:user.id,subscription:{endpoint:s.endpoint,expirationTime:s.expirationTime||null,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}}});return reply({subscribed:true});
  }
  if(data.action==='unsubscribe'){await service('unsubscribe',{user_id:user.id,endpoint:String(data.endpoint||'')});return reply({subscribed:false})}
  return reply({error:'عملیات مجاز نیست.'},400);
 }catch{return reply({error:'سرویس اعلان پاسخ نداد؛ دوباره تلاش کنید.'},500)}
});

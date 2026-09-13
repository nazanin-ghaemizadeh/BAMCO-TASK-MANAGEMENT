import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'
import '../../../assets/js/message-renderer.js'
import './worker.js'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors})
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
 if(req.method!=='POST')return reply({error:'Method not allowed'},405)
 try{
  const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,auth=req.headers.get('Authorization')||''
  const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}}})
  const {data:{user}}=await userClient.auth.getUser();if(!user)return reply({error:'نشست کاربری معتبر نیست.'},401)
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}})
  const {data:profile}=await admin.from('profiles').select('role,active,display_name,full_name,email').eq('id',user.id).maybeSingle()
  if(profile?.role!=='manager'||!profile.active)return reply({error:'فقط مدیر فعال مجاز به ارسال ایمیل است.'},403)
  const senderName=profile.display_name||profile.full_name||profile.email||'سامانه'
  const mailerinoKey=Deno.env.get('MAILERINO_API_KEY'),emailFrom=Deno.env.get('MAILERINO_FROM_EMAIL')||Deno.env.get('EMAIL_FROM')
  if(!mailerinoKey||!emailFrom)return reply({error:'کلید سرویس یا فرستنده تأییدشده ایمیل روی سرور تنظیم نشده است.'},503)
  const {batch_id,action}=await req.json().catch(()=>({}))
  if(action==='check'){
   try{await fetch('https://api.mailerino.com/v1/send',{method:'HEAD',signal:AbortSignal.timeout(10000)});return reply({ok:true,message:'اتصال امن به سرویس برقرار است؛ نتیجه نهایی هر ارسال در سابقه پیام‌ها ثبت می‌شود.'})}
   catch(error){return reply({error:globalThis.BamcoEmailQueue.explain(error)},503)}
  }
  if(!batch_id||!/^[0-9a-f-]{36}$/i.test(batch_id))return reply({error:'شناسه بسته پیام معتبر نیست.'},400)
  const result=await globalThis.BamcoEmailQueue.run(admin,batch_id,async(snapshot,delivery)=>{
   let stickerUrl=''
   if(snapshot.sticker_path){const {data,error}=await admin.storage.from('stickers').createSignedUrl(snapshot.sticker_path,60*60*24*7);if(!error)stickerUrl=data.signedUrl}
   const tracking=globalThis.BamcoMessageRender.isReminder(snapshot)?'':'شناسه پیگیری: '+delivery.thread_key
   const response=await fetch('https://api.mailerino.com/v1/send',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${mailerinoKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:emailFrom,to:snapshot.recipient_email,cc:snapshot.cc_emails||[],replyTo:Deno.env.get('EMAIL_REPLY_TO')||'bamco.task.reminder@outlook.com',subject:`${snapshot.subject} [${delivery.thread_key}]`,text:globalThis.BamcoMessageRender.bodyText({...snapshot,body_template:snapshot.final_text})+(tracking?`\n\n${tracking}`:''),html:globalThis.BamcoMessageRender.html(snapshot,{stickerUrl,tracking:delivery.thread_key,subject:snapshot.subject,reportDate:snapshot.created_at,senderName})})})
   const info=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof info.message==='string'?info.message:typeof info.error==='string'?info.error:`سرویس ایمیل خطای ${response.status} برگرداند.`)
   return info
  });return reply(result)
 }catch(error){return reply({error:globalThis.BamcoEmailQueue.explain(error)},500)}
})

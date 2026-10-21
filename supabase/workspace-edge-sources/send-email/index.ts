import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';

const corsHeaders={
  'Access-Control-Allow-Origin':'https://nazanin-ghaemizadeh.github.io',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json'
};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFICIAL_REPLY_TO='bamco.task.reminder@outlook.com';
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization=req.headers.get('Authorization')||'';
    const client=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
    const {data:{user}}=await client.auth.getUser();
    if(!user)return reply({error:'نشست کاربری معتبر نیست.'},401);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const {data:profile}=await client.from('profiles').select('role,active').eq('id',user.id).maybeSingle();
    if(profile?.role!=='manager'||!profile.active)return reply({error:'فقط مدیر مجاز به ارسال ایمیل است.'},403);

    const apiKey=Deno.env.get('MAILERINO_API_KEY');
    const from=Deno.env.get('MAILERINO_FROM_EMAIL')||Deno.env.get('EMAIL_FROM');
    if(!apiKey||!from)return reply({error:'Email service is not configured'},500);

    const body=await req.json();
    const to=typeof body?.to==='string'?body.to.trim():'';
    const subject=typeof body?.subject==='string'?body.subject.trim():'';
    const text=typeof body?.text==='string'?body.text:undefined;
    const html=typeof body?.html==='string'?body.html:undefined;
    if(!emailPattern.test(to))return reply({error:'Invalid recipient email'},400);
    if(!subject||subject.length>300)return reply({error:'Invalid subject'},400);
    if((!text||!text.trim())&&(!html||!html.trim()))return reply({error:'Email body is required'},400);

    const payload:Record<string,unknown>={from,to,subject,replyTo:OFFICIAL_REPLY_TO};
    if(text)payload.text=text;if(html)payload.html=html;
    const providerResponse=await fetch('https://api.mailerino.com/v1/send',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const raw=await providerResponse.text();let providerData:unknown=raw;try{providerData=raw?JSON.parse(raw):{}}catch{}
    if(!providerResponse.ok)return reply({error:'Email provider rejected the request',providerStatus:providerResponse.status,details:providerData},502);
    return reply({ok:true,provider:'mailerino',replyTo:OFFICIAL_REPLY_TO,result:providerData});
  }catch(error){
    console.error('send-email error',error);
    return reply({error:'Unexpected server error'},500);
  }
});


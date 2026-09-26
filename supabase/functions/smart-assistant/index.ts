import { createClient } from 'jsr:@supabase/supabase-js@2.57.4'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Content-Type':'application/json; charset=utf-8'
}
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors})
const textFrom=(payload:any)=>{
  if(typeof payload?.output_text==='string')return payload.output_text.trim()
  return (payload?.output||[]).flatMap((item:any)=>item?.content||[]).filter((item:any)=>item?.type==='output_text').map((item:any)=>item?.text||'').join('\n').trim()
}
const safetyId=async(userId:string)=>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`bamco:${userId}`))
  return 'bamco_'+[...new Uint8Array(bytes)].slice(0,16).map(byte=>byte.toString(16).padStart(2,'0')).join('')
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(request.method!=='POST')return reply({error:'روش درخواست معتبر نیست.'},405)
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,auth=request.headers.get('Authorization')||''
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
    const {data:{user},error:userError}=await client.auth.getUser()
    if(userError||!user)return reply({error:'نشست کاربری معتبر نیست.'},401)
    const apiKey=Deno.env.get('OPENAI_API_KEY')
    if(!apiKey)return reply({error:'کلید OpenAI هنوز روی سرور تنظیم نشده است.'},503)
    if(request.headers.get('Content-Type')?.includes('multipart/form-data')){
      const form=await request.formData(),file=form.get('audio')
      if(!(file instanceof File)||!file.size||file.size>10*1024*1024||!['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav'].includes(file.type))return reply({error:'فایل صدای معتبر تا ۱۰ مگابایت ارسال کنید.'},400)
      const payload=new FormData();payload.append('file',file,file.name||'voice.webm');payload.append('model','whisper-1');payload.append('language','fa')
      const transcription=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:payload,signal:AbortSignal.timeout(45000)})
      const result=await transcription.json().catch(()=>({}))
      if(!transcription.ok)return reply({error:result?.error?.message||'تبدیل صدا به متن انجام نشد.'},transcription.status)
      return reply({transcript:String(result.text||'').trim().slice(0,4000)})
    }
    const body=await request.json().catch(()=>({})),message=String(body.message||'').trim().slice(0,4000)
    if(!message)return reply({error:'پیام خالی است.'},400)
    const {data:tasks,error:taskError}=await client.from('task_status_view').select('legacy_id,title,status,priority,start_date,due_date,done_date,archived').eq('archived',false).order('due_date',{ascending:true,nullsFirst:false}).limit(100)
    if(taskError)return reply({error:'دریافت امن وظایف شما انجام نشد.'},500)
    const taskContext=(tasks||[]).map((task:any)=>`- شناسه ${task.legacy_id??'—'} | ${task.title||'بدون عنوان'} | وضعیت: ${task.status||'—'} | اولویت: ${task.priority||'—'} | شروع: ${task.start_date||'—'} | پایان: ${task.due_date||'—'}`).join('\n')||'وظیفه بازی برای این کاربر ثبت نشده است.'
    const payload:any={
      model:Deno.env.get('OPENAI_MODEL')||'gpt-5-mini',
      store:true,
      safety_identifier:await safetyId(user.id),
      instructions:'تو دستیار فارسی سامانه مدیریت امور BAMCO هستی. فقط بر اساس وظایفی که سرور در همین پیام در اختیار تو قرار داده و اطلاعاتی که کاربر در همین گفت‌وگو می‌گوید پاسخ بده. پاسخ‌ها عملی، کوتاه، محترمانه و اولویت‌محور باشند. اگر داده کافی نیست صریح بگو. هرگز ادعا نکن کاری را در سامانه ثبت، حذف یا ویرایش کرده‌ای. تاریخ‌ها را همان‌طور که دریافت می‌کنی بیان کن.',
      input:[{role:'user',content:`فهرست فعلی وظایف مجاز کاربر:\n${taskContext}\n\nدرخواست کاربر:\n${message}`}]
    }
    if(typeof body.previous_response_id==='string'&&/^resp_[A-Za-z0-9_-]+$/.test(body.previous_response_id))payload.previous_response_id=body.previous_response_id
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)return reply({error:data?.error?.message||'پاسخ دستیار هوشمند دریافت نشد.'},response.status)
    return reply({text:textFrom(data)||'پاسخی دریافت نشد.',response_id:data.id||null})
  }catch(error){return reply({error:error instanceof Error?error.message:'خطای پیش‌بینی‌نشده در دستیار هوشمند.'},500)}
})

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,authorization=req.headers.get("Authorization")||"";
    const userRes=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:authorization}});if(!userRes.ok)return json({error:"ورود معتبر نیست."},401);
    const user=await userRes.json();
    const profileRes=await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role,active`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),profiles=await profileRes.json();
    if(profiles?.[0]?.role!=="manager"||!profiles[0].active)return json({error:"دسترسی مدیر لازم است."},403);
    const b=await req.json();if(!b.email||!b.initial_password||String(b.initial_password).length<8)return json({error:"ایمیل و رمز اولیه حداقل ۸ کاراکتری الزامی است."},400);
    const created=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({email:String(b.email).trim(),password:b.initial_password,email_confirm:true,user_metadata:{full_name:b.full_name||""}})});
    const account=await created.json();if(!created.ok)return json({error:account.msg||account.message||"ساخت حساب انجام نشد."},created.status);
    await fetch(`${url}/rest/v1/profiles?id=eq.${account.id}`,{method:"PATCH",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({full_name:b.full_name||"",display_name:b.full_name||"",gender:b.gender||null,salutation:b.salutation||null,cc_emails:Array.isArray(b.cc_emails)?b.cc_emails:[],active:b.active!==false,must_change_password:true})});
    return json({ok:true,id:account.id});
  }catch(e){return json({error:e instanceof Error?e.message:"خطای ناشناخته"},500)}
});

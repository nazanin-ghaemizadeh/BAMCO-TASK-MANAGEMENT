const APP_ORIGINS=new Set([
  'https://nazanin-ghaemizadeh.github.io',
  'https://zhhongjhhbvpmoquvkhl.supabase.co'
]);
const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(req:Request){
  const origin=req.headers.get('origin')||'';
  const local=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin':APP_ORIGINS.has(origin)||local?origin:'https://nazanin-ghaemizadeh.github.io',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Vary':'Origin'
  };
}
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
const serviceHeaders=()=>({apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'});

function decodeJwt(token:string){
  const part=token.split('.')[1]||'';
  const padded=(part.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((part.length+3)%4));
  try{return JSON.parse(atob(padded))}catch{return {}}
}
async function parse(res:Response){
  const text=await res.text();let data:any=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw Object.assign(new Error(data?.message||data?.error||data?.msg||(`HTTP ${res.status}`)),{status:res.status});
  return data;
}
async function serviceRpc(name:string,body:Record<string,unknown>){
  return parse(await fetch(`${URL}/rest/v1/rpc/${name}`,{
    method:'POST',headers:serviceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  }));
}
async function authenticate(req:Request){
  const authorization=req.headers.get('authorization')||'';
  const token=authorization.replace(/^Bearer\s+/i,'');
  if(!token)fail('ورود معتبر نیست.',401);
  const userRes=await fetch(`${URL}/auth/v1/user`,{
    headers:{apikey:ANON,Authorization:authorization},signal:AbortSignal.timeout(15000)
  });
  if(!userRes.ok)fail('نشست کاربری معتبر نیست؛ دوباره وارد شوید.',401);
  const user=await userRes.json();
  const claims=decodeJwt(token),sessionId=String(claims.session_id||'');
  if(!UUID.test(sessionId))fail('شناسه نشست معتبر نیست.',401);
  const active=await serviceRpc('bamco_session_auth_exists',{p_session_id:sessionId,p_user_id:user.id});
  if(active!==true)fail('این نشست پایان یافته یا حساب غیرفعال است؛ دوباره وارد شوید.',401);
  const status=await serviceRpc('bamco_account_security_status',{p_user_id:user.id});
  if(status?.error||!status?.profile?.active)fail('حساب کاربری فعال نیست.',403);
  return {authorization,user,claims,sessionId,status};
}
function classes(password:string){
  return [/[a-z]/.test(password),/[A-Z]/.test(password),/\d/.test(password),/[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
}
function localPasswordChecks(password:string,user:any){
  if(password.length<14)fail('رمز عبور باید حداقل ۱۴ کاراکتر باشد.');
  if(password.length>128)fail('رمز عبور بیش از حد طولانی است.');
  if(classes(password)<3)fail('رمز عبور باید دست‌کم سه گروه از حروف کوچک، حروف بزرگ، عدد و نماد را داشته باشد.');
  const lower=password.toLowerCase();
  if(/^(.)\1+$/.test(password)||/(123456|password|qwerty|admin|letmein|welcome|bamco)/i.test(password))fail('این رمز عبور قابل حدس است؛ رمز متفاوت‌تری انتخاب کنید.');
  const login=String(user?.email||'').split('@')[0].toLowerCase();
  if(login.length>=4&&lower.includes(login))fail('رمز عبور نباید شامل نام کاربری باشد.');
}
async function sha1Hex(value:string){
  const bytes=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
}
async function rejectLeaked(password:string){
  const hash=await sha1Hex(password),prefix=hash.slice(0,5),suffix=hash.slice(5);
  let res:Response;
  try{
    res=await fetch(`https://api.pwnedpasswords.com/range/${prefix}`,{
      headers:{'Add-Padding':'true','User-Agent':'BAMCO-Account-Security/1.0'},
      signal:AbortSignal.timeout(12000)
    });
  }catch{fail('سرویس کنترل رمزهای افشاشده در دسترس نیست؛ کمی بعد دوباره تلاش کنید.',503)}
  if(!res.ok)fail('کنترل امنیت رمز عبور انجام نشد؛ کمی بعد دوباره تلاش کنید.',503);
  const text=await res.text();
  const compromised=text.split(/\r?\n/).some(line=>line.slice(0,35).toUpperCase()===suffix);
  if(compromised)fail('این رمز عبور در نشت‌های عمومی دیده شده است؛ رمز دیگری انتخاب کنید.');
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return json(req,{error:'روش درخواست مجاز نیست.'},405);
  try{
    const ctx=await authenticate(req);
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||'status');
    if(action==='status'){
      const factors=Array.isArray(ctx.status.factors)?ctx.status.factors:[];
      const verified=factors.filter((f:any)=>f.status==='verified');
      return json(req,{
        ok:true,
        role:ctx.status.profile.role,
        must_change_password:!!ctx.status.profile.must_change_password,
        aal:String(ctx.claims.aal||'aal1'),
        factors,
        verified_factors:verified,
        mfa_required:true
      });
    }
    if(action==='change_password'){
      const password=String(body.password||'');
      localPasswordChecks(password,ctx.user);
      await rejectLeaked(password);
      const changed=await fetch(`${URL}/auth/v1/user`,{
        method:'PUT',
        headers:{apikey:ANON,Authorization:ctx.authorization,'Content-Type':'application/json'},
        body:JSON.stringify({password}),
        signal:AbortSignal.timeout(20000)
      });
      const changedData=await changed.json().catch(()=>({}));
      if(!changed.ok)fail(changedData?.msg||changedData?.message||changedData?.error_description||'تغییر رمز عبور انجام نشد.',changed.status);
      const revoked=await serviceRpc('bamco_revoke_other_auth_sessions',{p_user_id:ctx.user.id,p_keep_session_id:ctx.sessionId});
      const profileRes=await fetch(`${URL}/rest/v1/profiles?id=eq.${encodeURIComponent(ctx.user.id)}`,{
        method:'PATCH',
        headers:{...serviceHeaders(),Prefer:'return=minimal'},
        body:JSON.stringify({must_change_password:false,updated_at:new Date().toISOString()}),
        signal:AbortSignal.timeout(15000)
      });
      if(!profileRes.ok)fail('رمز تغییر کرد، اما وضعیت اجبار تغییر رمز ثبت نشد؛ دوباره وارد شوید.',500);
      return json(req,{ok:true,revoked_other_sessions:Number(revoked||0)});
    }
    return json(req,{error:'عملیات معتبر نیست.'},400);
  }catch(error:any){
    return json(req,{error:error?.message||'خطای امنیت حساب کاربری.'},Number(error?.status)||500);
  }
});

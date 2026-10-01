import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2.57.4';

const cors={
  // Preserve the verified production origin allowlist when deploying this fix.
  'Access-Control-Allow-Origin':'https://nazanin-ghaemizadeh.github.io',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Content-Type':'application/json',
  'Cache-Control':'no-store'
};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const clamp=(value:unknown,max=500)=>String(value??'').slice(0,max);
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))?String(value):null;
const getIp=(req:Request)=>{
  const raw=(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')||'').split(',')[0]?.trim()||'';
  if(!raw)return null;
  if(/^(\d{1,3}\.){3}\d{1,3}$/.test(raw))return raw;
  if(/^[0-9a-f:]+$/i.test(raw)&&raw.includes(':'))return raw;
  return null;
};

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authorization=req.headers.get('Authorization')||'';
    if(!authorization)return respond({error:'نشست کاربری معتبر نیست.'},401);
    const authClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await authClient.auth.getUser();
    if(userError||!user)return respond({error:'نشست کاربری معتبر نیست.'},401);
    const payload=JSON.parse(atob(authorization.replace(/^Bearer\s+/i,'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    const authSessionId=String(payload.session_id||'');
    if(!/^[0-9a-f-]{36}$/i.test(authSessionId))return respond({error:'شناسه ورود معتبر نیست.'},401);

    const admin=createClient(url,service,{auth:{persistSession:false}});
    const [{data:timeoutSetting},{data:retentionSetting},{data:presenceSetting},{data:authActive,error:authError}]=await Promise.all([
      admin.from('app_settings').select('value').eq('key','session.timeout_minutes').maybeSingle(),
      admin.from('app_settings').select('value').eq('key','session.retention_days').maybeSingle(),
      admin.from('app_settings').select('value').eq('key','session.presence_grace_seconds').maybeSingle(),
      admin.rpc('bamco_session_auth_exists',{p_session_id:authSessionId,p_user_id:user.id})
    ]);
    const timeoutMinutes=Math.max(5,Number(timeoutSetting?.value??30)||30);
    const retentionDays=Math.max(1,Number(retentionSetting?.value??30)||30);
    const presenceGraceSeconds=Math.max(60,Number(presenceSetting?.value??180)||180);
    const body=await req.json().catch(()=>({})) as Record<string,unknown>;
    const action=String(body.action||'heartbeat');
    let sessionId=body.session_id?String(body.session_id):null;
    const deviceId=uuid(body.device_id);
    const now=new Date(),nowIso=now.toISOString();
    const userAgent=clamp(req.headers.get('user-agent'),1000),ip=getIp(req);
    if(!['start','end','heartbeat','status'].includes(action))return respond({error:'عملیات نشست معتبر نیست.'},400);

    if(authError)throw authError;

    if(action==='start'){
      if(!authActive)return respond({error:'این ورود پایان یافته است. دوباره وارد شوید.',ended:true},401);
      const cutoff=new Date(now.getTime()-retentionDays*86400000).toISOString();
      const housekeeping=[admin.from('user_sessions').delete().lt('login_at',cutoff)];

      if(deviceId){
        const replaced=admin.from('user_sessions').update({logout_at:nowIso,ended_reason:'replaced',last_seen_at:nowIso})
          .eq('user_id',user.id).eq('device_id',deviceId).neq('auth_session_id',authSessionId)
          .is('logout_at',null).is('revoked_at',null);
        let legacy=admin.from('user_sessions').update({logout_at:nowIso,ended_reason:'replaced',last_seen_at:nowIso,device_id:deviceId})
          .eq('user_id',user.id).is('device_id',null).neq('auth_session_id',authSessionId)
          .eq('user_agent',userAgent).is('logout_at',null).is('revoked_at',null);
        if(ip)legacy=legacy.eq('ip_address',ip);
        housekeeping.push(replaced,legacy);
      }

      const maintenance=await Promise.all(housekeeping);
      for(const result of maintenance)if(result.error)throw result.error;
      let {data,error}=await admin.from('user_sessions').insert({
        user_id:user.id,auth_session_id:authSessionId,device_id:deviceId,last_activity_at:nowIso,last_seen_at:nowIso,ip_address:ip,
        user_agent:userAgent,app_version:clamp(body.app_version||'web',120)
      }).select('id,login_at,last_activity_at,last_seen_at,logout_at,revoked_at,ended_reason,device_id').single();
      if(error?.code==='23505')({data,error}=await admin.from('user_sessions').select('id,login_at,last_activity_at,last_seen_at,logout_at,revoked_at,ended_reason,device_id').eq('auth_session_id',authSessionId).eq('user_id',user.id).single());
      if(error)return respond({error:error.message},400);
      if(data?.logout_at&&data.ended_reason==='closed'&&!data.revoked_at){
        const resumed=await admin.from('user_sessions').update({logout_at:null,ended_reason:null,last_seen_at:nowIso,device_id:deviceId||data.device_id})
          .eq('id',data.id).eq('user_id',user.id).eq('auth_session_id',authSessionId).eq('ended_reason','closed').is('revoked_at',null)
          .select('id,login_at,last_activity_at,last_seen_at,logout_at,revoked_at,ended_reason,device_id').single();
        if(resumed.error)throw resumed.error;data=resumed.data;
      }
      if(data?.logout_at||data?.revoked_at)return respond({error:'این نشست پایان یافته است. دوباره وارد شوید.',ended:true},409);
      if(deviceId&&!data?.device_id){await admin.from('user_sessions').update({device_id:deviceId}).eq('id',data.id).eq('user_id',user.id)}
      return respond({ok:true,session:data,timeout_minutes:timeoutMinutes,presence_grace_seconds:presenceGraceSeconds,retention_days:retentionDays});
    }

    if(!sessionId&&action==='end'){
      const {data,error}=await admin.from('user_sessions').select('id').eq('auth_session_id',authSessionId).eq('user_id',user.id).maybeSingle();
      if(error)throw error;sessionId=data?.id;
      if(!sessionId)return respond({ok:true,ended:true,ended_reason:'logout'});
    }
    if(!sessionId)return respond({error:'شناسه نشست الزامی است.'},400);

    const {data:session,error:sessionError}=await admin.from('user_sessions')
      .select('id,user_id,auth_session_id,device_id,last_activity_at,last_seen_at,logout_at,revoked_at,ended_reason')
      .eq('id',sessionId).eq('user_id',user.id).maybeSingle();
    if(sessionError)return respond({error:sessionError.message},400);
    if(!session)return respond({error:'نشست ثبت‌شده پیدا نشد.',expired:true,ended:true},404);
    if(session.auth_session_id&&session.auth_session_id!==authSessionId)return respond({error:'شناسه نشست با این ورود مطابقت ندارد.'},403);

    if(authActive&&session.logout_at&&session.ended_reason==='closed'&&!session.revoked_at&&['heartbeat','status'].includes(action)){
      const patch:Record<string,unknown>={logout_at:null,ended_reason:null,last_seen_at:nowIso};if(deviceId)patch.device_id=deviceId;
      if(action==='heartbeat')patch.last_activity_at=nowIso;
      const resumed=await admin.from('user_sessions').update(patch).eq('id',sessionId).eq('user_id',user.id).eq('auth_session_id',authSessionId).eq('ended_reason','closed').is('revoked_at',null).select('id').single();
      if(resumed.error)throw resumed.error;
      return respond({ok:true,ended:false,revoked:false,expired:false,last_activity_at:action==='heartbeat'?nowIso:session.last_activity_at,last_seen_at:nowIso,timeout_minutes:timeoutMinutes,presence_grace_seconds:presenceGraceSeconds});
    }
    if(session.revoked_at||session.logout_at)return respond({ok:true,revoked:!!session.revoked_at,expired:session.ended_reason==='inactivity',ended:true,ended_reason:session.ended_reason,timeout_minutes:timeoutMinutes,presence_grace_seconds:presenceGraceSeconds});

    if(!session.auth_session_id&&authActive&&action!=='end'){
      const patch:Record<string,unknown>={auth_session_id:authSessionId,last_seen_at:nowIso};if(deviceId)patch.device_id=deviceId;
      const {data:linked,error}=await admin.from('user_sessions').update(patch)
        .eq('id',sessionId).eq('user_id',user.id).is('auth_session_id',null)
        .is('logout_at',null).is('revoked_at',null).select('id,auth_session_id').maybeSingle();
      if(error||!linked)return respond({error:error?.message||'وضعیت نشست تغییر کرده است؛ دوباره بررسی کنید.'},409);
    }

    if(action==='end'||!authActive){
      const reason=authActive&&['logout','inactivity','closed','replaced'].includes(String(body.reason))?String(body.reason):'logout';
      const {data,error}=await admin.from('user_sessions').update({logout_at:nowIso,last_seen_at:nowIso,ended_reason:reason}).eq('id',sessionId).eq('user_id',user.id).select('id,logout_at').single();
      if(error||!data?.logout_at)return respond({error:error?.message||'پایان نشست ذخیره نشد.'},500);
      return respond({ok:true,ended:true,ended_reason:reason});
    }

    const lastActivity=new Date(session.last_activity_at).getTime();
    if(Number.isFinite(lastActivity)&&now.getTime()-lastActivity>=timeoutMinutes*60000){
      const expiry=new Date(lastActivity+timeoutMinutes*60000).toISOString();
      const {error}=await admin.from('user_sessions').update({logout_at:expiry,last_seen_at:nowIso,ended_reason:'inactivity'}).eq('id',sessionId).eq('user_id',user.id);
      if(error)throw error;
      return respond({ok:true,expired:true,ended:true,ended_reason:'inactivity',timeout_minutes:timeoutMinutes,presence_grace_seconds:presenceGraceSeconds});
    }

    const patch:Record<string,unknown>={last_seen_at:nowIso};if(deviceId)patch.device_id=deviceId;if(action==='heartbeat')patch.last_activity_at=nowIso;
    const {error}=await admin.from('user_sessions').update(patch).eq('id',sessionId).eq('user_id',user.id).is('logout_at',null).is('revoked_at',null);
    if(error)return respond({error:error.message},400);
    return respond({ok:true,expired:false,revoked:false,ended:false,timeout_minutes:timeoutMinutes,presence_grace_seconds:presenceGraceSeconds,last_activity_at:action==='heartbeat'?nowIso:session.last_activity_at,last_seen_at:nowIso});
  }catch(error){
    console.error('session-audit',error);
    return respond({error:error instanceof Error?error.message:'خطای ناشناخته نشست.'},500);
  }
});

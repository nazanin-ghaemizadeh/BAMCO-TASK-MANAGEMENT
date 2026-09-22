const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"GET,POST,DELETE,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const normalizeEmail=(value:unknown)=>String(value||"").trim().toLowerCase();
const temporaryPassword=()=>'A9!'+Array.from(crypto.getRandomValues(new Uint8Array(17)),n=>'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[n%64]).join('');
const loginPattern=/^[a-z0-9][a-z0-9._-]{2,63}$/;
const internalEmail=(login:string)=>`${login}@no-email.invalid`;
const generatedLogin=()=>`person-${crypto.randomUUID()}`;
// Existing accounts created before the split can still have a normal email in
// Auth.  We only use that representation to display/repair the account; every
// new or changed credential is stored as <login_name>@no-email.invalid.
const loginLabel=(email:string)=>email.endsWith('@no-email.invalid')?email.slice(0,-'@no-email.invalid'.length):email;
const requestedLogin=(value:unknown)=>normalizeEmail(value);
const validLogin=(value:string)=>loginPattern.test(value);
const safeChannel=(value:unknown,hasEmail:boolean)=>hasEmail&&["portal","email","both"].includes(String(value))?String(value):"portal";

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,authorization=req.headers.get("Authorization")||"";
    const userRes=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:authorization}});if(!userRes.ok)return json({error:"ورود معتبر نیست."},401);
    const user=await userRes.json();
    const managerRes=await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=role,active`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),managerRows=await managerRes.json();
    const actorProfile=managerRows?.[0],systemManager=!!actorProfile?.active&&actorProfile.role==='manager';
    const b=req.method==='GET'?{}:await req.json();
    const callerHeaders={apikey:anon,Authorization:authorization,"Content-Type":"application/json"};
    const callerRpc=async(name:string,body:Record<string,unknown>={})=>{
      const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:callerHeaders,body:JSON.stringify(body)});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw Object.assign(new Error(result?.message||result?.error||'اعتبارسنجی دسترسی انجام نشد.'),{status:response.status});
      return result;
    };
    const canUsePeople=async(action:string)=>{
      if(!actorProfile?.active)return false;
      try{return await callerRpc('can_access_feature',{p_feature_key:'people',p_action:action})===true}catch{return false}
    };
    const isStrictSubordinate=async(targetId:string)=>{
      if(!targetId||targetId===user.id||!await canUsePeople('edit'))return false;
      try{return await callerRpc('bamco_can_direct_manage_organization_user',{p_target_user:targetId})===true}catch{return false}
    };
    const callerDescendants=async()=>{
      const rows=await callerRpc('bamco_strict_descendant_user_ids',{});
      return new Set((Array.isArray(rows)?rows:[]).map(row=>String(row?.user_id||'')).filter(Boolean));
    };
    const systemOnly=()=>systemManager?null:json({error:'این عملیات فقط برای مدیر سامانه مجاز است.'},403);
    if(req.method==='POST'&&b.action==='save_own_login'){
      if(!managerRows?.[0]?.active)return json({error:'حساب فعال نیست.'},403);
      const ownRes=await fetch(`${url}/rest/v1/profiles?id=eq.${user.id}&select=must_change_password`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),own=await ownRes.json();
      if(!ownRes.ok||!own?.[0]||own[0].must_change_password)return json({error:'ابتدا رمز عبور موقت خود را تغییر دهید.'},403);
      const login=requestedLogin(b.login_name),current=loginLabel(normalizeEmail(user.email));
      if(!validLogin(login))return json({error:'نام کاربری باید ۳ تا ۶۴ کاراکتر و شامل حروف انگلیسی، عدد، نقطه یا خط تیره باشد.'},400);
      // A legacy corporate Auth email is not a valid login identity.  Even if
      // it happens to match a submitted string, do not report a no-op: force
      // the account through the canonical internal login representation.
      if(login===current&&normalizeEmail(user.email)===internalEmail(login))return json({ok:true,id:user.id,login_name:current});
      const changed=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:'PUT',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({email:internalEmail(login),email_confirm:true})}),result=await changed.json().catch(()=>({}));
      if(!changed.ok)return json({error:['email_exists','user_already_exists'].includes(result.code||result.error_code)?'این نام کاربری قبلاً استفاده شده است.':result.msg||result.message||'نام کاربری ذخیره نشد.'},changed.status);
      return json({ok:true,id:user.id,login_name:login});
    }
    if(req.method==='GET'){
      if(!await canUsePeople('view'))return json({error:'دسترسی مشاهده افراد و نقش‌ها لازم است.'},403);
      const ids=systemManager?null:new Set([user.id,...await callerDescendants()]);
      const params=new URLSearchParams({select:'id,email,login_name,must_change_password,password_changed_at,full_name,display_name,role,gender,salutation,active,default_message_channel,messaging_enabled,avatar_path,updated_at',order:'full_name.asc'});
      if(ids)params.set('id',`in.(${[...ids].join(',')})`);
      const listed=await fetch(`${url}/rest/v1/profiles?${params.toString()}`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),profiles=await listed.json().catch(()=>null);
      if(!listed.ok||!Array.isArray(profiles))return json({error:profiles?.message||profiles?.error||'فهرست افراد دریافت نشد.'},listed.status||500);
      return json({ok:true,profiles});
    }
    // Use the caller JWT first so current RLS remains authoritative.  The
    // compatibility fallback is deliberately limited to an already-authorized
    // subordinate edit: legacy profile policies still allow only self/system
    // manager updates, so the service token may carry a narrow safe-field patch
    // only after the caller JWT has proven people:edit plus tree scope.
    const saveProfile=async(id:string,profile:Record<string,unknown>,failure:string,{allowScopedFallback=false}:{allowScopedFallback?:boolean}={})=>{
      const write=async(headers:HeadersInit)=>{
        const saved=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{...headers,"Prefer":"return=representation"},body:JSON.stringify(profile)});
        return {saved,rows:await saved.json().catch(()=>null)};
      };
      let result=await write(callerHeaders),usedScopedFallback=false;
      const confirmed=()=>result.saved.ok&&Array.isArray(result.rows)&&result.rows.length===1&&result.rows[0].id===id;
      if(!confirmed()&&allowScopedFallback&&result.saved.status!==409&&result.saved.status!==422){
        result=await write({apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"});
        usedScopedFallback=true;
      }
      if(!result.saved.ok)return json({error:result.rows?.message||result.rows?.error||failure},result.saved.status);
      if(!Array.isArray(result.rows)||result.rows.length!==1||result.rows[0].id!==id)return json({error:"ذخیره اطلاعات تأیید نشد؛ فرد را دوباره انتخاب کنید."},409);
      // `usedScopedFallback` is intentionally observable in the response only
      // as audit metadata on the server; it never widens fields or scope.
      if(usedScopedFallback){
        await fetch(`${url}/rest/v1/audit_trail`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({actor_id:user.id,action:'profile_subordinate_update',target_type:'profile',target_id:id,new_data:profile,metadata:{authorization:'people:edit + organization descendant',write_path:'service-scoped-fallback'}})}).catch(()=>{});
      }
      return json({ok:true,id,profile:result.rows[0]});
    };
    if(req.method==="DELETE"){
      const forbidden=systemOnly();if(forbidden)return forbidden;
      if(!b.user_id)return json({error:"شناسه فرد ارسال نشده است."},400);
      if(b.user_id===user.id)return json({error:"مدیر نمی‌تواند حساب در حال استفاده خود را حذف کند."},400);
      const deleted=await fetch(`${url}/rest/v1/rpc/delete_person_account`,{method:"POST",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({p_user_id:b.user_id,p_actor_id:user.id})}),result=await deleted.json().catch(()=>({}));
      if(!deleted.ok||result?.ok!==true)return json({error:result.message||result.error||"حذف حساب انجام نشد."},deleted.ok?409:deleted.status);
      let cleanup_warning="";
      if(result.avatar_paths?.length){
        try{const cleanup=await fetch(`${url}/storage/v1/object/avatars`,{method:"DELETE",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({prefixes:result.avatar_paths})});if(!cleanup.ok)cleanup_warning="حساب حذف شد؛ پاک‌سازی فایل عکس نیاز به تلاش مجدد دارد."}
        catch{cleanup_warning="حساب حذف شد؛ پاک‌سازی فایل عکس نیاز به تلاش مجدد دارد."}
      }
      return json({ok:true,tasks_retained:result.tasks_retained||0,active_tasks:result.active_tasks||[],already_deleted:!!result.already_deleted,...(cleanup_warning?{cleanup_warning}:{})});
    }
    if(req.method!=="POST")return json({error:"روش درخواست مجاز نیست."},405);
    if(b.action==='get_credentials'||b.action==='save_credentials'){
      const forbidden=systemOnly();if(forbidden)return forbidden;
      if(!b.user_id)return json({error:'فرد را انتخاب کنید.'},400);
      const id=encodeURIComponent(b.user_id),headers={apikey:service,Authorization:`Bearer ${service}`};
      const profileRes=await fetch(`${url}/rest/v1/profiles?id=eq.${id}&select=email,login_name,must_change_password`,{headers}),profiles=await profileRes.json(),profile=profiles?.[0];
      if(!profileRes.ok||!profile)return json({error:'فرد پیدا نشد.'},404);
      const accountRes=await fetch(`${url}/auth/v1/admin/users/${id}`,{headers}),account=await accountRes.json();
      if(!accountRes.ok||!account.id)return json({error:'اطلاعات ورود دریافت نشد.'},accountRes.ok?409:accountRes.status);
      const current=String(profile.login_name||'').trim().toLowerCase()||loginLabel(normalizeEmail(account.email));
      if(b.action==='get_credentials')return json({ok:true,id:account.id,login_name:current,credential_editable:true});
      const login=requestedLogin(b.login_name),password=String(b.temporary_password||'');
      if(!login||!validLogin(login))return json({error:'نام کاربری باید ۳ تا ۶۴ کاراکتر و شامل حروف انگلیسی، عدد، نقطه یا خط تیره باشد.'},400);
      if(password&&(password.length<12||/^(.)\1+$/.test(password)||/^(123456|password|qwerty)/i.test(password)))return json({error:'رمز موقت باید حداقل ۱۲ کاراکتر و غیرقابل حدس باشد.'},400);
      const changes:Record<string,unknown>={};
      // Compare the actual Auth identity as well.  This repairs a legacy
      // corporate-email Auth record even when its mirrored login_name already
      // has the requested value.
      if(normalizeEmail(account.email)!==internalEmail(login)){changes.email=internalEmail(login);changes.email_confirm=true}
      if(password)changes.password=password;
      const gate=password&&!profile.must_change_password;
      if(gate){const saved=await saveProfile(account.id,{must_change_password:true},'تنظیم رمز موقت انجام نشد.');if(!saved.ok)return saved}
      if(Object.keys(changes).length){
        const changed=await fetch(`${url}/auth/v1/admin/users/${id}`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(changes)}),result=await changed.json().catch(()=>({}));
        if(!changed.ok){if(gate)await saveProfile(account.id,{must_change_password:false},'بازگردانی تنظیم رمز انجام نشد.');return json({error:['email_exists','user_already_exists'].includes(result.code||result.error_code)?'این نام کاربری قبلاً استفاده شده است.':result.msg||result.message||'اطلاعات ورود ذخیره نشد.'},changed.status)}
      }
      return json({ok:true,id:account.id,login_name:login,credential_editable:true});
    }
    const targetId=typeof b.user_id==='string'?b.user_id:'';
    if(!targetId){const forbidden=systemOnly();if(forbidden)return forbidden}
    if(targetId&&!systemManager){
      const sensitive=['role','system_access','active','login_name','temporary_password','must_change_password','password','cc_emails'];
      if(sensitive.some(field=>Object.prototype.hasOwnProperty.call(b,field)))return json({error:'تغییر سطح دسترسی، فعال‌بودن یا اطلاعات ورود فقط برای مدیر سامانه مجاز است.'},403);
      if(!await isStrictSubordinate(targetId))return json({error:'ویرایش فقط برای افراد پایین‌دست در ساختار سازمانی مجاز است.'},403);
    }
    if(!String(b.full_name||"").trim())return json({error:"نام فرد الزامی است."},400);
    const publicEmail=normalizeEmail(b.email)||null,hasEmail=!!publicEmail,channel=safeChannel(b.default_message_channel,hasEmail);
    const profileBody:Record<string,unknown>={email:publicEmail,full_name:String(b.full_name).trim(),display_name:String(b.full_name).trim(),gender:b.gender||null,salutation:b.salutation||null,messaging_enabled:true,default_message_channel:channel};
    if(systemManager){profileBody.role=b.role==="manager"?"manager":"owner";profileBody.active=b.active!==false;if(Array.isArray(b.cc_emails))profileBody.cc_emails=b.cc_emails}
    if(b.user_id){
      const oldRes=await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(b.user_id)}&select=email,must_change_password`,{headers:{apikey:service,Authorization:`Bearer ${service}`}}),oldRows=await oldRes.json(),old=oldRows?.[0];if(!old)return json({error:"فرد پیدا نشد."},404);
      // Corporate delivery email is independent of the existing Auth login.
      const authBody:Record<string,unknown>={user_metadata:{full_name:profileBody.full_name}};
      const authUpdate=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(b.user_id)}`,{method:"PUT",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify(authBody)}),authResult=await authUpdate.json().catch(()=>({}));if(!authUpdate.ok)return json({error:authResult.msg||authResult.message||"ویرایش حساب انجام نشد."},authUpdate.status);
      return await saveProfile(b.user_id,profileBody,"ویرایش اطلاعات فرد انجام نشد.",{allowScopedFallback:!systemManager});
    }
    // Corporate email is deliberately not an Auth credential.  When a caller
    // does not provide a login name (older clients), generate one first; Auth
    // and the auth->profile trigger will then derive the same canonical value.
    const login=requestedLogin(b.login_name)||generatedLogin();
    if(!validLogin(login))return json({error:'نام کاربری باید ۳ تا ۶۴ کاراکتر و شامل حروف انگلیسی، عدد، نقطه یا خط تیره باشد.'},400);
    const authEmail=internalEmail(login),initialPassword=temporaryPassword(),created=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify({email:authEmail,password:initialPassword,email_confirm:true,user_metadata:{full_name:profileBody.full_name}})}),account=await created.json();if(!created.ok)return json({error:account.msg||account.message||"ساخت حساب انجام نشد."},created.status);
    const saved=await saveProfile(account.id,{...profileBody,must_change_password:true},"حساب ساخته شد اما اطلاعات فرد کامل ذخیره نشد.");
    if(!saved.ok)return saved;
    return json({...await saved.json(),temporary_password:initialPassword,login_name:login,credential_editable:true});
  }catch(e){return json({error:e instanceof Error?e.message:"خطای ناشناخته"},500)}
});

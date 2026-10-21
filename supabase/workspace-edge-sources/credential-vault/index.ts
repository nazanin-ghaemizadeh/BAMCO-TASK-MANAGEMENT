const APP_ORIGIN="https://nazanin-ghaemizadeh.github.io";
const enc=new TextEncoder(),dec=new TextDecoder();
function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  const allowed=origin===APP_ORIGIN||/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {"Access-Control-Allow-Origin":allowed?origin:APP_ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
}
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json","Cache-Control":"no-store"}});
const clean=(v:unknown,max=4000)=>String(v??"").trim().slice(0,max);
const b64=(bytes:Uint8Array)=>{let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(s)};
const unb64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const svcHeaders=(service:string)=>({apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"});
async function parse(res:Response){const text=await res.text();let data:any=null;try{data=text?JSON.parse(text):null}catch{data=text}if(!res.ok)throw new Error(data?.message||data?.error||data?.msg||`HTTP ${res.status}`);return data}
async function authenticate(req:Request,url:string,anon:string,service:string){
  const authorization=req.headers.get("Authorization")||"";
  if(!authorization)throw Object.assign(new Error("ورود معتبر نیست."),{status:401});
  const userRes=await fetch(`${url}/auth/v1/user`,{headers:{apikey:anon,Authorization:authorization}});
  if(!userRes.ok)throw Object.assign(new Error("نشست کاربری معتبر نیست؛ دوباره وارد سامانه شوید."),{status:401});
  const user=await userRes.json();
  const rows=await parse(await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active,full_name,email`,{headers:{apikey:anon,Authorization:authorization}}));
  const profile=rows?.[0];
  if(!profile?.active)throw Object.assign(new Error("حساب کاربری فعال نیست."),{status:403});
  return {user,profile,authorization};
}
async function cryptoKey(url:string,service:string){
  const raw=await parse(await fetch(`${url}/rest/v1/rpc/credential_server_key`,{method:"POST",headers:svcHeaders(service),body:"{}"}));
  if(typeof raw!=="string")throw new Error("کلید رمزنگاری سرور در دسترس نیست.");
  return crypto.subtle.importKey("raw",unb64(raw),{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function seal(key:CryptoKey,value:string,aad:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:enc.encode(aad)},key,enc.encode(value)));return {ciphertext:b64(cipher),iv:b64(iv)}}
async function open(key:CryptoKey,ciphertext:string,iv:string,aad:string){const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv),additionalData:enc.encode(aad)},key,unb64(ciphertext));return dec.decode(plain)}
async function audit(url:string,service:string,userId:string,action:string,targetId:string|null,metadata:Record<string,unknown>={}){await parse(await fetch(`${url}/rest/v1/security_audit_log`,{method:"POST",headers:{...svcHeaders(service),Prefer:"return=minimal"},body:JSON.stringify({user_id:userId,action,target_type:"site_credential",target_id:targetId,metadata})}))}
async function siteById(url:string,service:string,id:number){const rows=await parse(await fetch(`${url}/rest/v1/site_definitions?id=eq.${id}&select=*`,{headers:svcHeaders(service)}));return rows?.[0]||null}
async function canUseSite(url:string,service:string,site:any,userId:string,isManager:boolean){if(!site)return false;if(site.kind==="personal")return String(site.owner_user_id)===String(userId);if(site.kind!=="organization")return false;if(isManager)return true;if(!site.active)return false;if(site.scope==="all")return true;if(site.scope!=="selected")return false;const rows=await parse(await fetch(`${url}/rest/v1/site_assignments?site_id=eq.${site.id}&user_id=eq.${encodeURIComponent(userId)}&select=site_id&limit=1`,{headers:svcHeaders(service)}));return !!rows?.length}
async function ownCredential(url:string,service:string,userId:string,siteId:number){const rows=await parse(await fetch(`${url}/rest/v1/user_site_credentials?user_id=eq.${encodeURIComponent(userId)}&site_id=eq.${siteId}&select=*`,{headers:svcHeaders(service)}));return rows?.[0]||null}
async function allOwn(url:string,service:string,userId:string){return await parse(await fetch(`${url}/rest/v1/user_site_credentials?user_id=eq.${encodeURIComponent(userId)}&select=*&order=site_id.asc`,{headers:svcHeaders(service)}))}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"روش درخواست مجاز نیست."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const {user,profile}=await authenticate(req,url,anon,service);
    const body=await req.json().catch(()=>({}));
    const action=clean(body.action,64),isManager=profile.role==="manager";
    if(action==="list"){
      const key=await cryptoKey(url,service),rows=await allOwn(url,service,user.id),items=[];
      for(const row of rows){let username="";try{username=await open(key,row.username_ciphertext,row.username_iv,`${row.user_id}:${row.site_id}:username`)}catch{username=""}items.push({site_id:row.site_id,username,has_password:!!row.password_ciphertext,notes:row.notes||"",updated_at:row.updated_at})}
      return json(req,{items});
    }
    if(action==="save"){
      const siteId=Number(body.site_id);if(!Number.isInteger(siteId)||siteId<=0)return json(req,{error:"سایت معتبر نیست."},400);
      const site=await siteById(url,service,siteId);if(!await canUseSite(url,service,site,user.id,isManager))return json(req,{error:"دسترسی به این سایت ندارید."},403);
      const username=String(body.username??"").slice(0,500),notes=String(body.notes??"").slice(0,2000),suppliedPassword=body.password!==undefined&&body.password!==null&&String(body.password)!=="";
      const existing=await ownCredential(url,service,user.id,siteId);if(!existing&&!suppliedPassword)return json(req,{error:"رمز عبور برای ثبت اولیه الزامی است."},400);
      const key=await cryptoKey(url,service),u=await seal(key,username,`${user.id}:${siteId}:username`);let p={ciphertext:existing?.password_ciphertext||"",iv:existing?.password_iv||""};
      if(suppliedPassword)p=await seal(key,String(body.password).slice(0,4000),`${user.id}:${siteId}:password`);
      const record={user_id:user.id,site_id:siteId,username_ciphertext:u.ciphertext,username_iv:u.iv,password_ciphertext:p.ciphertext,password_iv:p.iv,key_version:1,notes};
      const saved=await parse(await fetch(`${url}/rest/v1/user_site_credentials?on_conflict=user_id,site_id`,{method:"POST",headers:{...svcHeaders(service),Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(record)}));
      await audit(url,service,user.id,existing?"credential_update":"credential_create",String(siteId),{site_kind:site.kind});return json(req,{ok:true,site_id:siteId,updated_at:saved?.[0]?.updated_at||null});
    }
    if(action==="reveal"){
      const siteId=Number(body.site_id),site=await siteById(url,service,siteId);if(!await canUseSite(url,service,site,user.id,isManager))return json(req,{error:"دسترسی به این سایت ندارید."},403);
      const row=await ownCredential(url,service,user.id,siteId);if(!row)return json(req,{error:"اطلاعات ورود ثبت نشده است."},404);
      const key=await cryptoKey(url,service),username=await open(key,row.username_ciphertext,row.username_iv,`${user.id}:${siteId}:username`),password=await open(key,row.password_ciphertext,row.password_iv,`${user.id}:${siteId}:password`);
      await audit(url,service,user.id,"credential_reveal",String(siteId),{purpose:clean(body.purpose||"reveal",40)});return json(req,{username,password});
    }
    if(action==="delete"){
      const siteId=Number(body.site_id),row=await ownCredential(url,service,user.id,siteId);if(!row)return json(req,{ok:true});
      await parse(await fetch(`${url}/rest/v1/user_site_credentials?user_id=eq.${encodeURIComponent(user.id)}&site_id=eq.${siteId}`,{method:"DELETE",headers:{...svcHeaders(service),Prefer:"return=minimal"}}));
      await audit(url,service,user.id,"credential_delete",String(siteId),{});return json(req,{ok:true});
    }
    if(action==="export_self"){
      const key=await cryptoKey(url,service),rows=await allOwn(url,service,user.id),out=[];
      for(const row of rows){const site=await siteById(url,service,Number(row.site_id));if(!await canUseSite(url,service,site,user.id,isManager))continue;out.push({title:site.title,url:site.url,username:await open(key,row.username_ciphertext,row.username_iv,`${user.id}:${row.site_id}:username`),password:await open(key,row.password_ciphertext,row.password_iv,`${user.id}:${row.site_id}:password`),notes:row.notes||""})}
      await audit(url,service,user.id,"credential_export",null,{scope:"self",row_count:out.length});return json(req,{rows:out});
    }
    if(action==="export_manager"){
      if(!isManager)return json(req,{error:"فقط مدیر مجاز به خروجی محرمانه است."},403);const key=await cryptoKey(url,service);
      const [creds,sites,profiles]=await Promise.all([parse(await fetch(`${url}/rest/v1/user_site_credentials?select=*&order=user_id.asc,site_id.asc`,{headers:svcHeaders(service)})),parse(await fetch(`${url}/rest/v1/site_definitions?select=id,title,url`,{headers:svcHeaders(service)})),parse(await fetch(`${url}/rest/v1/profiles?select=id,full_name,email,login_name`,{headers:svcHeaders(service)}))]);
      const sm=new Map(sites.map((x:any)=>[String(x.id),x])),pm=new Map(profiles.map((x:any)=>[String(x.id),x])),out=[];
      for(const row of creds){const site=sm.get(String(row.site_id))||{},person=pm.get(String(row.user_id))||{};out.push({user_name:person.full_name||person.login_name||"",user_id:row.user_id,user_email:person.email||"",title:site.title||"",url:site.url||"",username:await open(key,row.username_ciphertext,row.username_iv,`${row.user_id}:${row.site_id}:username`),password:await open(key,row.password_ciphertext,row.password_iv,`${row.user_id}:${row.site_id}:password`),notes:row.notes||"",updated_at:row.updated_at})}
      await audit(url,service,user.id,"credential_export",null,{scope:"manager_all",row_count:out.length});return json(req,{rows:out});
    }
    return json(req,{error:"عملیات معتبر نیست."},400);
  }catch(e){const status=Number((e as any)?.status)||500;return json(req,{error:e instanceof Error?e.message:"خطای ناشناخته در مدیریت دسترسی‌ها."},status)}
});

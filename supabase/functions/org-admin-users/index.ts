// Central admin gateway. Target scope is resolved from server-owned units;
// account creation stays in the existing audited Auth administration functions.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'روش درخواست معتبر نیست.'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,authorization=req.headers.get('Authorization')||'';
  const headers={apikey:key,Authorization:authorization,'Content-Type':'application/json','Accept-Profile':'public','Content-Profile':'public'};
  const rpc=async(name:string,body:unknown={})=>{const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json().catch(()=>null);if(!r.ok)throw Object.assign(new Error(data?.message||'دسترسی مدیریت لازم است.'),{status:r.status});return data};
  // This RPC authenticates the global administrator; local feature grants and
  // editable user metadata cannot authorize the gateway.
  const snapshot=await rpc('admin_org_snapshot');const input=await req.json();
  const unit=snapshot.units?.find((u:{id:number;active:boolean})=>String(u.id)===String(input.unit_id)&&u.active);
  if(!unit||!snapshot.departments?.some((d:{id:number;active:boolean})=>d.id===unit.department_id&&d.active))return json({error:'واحد فعال را انتخاب کنید.'},400);
  const target=({public:'admin-users',bamco_process:'process-admin-users',bamco_quality:'quality-admin-users'} as Record<string,string>)[unit.schema_name];
  if(!target)return json({error:'محیط معتبر نیست.'},400);
  const submitted=input.profile||{},current=snapshot.workspaces?.find((w:{schema_name:string})=>w.schema_name===unit.schema_name)?.people?.find((p:{id:string})=>p.id===submitted.user_id);
  if(submitted.user_id&&(!current||current.role==='manager'))return json({error:'حساب انتخاب‌شده قابل ویرایش از این فرم نیست.'},403);
  await rpc('admin_org_prepare_workspace',{p_schema:unit.schema_name});
  const profile:Record<string,unknown>={role:'owner',active:submitted.active!==false};
  for(const name of ['user_id','full_name','email','login_name','gender','mobile_phone','internal_extension','salutation'])if(submitted[name]!==undefined)profile[name]=submitted[name];
  const response=await fetch(`${url}/functions/v1/${target}`,{method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(profile)});
  const data=await response.json().catch(()=>({error:'پاسخ مدیریت حساب معتبر نیست.'}));if(!response.ok)return json(data,response.status);
  if(!data.id)return json({error:'ذخیره حساب تأیید نشد.'},502);
  try{await rpc('admin_org_save',{p_action:'membership',p_payload:{unit_id:unit.id,user_id:data.id}});return json({...data,organization_saved:true})}
  catch{return json({...data,organization_saved:false,warning:'حساب ذخیره شد؛ برای تکمیل عضویت واحد دوباره ذخیره کنید.'})}
 }catch(error){return json({error:error instanceof Error?error.message:'عملیات انجام نشد.'},Math.max(400,Math.min(500,Number((error as {status?:number}).status)||500)))}
});

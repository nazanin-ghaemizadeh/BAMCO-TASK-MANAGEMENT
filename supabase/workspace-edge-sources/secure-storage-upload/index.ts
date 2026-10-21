
const APP_ORIGIN='https://nazanin-ghaemizadeh.github.io';
const URL=Deno.env.get('SUPABASE_URL')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cors={
  'Access-Control-Allow-Origin':APP_ORIGIN,
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
  'Vary':'Origin'
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}
});
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};

function cleanPath(raw:string){
  const decoded=String(raw||'').split('/').filter(Boolean).map(part=>{try{return decodeURIComponent(part)}catch{return part}});
  if(!decoded.length||decoded.some(p=>p==='.'||p==='..'||p.includes('\\')||/[\0-\x1f\x7f]/.test(p)))fail('مسیر فایل معتبر نیست.');
  return decoded.join('/');
}
const encodePath=(path:string)=>path.split('/').map(encodeURIComponent).join('/');
const extOf=(path:string)=>path.split('/').pop()?.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]||'';

async function parse(res:Response){
  const text=await res.text();let data:any=null;
  try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw Object.assign(new Error(data?.message||data?.error||data?.msg||('HTTP '+res.status)),{status:res.status});
  return data;
}
const userHeaders=(authorization:string)=>({apikey:ANON,Authorization:authorization,'Content-Type':'application/json'});
const serviceHeaders=()=>({apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'});

async function userJson(path:string,authorization:string,init:RequestInit={}){
  return parse(await fetch(URL+path,{...init,headers:{...userHeaders(authorization),...(init.headers||{})},signal:AbortSignal.timeout(15000)}));
}
async function authenticate(req:Request){
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization)fail('ورود معتبر نیست.',401);
  const userRes=await fetch(URL+'/auth/v1/user',{headers:{apikey:ANON,Authorization:authorization},signal:AbortSignal.timeout(15000)});
  if(!userRes.ok)fail('نشست کاربری معتبر نیست؛ دوباره وارد شوید.',401);
  const user=await userRes.json();
  const rows=await userJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,active`,authorization);
  const profile=rows?.[0];
  if(!profile?.active)fail('حساب کاربری فعال نیست.',403);
  return {user,profile,authorization};
}
async function rpc(name:string,body:Record<string,unknown>,authorization:string){
  return userJson('/rest/v1/rpc/'+name,authorization,{method:'POST',body:JSON.stringify(body)});
}
async function rowVisible(table:string,filter:string,select:string,authorization:string){
  const rows=await userJson(`/rest/v1/${table}?${filter}&select=${encodeURIComponent(select)}&limit=1`,authorization);
  return rows?.[0]||null;
}

const TYPES:Record<string,Record<string,string>>={
  avatars:{png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'},
  'chat-attachments':{
    png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  'group-avatars':{png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'},
  'petty-cash-private':{
    pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  },
  stickers:{png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'},
  'vehicle-forms':{pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'}
};
const LIMITS:Record<string,number>={
  avatars:8*1024*1024,'chat-attachments':5*1024*1024,'group-avatars':5*1024*1024,
  'petty-cash-private':25*1024*1024,stickers:5*1024*1024,'vehicle-forms':20*1024*1024
};

async function validateFile(bucket:string,path:string,file:File){
  if(file.size<=0||file.size>LIMITS[bucket])fail('حجم فایل نامعتبر یا بیشتر از حد مجاز است.',413);
  const ext=extOf(path),expected=TYPES[bucket]?.[ext];
  if(!expected)fail('پسوند فایل مجاز نیست.');
  const declared=String(file.type||'').toLowerCase();
  if(declared&&declared!=='application/octet-stream'&&declared!==expected)fail('پسوند و نوع فایل با هم مطابقت ندارند.');
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const txt=new TextDecoder().decode(head);
  const starts=(...bytes:number[])=>bytes.every((b,i)=>head[i]===b);
  let ok=false;
  if(expected==='application/pdf')ok=txt.startsWith('%PDF-');
  else if(expected==='image/png')ok=starts(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
  else if(expected==='image/jpeg')ok=starts(0xff,0xd8,0xff);
  else if(expected==='image/webp')ok=txt.startsWith('RIFF')&&new TextDecoder().decode(head.slice(8,12))==='WEBP';
  else if(expected==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||expected==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    ok=starts(0x50,0x4b,0x03,0x04)||starts(0x50,0x4b,0x05,0x06)||starts(0x50,0x4b,0x07,0x08);
  }else if(expected==='text/plain'){
    const sample=new Uint8Array(await file.slice(0,Math.min(file.size,4096)).arrayBuffer());
    ok=!sample.includes(0);
  }
  if(!ok)fail('محتوای فایل با فرمت اعلام‌شده مطابقت ندارد.');
  return expected;
}

async function authorize(bucket:string,path:string,ctx:{user:any,profile:any,authorization:string}){
  const parts=path.split('/'),uid=String(ctx.user.id);
  if(bucket==='avatars'){
    if(parts.length!==2||parts[0]!==uid||!/^avatar(?:-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?\.(png|jpe?g|webp)$/i.test(parts[1]))fail('مسیر تصویر پروفایل مجاز نیست.',403);
    return path;
  }
  if(bucket==='chat-attachments'){
    if(parts.length!==3||!UUID.test(parts[0])||parts[1]!==uid)fail('مسیر پیوست گفت‌وگو مجاز نیست.',403);
    const thread=await rowVisible('chat_threads',`id=eq.${encodeURIComponent(parts[0])}&is_active=eq.true`,'id',ctx.authorization);
    if(!thread)fail('دسترسی به این گفت‌وگو ندارید.',403);
    return path;
  }
  if(bucket==='group-avatars'){
    if(ctx.profile.role!=='manager'||parts.length!==2||!UUID.test(parts[0]))fail('فقط مدیر مجاز به تغییر عکس گروه است.',403);
    const thread=await rowVisible('chat_threads',`id=eq.${encodeURIComponent(parts[0])}&thread_type=eq.group&is_active=eq.true`,'id',ctx.authorization);
    if(!thread)fail('گروه معتبر نیست.',404);
    return path;
  }
  if(bucket==='petty-cash-private'){
    if(parts.length!==2||!/^[0-9]+$/.test(parts[0])||await rpc('can_access_petty_cash',{},ctx.authorization)!==true)fail('دسترسی تنخواه مجاز نیست.',403);
    const entry=await rowVisible('petty_cash_entries',`id=eq.${encodeURIComponent(parts[0])}`,'id',ctx.authorization);
    if(!entry)fail('رویداد تنخواه معتبر نیست.',404);
    return path;
  }
  if(bucket==='stickers'){
    if(ctx.profile.role!=='manager'||parts.length!==3||parts[0]!=='sets'||!/^[0-9]+$/.test(parts[1]))fail('فقط مدیر مجاز به بارگذاری استیکر است.',403);
    return path;
  }
  if(bucket==='vehicle-forms'){
    if(parts.length!==3||parts[0]!=='permanent'||!/^[0-9]+$/.test(parts[1]))fail('مسیر فرم خودرو معتبر نیست.',400);
    if(await rpc('can_access_vehicle',{p_scope:'permanent'},ctx.authorization)!==true)fail('دسترسی فرم خودرو مجاز نیست.',403);
    const row=await rowVisible('vehicle_permanent_records',`id=eq.${encodeURIComponent(parts[1])}`,'id',ctx.authorization);
    if(!row)fail('رکورد خودرو معتبر نیست.',404);
    const ext=extOf(path)||'pdf';
    const token=(parts[2].match(/^([0-9]+)/)?.[1]||Date.now().toString()).slice(0,20);
    return `permanent/${parts[1]}/${token}.${ext}`;
  }
  fail('فضای ذخیره‌سازی مجاز نیست.',400);
}

async function upload(bucket:string,path:string,file:File,mime:string){
  const upsert=bucket==='avatars';
  const res=await fetch(`${URL}/storage/v1/object/${bucket}/${encodePath(path)}`,{
    method:'POST',
    headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':mime,'Cache-Control':'no-cache','x-upsert':String(upsert)},
    body:file,signal:AbortSignal.timeout(45000)
  });
  if(!res.ok){const d=await res.json().catch(()=>({}));fail(d.message||d.error||'بارگذاری فایل انجام نشد.',res.status)}
}
async function remove(bucket:string,path:string){
  const res=await fetch(`${URL}/storage/v1/object/${bucket}`,{
    method:'DELETE',headers:serviceHeaders(),body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(15000)
  });
  if(!res.ok){const d=await res.json().catch(()=>({}));fail(d.message||d.error||'حذف فایل انجام نشد.',res.status)}
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'روش درخواست مجاز نیست.'},405);
  try{
    const ctx=await authenticate(req);
    const form=await req.formData();
    const bucket=String(form.get('bucket')||'');
    if(!Object.prototype.hasOwnProperty.call(TYPES,bucket))fail('فضای ذخیره‌سازی مجاز نیست.');
    let path=cleanPath(String(form.get('path')||''));
    const operation=String(form.get('operation')||'upload');
    path=await authorize(bucket,path,ctx);

    if(operation==='delete'){
      await remove(bucket,path);
      return json({ok:true,path});
    }
    if(operation!=='upload')fail('عملیات فایل معتبر نیست.');
    const file=form.get('file');
    if(!(file instanceof File))fail('فایلی دریافت نشد.');
    const mime=await validateFile(bucket,path,file);
    await upload(bucket,path,file,mime);
    return json({ok:true,path,size:file.size,type:mime});
  }catch(error:any){
    return json({error:error?.message||'خطای ناشناخته در عملیات فایل.'},Number(error?.status)||500);
  }
});


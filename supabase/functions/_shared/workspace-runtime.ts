// Fixed per deployment, never selected by a caller-supplied header.
export function installWorkspaceRuntime(key: 'process'|'quality', worker=false) {
 const schema=`bamco_${key}`,base=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,native=globalThis.fetch.bind(globalThis);
 const buckets=new Set(['stickers','vehicle-forms','avatars','group-avatars','letters-private','chat-attachments','documents-private','petty-cash-private','test-reports-private','invoices-private']);
 const bucket=(value:string)=>buckets.has(value)?`${key}-${value}`:value;
 const remap=(value:unknown):unknown=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([name,item])=>[name,['bucket','bucket_id','p_bucket','p_bucket_id'].includes(name)&&typeof item==='string'?bucket(item):remap(item)])):value;
 const serviceHeaders=(target:string)=>({apikey:service,Authorization:`Bearer ${service}`,'Accept-Profile':target,'Content-Profile':target});
 globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  let request=new Request(input,init);const url=new URL(request.url);
  if(url.origin!==new URL(base).origin)return native(request);
  if(url.pathname.startsWith('/rest/v1/')){
   const headers=new Headers(request.headers);headers.set('Accept-Profile',schema);headers.set('Content-Profile',schema);request=new Request(request,{headers});
   if(url.pathname.endsWith('/rpc/delete_person_account')&&request.method==='POST'){
    const body=await request.clone().json();
    // Auth identities shared with another environment must never be deleted.
    for(const other of ['public','bamco_process','bamco_quality'].filter(name=>name!==schema)){
     const check=await native(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(body.p_user_id)}&select=id`,{headers:serviceHeaders(other)});
     if(!check.ok)return new Response(JSON.stringify({message:'بررسی وابستگی حساب انجام نشد.'}),{status:503});
     if((await check.json()).length)return new Response(JSON.stringify({message:'این حساب در مدیریت دیگری هم استفاده می‌شود و قابل حذف نیست.'}),{status:409});
    }
   }
  }
  if(url.pathname.startsWith('/storage/v1/'))url.pathname=url.pathname.split('/').map(part=>bucket(part)).join('/');
  if(url.pathname.startsWith('/functions/v1/'))url.pathname=url.pathname.replace('/functions/v1/',`/functions/v1/${key}-`);
  if(request.body&&request.headers.get('content-type')?.includes('application/json')){
   let body=await request.clone().json();
   body=remap(body);
   if(url.pathname==='/auth/v1/admin/users'&&request.method==='POST')body={...body,app_metadata:{...body.app_metadata,bamco_department:key}};
   request=new Request(request,{body:JSON.stringify(body)});
  }
  return native(new Request(url,request));
 };
 // Every handler, including ones using the service key, first checks membership.
 const serve=Deno.serve.bind(Deno);
 Deno.serve=((handler: (request:Request,info:unknown)=>Response|Promise<Response>)=>serve(async(request:Request,info:unknown)=>{
  if(request.method==='OPTIONS')return handler(request,info);
  const authorization=request.headers.get('authorization')||'';
  if(!worker&&authorization!==`Bearer ${service}`){
   const auth=await native(`${base}/auth/v1/user`,{headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:authorization}});
   if(!auth.ok)return reject(request,401,'ورود معتبر لازم است.');
   const user=await auth.json();
   const profile=await native(`${base}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id`,{headers:serviceHeaders(schema)});
   if(!profile.ok||!(await profile.json()).length)return reject(request,403,'حساب شما به این مدیریت دسترسی ندارد.');
  }
  return handler(request,info);
 })) as typeof Deno.serve;
 function reject(request:Request,status:number,message:string){return new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://nazanin-ghaemizadeh.github.io','Cache-Control':'no-store'}})}
}

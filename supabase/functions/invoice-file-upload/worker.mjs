// Caller-scoped reservations authorize each upload. Storage service credentials
// stay server-side, and this endpoint never accepts a bucket/path or upsert flag.
const BUCKET = 'invoices-private', MAX_BYTES = 6 * 1024 * 1024, MAX_BODY = MAX_BYTES + 65536;
const EXT = { 'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
const ID = /^[1-9][0-9]{0,18}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2,'0')).join('');
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
function cors(request) {
 const origin = request.headers.get('origin') || '';
 return { 'Access-Control-Allow-Origin': origin === 'https://nazanin-ghaemizadeh.github.io' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : 'https://nazanin-ghaemizadeh.github.io', 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods':'POST,OPTIONS', Vary:'Origin' };
}
async function boundedBytes(response, maximum) {
 if (Number(response.headers.get('content-length') || 0) > maximum) throw failure('حجم فایل بیش از حد مجاز است.',413);
 if (!response.body) throw failure('فایل خالی است.');
 const reader=response.body.getReader(), chunks=[]; let total=0;
 try {
  for (;;) { const {done,value}=await reader.read(); if(done) break; total+=value.byteLength; if(total>maximum){await reader.cancel();throw failure('حجم فایل بیش از حد مجاز است.',413)} chunks.push(value); }
 } finally { reader.releaseLock(); }
 const bytes=new Uint8Array(total); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;} return bytes;
}
function reservationPath(row) {
 if (!row || !ID.test(String(row.id)) || !ID.test(String(row.invoice_id)) || (row.payment_id != null && !ID.test(String(row.payment_id))) || !UUID.test(row.client_request_id || '') || !EXT[row.content_type] || !['proforma','receipt','final'].includes(row.file_type) || (row.file_type === 'receipt') !== (row.payment_id != null)) throw failure('شناسهٔ فایل معتبر نیست.',409);
 const path=`${row.invoice_id}/${row.payment_id || 'invoice'}/${row.file_type}/${row.client_request_id}.${EXT[row.content_type]}`;
 if (row.bucket_id !== BUCKET || row.storage_path !== path || !['pending','ready'].includes(row.upload_state) || !/^[0-9a-f]{64}$/.test(row.sha256 || '') || !/^[1-9][0-9]*$/.test(String(row.size_bytes)) || BigInt(row.size_bytes)>BigInt(MAX_BYTES)) throw failure('اطلاعات فایل با فضای ذخیره‌سازی مطابقت ندارد.',409);
 return path;
}
export function createInvoiceUploadHandler({url,anonKey,serviceKey,fetchImpl=fetch}) {
 return async function handle(request) {
  const headers={...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS') return new Response('ok',{headers});
  if(request.method!=='POST') return reply({error:'Method not allowed'},405);
  if(!url || !anonKey || !serviceKey) return reply({error:'سرویس بارگذاری آماده نیست.'},503);
  const authorization=request.headers.get('Authorization') || '';
  if(!/^Bearer\s+\S+$/i.test(authorization)) return reply({error:'ابتدا وارد سامانه شوید.'},401);
  const base=url.replace(/\/$/,''), callerHeaders={Authorization:authorization,apikey:anonKey,'Content-Type':'application/json'}, storageHeaders={Authorization:`Bearer ${serviceKey}`,apikey:serviceKey};
  const upstream=async(path,init)=>fetchImpl(`${base}${path}`,{...init,signal:AbortSignal.timeout(20000)});
  const callerRpc=async(name,args)=>{
   const response=await upstream(`/rest/v1/rpc/${name}`,{method:'POST',headers:callerHeaders,body:JSON.stringify(args)});
   if(!response.ok) throw failure('مجوز یا وضعیت اتصال فایل تأیید نشد؛ اطلاعات ثبت‌شده حفظ شده است.',response.status===401?401:response.status===403?403:409);
   return response.json();
  };
  try {
   const authentication=await upstream('/auth/v1/user',{method:'GET',headers:callerHeaders});
   if(!authentication.ok) throw failure('نشست ورود معتبر نیست.',401);
   const user=await authentication.json(); if(!user?.id) throw failure('نشست ورود معتبر نیست.',401);
   if(!/^multipart\/form-data\b/i.test(request.headers.get('content-type') || '')) throw failure('فایل باید به‌صورت فرم ارسال شود.');
   const body=await boundedBytes(request,MAX_BODY);
   const form=await new Response(body,{headers:{'content-type':request.headers.get('content-type')}}).formData();
   if([...form.keys()].some(key=>!['file_id','file'].includes(key)) || form.getAll('file_id').length!==1 || form.getAll('file').length!==1) throw failure('درخواست بارگذاری معتبر نیست.');
   const id=String(form.get('file_id') || ''), file=form.get('file');
   if(!ID.test(id) || !file || typeof file.arrayBuffer!=='function' || !file.size || file.size>MAX_BYTES) throw failure('شناسه یا اندازهٔ فایل معتبر نیست.');
   const row=await callerRpc('get_invoice_file_upload',{p_file_id:id}), path=reservationPath(row);
   if(String(row.id)!==id || row.uploaded_by!==user.id) throw failure('مجوز بارگذاری این فایل را ندارید.',403);
   if(file.name!==row.file_name || file.type!==row.content_type || String(file.size)!==String(row.size_bytes)) throw failure('همان فایل انتخاب‌شدهٔ اولیه را بارگذاری کنید؛ نام، نوع یا اندازه متفاوت است.',409);
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(await digest(bytes)!==row.sha256) throw failure('محتوای فایل با درخواست اولیه مطابقت ندارد.',409);
   const verifyStored=async()=>{
    const response=await upstream(`/storage/v1/object/authenticated/${BUCKET}/${encodePath(path)}`,{method:'GET',headers:storageHeaders});
    if(!response.ok) throw failure('ذخیرهٔ فایل تأیید نشد؛ دوباره تلاش کنید.',502);
    const storedType=(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const stored=await boundedBytes(response,MAX_BYTES);
    if(storedType!==row.content_type || stored.byteLength!==bytes.byteLength || await digest(stored)!==row.sha256) throw failure('فایل ذخیره‌شده با درخواست اولیه مطابقت ندارد؛ بازنویسی انجام نشد.',409);
   };
   if(row.upload_state==='ready' || row.uploaded_object_matches===true) await verifyStored();
   else {
    const storageForm=new FormData(); storageForm.append('cacheControl','0'); storageForm.append('metadata',JSON.stringify({sha256:row.sha256})); storageForm.append('',new Blob([bytes],{type:row.content_type}),row.file_name);
    let uploaded=false;
    try { const response=await upstream(`/storage/v1/object/${BUCKET}/${encodePath(path)}`,{method:'POST',headers:{...storageHeaders,'x-upsert':'false'},body:storageForm}); uploaded=response.ok; } catch { /* Unknown commit: verify the exact stored bytes below. */ }
    // No overwrite or delete is attempted. A duplicate or lost response is safe
    // only when the existing bytes match this frozen reservation exactly.
    if(!uploaded) await verifyStored();
   }
   const ready=await callerRpc('finalize_invoice_file',{p_file_id:id});
   if(!ready || String(ready.id)!==id || String(ready.invoice_id)!==String(row.invoice_id) || String(ready.payment_id??'')!==String(row.payment_id??'') || ready.upload_state!=='ready') throw failure('اتصال نهایی فایل تأیید نشد؛ دوباره تلاش کنید.',502);
   return reply({file:ready});
  } catch(error) { return reply({error:error?.status?error.message:'بارگذاری کامل نشد؛ فایل رزروشده برای تلاش دوباره حفظ شده است.'},error?.status || 502); }
 };
}

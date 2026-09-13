import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,KEY,{auth:{persistSession:false}}),bucket='letters-private';
const headers={'Access-Control-Allow-Origin':'https://nazanin-ghaemizadeh.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const fail=(message:string,status=400)=>{throw Object.assign(new Error(message),{status})};
const clean=(v:unknown)=>String(v??'').trim();
const digits=(v:unknown)=>clean(v).replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.includes(c)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(c):'٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return reply({error:'روش درخواست مجاز نیست.'},405);
 let newPath:string|null=null,committed=false;
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)fail('نشست معتبر نیست؛ دوباره وارد شوید.',401);
  const {data:profile}=await db.from('profiles').select('active,role').eq('id',user!.id).single();if(!profile?.active)fail('دسترسی به نامه‌ها مجاز نیست.',403);
  if(profile.role!=='manager'){const {data:grant,error}=await db.from('letter_access').select('user_id').eq('user_id',user!.id).single();if(error||!grant)fail('دسترسی به نامه‌ها برای شما فعال نشده است.',403);}
  const form=req.headers.get('content-type')?.includes('multipart/form-data')?await req.formData():null;
  const data:Record<string,unknown>=form?Object.fromEntries(form.entries()):await req.json();
  if(data.action==='download'){
   const {data:row,error}=await db.from('letters').select('storage_path,file_name').eq('id',data.id).single();if(error||!row)fail('نامه پیدا نشد.',404);if(!row!.storage_path)fail('فایل این نامه هنوز بارگذاری نشده است.',404);
   const {data:signed,error:signError}=await db.storage.from(bucket).createSignedUrl(row!.storage_path,60,{download:row!.file_name});if(signError)throw signError;return reply({url:signed!.signedUrl});
  }
  if(data.action!=='save')fail('عملیات مجاز نیست.');
  const id=clean(data.id)||crypto.randomUUID(),expected=Number(data.version),isEdit=!!clean(data.id);
  const fields={letter_number:digits(data.letter_number),letter_date:digits(data.letter_date),recipient:clean(data.recipient),subject:clean(data.subject)};
  if(!fields.letter_number||fields.letter_number.length>120||!fields.recipient||fields.recipient.length>300||!fields.subject||fields.subject.length>1000)fail('شماره، گیرنده و موضوع نامه را کامل کنید.');
  if(!/^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(fields.letter_date))fail('تاریخ را به صورت ۱۴۰۵/۰۶/۲۲ وارد کنید.');
  let old:any=null;
  if(isEdit){const {data:row,error}=await db.from('letters').select('*').eq('id',id).single();if(error||!row)fail('نامه پیدا نشد.',404);old=row;if(old.version!==expected)fail('نامه توسط فرد دیگری تغییر کرده؛ تازه‌سازی کنید.',409)}
  const file=form?.get('file'),patch:any={...fields,updated_by:user!.id,updated_at:new Date().toISOString(),version:isEdit?expected+1:1};
  if(file instanceof File&&file.size){
   const mimeByExt:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
   const ext=file.name.split('.').pop()?.toLowerCase()||'',mime=mimeByExt[ext];if(!mime)fail('فایل PDF، Word، PNG یا JPG انتخاب کنید.');if(file.size>25*1024*1024)fail('حداکثر حجم فایل ۲۵ مگابایت است.',413);
   const head=new Uint8Array(await file.slice(0,8).arrayBuffer());if((ext==='pdf'&&new TextDecoder().decode(head).indexOf('%PDF-')!==0)||(ext==='docx'&&(head[0]!==80||head[1]!==75))||(ext==='png'&&(head[0]!==137||head[1]!==80))||(['jpg','jpeg'].includes(ext)&&(head[0]!==255||head[1]!==216)))fail('محتوای فایل با پسوند آن مطابقت ندارد.');
   newPath=`${id}/${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from(bucket).upload(newPath,file,{contentType:mime,upsert:false});if(error)throw error;
   Object.assign(patch,{storage_path:newPath,file_name:file.name,mime_type:mime,file_size:file.size});
  }else if(!isEdit)fail('فایل نامه را انتخاب کنید.');
  const query=isEdit?db.from('letters').update(patch).eq('id',id).eq('version',expected):db.from('letters').insert({...patch,id,created_by:user!.id});
  const {data:saved,error}=await query.select().single();if(error){if(error.code==='23505')fail('شماره نامه تکراری است.',409);if(error.code==='PGRST116')fail('نامه هم‌زمان تغییر کرده؛ تازه‌سازی کنید.',409);throw error}committed=true;
  // The new version is committed before its predecessor can be removed.
  if(newPath&&old?.storage_path)await db.storage.from(bucket).remove([old.storage_path]);
  return reply({letter:saved});
 }catch(error:any){if(newPath&&!committed)await db.storage.from(bucket).remove([newPath]);return reply({error:error.status?error.message:'ثبت یا دریافت نامه انجام نشد؛ دوباره تلاش کنید.'},error.status||500)}
});

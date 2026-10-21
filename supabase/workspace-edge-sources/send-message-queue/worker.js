/* Atomic queue claims and complete batch accounting; no credentials in this module. */
(()=>{'use strict';
function explain(error){const raw=error instanceof Error?error.message:String(error);if(/certificate|NotValidForName|TLS|SSL/i.test(raw))return 'گواهی امنیتی سرویس ایمیل معتبر نیست؛ سرویس ارسال باید گواهی دامنه api.mailerino.com را اصلاح کند. پیام داخل سامانه مستقل از این خطا کار می‌کند.';if(/timeout|timed out|AbortError/i.test(raw))return 'پاسخ سرویس ایمیل به‌موقع دریافت نشد؛ پیش از تلاش مجدد وضعیت ارسال را بررسی کنید.';return raw.slice(0,1000)}
async function run(admin,batchId,send){const {data:items,error}=await admin.from('message_deliveries').select('id,status,thread_key,attempt_count,message_snapshots(*)').eq('batch_id',batchId).eq('channel','email').in('status',['queued','failed']).lt('attempt_count',3);if(error)throw Error(error.message);let sent=0;const errors=[];
 for(const d of items||[]){const {data:claim,error:claimError}=await admin.from('message_deliveries').update({status:'processing',attempt_count:d.attempt_count+1,last_attempt_at:new Date().toISOString(),error_message:null}).eq('id',d.id).eq('status',d.status).eq('attempt_count',d.attempt_count).select('id').maybeSingle();if(claimError){errors.push({id:d.id,message:claimError.message});continue;}if(!claim)continue;
  let accepted=false;try{const snapshot=Array.isArray(d.message_snapshots)?d.message_snapshots[0]:d.message_snapshots;if(!snapshot?.recipient_email)throw Error('ایمیل گیرنده ثبت نشده است.');if(!String(snapshot.subject||'').trim()||!String(snapshot.final_text||'').trim())throw Error('موضوع یا متن پیام خالی است.');const result=await send(snapshot,d);accepted=true;const {error:saveError}=await admin.from('message_deliveries').update({status:'sent',provider_message_id:result.id||result.messageId||null,sent_at:new Date().toISOString(),error_message:null}).eq('id',d.id);if(saveError)throw Error('سرویس ایمیل پیام را پذیرفت، اما ثبت نتیجه انجام نشد؛ قبل از ارسال مجدد سابقه را بررسی کنید.');sent++;
  }catch(err){const message=explain(err);await admin.from('message_deliveries').update({status:accepted?'processing':'failed',error_message:message}).eq('id',d.id);errors.push({id:d.id,message})}
 }
 const {data:all,error:readError}=await admin.from('message_deliveries').select('id,status,error_message,channel').eq('batch_id',batchId);if(readError)throw Error(readError.message);if(!all?.length)throw Error('بسته پیام یا مسیر ارسالی پیدا نشد.');
 const failedRows=all.filter(d=>d.status==='failed'),pending=all.some(d=>['ready','queued','processing'].includes(d.status)),success=all.some(d=>['sent','delivered'].includes(d.status)),status=pending?'queued':failedRows.length?(success?'partial':'failed'):success?'sent':'cancelled';
 await admin.from('message_batches').update({status,completed_at:pending?null:new Date().toISOString()}).eq('id',batchId);
 for(const d of failedRows)if(!errors.some(e=>e.id===d.id))errors.push({id:d.id,message:d.error_message||'ارسال ناموفق؛ تعداد مجاز تلاش‌ها تمام شده است.'});
 return{sent,failed:failedRows.length,pending,status,errors};
}
globalThis.BamcoEmailQueue={run,explain};if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.BamcoEmailQueue;
})();


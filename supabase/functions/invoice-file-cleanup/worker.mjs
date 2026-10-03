// Service-only worker. Client-supplied paths/bucket names are never accepted.
// The SQL outbox is authoritative and retains failed work for later retries.
const BUCKET = 'invoices-private';
const LIMIT = 20;
const CONCURRENCY = 4;
const MAX_RUN_MS = 45000;
const PATH = /^[1-9][0-9]*\/(?:invoice|[1-9][0-9]*)\/(?:proforma|receipt|final)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png|webp)$/;
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createInvoiceCleanupHandler({url,serviceKey,fetchImpl=fetch,now=Date.now}) {
 return async function handle(request) {
  if (request.method !== 'POST') return reply({error:'Method not allowed'},405);
  if (!url || !serviceKey) return reply({error:'Cleanup is not configured'},503);
  if (request.headers.get('Authorization') !== `Bearer ${serviceKey}`) return reply({error:'Unauthorized'},401);
  const base=url.replace(/\/$/,'');
  const headers={Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,'Content-Type':'application/json'};
  const post=async(path,body,method='POST')=>{
   const response=await fetchImpl(`${base}${path}`,{method,headers,body:JSON.stringify(body),signal:AbortSignal.timeout(7000)});
   if(!response.ok) throw new Error('upstream request failed');
   return await response.json();
  };
  let rows;
  try { rows=await post('/rest/v1/rpc/invoice_file_cleanup_batch',{p_limit:LIMIT}); }
  catch { return reply({error:'Cleanup queue is unavailable'},503); }
  if(!Array.isArray(rows)) return reply({error:'Invalid cleanup queue response'},502);
  const jobs=rows.slice(0,LIMIT),started=now();
  let next=0,completed=0,failed=0,deferred=0;
  const run=async()=>{
   for(;;){
    const index=next++;
    if(index>=jobs.length) return;
    if(now()-started>=MAX_RUN_MS){deferred++;continue;}
    const job=jobs[index];
    // Defense in depth even though only server-written, deleted row identities
    // can enter the outbox. Never follow untrusted URLs or delete other buckets.
    if(!job || !/^[1-9][0-9]*$/.test(String(job.file_id)) || job.bucket_id!==BUCKET || typeof job.storage_path!=='string' || !PATH.test(job.storage_path)) {failed++;continue;}
    try {
     // Supabase's remove endpoint is idempotent for already-absent objects.
     // Metadata rows must not be deleted with SQL: this removes the actual bytes.
     await post(`/storage/v1/object/${BUCKET}`,{prefixes:[job.storage_path]},'DELETE');
     const acknowledged=await post('/rest/v1/rpc/ack_invoice_file_cleanup',{p_file_id:String(job.file_id)});
     if(acknowledged!==true) throw new Error('cleanup acknowledgement failed');
     completed++;
    } catch {failed++;} // No ack on API failure. Next invocation retries safely.
   }
  };
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,jobs.length)},run));
  return reply({scanned:jobs.length,completed,failed,deferred},failed?207:200);
 };
}

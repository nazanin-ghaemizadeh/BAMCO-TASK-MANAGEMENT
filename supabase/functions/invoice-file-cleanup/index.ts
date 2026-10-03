// STAGED ONLY. Deploy and invoke from a trusted server-side schedule after the
// invoice attachment schema proposal is reviewed. Never put this credential in UI.
import { createInvoiceCleanupHandler } from './worker.mjs';
Deno.serve(createInvoiceCleanupHandler({
 url:Deno.env.get('SUPABASE_URL'),
 serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));

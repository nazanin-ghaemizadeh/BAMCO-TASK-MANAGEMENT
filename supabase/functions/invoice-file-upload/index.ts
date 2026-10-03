// Staged only. User JWT remains the authorization boundary for reservations and
// finalization. The service key is used solely for fixed-path, non-upsert bytes.
import { createInvoiceUploadHandler } from './worker.mjs';
Deno.serve(createInvoiceUploadHandler({
 url: Deno.env.get('SUPABASE_URL'),
 anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
 serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));

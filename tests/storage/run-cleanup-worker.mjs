// Run the actual cleanup handler in Node against real ephemeral local services.
// No Deno deployment is performed. Credentials enter over stdin, never argv/logs.
import { createInvoiceCleanupHandler } from '../../supabase/functions/invoice-file-cleanup/worker.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { url, serviceKey } = JSON.parse(input);
const origin = new URL(url);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw Error('Only the isolated loopback API origin is allowed');
if (typeof serviceKey !== 'string' || serviceKey.length < 20) throw Error('Missing fixture credential');
const requests = [];
const handler = createInvoiceCleanupHandler({ url, serviceKey, fetchImpl: async (target, options) => {
  const address = new URL(target);
  if (address.origin !== origin.origin || !/^\/(?:rest\/v1\/rpc\/(?:invoice_file_cleanup_batch|ack_invoice_file_cleanup)|storage\/v1\/object\/invoices-private)$/.test(address.pathname) || address.search || address.hash) throw Error('Cleanup attempted an unexpected destination');
  requests.push({ method: options.method, path: address.pathname });
  return fetch(address, { ...options, redirect: 'error' });
}});
try {
  const response = await handler(new Request(`${origin.origin}/fixture-cleanup`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}` } }));
  process.stdout.write(JSON.stringify({ status: response.status, body: await response.json(), requests }));
} catch {
  process.stderr.write('Real local cleanup invocation failed; credentials and upstream bodies omitted\n');
  process.exitCode = 1;
}

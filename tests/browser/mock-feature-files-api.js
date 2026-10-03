/* Isolated feature-file fixtures. This wrapper never sends writes to a server. */
(() => {
  const earlier = window.fetch;
  const stamp = () => new Date().toISOString();
  const store = window.__featureFiles = {
    invoices: [], payments: [], files: [], years: [], reports: [], operations: new Map(), uploads: [], calls: [], failNext: null
  };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const uid = () => window.__testApi.actor.id;
  const exact = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value != null && ['id','invoice_id','payment_id','total_amount','amount','percent_of_total','size_bytes'].includes(key) ? String(value) : value]));
  const cents = value => { const [whole, fraction = ''] = String(value || '0').split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
  const paid = invoiceId => store.payments.filter(item => String(item.invoice_id) === String(invoiceId) && item.status === 'paid').reduce((sum, item) => sum + cents(item.amount), 0n);
  const currentFinal = file => { const invoice = store.invoices.find(row => String(row.id) === String(file.invoice_id)); return !!invoice && cents(invoice.total_amount) > 0n && paid(invoice.id) >= cents(invoice.total_amount); };
  const touchYear = id => { const year = store.years.find(row => row.id === id); if (year) year.updated_at = stamp(); };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href), endpoint = url.pathname.split('/').pop(), method = init.method || 'GET';
    let body = init.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }
    store.calls.push({ endpoint, method, body });
    if (store.failNext === endpoint) { store.failNext = null; return response({ message: 'خطای آزمایشی قابل تکرار' }, 503); }
    if (endpoint === 'list_invoice_workspace') return response({ invoices: store.invoices.map(exact), payments: store.payments.map(exact), files: store.files.map(row => exact({ ...row, final_is_current: row.file_type !== 'final' || currentFinal(row) })) });
    if (endpoint === 'save_invoice' || endpoint === 'save_invoice_payment') {
      const payment = endpoint === 'save_invoice_payment', rows = payment ? store.payments : store.invoices, id = payment ? body.p_payment_id : body.p_invoice_id;
      const key = endpoint + body.p_request_id;
      if (store.operations.has(key)) return response(exact(store.operations.get(key)));
      let row = rows.find(item => String(item.id) === String(id));
      if (row) Object.assign(row, body.p_payload, { updated_at: stamp() });
      else { row = { id: String(1000 + rows.length), created_by: uid(), follow_up_owner_id: uid(), status: 'initial', created_at: stamp(), updated_at: stamp(), ...body.p_payload }; rows.push(row); }
      if(payment){const inv=store.invoices.find(item=>String(item.id)===String(row.invoice_id));const total=inv&&cents(inv.total_amount);if(total>0n){const ratio=(cents(row.amount)*100000n+total/2n)/total;row.percent_of_total=String(ratio/1000n)+'.'+String(ratio%1000n).padStart(3,'0')}}
      store.operations.set(key, row); return response(exact(row));
    }
    if (endpoint === 'reserve_invoice_file') {
      let row = store.files.find(item => item.client_request_id === body.p_request_id);
      if (!row) {
        const invoice = store.invoices.find(item => String(item.id) === String(body.p_invoice_id));
        if (!invoice) return response({ message: 'صورتحساب پیدا نشد' }, 404);
        if (body.p_file_type === 'final' && !(cents(invoice.total_amount) > 0n && paid(invoice.id) >= cents(invoice.total_amount))) return response({ message: 'صورتحساب هنوز تسویه نشده' }, 400);
        row = { id: String(2000 + store.files.length), invoice_id: String(body.p_invoice_id), payment_id: body.p_payment_id == null ? null : String(body.p_payment_id), file_type: body.p_file_type, bucket_id: 'invoices-private', file_name: body.p_file_name, content_type: body.p_content_type, size_bytes: String(body.p_size_bytes), sha256: body.p_sha256, client_request_id: body.p_request_id, uploaded_by: uid(), upload_state: 'pending', storage_path: `invoices/${body.p_invoice_id}/${body.p_request_id}.pdf`, created_at: stamp() };
        store.files.push(row);
      }
      return response(exact(row));
    }
    if (endpoint === 'invoice-file-upload') {
      const row=store.files.find(item=>String(item.id)===String(body.get('file_id')));
      const file=body.get('file');
      if(!row||!file||file.name!==row.file_name||file.size!==Number(row.size_bytes))return response({error:'فایل با درخواست رزروشده مطابقت ندارد'},409);
      store.uploads.push({path:row.storage_path,bytes:file.size,transport:'authorized-edge'});
      row.upload_state='ready';return response({file:exact(row)});
    }
    if (endpoint === 'finalize_invoice_file') {
      const row = store.files.find(item => String(item.id) === String(body.p_file_id)); if (!row) return response({ message: 'فایل پیدا نشد' }, 404);
      row.upload_state = 'ready'; return response(exact(row));
    }
    if (endpoint === 'invoices' && method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      store.invoices = store.invoices.filter(row => String(row.id) !== id); store.payments = store.payments.filter(row => String(row.invoice_id) !== id); store.files = store.files.filter(row => String(row.invoice_id) !== id);
      return response(null);
    }
    if (endpoint === 'test_report_years') return response(store.years);
    if (endpoint === 'test_report_files') { const id = url.searchParams.get('year_id')?.replace(/^eq\./, ''); return response(store.reports.filter(row => !id || row.year_id === id)); }
    if (endpoint === 'test-report-library') {
      const action = body.get('action'), yearId = body.get('year_id'), id = body.get('id'), fileId = body.get('file_id');
      if (action === 'create_year') {
        const existing = store.years.find(row => row.id === id); if (existing) return response({ ok: true, year: existing });
        if (store.years.some(row => row.domain === body.get('domain') && row.report_type === body.get('report_type') && row.jalali_year === Number(body.get('jalali_year')))) return response({ error: 'این سال قبلاً تعریف شده است', code: 'already_exists' }, 409);
        const year = { id, domain: body.get('domain'), report_type: body.get('report_type'), jalali_year: Number(body.get('jalali_year')), created_by: uid(), created_at: stamp(), updated_at: stamp() }; store.years.push(year); return response({ ok: true, year });
      }
      if (action === 'update_year') { const year = store.years.find(row => row.id === yearId); year.jalali_year = Number(body.get('jalali_year')); year.updated_at = stamp(); return response({ ok: true, year }); }
      if (action === 'delete_year') { const count = store.reports.filter(row => row.year_id === yearId).length; if (count) return response({ error: 'ابتدا فایل‌های داخل پوشه را حذف کنید', code: 'folder_not_empty', count }, 409); store.years = store.years.filter(row => row.id !== yearId); return response({ ok: true }); }
      if (action === 'upload') {
        let file = store.reports.find(row => row.id === id);
        if (!file) { const picked = body.get('file'); file = { id, year_id: yearId, title: body.get('title'), description: body.get('description'), original_file_name: picked.name, storage_path: `years/${yearId}/${id}.pdf`, mime_type: picked.type, file_size: picked.size, sha256: 'a'.repeat(64), status: 'ready', created_by: uid(), created_at: stamp(), updated_at: stamp() }; store.reports.push(file); }
        touchYear(yearId); return response({ ok: true, file });
      }
      if (action === 'update') { const file = store.reports.find(row => row.id === fileId); Object.assign(file, { title: body.get('title'), description: body.get('description'), updated_at: stamp() }); touchYear(file.year_id); return response({ ok: true, file }); }
      if (action === 'delete') { const file = store.reports.find(row => row.id === fileId); store.reports = store.reports.filter(row => row.id !== fileId); if (file) touchYear(file.year_id); return response({ ok: true }); }
    }
    if (url.pathname.includes('/storage/v1/object/') && /invoices-private|test-reports-private/.test(url.pathname)) {
      if (method === 'POST') { store.uploads.push({ path: url.pathname, bytes: body?.size || body?.get?.('')?.size }); return response({ Key: url.pathname }); }
      return new Response('%PDF-1.7\n%Isolated fixture only', { headers: { 'Content-Type': 'application/pdf' } });
    }
    if (endpoint === 'phonebook_units') return response([{ id: 1, category: 'office', title: 'معاونت فنی، مهندسی و کیفیت' }]);
    if (endpoint === 'contact_directory') return response([]);
    return earlier(input, init);
  };
})();

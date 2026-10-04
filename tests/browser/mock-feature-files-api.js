/* Isolated feature-file fixtures. This wrapper never sends writes to a server. */
(() => {
  const earlier = window.fetch;
  const stamp = () => new Date().toISOString();
  const store = window.__featureFiles = {
    invoices: [], payments: [], files: [], years: [], reports: [], operations: new Map(), fileBodies: new Map(), uploads: [], calls: [], failNext: null, gates: {}, expiredGates: [], workspaceResponses: [], nextInvoiceId: 1000, nextPaymentId: 1000, nextFileId: 2000
  };
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const uid = () => window.__testApi.actor.id;
  const manager = () => window.__testApi.actor.role === 'manager';
  const can = action => window.__testApi.actor.active !== false && (manager() || window.__testApi.featureAccess.some(row => row.feature_key === 'invoices' && row['can_' + action] === true));
  const parent = id => store.invoices.find(row => String(row.id) === String(id));
  const fileVisible = file => can('view') && !!parent(file.invoice_id) && (file.upload_state !== 'pending' || String(file.uploaded_by) === String(uid()));
  const canFiles = invoice => can('view') && !!invoice;
  const canPayments = invoice => canFiles(invoice) && can('edit');
  const denied = () => response({ message: 'Fixture invoice action is outside the existing scope' }, 403);
  // One response may be held per endpoint. Gates fail closed after ten seconds,
  // so a missed release fails the acceptance case rather than hanging CI.
  store.pauseNext = endpoint => {
    if (store.gates[endpoint] && !store.gates[endpoint].finished) throw Error('Fixture gate already pending: ' + endpoint);
    store.gates[endpoint] = { entered: false, released: false, finished: false };
  };
  store.release = endpoint => {
    const gate = store.gates[endpoint];
    if (!gate?.entered || gate.finished || gate.released) throw Error('Fixture gate is not waiting: ' + endpoint);
    gate.released = true; gate.resolve();
  };
  const waitAtGate = async endpoint => {
    const gate = store.gates[endpoint]; if (!gate || gate.entered) return;
    gate.entered = true;
    let timer;
    try {
      await new Promise((resolve, reject) => {
        gate.resolve = resolve;
        timer = setTimeout(() => { store.expiredGates.push(endpoint); reject(Error('Fixture gate expired: ' + endpoint)); }, 10000);
      });
    } finally { clearTimeout(timer); gate.finished = true; delete gate.resolve; }
  };
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
    await waitAtGate(endpoint);
    if (store.failNext === endpoint) { store.failNext = null; return response({ message: 'خطای آزمایشی قابل تکرار' }, 503); }
    if (endpoint === 'list_invoice_workspace') {
      if (!can('view')) return denied();
      const workspace = { invoices: store.invoices.map(exact), payments: store.payments.filter(row => parent(row.invoice_id)).map(exact), files: store.files.filter(fileVisible).map(row => exact({ ...row, final_is_current: row.file_type !== 'final' || currentFinal(row) })) };
      // Keep a detached response record: tests can distinguish fixture filtering
      // from accidentally hiding pending records only after they reach the UI.
      store.workspaceResponses.push(JSON.parse(JSON.stringify(workspace)));
      return response(workspace);
    }
    if (endpoint === 'save_invoice' || endpoint === 'save_invoice_payment') {
      const payment = endpoint === 'save_invoice_payment', rows = payment ? store.payments : store.invoices, id = payment ? body.p_payment_id : body.p_invoice_id;
      const existing = rows.find(item => String(item.id) === String(id));
      if (payment ? !canPayments(parent(existing?.invoice_id || body.p_payload.invoice_id)) : id ? !can('view') || !can('edit') || !existing : !can('create')) return denied();
      const key = endpoint + body.p_request_id;
      if (store.operations.has(key)) return response(exact(store.operations.get(key)));
      let row = rows.find(item => String(item.id) === String(id));
      if (row) Object.assign(row, body.p_payload, { updated_at: stamp() });
      else { row = { id: String(payment ? store.nextPaymentId++ : store.nextInvoiceId++), created_by: uid(), follow_up_owner_id: uid(), status: 'initial', created_at: stamp(), updated_at: stamp(), ...body.p_payload }; rows.push(row); }
      if(payment){const inv=store.invoices.find(item=>String(item.id)===String(row.invoice_id));const total=inv&&cents(inv.total_amount);if(total>0n){const ratio=(cents(row.amount)*100000n+total/2n)/total;row.percent_of_total=String(ratio/1000n)+'.'+String(ratio%1000n).padStart(3,'0')}}
      store.operations.set(key, row); return response(exact(row));
    }
    if (endpoint === 'reserve_invoice_file') {
      const invoice = parent(body.p_invoice_id);
      if (!canFiles(invoice)) return denied();
      let row = store.files.find(item => item.client_request_id === body.p_request_id);
      if (row && (String(row.uploaded_by) !== String(uid()) || String(row.invoice_id) !== String(body.p_invoice_id) || String(row.payment_id ?? '') !== String(body.p_payment_id ?? '') || row.file_type !== body.p_file_type || row.file_name !== body.p_file_name || row.sha256 !== body.p_sha256)) return response({ message: 'File request belongs to another actor or payload' }, 409);
      if (!row) {
        const invoice = store.invoices.find(item => String(item.id) === String(body.p_invoice_id));
        if (!invoice) return response({ message: 'صورتحساب پیدا نشد' }, 404);
        if (body.p_file_type === 'final' && !(cents(invoice.total_amount) > 0n && paid(invoice.id) >= cents(invoice.total_amount))) return response({ message: 'صورتحساب هنوز تسویه نشده' }, 400);
        row = { id: String(store.nextFileId++), invoice_id: String(body.p_invoice_id), payment_id: body.p_payment_id == null ? null : String(body.p_payment_id), file_type: body.p_file_type, bucket_id: 'invoices-private', file_name: body.p_file_name, content_type: body.p_content_type, size_bytes: String(body.p_size_bytes), sha256: body.p_sha256, client_request_id: body.p_request_id, uploaded_by: uid(), upload_state: 'pending', storage_path: `invoices/${body.p_invoice_id}/${body.p_request_id}.pdf`, created_at: stamp() };
        store.files.push(row);
      }
      return response(exact(row));
    }
    if (endpoint === 'invoice-file-upload') {
      const row=store.files.find(item=>String(item.id)===String(body.get('file_id')));
      const file=body.get('file');
      if (!row || String(row.uploaded_by) !== String(uid()) || !canFiles(parent(row.invoice_id)) || (row.file_type === 'receipt' && !canPayments(parent(row.invoice_id)))) return denied();
      if(!row||!file||file.name!==row.file_name||file.size!==Number(row.size_bytes))return response({error:'فایل با درخواست رزروشده مطابقت ندارد'},409);
      store.uploads.push({path:row.storage_path,bytes:file.size,transport:'authorized-edge'}); store.fileBodies.set('invoices-private/'+row.storage_path,file);
      row.upload_state='ready'; if(row.file_type==='receipt'){const payment=store.payments.find(item=>String(item.id)===String(row.payment_id));if(payment)payment.receipt_path=row.storage_path;} return response({file:exact(row)});
    }
    if (endpoint === 'finalize_invoice_file') {
      const row = store.files.find(item => String(item.id) === String(body.p_file_id)); if (!row) return response({ message: 'فایل پیدا نشد' }, 404);
      if (String(row.uploaded_by) !== String(uid()) || !canFiles(parent(row.invoice_id)) || (row.file_type === 'receipt' && !canPayments(parent(row.invoice_id)))) return denied();
      row.upload_state = 'ready'; return response(exact(row));
    }
    if (endpoint === 'delete_invoice_file') {
      const row=store.files.find(item=>String(item.id)===String(body.p_file_id));
      const result={id:String(body.p_file_id),invoice_id:String(body.p_invoice_id),payment_id:body.p_payment_id==null?null:String(body.p_payment_id),file_type:body.p_file_type,deleted:false};
      if(!row)return response(result);
      if (!canFiles(parent(row.invoice_id)) || !fileVisible(row)) return denied();
      if (row.file_type === 'receipt' && store.payments.some(item => String(item.id) === String(row.payment_id) && item.receipt_path === row.storage_path) && !canPayments(parent(row.invoice_id))) return denied();
      if(String(row.invoice_id)!==String(body.p_invoice_id)||String(row.payment_id??'')!==String(body.p_payment_id??'')||row.file_type!==body.p_file_type||row.client_request_id!==body.p_file_request_id)return response({message:'File identity mismatch'},400);
      store.files=store.files.filter(item=>item!==row);
      const payment=store.payments.find(item=>String(item.id)===String(row.payment_id));
      if(payment&&payment.receipt_path===row.storage_path)payment.receipt_path=store.files.filter(item=>String(item.payment_id)===String(row.payment_id)&&item.file_type==='receipt'&&item.upload_state==='ready').sort((a,b)=>b.created_at.localeCompare(a.created_at)||Number(b.id)-Number(a.id))[0]?.storage_path || null;
      return response({...result,deleted:true});
    }
    if (endpoint === 'invoices' && method === 'DELETE') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const invoice = parent(id);
      if (!can('view') || !can('delete') || !invoice) return denied();
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
        if (!file) { const picked = body.get('file'); file = { id, year_id: yearId, title: body.get('title'), description: body.get('description'), original_file_name: picked.name, storage_path: `years/${yearId}/${id}.pdf`, mime_type: picked.type, file_size: picked.size, sha256: 'a'.repeat(64), status: 'ready', created_by: uid(), created_at: stamp(), updated_at: stamp() }; store.reports.push(file); store.fileBodies.set('test-reports-private/'+file.storage_path,picked); }
        touchYear(yearId); return response({ ok: true, file });
      }
      if (action === 'update') { const file = store.reports.find(row => row.id === fileId); Object.assign(file, { title: body.get('title'), description: body.get('description'), updated_at: stamp() }); touchYear(file.year_id); return response({ ok: true, file }); }
      if (action === 'delete') { const file = store.reports.find(row => row.id === fileId); store.reports = store.reports.filter(row => row.id !== fileId); if (file) touchYear(file.year_id); return response({ ok: true }); }
    }
    if (url.pathname.includes('/storage/v1/object/') && /invoices-private|test-reports-private/.test(url.pathname)) {
      if (method === 'POST' && url.pathname.includes('/invoices-private/')) return denied();
      if (method === 'POST') { store.uploads.push({ path: url.pathname, bytes: body?.size || body?.get?.('')?.size }); return response({ Key: url.pathname }); }
      const path=decodeURIComponent(url.pathname.split('/object/authenticated/')[1] || '');
      if (path.startsWith('invoices-private/')) {
        const row = store.files.find(item => 'invoices-private/' + item.storage_path === path);
        if (!row || !fileVisible(row)) return denied();
      }
      const bytes=store.fileBodies.get(path); if (!bytes) return response({error:'Fixture file missing'},404); return new Response(bytes, { headers: { 'Content-Type': bytes.type || 'application/octet-stream' } });
    }
    if (endpoint === 'phonebook_units') return response([{ id: 1, category: 'office', title: 'معاونت فنی، مهندسی و کیفیت' }]);
    if (endpoint === 'contact_directory') return response([]);
    return earlier(input, init);
  };
})();

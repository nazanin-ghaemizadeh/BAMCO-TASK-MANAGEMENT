/* Canonical message-center UI: feature grants decide access; recipient labels
 * always resolve from the current profile store by immutable recipient_id. */
(() => {
  'use strict';

  const q = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qa = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const channelLabel = { portal: 'داخل سامانه', email: 'ایمیل', both: 'هر دو' };
  const appState = () => window.Bamco?.state || window.state || {};
  const feature = () => window.BamcoNavigationCatalog?.featureForRoute?.('messageCenter') || 'messageCenter';
  const can = (action = 'view') => window.BamcoAccess?.can?.(feature(), action) === true;
  const reportDate = () => BamcoMessageRender.fullDate(new Date().toISOString());

  let rows = [];
  let selected = new Set();
  let busy = false;
  let prepared = null;
  let loading = null;

  async function authorize(action = 'view') {
    const access = window.BamcoAccess;
    if (!appState().token || typeof access?.can !== 'function') return false;
    if (!access.isReady?.()) await access.refresh?.();
    if (!can('view')) {
      access.denied?.(feature(), 'view', { route: 'messageCenter' });
      return false;
    }
    if (action === 'view' || can(action)) return true;
    access.denied?.(feature(), action, { route: 'messageCenter' });
    return false;
  }

  function recipientName(row, fallback = '—') {
    const currentFallback = row?.display_name || row?.recipient_display_name || row?.recipient_name
      || row?.full_name || row?.recipient_full_name || row?.email || fallback;
    return window.BamcoProfiles?.label?.(row?.recipient_id, currentFallback) || currentFallback;
  }

  function senderName() {
    const profile = window.BamcoProfiles?.current?.() || appState().profile || {};
    return profile.display_name || profile.full_name || profile.email || 'سامانه';
  }

  function hydrateRecipients(source) {
    const profiles = (source || []).map(row => {
      const profile = { id: row?.recipient_id };
      const values = {
        display_name: row?.display_name ?? row?.recipient_display_name,
        full_name: row?.full_name ?? row?.recipient_full_name,
        email: row?.email,
        avatar_path: row?.avatar_path,
        updated_at: row?.updated_at,
        active: row?.active
      };
      Object.entries(values).forEach(([key, value]) => {
        if (value !== null && value !== undefined) profile[key] = value;
      });
      return profile;
    }).filter(profile => profile.id);
    if (profiles.length) window.BamcoProfiles?.upsert?.(profiles, { source: 'message-center-directory' });
  }

  function visible() { return rows; }

  function syncSelection() {
    const writable = can('create');
    if (!writable) selected.clear();
    const ids = new Set(rows.map(row => String(row.recipient_id)));
    selected = new Set([...selected].filter(id => ids.has(String(id))));
    qa('#messageCenterBody tr[data-id]').forEach(row => {
      const yes = writable && selected.has(String(row.dataset.id));
      row.classList.toggle('suite-selected', yes);
      row.setAttribute('aria-selected', String(yes));
      row.tabIndex = writable ? 0 : -1;
    });
    const count = q('#messageSelectionCount');
    if (count) count.textContent = fa(selected.size) + ' نفر انتخاب شده';
    const send = q('#sendSelectedMessages');
    if (send) send.disabled = !writable || !selected.size || busy;
    q('#messageChannel')?.toggleAttribute('disabled', !writable || busy);
    q('#messageCenterExport')?.toggleAttribute('disabled', !can('export') || busy);
    q('#refreshMessageCenter')?.toggleAttribute('disabled', !can('view') || busy || !!loading);
    q('#confirmSendMessage')?.toggleAttribute('disabled', !writable || !prepared || busy);
  }

  function toggleRecipient(row) {
    if (!can('create')) { void authorize('create'); return; }
    const id = String(row?.dataset?.id || '');
    if (!id) return;
    selected.has(id) ? selected.delete(id) : selected.add(id);
    syncSelection();
  }

  function render() {
    const body = q('#messageCenterBody');
    if (!body) return;
    body.innerHTML = visible().map(row => `<tr data-id="${esc(row.recipient_id)}" aria-selected="false"><td>${esc(recipientName(row))}</td><td>${fa(row.active_count || 0)}</td><td>${fa(row.warning_count || 0)}</td><td>${fa(row.overdue_count || 0)}</td><td>${row.sticker_state === 1 ? 'وضعیت مطلوب' : row.sticker_state === 2 ? 'یادآوری' : row.sticker_state === 3 ? 'نیازمند توجه' : row.sticker_state === 4 ? 'پیگیری جدی' : row.sticker_state === 5 ? 'اقدام فوری' : '—'}</td><td>${row.last_sent_at ? jalaliDateTime(row.last_sent_at) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">متولی برای نمایش وجود ندارد.</td></tr>';
    syncSelection();
  }

  async function load(force = false) {
    if (!await authorize('view')) {
      rows = [];
      selected.clear();
      render();
      return [];
    }
    if (loading && !force) return loading;
    const view = q('#messageCenterView');
    view?.classList.add('bamco-view-settling');
    loading = (async () => {
      try {
        rows = await selectAll('message_recipient_live_state', 'select=*&order=recipient_name');
        hydrateRecipients(rows);
        render();
        const error = q('#messageCenterError');
        if (error) error.textContent = '';
      } catch (errorValue) {
        const error = q('#messageCenterError');
        if (error) error.textContent = errorValue.message;
      } finally {
        view?.classList.remove('bamco-view-settling');
        view?.dispatchEvent(new CustomEvent('bamco-view-data-ready', { bubbles: true }));
        loading = null;
        syncSelection();
      }
    })();
    syncSelection();
    return loading;
  }

  function channelFor(ids) {
    const channel = q('#messageChannel')?.value || 'portal';
    if (channel !== 'portal') {
      const missing = rows.filter(row => ids.includes(String(row.recipient_id)) && !row.email);
      if (missing.length) throw Error(`برای ${missing.map(row => recipientName(row, 'گیرنده')).join('، ')} ایمیل ثبت نشده است.`);
    }
    return channel;
  }

  async function prepare(ids) {
    if (busy) return;
    if (!await authorize('create') || busy) return;
    if (!ids.length) return toast('حداقل یک فرد را انتخاب کنید.', true);
    busy = true;
    prepared = null;
    syncSelection();
    try {
      const channel = channelFor(ids);
      const channelMap = Object.fromEntries(ids.map(id => [id, channel]));
      const batchId = await rpc('prepare_workflow_messages', {
        p_recipient_ids: ids,
        p_channels: channelMap,
        p_subject: '',
        p_template_text: null,
        p_kind: 'daily',
        p_report_date: reportDate()
      });
      const snapshots = await selectAll('message_snapshots', `select=*&batch_id=eq.${batchId}&order=id`);
      if (!snapshots.length) throw Error('گیرنده معتبری برای ارسال ثبت نشد.');
      prepared = { id: batchId, channels: channelMap };
      const sender = senderName();
      q('#messagePreviewContent').innerHTML = snapshots.map(snapshot => `<section class="snapshot-preview" data-preview-snapshot="${snapshot.id}"><div class="preview-summary"><h4>${esc(recipientName(snapshot, snapshot.recipient_name || '—'))}</h4><p>کانال ارسال: ${channelLabel[channel]}</p></div><div class="message-report-body">${BamcoMessageRender.html(snapshot, { subject: snapshot.subject, reportDate: snapshot.created_at, senderName: sender })}</div></section>`).join('');
      q('#messagePreviewDialog').showModal();
      await Promise.all(snapshots.map(async snapshot => {
        try {
          const stickerUrl = await BamcoMessageRender.stickerUrl(snapshot);
          if (prepared?.id === batchId) {
            const host = q(`[data-preview-snapshot="${snapshot.id}"] .message-report-body`);
            if (host) host.innerHTML = BamcoMessageRender.html(snapshot, { stickerUrl, subject: snapshot.subject, reportDate: snapshot.created_at, senderName: senderName() });
          }
        } catch {}
      }));
    } catch (errorValue) {
      toast(errorValue.message, true);
    } finally {
      busy = false;
      syncSelection();
    }
  }

  async function send() {
    if (busy || !prepared) return;
    if (!await authorize('create') || busy || !prepared) return;
    busy = true;
    syncSelection();
    try {
      const { id, channels } = prepared;
      await rpc('queue_message_batch', { p_batch_id: id });
      if (Object.values(channels).some(channel => channel === 'email' || channel === 'both')) {
        const result = await api('/functions/v1/send-message-queue', { method: 'POST', body: { batch_id: id } });
        if (result.failed || result.pending || result.errors?.length) {
          const detail = result.error || result.errors?.map(error => error.message).join('؛ ') || 'ارسال ایمیل انجام نشد.';
          throw Error(detail);
        }
      }
      prepared = null;
      selected.clear();
      q('#messagePreviewDialog').close();
      toast('ارسال انجام شد و در «پیام‌های ارسال‌شده» ثبت شد.');
      await Promise.allSettled([load(true), window.bamcoInbox?.load?.(), window.bamcoConversations?.refresh?.()]);
    } catch (errorValue) {
      toast(errorValue.message, true);
    } finally {
      busy = false;
      syncSelection();
    }
  }

  async function exportVisible() {
    if (!await authorize('export')) return;
    const button = q('#messageCenterExport');
    if (button) button.disabled = true;
    try {
      const table = q('#messageCenterView table');
      if (!table) return;
      if (typeof window.bamcoExportTable === 'function') {
        await window.bamcoExportTable(table);
        return;
      }
      const X = await window.ensureBamcoXLSX();
      const data = [...table.rows].map(row => [...row.cells].map(cell => cell.textContent.trim()));
      const worksheet = X.utils.aoa_to_sheet(data);
      const workbook = X.utils.book_new();
      worksheet['!views'] = [{ rightToLeft: true }];
      worksheet['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: data[0].length - 1 } }) };
      X.utils.book_append_sheet(workbook, worksheet, 'ارسال پیام');
      workbook.Workbook = { Views: [{ RTL: true }] };
      X.writeFile(workbook, 'ارسال پیام.xlsx', { compression: true });
    } catch (errorValue) {
      toast(errorValue.message, true);
    } finally {
      syncSelection();
    }
  }

  window.bamcoTableData = window.bamcoTableData || {};
  window.bamcoTableData.messageCenterView = () => visible().map(row => ({
    id: String(row.recipient_id),
    values: [recipientName(row), row.active_count, row.warning_count, row.overdue_count, row.sticker_state, row.last_sent_at ? jalaliDateTime(row.last_sent_at) : '—']
  }));

  function syncFeatureAccess() {
    if (!can('view')) {
      rows = [];
      selected.clear();
      prepared = null;
      q('#messagePreviewDialog')?.close();
      render();
    }
    syncSelection();
  }

  function refreshCurrentRecipientLabels(event) {
    const changed = new Set((event.detail?.ids || []).map(String));
    if (changed.size && rows.some(row => changed.has(String(row.recipient_id)))) render();
  }

  function install() {
    const nav = q('#nav');
    const workspace = q('.workspace');
    if (!workspace || q('#messageCenterView')) return;
    const style = document.createElement('style');
    style.id = 'bamcoMessageCenterCommandCss';
    style.textContent = '#messageCenterView .message-command-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;margin:0 0 12px;border-top:1px solid #d9e4de;border-bottom:1px solid #d9e4de}#messageCenterView .message-command-row button{font-weight:400!important}#messageCenterView .message-command-row #sendSelectedMessages{background:#218764!important;border-color:#218764!important;color:#fff!important}#messageCenterView table{border-collapse:collapse;width:100%}#messageCenterView table th,#messageCenterView table td{border:1px solid #cbd9d3}#messageCenterBody tr[data-id]{cursor:pointer}#messageCenterBody tr.suite-selected>td{background:#e9f4ef!important}';
    document.head.append(style);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.view = 'messageCenter';
    button.dataset.featureKey = feature();
    button.className = 'hidden';
    button.innerHTML = '<b>✉</b><span>ارسال پیام</span>';
    nav?.append(button);
    button.addEventListener('click', () => { void load(); });
    workspace.insertAdjacentHTML('beforeend', `<section id="messageCenterView" class="view hidden" data-feature-key="${esc(feature())}"><div class="panel table-panel"><div class="panel-head"><h3>ارسال پیام</h3></div><div class="message-command-row"><button type="button" class="ghost" id="messageCenterHome">بازگشت به خانه</button><button type="button" class="ghost" id="messageCenterExport" data-feature-key="${esc(feature())}" data-feature-action="export">خروجی اکسل</button><button type="button" class="ghost" id="refreshMessageCenter">تازه‌سازی</button><label class="message-channel-inline" data-feature-key="${esc(feature())}" data-feature-action="create">کانال ارسال<select id="messageChannel"><option value="portal">داخل سامانه</option><option value="email">ایمیل</option><option value="both">هر دو</option></select></label><button id="sendSelectedMessages" type="button" class="primary" data-feature-key="${esc(feature())}" data-feature-action="create" disabled>ارسال</button><span id="messageSelectionCount">۰ نفر انتخاب شده</span></div><p id="messageCenterError" role="alert"></p><div class="table-wrap"><table class="workspace-table"><thead><tr>${['نام', 'کار فعال', 'هشدار', 'دیرکرد', 'وضعیت پیام', 'آخرین ارسال'].map(label => '<th>' + label + '</th>').join('')}</tr></thead><tbody id="messageCenterBody"></tbody></table></div></div></section>`);
    document.body.insertAdjacentHTML('beforeend', '<dialog id="messagePreviewDialog" class="modal bamco-dialog"><div class="modal-head"><h3>بازبینی نهایی پیام</h3><button type="button" data-message-preview-close aria-label="بستن">×</button></div><div id="messagePreviewContent"></div><div class="modal-actions"><button type="button" data-message-preview-close class="ghost">انصراف</button><button id="confirmSendMessage" class="primary" data-feature-key="messageCenter" data-feature-action="create">تأیید و ارسال</button></div></dialog>');
    q('#refreshMessageCenter').onclick = () => { void load(true); };
    q('#messageCenterExport').onclick = exportVisible;
    q('#messageCenterHome').onclick = () => window.bamcoShowHome?.();
    q('#messageCenterBody').onclick = event => {
      if (event.target.closest('button,a,input,select,textarea')) return;
      const row = event.target.closest('tr[data-id]');
      if (row) toggleRecipient(row);
    };
    q('#messageCenterBody').onkeydown = event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const row = event.target.closest('tr[data-id]');
      if (!row) return;
      event.preventDefault();
      toggleRecipient(row);
    };
    q('#sendSelectedMessages').onclick = () => { void prepare([...selected]); };
    q('#confirmSendMessage').onclick = () => { void send(); };
    qa('[data-message-preview-close]').forEach(button => {
      button.onclick = () => { prepared = null; q('#messagePreviewDialog').close(); syncSelection(); };
    });
    window.addEventListener('bamco:feature-access-changed', syncFeatureAccess);
    document.addEventListener('bamco:profiles-updated', refreshCurrentRecipientLabels);
    syncSelection();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

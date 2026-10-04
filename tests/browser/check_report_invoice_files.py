"""Feature acceptance in real Chromium with wholly isolated in-memory API data."""
import asyncio, functools, http.server, json, os, shutil, threading, traceback
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright, expect
from run_smoke import MOCK, MSG_MOCK, login, click_route, settled, home
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results' / 'report-invoice-files'
FEATURE_MOCK = (Path(__file__).parent / 'mock-feature-files-api.js').read_text()
def fixture_pdf():
    stream = b'BT /F1 12 Tf 40 100 Td (Isolated report acceptance) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    data=b'%PDF-1.4\n'; offsets=[0]
    for number, body in enumerate(objects,1):
        offsets.append(len(data)); data+=str(number).encode()+b' 0 obj\n'+body+b'\nendobj\n'
    start=len(data); data+=b'xref\n0 6\n0000000000 65535 f \n'
    for offset in offsets[1:]: data+=f'{offset:010d} 00000 n \n'.encode()
    return data+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF'
PDF = {'name': 'report-fixture.pdf', 'mimeType': 'application/pdf', 'buffer': fixture_pdf()}

async def snapshot(page, name):
    # Dismiss visible transient notices through their real controls, never behind a modal.
    if await page.locator('dialog[open]').count() == 0:
        for _ in range(8):
            close=page.locator('.bamco-toast-close').first
            if not await close.count() or not await close.is_visible(): break
            await close.click()
    await page.screenshot(path=str(OUT / name), full_page=True)

async def check_report(page, width):
    await click_route(page, 'testReports'); await settled(page, 'testReports')
    await expect(page.locator('[data-report-domain]')).to_have_count(2)
    await expect(page.locator('#testReportsView')).to_contain_text('گزارش آزمون')
    await expect(page.locator('#testReportsBreadcrumbs')).not_to_contain_text('گزارش آزمون')
    await page.locator('[data-report-domain="environment"]').click()
    await expect(page.locator('[data-report-type]')).to_have_count(3)
    assert await page.locator('[data-report-type] strong').all_text_contents() == ['تحقیقاتی', 'انطباق تولید', 'تأیید نوع و تغییرات مهندسی']
    await snapshot(page, f'{width}-report-types.png')
    await page.locator('[data-report-type="research"]').click()
    await page.locator('[data-report-action="new-year"]').click()
    yearform = page.locator('#testReportYearForm')
    await expect(yearform).to_be_visible()
    assert await yearform.locator('[name="jalali_year"]').input_value() == await page.evaluate("new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',timeZone:'Asia/Tehran'}).format(new Date())")
    await yearform.locator('[name="jalali_year"]').fill('۱۴۰۵')
    await yearform.locator('[type="submit"]').click()
    await expect(page.locator('[data-report-year]')).to_have_count(1)
    await expect(page.locator('[data-report-year] time')).not_to_have_attribute('datetime', '')
    await page.locator('[data-report-action="new-year"]').click()
    await yearform.locator('[name="jalali_year"]').fill('۱۴۰۵'); await yearform.locator('[type="submit"]').click()
    await expect(yearform.locator('[data-report-error]')).to_contain_text('وجود دارد')
    assert await page.evaluate('__featureFiles.years.length') == 1
    await yearform.locator('[data-report-close]').last.click()
    await page.locator('[data-report-edit-year]').click()
    await yearform.locator('[name="jalali_year"]').fill('۱۴۰۴'); await yearform.locator('[type="submit"]').click()
    await expect(page.locator('[data-report-year]')).to_contain_text('۱۴۰۴')
    await page.locator('[data-report-year]').click(); await expect(page.locator('#testReportsBody')).to_contain_text('هنوز گزارشی')
    await page.locator('[data-report-action="upload"]').click()
    form = page.locator('#testReportFileForm')
    await form.locator('[name="title"]').fill('گزارش آزمون اولیه')
    await form.locator('[name="description"]').fill('شرح قابل مشاهده گزارش آزمون')
    await expect(form.locator('[data-bamco-file-picker]')).to_have_count(1)
    await expect(form.locator('[name="file"]')).not_to_have_attribute('multiple','')
    await form.locator('[name="file"]').set_input_files(PDF)
    await expect(form.locator('[data-file-name]')).to_have_text(PDF['name'])
    await snapshot(page, f'{width}-report-upload.png')
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#testReportsFileList')).to_contain_text('گزارش آزمون اولیه')
    await expect(page.locator('#testReportsFileList time')).not_to_have_attribute('datetime', '')
    await page.locator('[data-report-edit-file]').click()
    await form.locator('[name="title"]').fill('گزارش آزمایش بازبینی‌شده'); await form.locator('[type="submit"]').click()
    await expect(page.locator('#testReportsFileList')).to_contain_text('بازبینی‌شده')
    await page.locator('#testReportsSearch').fill('ناموجود'); await expect(page.locator('#testReportsBody')).to_contain_text('پیدا نشد')
    await page.locator('#testReportsSearch').fill('')
    await expect(page.locator('#testReportsView table')).to_have_count(0)
    await expect(page.locator('#testReportsFileList > .feature-document-row')).to_have_count(1)
    await expect(page.locator('.test-report-description')).to_contain_text('شرح قابل مشاهده گزارش آزمون')
    border=await page.locator('#testReportsBreadcrumbs').evaluate("e=>getComputedStyle(e).borderBottomWidth")
    assert border=='1px',border
    await page.locator('[data-report-preview]').click()
    await expect(page.locator('#testReportPreview')).to_be_visible()
    await expect(page.locator('#testReportPreview iframe')).to_have_count(1)
    await page.locator('#testReportPreview [data-report-close]').click()
    async with page.expect_download() as downloaded:
        await page.locator('[data-report-download]').click()
    file=await downloaded.value
    assert file.suggested_filename==PDF['name']
    assert Path(await file.path()).read_bytes()==PDF['buffer']
    await snapshot(page, f'{width}-report-files.png')
    await page.locator('[data-report-action="back"]').click()
    await page.locator('[data-report-delete-year]').click()
    await expect(page.locator('.bamco-toast[data-kind=error]').last).to_contain_text('فایل')
    await page.locator('.bamco-toast-close').last.click()
    assert await page.evaluate('__featureFiles.years.length') == 1
    await page.locator('[data-report-year]').click()
    await page.locator('[data-report-delete-file]').click(); await expect(page.locator('#bamcoNoticeDialog')).to_be_visible()
    await page.locator('[data-notice-cancel]').click(); assert await page.evaluate('__featureFiles.reports.length') == 1
    await page.locator('[data-report-delete-file]').click(); await page.locator('[data-notice-ok]').click()
    await expect(page.locator('#testReportsBody')).to_contain_text('هنوز گزارشی')
    await page.locator('[data-report-action="back"]').click(); await page.locator('[data-report-delete-year]').click(); await page.locator('[data-notice-ok]').click()
    await expect(page.locator('#testReportsBody')).to_contain_text('هنوز پوشه')
    assert await page.evaluate('__featureFiles.years.length') == 0
    await page.locator('[data-report-ancestor="root"]').click()
    await page.locator('[data-report-domain="standard"]').click(); await expect(page.locator('[data-report-type]')).to_have_count(3)
    await page.locator('[data-report-action="home"]').click(); await expect(page.locator('#homeView')).to_be_visible()

async def check_invoice(page, width):
    await click_route(page, 'invoices'); await settled(page, 'invoices')
    await page.locator('[data-invoice-action="new"]').click()
    form = page.locator('#invoiceForm')
    await form.locator('[name="invoice_number"]').fill('LOCAL-TEST-01')
    await form.locator('[name="title"]').fill('آزمایش محیط زیست')
    await form.locator('[name="company_name"]').fill('آزمایشگاه نمونه')
    await form.locator('[name="currency"]').select_option('IRT')
    amount = form.locator('[name="total_amount"]'); await amount.fill('۱۲۳۴۵۶۷۸۹۰.۲۵')
    await expect(amount).to_have_value('۱,۲۳۴,۵۶۷,۸۹۰.۲۵')
    await expect(amount).to_have_attribute('dir', 'ltr')
    await expect(form.locator('[data-bamco-file-picker]')).to_have_count(1)
    await form.locator('[name="proforma_file"]').set_input_files({**PDF, 'name':'proforma.pdf'})
    await expect(form.locator('[data-file-name]')).to_have_text('proforma.pdf')
    await snapshot(page, f'{width}-invoice-create.png')
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#invoiceDialog')).not_to_be_visible()
    await expect(page.locator('.invoice-detail')).to_contain_text('proforma.pdf')
    assert await page.evaluate('__featureFiles.invoices[0].total_amount') == '1234567890.25'
    assert await page.evaluate('__featureFiles.invoices[0].currency') == 'IRT'
    await expect(page.locator('[data-invoice-file-kind="final"]')).to_have_count(0)
    for index, value in enumerate(['1000000000.10', '234567890.15']):
        await page.locator('[data-invoice-action="payment"]').click()
        payment = page.locator('#invoicePaymentForm')
        await payment.locator('[name="amount"]').fill(value)
        await payment.locator('[name="status"]').select_option('paid')
        await payment.locator('[name="receipt_file"]').set_input_files({**PDF, 'name':f'receipt-{index+1}.pdf'})
        await payment.locator('[type="submit"]').click()
        await expect(page.locator('#invoicePaymentDialog')).not_to_be_visible()
        await expect(page.locator('.payment-row')).to_have_count(index+1)
    assert await page.evaluate("__featureFiles.files.filter(x=>x.file_type==='receipt').every((x,i)=>x.invoice_id===__featureFiles.invoices[0].id&&x.payment_id===__featureFiles.payments[i].id)")
    await expect(page.locator('[data-invoice-file-kind="final"]')).to_be_visible()
    await page.locator('[data-invoice-file-kind="final"]').click()
    await page.locator('#invoiceFileForm [name="file"]').set_input_files({**PDF, 'name':'final-invoice.pdf'})
    await page.locator('#invoiceFileForm [type="submit"]').click()
    await expect(page.locator('#invoiceFileDialog')).not_to_be_visible()
    await expect(page.locator('.invoice-detail')).to_contain_text('final-invoice.pdf')
    await snapshot(page, f'{width}-invoice-settled.png')
    await page.locator('.invoice-detail .project-detail-head').scroll_into_view_if_needed()
    await snapshot(page, f'{width}-invoice-overview.png')
    assert await page.evaluate('__featureFiles.invoices.length') == 1
    assert await page.evaluate('__featureFiles.payments.length') == 2
    assert await page.evaluate('__featureFiles.files.length') == 4
    # Each persisted action targets the actual original bytes and selected metadata row.
    file_id=await page.evaluate("__featureFiles.files.find(x=>x.file_type==='proforma').id")
    row=page.locator(f'[data-invoice-file-row="{file_id}"]')
    await expect(row.locator('[data-invoice-file-download] svg')).to_have_count(1)
    await expect(row.locator('[data-invoice-file-delete] svg')).to_have_count(1)
    async with page.expect_download() as downloaded:
        await row.locator('[data-invoice-file-download]').click()
    file=await downloaded.value
    assert file.suggested_filename=='proforma.pdf'
    assert Path(await file.path()).read_bytes()==PDF['buffer']
    await row.locator('[data-invoice-file-delete]').click()
    await expect(page.locator('#bamcoNoticeDialog')).to_be_visible()
    await page.locator('[data-notice-cancel]').click()
    assert await page.evaluate('__featureFiles.files.length') == 4
    await page.evaluate("__featureFiles.failNext='delete_invoice_file'")
    await row.locator('[data-invoice-file-delete]').click(); await page.locator('[data-notice-ok]').click()
    await expect(page.locator('.bamco-toast[data-kind=error]').last).to_contain_text('حذف فایل تأیید نشد')
    assert await page.evaluate('__featureFiles.files.length') == 4
    await row.locator('[data-invoice-file-delete]').click(); await page.locator('[data-notice-ok]').click()
    await expect(row).to_have_count(0)
    assert await page.evaluate('__featureFiles.files.length') == 3
    assert await page.evaluate('__featureFiles.payments.length') == 2
    receipt_id=await page.evaluate("__featureFiles.files.find(x=>x.file_type==='receipt').id")
    await page.locator(f'[data-invoice-file-delete="{receipt_id}"]').click(); await page.locator('[data-notice-ok]').click()
    await expect(page.locator(f'[data-invoice-file-row="{receipt_id}"]')).to_have_count(0)
    assert await page.evaluate("__featureFiles.files.filter(x=>x.file_type==='receipt').length") == 1
    assert await page.evaluate('__featureFiles.payments.length') == 2
    await page.locator('[data-invoice-action="back"]').click()
    await expect(page.locator('.invoice-list-card')).to_have_count(1)
    card=await page.locator('.invoice-list-card').bounding_box()
    heading=await page.locator('#invoiceFeatureRoot > .feature-toolbar').bounding_box()
    assert heading['y']>=0,heading
    assert card['height']>=90,card
    await snapshot(page, f'{width}-invoice-cards.png')
    await home(page)

async def wait_for_gate(page, endpoint):
    await page.wait_for_function("endpoint => window.__featureFiles.gates[endpoint]?.entered === true", arg=endpoint)

async def seed_foreign_invoice(page):
    # Only this new context gets synthetic grants. The shared smoke-test owner
    # remains view-only, and the application's real feature resolver is used.
    await page.evaluate("""bytes => {
      const api = window.__testApi, store = window.__featureFiles, foreign = api.profiles[0].id;
      const grant = api.featureAccess.find(row => row.feature_key === 'invoices');
      Object.assign(grant, { can_view: true, can_edit: true, can_delete: true });
      const created_at = new Date().toISOString();
      store.invoices.push({ id: '8101', invoice_number: 'FOREIGN-01', title: 'صورتحساب همکار دیگر',
        company_name: 'شرکت آزمایشی دیگر', account_party: 'شرکت آزمایشی دیگر', total_amount: '100.00',
        currency: 'IRR', created_by: foreign, follow_up_owner_id: foreign, status: 'partially_paid',
        description: 'توضیح ثبت‌شده', created_at, updated_at: created_at });
      store.payments.push({ id: '8201', invoice_id: '8101', sequence_no: 1, amount: '25.00',
        percent_of_total: '25.000', status: 'paid', created_by: foreign, created_at });
      const ready = { id: '8301', invoice_id: '8101', payment_id: null, file_type: 'proforma',
        bucket_id: 'invoices-private', file_name: 'foreign-ready.pdf', content_type: 'application/pdf',
        size_bytes: String(bytes.length), sha256: 'a'.repeat(64), client_request_id: 'foreign-ready-request',
        uploaded_by: foreign, upload_state: 'ready', storage_path: 'invoices/8101/foreign-ready.pdf', created_at };
      store.files.push(ready, { ...ready, id: '8302', file_name: 'foreign-pending-private.pdf',
        client_request_id: 'foreign-pending-request', upload_state: 'pending', storage_path: 'invoices/8101/foreign-pending.pdf' });
      store.fileBodies.set('invoices-private/' + ready.storage_path, new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    }""", list(PDF['buffer']))

async def assert_foreign_mutation_controls_present(page):
    # Identical action grants must expose identical controls on another creator's
    # invoice. Their pending reservation stays private to that uploader.
    for selector in ('[data-invoice-action="payment"]', '[data-invoice-action="delete"]',
                     '[data-invoice-payment-edit="8201"]', '[data-invoice-file-kind="proforma"]',
                     '[data-invoice-file-kind="receipt"]', '[data-invoice-file-delete="8301"]'):
        await expect(page.locator('#invoiceFeatureRoot ' + selector)).to_be_enabled()
    await expect(page.locator('#invoiceFeatureRoot [data-invoice-file-resume]')).to_have_count(0)

async def check_foreign_invoice(page, width):
    assert await page.evaluate("__testApi.actor.role") == 'owner'
    assert await page.evaluate("() => { const row = __featureFiles.invoices[0]; return row.created_by !== __testApi.actor.id && row.follow_up_owner_id !== __testApi.actor.id; }")
    await page.evaluate("__featureFiles.pauseNext('list_invoice_workspace')")
    await click_route(page, 'invoices')
    await wait_for_gate(page, 'list_invoice_workspace')
    await expect(page.locator('[data-invoice-load-status]')).to_be_visible()
    await page.locator('#invoiceSearch').fill('FOREIGN-01')
    await expect(page.locator('#invoiceSearch')).to_have_value('FOREIGN-01')
    await page.evaluate("__featureFiles.release('list_invoice_workspace')")
    await settled(page, 'invoices')
    await expect(page.locator('[data-invoice-select="8101"]')).to_be_visible()
    await expect(page.locator('[data-invoice-load-status]')).to_have_count(0)
    await expect(page.locator('#invoiceSearch')).to_have_value('FOREIGN-01')
    # Search may change the projection, but must not retire the only pending load.
    assert await page.evaluate("__featureFiles.calls.filter(call => call.endpoint === 'list_invoice_workspace').length") == 1
    await page.locator('#invoiceSearch').fill('ناموجود')
    await expect(page.locator('.invoice-list-card')).to_have_count(0)
    await page.locator('#invoiceSearch').press('Escape')
    await expect(page.locator('#invoiceSearch')).to_have_value('')
    await expect(page.locator('[data-invoice-select="8101"]')).to_be_visible()
    assert await page.evaluate("__featureFiles.workspaceResponses[0].files.map(row => row.id)") == ['8301']
    assert await page.evaluate("__featureFiles.files.some(row => row.id === '8302')"), 'pending fixture must exist on the mock server'
    await page.locator('[data-invoice-select="8101"]').click()
    await expect(page.locator('.payment-row')).to_have_count(1)
    await expect(page.locator('.invoice-detail')).to_contain_text('foreign-ready.pdf')
    await expect(page.locator('.invoice-detail')).not_to_contain_text('foreign-pending-private.pdf')
    await expect(page.locator('[data-invoice-file-row="8302"]')).to_have_count(0)
    await assert_foreign_mutation_controls_present(page)
    await expect(page.locator('[data-invoice-action="edit"]')).to_be_enabled()
    download = page.locator('[data-invoice-file-download="8301"]')
    await expect(download).to_be_enabled()
    async with page.expect_download() as downloaded:
        await download.click()
    file = await downloaded.value
    assert file.suggested_filename == 'foreign-ready.pdf'
    assert Path(await file.path()).read_bytes() == PDF['buffer']
    await snapshot(page, f'{width}-foreign-invoice-detail.png')

    await page.locator('[data-invoice-action="edit"]').click()
    form = page.locator('#invoiceForm')
    await expect(form.locator('[name="proforma_file"]')).to_have_count(1)
    await form.locator('[name="title"]').fill('ویرایش سراسری صورتحساب')
    await page.evaluate("__featureFiles.pauseNext('save_invoice')")
    await form.locator('[type="submit"]').click()
    await wait_for_gate(page, 'save_invoice')
    # Exercise the browser's native dialog cancel event, not a synthetic one.
    await page.keyboard.press('Escape')
    await expect(page.locator('#invoiceDialog')).to_be_visible()
    await expect(form.locator('[type="submit"]')).to_be_disabled()
    await page.evaluate("__featureFiles.release('save_invoice')")
    await expect(page.locator('#invoiceDialog')).not_to_be_visible()
    await expect(page.locator('.invoice-detail')).to_contain_text('ویرایش سراسری صورتحساب')
    await expect(page.locator('[data-invoice-load-status]')).to_have_count(0)
    assert await page.evaluate("__featureFiles.invoices[0].title") == 'ویرایش سراسری صورتحساب'
    await assert_foreign_mutation_controls_present(page)

    # Hold a refresh, then enter an editor while the cached card is available.
    # The stale response must not replace a draft. Native Escape must re-read
    # the current server value and leave the editor usable on the next open.
    await page.locator('[data-invoice-action="back"]').click()
    await page.evaluate("__featureFiles.pauseNext('list_invoice_workspace')")
    await page.locator('[data-invoice-action="refresh"]').click()
    await wait_for_gate(page, 'list_invoice_workspace')
    await page.locator('[data-invoice-select="8101"]').click()
    await page.locator('[data-invoice-action="edit"]').click()
    await form.locator('[name="description"]').fill('پیش‌نویس ذخیره‌نشده')
    response_count = await page.evaluate('__featureFiles.workspaceResponses.length')
    await page.evaluate("__featureFiles.invoices[0].title = 'تازه پس از Escape'; __featureFiles.release('list_invoice_workspace')")
    await page.wait_for_function('count => __featureFiles.workspaceResponses.length > count', arg=response_count)
    await expect(page.locator('#invoiceDialog')).to_be_visible()
    await expect(form.locator('[name="description"]')).to_have_value('پیش‌نویس ذخیره‌نشده')
    await page.keyboard.press('Escape')
    await expect(page.locator('#invoiceDialog')).not_to_be_visible()
    await expect(page.locator('.invoice-detail')).to_contain_text('تازه پس از Escape')
    await expect(page.locator('[data-invoice-load-status]')).to_have_count(0)
    await page.locator('[data-invoice-action="edit"]').click()
    await expect(form.locator('[name="title"]')).to_have_value('تازه پس از Escape')
    await expect(form.locator('[name="description"]')).to_have_value('توضیح ثبت‌شده')
    await page.keyboard.press('Escape')
    await expect(page.locator('#invoiceDialog')).not_to_be_visible()
    await expect(page.locator('[data-invoice-load-status]')).to_have_count(0)
    await assert_foreign_mutation_controls_present(page)
    await snapshot(page, f'{width}-foreign-invoice-escape-recovery.png')
    assert await page.evaluate("__featureFiles.calls.filter(call => call.endpoint === 'save_invoice').length") == 1
    assert not await page.evaluate("__featureFiles.calls.some(call => ['save_invoice_payment', 'reserve_invoice_file', 'invoice-file-upload', 'finalize_invoice_file', 'delete_invoice_file'].includes(call.endpoint) || (call.endpoint === 'invoices' && call.method === 'DELETE'))")
    assert await page.evaluate('__featureFiles.invoices.length') == 1
    assert await page.evaluate('__featureFiles.payments.length') == 1
    assert await page.evaluate('__featureFiles.files.length') == 2
    assert await page.evaluate('__featureFiles.uploads.length') == 0
    assert await page.evaluate('__featureFiles.expiredGates') == []
    assert await page.evaluate('Object.values(__featureFiles.gates).every(gate => gate.released && gate.finished)')

async def upload_invoice_file(page, kind, filename, payment_id=None):
    selector = f'[data-invoice-file-kind="{kind}"]'
    if payment_id is not None:
        selector += f'[data-payment-id="{payment_id}"]'
    await page.locator(selector).click()
    await page.locator('#invoiceFileForm [name="file"]').set_input_files({**PDF, 'name': filename})
    await page.locator('#invoiceFileForm [type="submit"]').click()
    await expect(page.locator('#invoiceFileDialog')).not_to_be_visible()
    await expect(page.locator('.invoice-detail')).to_contain_text(filename)
    return await page.evaluate('name => __featureFiles.files.find(row => row.file_name === name).id', filename)

async def download_invoice_file(page, file_id, filename):
    async with page.expect_download() as downloaded:
        await page.locator(f'[data-invoice-file-download="{file_id}"]').click()
    file = await downloaded.value
    assert file.suggested_filename == filename
    assert Path(await file.path()).read_bytes() == PDF['buffer']

async def remove_invoice_file(page, file_id):
    await page.locator(f'[data-invoice-file-delete="{file_id}"]').click()
    await expect(page.locator('#bamcoNoticeDialog')).to_be_visible()
    await page.locator('[data-notice-ok]').click()
    await expect(page.locator(f'[data-invoice-file-row="{file_id}"]')).to_have_count(0)

async def check_foreign_operations(page, width):
    # Continue the same foreign invoice after load/search/native Escape checks.
    await page.locator('[data-invoice-payment-edit="8201"]').click()
    form = page.locator('#invoicePaymentForm')
    await form.locator('[name="amount"]').fill('20.00')
    await form.locator('[name="notes"]').fill('ویرایش مرحله همکار دیگر')
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#invoicePaymentDialog')).not_to_be_visible()
    assert await page.evaluate("__featureFiles.payments.find(row => row.id === '8201').amount") == '20.00'
    await page.locator('[data-invoice-action="payment"]').click()
    await form.locator('[name="amount"]').fill('80.00')
    await form.locator('[name="status"]').select_option('paid')
    await form.locator('[name="receipt_file"]').set_input_files({**PDF, 'name': 'foreign-new-receipt.pdf'})
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#invoicePaymentDialog')).not_to_be_visible()
    await expect(page.locator('.payment-row')).to_have_count(2)
    assert await page.evaluate("__featureFiles.payments.filter(row => row.invoice_id === '8101').map(row => row.percent_of_total)") == ['20.000', '80.000']
    assert await page.evaluate("__featureFiles.invoices[0].created_by !== __testApi.actor.id && __featureFiles.invoices[0].follow_up_owner_id !== __testApi.actor.id")
    receipt_id = await page.evaluate("__featureFiles.files.find(row => row.file_name === 'foreign-new-receipt.pdf').id")
    original_receipt_id = await upload_invoice_file(page, 'receipt', 'foreign-original-stage-receipt.pdf', '8201')
    proforma_id = await upload_invoice_file(page, 'proforma', 'foreign-new-proforma.pdf')
    final_id = await upload_invoice_file(page, 'final', 'foreign-new-final.pdf')
    for file_id, filename in [(proforma_id, 'foreign-new-proforma.pdf'), (receipt_id, 'foreign-new-receipt.pdf'), (original_receipt_id, 'foreign-original-stage-receipt.pdf'), (final_id, 'foreign-new-final.pdf')]:
        await download_invoice_file(page, file_id, filename)
    assert await page.evaluate("__featureFiles.files.filter(row => ['proforma','receipt','final'].includes(row.file_type) && row.uploaded_by === __testApi.actor.id).length") == 4
    await snapshot(page, f'{width}-foreign-operation-parity.png')
    # Removing someone else's ready file has the same confirmation/cancellation
    # contract. A selected file never removes the invoice or payment itself.
    await page.locator('[data-invoice-file-delete="8301"]').click()
    await page.locator('[data-notice-cancel]').click()
    await expect(page.locator('[data-invoice-file-row="8301"]')).to_be_visible()
    await remove_invoice_file(page, '8301')
    for file_id in (proforma_id, receipt_id, original_receipt_id, final_id):
        await remove_invoice_file(page, file_id)
    assert await page.evaluate('__featureFiles.payments.length') == 2
    assert await page.evaluate("__featureFiles.payments.every(row => row.receipt_path == null)")
    assert await page.evaluate("__featureFiles.files.map(row => row.id)") == ['8302']
    # The hidden foreign pending reservation is never exposed as resumable.
    await expect(page.locator('[data-invoice-file-resume]')).to_have_count(0)
    await page.locator('[data-invoice-action="delete"]').click()
    await page.locator('[data-notice-cancel]').click()
    assert await page.evaluate('__featureFiles.invoices.length') == 1
    await page.locator('[data-invoice-action="delete"]').click()
    await page.locator('[data-notice-ok]').click()
    await expect(page.locator('.invoice-list-card')).to_have_count(0)
    assert await page.evaluate('[__featureFiles.invoices.length,__featureFiles.payments.length,__featureFiles.files.length]') == [0, 0, 0]
    assert await page.evaluate('__featureFiles.expiredGates') == []

async def prepare_view_only_foreign(page):
    await seed_foreign_invoice(page)
    await page.evaluate("""() => {
      const store = __featureFiles;
      Object.assign(__testApi.featureAccess.find(row => row.feature_key === 'invoices'),
        { can_view: true, can_create: false, can_edit: false, can_delete: false });
      store.payments[0].amount = '100.00'; store.payments[0].percent_of_total = '100.000';
      const original = store.files[0];
      const receipt = { ...original, id: '8303', file_type: 'receipt', payment_id: '8201',
        file_name: 'foreign-active-receipt.pdf', storage_path: 'invoices/8101/foreign-active-receipt.pdf', client_request_id: 'foreign-active-receipt' };
      store.files.push(receipt); store.payments[0].receipt_path = receipt.storage_path;
      store.fileBodies.set('invoices-private/' + receipt.storage_path, store.fileBodies.get('invoices-private/' + original.storage_path));
    }""")

async def check_view_only_foreign(page, width):
    await click_route(page, 'invoices'); await settled(page, 'invoices')
    await expect(page.locator('[data-invoice-action="new"]')).to_have_count(0)
    await page.locator('[data-invoice-select="8101"]').click()
    for selector in ('[data-invoice-action="edit"]', '[data-invoice-action="delete"]', '[data-invoice-file-resume]'):
        await expect(page.locator('#invoiceFeatureRoot ' + selector)).to_have_count(0)
    for selector in ('[data-invoice-action="payment"]', '[data-invoice-payment-edit="8201"]',
                     '[data-invoice-file-kind="receipt"]', '[data-invoice-file-delete="8303"]'):
        await expect(page.locator('#invoiceFeatureRoot ' + selector)).to_be_disabled()
    await expect(page.locator('#invoicePaymentAccessHint')).to_be_visible()
    await expect(page.locator('[data-invoice-file-row="8302"]')).to_have_count(0)
    await download_invoice_file(page, '8303', 'foreign-active-receipt.pdf')
    # Ordinary view-scoped files intentionally remain usable without edit/delete.
    for kind in ('proforma', 'final'):
        file_id = await upload_invoice_file(page, kind, f'viewer-{kind}.pdf')
        await download_invoice_file(page, file_id, f'viewer-{kind}.pdf')
        await remove_invoice_file(page, file_id)
    await remove_invoice_file(page, '8301')
    assert await page.evaluate('__featureFiles.invoices.length') == 1
    assert await page.evaluate('__featureFiles.payments.length') == 1
    assert await page.evaluate("__featureFiles.payments[0].receipt_path") == 'invoices/8101/foreign-active-receipt.pdf'
    assert not await page.evaluate("__featureFiles.calls.some(call => ['save_invoice','save_invoice_payment'].includes(call.endpoint) || (call.endpoint === 'invoices' && call.method === 'DELETE'))")
    await snapshot(page, f'{width}-foreign-view-only-actions.png')

async def check_phonebook(page, width):
    await click_route(page, 'phoneBook'); await settled(page, 'phoneBook')
    await expect(page.locator('.phonebook-command')).to_be_visible()
    border=await page.locator('.phonebook-command').evaluate("element=>({top:getComputedStyle(element).borderTopWidth,bottom:getComputedStyle(element).borderBottomWidth,style:getComputedStyle(element).borderTopStyle})")
    assert border['top']=='1px' and border['bottom']=='1px' and border['style']=='solid',border
    await snapshot(page, f'{width}-phonebook-toolbar.png')
    await page.locator('[data-phonebook-unit-select]').click()
    await expect(page.locator('.phonebook-table-command')).to_be_visible()
    unit_border=await page.locator('.phonebook-table-command').evaluate("element=>({top:getComputedStyle(element).borderTopWidth,bottom:getComputedStyle(element).borderBottomWidth,classes:element.className,parent:element.parentElement.className})")
    assert unit_border['top']=='1px',unit_border
    await home(page)

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            for width in [1365,390]:
                for role in ['manager', 'owner', 'viewer']:
                    context = await browser.new_context(viewport={'width':width,'height':900 if width>700 else 844},is_mobile=width<700,service_workers='block')
                    blocked = []
                    async def isolated_route(route):
                        parsed = urlsplit(route.request.url)
                        if f'{parsed.scheme}://{parsed.netloc}' == origin:
                            await route.continue_()
                        else:
                            blocked.append(route.request.url)
                            await route.abort('blockedbyclient')
                    async def isolated_socket(socket):
                        blocked.append(socket.url)
                        await socket.close()
                    # Fetch is fully mocked below; this guard also blocks image,
                    # XHR, worker, redirect, and WebSocket network escapes.
                    await context.route('**/*', isolated_route)
                    await context.route_web_socket('**/*', isolated_socket)
                    page = await context.new_page(); page.set_default_timeout(10000); errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    await page.add_init_script(MOCK+'\n'+MSG_MOCK+'\n'+FEATURE_MOCK)
                    try:
                        await page.goto(origin+'/',wait_until='load')
                        if role == 'owner': await seed_foreign_invoice(page)
                        if role == 'viewer': await prepare_view_only_foreign(page)
                        await login(page, 'owner' if role == 'viewer' else role)
                        if role == 'manager':
                            await check_report(page,width)
                            await check_invoice(page,width)
                            await check_phonebook(page,width)
                        elif role == 'owner':
                            await check_foreign_invoice(page,width)
                            await check_foreign_operations(page,width)
                        else:
                            await check_view_only_foreign(page,width)
                        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'), 'body overflow'
                        assert not errors,errors
                        results.append({'width':width,'role':role,'status':'passed','errors':errors,'blocked_external_requests':blocked})
                    except Exception:
                        await page.screenshot(path=str(OUT/f'{width}-{role}-failure.png'),full_page=True)
                        diagnostic=await page.evaluate("() => ({years:window.__featureFiles?.years,reports:window.__featureFiles?.reports,invoices:window.__featureFiles?.invoices,payments:window.__featureFiles?.payments,expiredGates:window.__featureFiles?.expiredGates,workspaceResponses:window.__featureFiles?.workspaceResponses,forms:[...document.querySelectorAll('dialog[open] form')].map(f=>({id:f.getAttribute('id'),namedId:typeof f.id,valid:f.checkValidity(),error:f.querySelector('[data-report-error],[data-invoice-save-status]')?.textContent})),lastCalls:(window.__featureFiles?.calls||[]).slice(-12).map(c=>({endpoint:c.endpoint,method:c.method,body:c.body instanceof FormData?Object.fromEntries(c.body.entries()):c.body}))})")
                        results.append({'width':width,'role':role,'status':'failed','error':traceback.format_exc(),'errors':errors,'diagnostic':diagnostic,'blocked_external_requests':blocked})
                    finally:
                        await context.close()
            await browser.close()
    finally:
        server.shutdown()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))
    assert len(results) == 6 and all(row['status']=='passed' for row in results)
if __name__=='__main__': asyncio.run(main())

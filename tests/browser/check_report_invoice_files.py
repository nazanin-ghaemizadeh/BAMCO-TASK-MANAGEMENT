"""Feature acceptance in real Chromium with wholly isolated in-memory API data."""
import asyncio, functools, http.server, json, os, shutil, threading, traceback
from pathlib import Path
from playwright.async_api import async_playwright, expect
from run_smoke import MOCK, MSG_MOCK, login, click_route, settled, home
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results' / 'report-invoice-files'
FEATURE_MOCK = (Path(__file__).parent / 'mock-feature-files-api.js').read_text()
PDF = {'name': 'report-fixture.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.7\n% Isolated acceptance fixture'}

async def snapshot(page, name):
    # Toasts can live behind an open native modal and are not clickable there.
    # Let their normal bounded lifetime finish; never mutate application DOM.
    await page.wait_for_function("() => !document.querySelector('.bamco-toast')", timeout=12000)
    await page.screenshot(path=str(OUT / name), full_page=True)

async def check_report(page, width):
    await click_route(page, 'testReports'); await settled(page, 'testReports')
    await expect(page.locator('[data-report-domain]')).to_have_count(2)
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
    await form.locator('[name="title"]').fill('گزارش آزمایش اولیه')
    await form.locator('[name="file"]').set_input_files(PDF)
    await form.locator('[type="submit"]').click()
    await expect(page.locator('#testReportsTable tbody')).to_contain_text('گزارش آزمایش اولیه')
    await expect(page.locator('#testReportsTable time')).not_to_have_attribute('datetime', '')
    await page.locator('[data-report-edit-file]').click()
    await form.locator('[name="title"]').fill('گزارش آزمایش بازبینی‌شده'); await form.locator('[type="submit"]').click()
    await expect(page.locator('#testReportsTable tbody')).to_contain_text('بازبینی‌شده')
    await page.locator('#testReportsSearch').fill('ناموجود'); await expect(page.locator('#testReportsBody')).to_contain_text('پیدا نشد')
    await page.locator('#testReportsSearch').fill('')
    await expect(page.locator('#testReportsView .reference-pagination')).to_have_count(1)
    await expect(page.locator('#testReportsTable .reference-filters')).to_have_count(1)
    await expect(page.locator('#testReportsView .suite-table-options')).to_have_count(1)
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
    await expect(amount).to_have_value('1,234,567,890.25')
    await expect(amount).to_have_attribute('dir', 'ltr')
    await form.locator('[name="proforma_file"]').set_input_files({**PDF, 'name':'proforma.pdf'})
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
    await page.locator('[data-invoice-action="back"]').click(); await home(page)

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
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
            for width in [1365,390]:
                context = await browser.new_context(viewport={'width':width,'height':900 if width>700 else 844},is_mobile=width<700)
                page = await context.new_page(); page.set_default_timeout(10000); errors=[]
                page.on('pageerror',lambda error:errors.append(str(error)))
                await page.add_init_script(MOCK+'\n'+MSG_MOCK+'\n'+FEATURE_MOCK)
                try:
                    await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='load')
                    await login(page,'manager')
                    await check_report(page,width)
                    await check_invoice(page,width)
                    await check_phonebook(page,width)
                    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'), 'body overflow'
                    assert not errors,errors
                    results.append({'width':width,'status':'passed','errors':errors})
                except Exception as error:
                    await page.screenshot(path=str(OUT/f'{width}-failure.png'),full_page=True)
                    diagnostic=await page.evaluate("() => ({years:window.__featureFiles?.years,reports:window.__featureFiles?.reports,invoices:window.__featureFiles?.invoices,payments:window.__featureFiles?.payments,forms:[...document.querySelectorAll('dialog[open] form')].map(f=>({id:f.getAttribute('id'),namedId:typeof f.id,valid:f.checkValidity(),error:f.querySelector('[data-report-error],[data-invoice-save-status]')?.textContent})),lastCalls:(window.__featureFiles?.calls||[]).slice(-12).map(c=>({endpoint:c.endpoint,method:c.method,body:c.body instanceof FormData?Object.fromEntries(c.body.entries()):c.body}))})")
                    results.append({'width':width,'status':'failed','error':traceback.format_exc(),'errors':errors,'diagnostic':diagnostic})
                await context.close()
            await browser.close()
    finally:
        server.shutdown()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print(json.dumps(results,ensure_ascii=False,indent=2))
    assert all(row['status']=='passed' for row in results)
if __name__=='__main__': asyncio.run(main())

"""Focused Chromium regression for performance/response reports and 15-second live sync."""
import asyncio, functools, http.server, threading
from pathlib import Path
from playwright.async_api import async_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).parent
FIXTURE=(HERE/'mock-api.js').read_text()+'\n'+(HERE/'mock-messaging-api.js').read_text()

async def login(page):
    await page.add_init_script(FIXTURE)
    await page.goto(page.base_url, wait_until='load', timeout=15000)
    await page.locator('[data-department="product"]').click()
    await page.locator('#email').fill('manager@example.test')
    await page.locator('#password').fill('Synthetic-test-password-729!')
    code=await page.locator('#loginVerification').get_attribute('data-code')
    for i,digit in enumerate(code):
        await page.locator('.verification-digit').nth(i).fill(digit)
    await page.locator('#loginForm button[type="submit"]').click()
    await page.locator('.welcome-dismiss').click()
    await expect(page.locator('#homeView')).to_be_visible()

async def open_home(page):
    await page.evaluate('window.bamcoShowHome?.()')
    await expect(page.locator('#homeView')).to_be_visible()
    await page.wait_for_timeout(80)

async def main():
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,args=['--no-sandbox'])
            for width in (1365,390):
                context=await browser.new_context(viewport={'width':width,'height':900 if width>700 else 844},is_mobile=width<700,has_touch=width<700)
                page=await context.new_page();page.base_url=f'http://127.0.0.1:{server.server_port}/';page.set_default_timeout(10000)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                await login(page)

                # Performance report: home -> real report nav click.
                await page.evaluate("window.bamcoHomeLayout.set('cards')")
                await page.locator('#nav [data-view="performanceReport"]').click(force=True)
                await expect(page.locator('#performanceReportView')).to_be_visible()
                await expect(page.locator('#performanceReportView .canonical-report')).to_have_count(1)
                await expect(page.locator('#performanceReportView [data-performance-from]')).to_be_visible()
                await expect(page.locator('#performanceReportView [data-performance-to]')).to_be_visible()
                await expect(page.locator('#performanceReportView [data-performance-clear]')).to_be_visible()
                assert await page.evaluate("state.view")=='performanceReport'

                # The card-home UI hides nav while a report is open, so verify response from its real entry path too.
                await open_home(page)
                await page.locator('#nav [data-view="responseReport"]').click(force=True)
                await expect(page.locator('#responseReportView')).to_be_visible()
                await expect(page.locator('#responseReportView .canonical-report')).to_have_count(1)
                rows=page.locator('#responseReportBody tr[data-delivery-id]')
                await expect(rows).to_have_count(3)
                bulk=page.locator('#responseReportView [data-response-bulk-delete]')
                await expect(bulk).to_be_disabled()
                await rows.first.click()
                await expect(bulk).to_be_enabled()
                assert await page.evaluate("state.view")=='responseReport'

                # A lightweight five-second change check; manual refresh must not reload the page.
                assert await page.evaluate("window.bamcoLiveSync?.interval") == 5000
                before=await page.evaluate("performance.getEntriesByType('navigation').length")
                await page.evaluate("window.bamcoLiveSync.refresh()")
                await page.wait_for_timeout(400)
                after=await page.evaluate("performance.getEntriesByType('navigation').length")
                assert before==after==1, (before,after)
                assert not errors, errors
                print(f'PASS width={width}: performance + response + live-sync',flush=True)
                await context.close()
            await browser.close()
    finally:
        server.shutdown()

if __name__=='__main__': asyncio.run(main())

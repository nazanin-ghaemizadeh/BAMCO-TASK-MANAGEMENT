"""Verify the single organization login is stable and has no workspace selector."""
import asyncio
import functools
import http.server
import json
import threading
from pathlib import Path

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
MOCK = (Path(__file__).parent / 'mock-api.js').read_text(encoding='utf-8')
MSG_MOCK = (Path(__file__).parent / 'mock-messaging-api.js').read_text(encoding='utf-8')
SELECTORS = ['#loginView', '#loginView .login-card', '#loginView .brand-lockup',
             '#loginView .brand-lockup img', '#loginForm', '#email', '#password',
             '#loginForm button[type="submit"]']


async def snapshot(page):
    return await page.evaluate(
        """selectors => Object.fromEntries(selectors.map(sel => {
          const el=document.querySelector(sel); if(!el) return [sel,null];
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          return [sel,{x:r.x,y:r.y,w:r.width,h:r.height,display:s.display,
            minHeight:s.minHeight,height:s.height,padding:s.padding,transform:s.transform}];
        }))""", SELECTORS)


async def run_case(browser, base, width, height):
    mobile = width < 700
    context = await browser.new_context(viewport={'width': width, 'height': height},
                                        is_mobile=mobile, has_touch=mobile)
    page = await context.new_page()
    page.set_default_timeout(8000)
    await page.add_init_script(MOCK + '\n' + MSG_MOCK)
    await page.add_init_script("""
      window.__entryLayoutShifts=[];
      try { new PerformanceObserver(list=>{
        for(const e of list.getEntries()) if(!e.hadRecentInput)
          window.__entryLayoutShifts.push({value:e.value,startTime:e.startTime});
      }).observe({type:'layout-shift',buffered:true}); } catch {}
    """)
    await page.goto(base, wait_until='domcontentloaded', timeout=15000)
    await expect(page.locator('#loginView')).to_be_visible()
    await expect(page.locator('#loginView .brand-lockup img')).to_have_count(1)
    await expect(page.locator('#departmentEntry')).to_have_count(0)
    await expect(page.locator('#departmentEntry [data-department], button[data-department]')).to_have_count(0)
    await expect(page.locator('#loginVerification')).to_have_count(0)
    await expect(page.locator('#email')).to_be_visible()
    await expect(page.locator('#password')).to_be_visible()

    marks = (0, 50, 100, 250, 500, 900, 1600)
    samples, previous = [], 0
    for mark in marks:
        if mark > previous:
            await page.wait_for_timeout(mark - previous)
        samples.append(await snapshot(page))
        previous = mark

    first, changes, max_delta = samples[0], [], 0.0
    for sample_index, sample in enumerate(samples[1:], 1):
        for selector in SELECTORS:
            before, after = first[selector], sample[selector]
            assert before and after, f'missing {selector}'
            for key in ('x', 'y', 'w', 'h'):
                delta = abs(float(before[key]) - float(after[key]))
                max_delta = max(max_delta, delta)
                if delta > 0.5:
                    changes.append((sample_index, selector, key, before[key], after[key]))
            for key in ('display', 'minHeight', 'height', 'padding', 'transform'):
                if before[key] != after[key]:
                    changes.append((sample_index, selector, key, before[key], after[key]))

    assert not changes, f'login layout changed: {json.dumps(changes, ensure_ascii=False)}'
    shifts = await page.evaluate('window.__entryLayoutShifts')
    cls = sum(float(item.get('value', 0)) for item in shifts)
    assert cls < 0.001, f'login CLS is {cls}: {json.dumps(shifts)}'
    assert await page.locator('#loginView .login-card').evaluate(
        "el => Math.abs((el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2) - innerWidth / 2) < 1")
    await page.evaluate("""() => {
      __testApi.actor=__testApi.profiles[1];
      __testApi.actor.workspace={key:'quality',schema_name:'bamco_quality',title:'کنترل کیفیت',is_system_manager:false};
    }""")
    await page.locator('#email').fill('quality-user')
    await page.locator('#password').fill('test-password')
    await page.locator('#loginForm button[type="submit"]').click()
    await expect(page.locator('#homeView')).to_be_visible(timeout=15000)
    assert await page.evaluate("window.BamcoWorkspace.key()==='quality'")
    assert await page.evaluate("document.documentElement.dataset.department==='quality'")
    assert await page.evaluate("__testApi.calls.some(call=>call.endpoint==='profiles'&&call.acceptProfile==='bamco_quality')")
    result = {'width': width, 'height': height, 'max_delta_px': max_delta,
              'cls': cls, 'samples': len(samples), 'status': 'passed'}
    print(json.dumps(result, ensure_ascii=False), flush=True)
    await context.close()
    return result


async def main():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True, args=['--no-sandbox'])
            base = f'http://127.0.0.1:{server.server_port}/'
            results = [await run_case(browser, base, 1365, 900),
                       await run_case(browser, base, 390, 844)]
            await browser.close()
        assert all(item['status'] == 'passed' for item in results)
    finally:
        server.shutdown()


if __name__ == '__main__':
    asyncio.run(main())

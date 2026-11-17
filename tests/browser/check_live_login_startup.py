import asyncio
import json
import time
from playwright.async_api import async_playwright

URL = "https://nazanin-ghaemizadeh.github.io/BAMCO-TASK-MANAGEMENT/?live-diagnostic=" + str(int(time.time()))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1365, "height": 900})
        errors, console_errors, failed, bad_responses = [], [], [], []
        page.on("pageerror", lambda e: errors.append({"message": str(e), "stack": e.stack}))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("requestfailed", lambda r: failed.append({"url": r.url, "failure": r.failure}))
        page.on("response", lambda r: bad_responses.append({"status": r.status, "url": r.url}) if r.status >= 400 else None)

        started = time.monotonic()
        response = await page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        dom_ms = round((time.monotonic() - started) * 1000)
        await page.wait_for_timeout(18000)

        result = await page.evaluate("""() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const resources = performance.getEntriesByType('resource')
            .filter(r => /bamco\\.bundle|auth-ui|department-entry|app-update|bamco\\.bundle\\.css/.test(r.name))
            .map(r => ({url:r.name, duration:Math.round(r.duration), transfer:r.transferSize,
              decoded:r.decodedBodySize, start:Math.round(r.startTime), responseEnd:Math.round(r.responseEnd)}));
          return {
            url: location.href,
            auth: typeof window.bamcoAuth,
            accept: typeof window.bamcoAuth?.accept,
            formReady: document.querySelector('#loginForm')?.dataset.bamcoCoreReady || null,
            submitDisabled: document.querySelector('#loginForm [type=submit]')?.disabled ?? null,
            visibleError: document.querySelector('#loginError')?.textContent || null,
            version: document.querySelector('meta[name="bamco-app-version"]')?.content || null,
            navigation: nav ? {domContentLoaded:Math.round(nav.domContentLoadedEventEnd),load:Math.round(nav.loadEventEnd),transfer:nav.transferSize} : null,
            resources
          };
        }""")
        result.update({
          "httpStatus": response.status if response else None,
          "domContentLoadedMs": dom_ms,
          "pageErrors": errors,
          "consoleErrors": console_errors[:30],
          "failedRequests": failed[:30],
          "badResponses": bad_responses[:30]
        })
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        await browser.close()
        if result["auth"] != "object" or result["accept"] != "function" or result["formReady"] != "1" or errors or failed:
            raise SystemExit("Live login startup diagnostic failed; see JSON above.")

asyncio.run(main())

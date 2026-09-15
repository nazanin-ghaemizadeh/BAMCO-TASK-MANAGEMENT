"""Run the full Chromium regression from the SPA's usable readiness boundary.

A single long-lived SPA can keep browser lifecycle events later than its usable state.
For release safety we wait for the late application modules themselves, then the
existing smoke suite proves that the event loop is alive, login works, and all routes
settle on desktop/mobile for manager/owner roles. This wrapper also guards the home
screen against delayed layout repairs: card geometry must remain stable after login.
"""
import asyncio
import run_smoke
from playwright.async_api import Page

_original_goto = Page.goto
_original_login = run_smoke.login

async def _spa_ready_goto(self, url, *args, **kwargs):
    kwargs['wait_until'] = 'commit'
    kwargs.setdefault('timeout', 15000)
    response = await _original_goto(self, url, *args, **kwargs)
    await self.wait_for_function(
        """() => window.bamcoSelection
          && window.bamcoDocumentsSites
          && window.bamcoFeaturePrefetch
          && document.querySelector('#lettersPanel')
          && document.querySelector('#departmentEntry')""",
        timeout=15000,
    )
    return response

async def _home_geometry(page):
    return await page.evaluate("""() => {
      const box = node => {
        const r = node.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 10) / 10);
      };
      const cards = [...document.querySelectorAll('#homeView #nav .nav-group')]
        .filter(node => {
          const style = getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length;
        })
        .map(box);
      return {
        settled: document.body.classList.contains('home-access-settled'),
        home: box(document.querySelector('#homeView')),
        topbar: box(document.querySelector('#appView > .card-topbar')),
        cards
      };
    }""")

async def _stable_login(page, role):
    await _original_login(page, role)
    before = await _home_geometry(page)
    assert before['settled'], 'home is visible before its layout is marked settled'
    await page.wait_for_timeout(1900)
    after = await _home_geometry(page)
    assert after['settled'], 'home lost settled state after login'
    assert len(before['cards']) == len(after['cards']), (before, after)
    for name in ('home', 'topbar'):
        assert max(abs(a-b) for a,b in zip(before[name], after[name])) <= 2, (name, before[name], after[name])
    for index, (first, second) in enumerate(zip(before['cards'], after['cards'])):
        assert max(abs(a-b) for a,b in zip(first, second)) <= 2, ('home-card', index, first, second)

Page.goto = _spa_ready_goto
run_smoke.login = _stable_login

if __name__ == '__main__':
    asyncio.run(run_smoke.main(False))

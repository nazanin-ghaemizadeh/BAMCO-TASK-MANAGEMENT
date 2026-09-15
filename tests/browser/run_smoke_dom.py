"""Run the full Chromium regression from the SPA's usable readiness boundary.

A single long-lived SPA can keep browser lifecycle events later than its usable state.
For release safety we wait for the late application modules themselves, then the
existing smoke suite proves that the event loop is alive, login works, and all routes
settle on desktop/mobile for manager/owner roles.
"""
import asyncio
import run_smoke
from playwright.async_api import Page

_original_goto = Page.goto

async def _spa_ready_goto(self, url, *args, **kwargs):
    kwargs['wait_until'] = 'commit'
    kwargs.setdefault('timeout', 15000)
    response = await _original_goto(self, url, *args, **kwargs)
    await self.wait_for_function(
        """() => window.bamcoSelection
          && window.bamcoDocumentsSites
          && document.querySelector('#lettersPanel')
          && document.querySelector('#departmentEntry')""",
        timeout=15000,
    )
    return response

Page.goto = _spa_ready_goto

if __name__ == '__main__':
    asyncio.run(run_smoke.main(False))

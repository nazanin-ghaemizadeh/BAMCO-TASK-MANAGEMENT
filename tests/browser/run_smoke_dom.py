"""Run the existing full Chromium regression from the SPA's usable readiness boundary.

The application intentionally starts authenticated media/background work after parsing;
those requests are not a safe definition of UI readiness. DOMContentLoaded still waits
for every deferred application script, and the existing smoke suite then checks the
real UI heartbeat plus every important route.
"""
import asyncio
import run_smoke
from playwright.async_api import Page

_original_goto = Page.goto

async def _dom_ready_goto(self, url, *args, **kwargs):
    kwargs['wait_until'] = 'domcontentloaded'
    kwargs.setdefault('timeout', 15000)
    return await _original_goto(self, url, *args, **kwargs)

Page.goto = _dom_ready_goto

if __name__ == '__main__':
    asyncio.run(run_smoke.main(False))

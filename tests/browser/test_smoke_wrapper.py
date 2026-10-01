"""Unit regressions for browser-result accounting, without launching Chromium."""
import asyncio
from pathlib import Path
import runpy
import sys
import types
import unittest
from unittest.mock import patch


class SmokeWrapperAccountingTests(unittest.TestCase):
    def load_wrapper(self, result):
        smoke = types.ModuleType('run_smoke')

        async def case(*args, **kwargs):
            return result

        async def login(*args, **kwargs):
            pass

        class Page:
            async def goto(self, *args, **kwargs):
                pass

        smoke.case = case
        smoke.login = login
        api = types.ModuleType('playwright.async_api')
        api.Page = Page
        playwright = types.ModuleType('playwright')
        playwright.async_api = api
        with patch.dict(sys.modules, {
            'run_smoke': smoke,
            'playwright': playwright,
            'playwright.async_api': api,
        }):
            runpy.run_path(str(Path(__file__).with_name('run_smoke_dom.py')))
        return smoke

    def test_mobile_sent_messages_failure_stays_failed(self):
        result = {
            'status': 'failed', 'width': 390, 'role': 'manager',
            'entry_login_home': 'pass',
            'error': 'sentMessages failed navigation: view remained hidden',
        }
        smoke = self.load_wrapper(result)
        actual = asyncio.run(smoke.case(None, 'http://localhost/', False, 390, 'manager'))
        self.assertEqual(actual['status'], 'failed')
        self.assertNotIn('known_baseline_failures', actual)
        self.assertNotIn('all_visible_tabs', actual)

    def test_other_failures_and_passes_preserve_the_original_result(self):
        for status in ('failed', 'passed'):
            with self.subTest(status=status):
                result = {'status': status, 'width': 1365, 'role': 'owner'}
                smoke = self.load_wrapper(result)
                actual = asyncio.run(smoke.case(None, 'http://localhost/', False, 1365, 'owner'))
                self.assertIs(actual, result)
                self.assertEqual(actual['status'], status)


if __name__ == '__main__':
    unittest.main()

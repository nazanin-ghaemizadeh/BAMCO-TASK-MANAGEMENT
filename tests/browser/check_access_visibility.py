"""Exhaustive access/navigation UI checks in isolated real Chromium.

Uses the actual shipped HTML, bundle and CSS at desktop/mobile widths. All API
responses are in-memory fixtures, and all non-loopback network requests are
aborted. No production login, API request, or data mutation can occur.

Run: python tests/browser/check_access_visibility.py
Optional: --role owner --width 390 --layout launcher --output /tmp/report.json
"""
import argparse
import asyncio
import functools
import http.server
import json
import threading
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright
from run_smoke import FIXTURE, login

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = {
    'people': 'people', 'accessMatrix': 'settings', 'organization': 'organization',
    'activeSessions': 'activeSessions', 'loginActivity': 'loginActivity',
    'messages': 'messages', 'messageCenter': 'messageCenter', 'sentMessages': 'sentMessages',
    'templates': 'templates', 'stickers': 'stickers', 'dashboard': 'dashboard',
    'performanceReport': 'performanceReport', 'pettyCash': 'pettyCash', 'invoices': 'invoices',
    'systemOptions': 'systemOptions', 'settings': 'settings', 'alertSettings': 'settings',
    'emailSettings': 'settings', 'kanban': 'kanban', 'archive': 'archive', 'taskTimeline': 'taskTimeline',
    'approvals': 'approvals', 'requestHistory': 'requestHistory', 'projects': 'projects',
    'vehiclePermanent': 'vehiclePermanent', 'vehicleTemporary': 'vehicleTemporary',
    'parts': 'parts', 'tools': 'tools', 'groupChat': 'groupChat', 'directMessages': 'directMessages',
    'taskChats': 'taskChats', 'documents': 'documents', 'testReports': 'documents',
    'sitesAccess': 'sitesAccess', 'lettersIncoming': 'letters', 'lettersOutgoing': 'letters',
    'userGuide': 'userGuide', 'phoneBook': 'phonebook', 'notes': 'notes', 'voiceAssistant': 'voiceAssistant',
}
INTERNAL = {'templates', 'alertSettings', 'emailSettings'}
GRANTABLE = [key for key in EXPECTED if key not in INTERNAL and key != 'accessMatrix']
VIEW_GRANTS = [{'feature_key': key, 'can_view': True, 'can_create': False,
                'can_edit': False, 'can_delete': False, 'can_export': False,
                'can_manage_access': False, 'can_bypass_approval': False}
               for key in sorted(set(EXPECTED.values()))]

DIAG = r'''() => {
 const shown = n => {if(!n)return false;const s=getComputedStyle(n),r=n.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&s.visibility!=='collapse'&&Number(s.opacity)!==0&&r.width>0&&r.height>0};
 const source = Object.fromEntries([...document.querySelectorAll('#nav [data-view]')].map(n=>[n.dataset.view,{shown:shown(n),hidden:n.hidden,disabled:n.disabled,class:n.className,display:getComputedStyle(n).display,allowed:n.dataset.bamcoFeatureAllowed}]));
 const groups = Object.fromEntries([...document.querySelectorAll('#nav .nav-group')].map(n=>[n.dataset.group,{shown:shown(n),trigger:shown(n.querySelector('.home-group-trigger')),class:n.className}]));
 return {route:window.Bamco.state.view,layout:document.querySelector('#homeView').dataset.layout,source,groups,
  views:[...document.querySelectorAll('.workspace > .view')].filter(shown).map(n=>n.id),
  catalog:Object.fromEntries(Object.entries(BamcoNavigationCatalog.byRoute).map(([k,r])=>[k,r.featureKey])),
  grantable:[...BamcoNavigationCatalog.accessMatrixRoutes],
  access:BamcoAccess.snapshot(),dialog:document.querySelector('.home-launcher-dialog').open};
}'''

async def home(page):
    await page.evaluate("() => {document.querySelector('.home-launcher-dialog')?.close();bamcoShowHome();}")
    await page.wait_for_function("() => Bamco.state.view==='home' && !document.querySelector('#homeView').classList.contains('hidden')")
    await page.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

async def one_case(browser, base, width, layout, role, scenario=None):
    case = {'width': width, 'layout': layout, 'role': role, 'routes': [], 'failures': [], 'errors': []}
    if scenario:
        case['scenario'] = scenario['id']
    grants = scenario['grants'] if scenario else VIEW_GRANTS
    by_feature = {row['feature_key']: row for row in grants}
    def allowed(route):
        return (not scenario or scenario.get('active') is not False) and (role == 'manager' or by_feature.get(EXPECTED[route], {}).get('can_manage_access' if route == 'accessMatrix' else 'can_view') is True)
    context = await browser.new_context(viewport={'width': width, 'height': 844 if width < 700 else 1000},
                                        is_mobile=width < 700, has_touch=width < 700, service_workers='block')
    page = await context.new_page()
    page.set_default_timeout(6000)
    page.on('pageerror', lambda error: case['errors'].append(str(error)))
    # Even an accidental transport regression cannot reach a live service.
    async def offline(route):
        if urlsplit(route.request.url).netloc == urlsplit(base).netloc:
            await route.continue_()
        else:
            await route.abort('blockedbyclient')
    await page.route('**/*', offline)
    await page.route_web_socket('**/*', lambda socket: socket.close())
    await page.add_init_script(FIXTURE + '\nwindow.__testApi.featureAccess=' + json.dumps(grants) + ';')
    try:
        await page.goto(base, wait_until='load', timeout=20000)
        await login(page, role)
        await page.evaluate('(layout)=>bamcoHomeLayout.set(layout)', layout)
        await page.wait_for_timeout(150)
        diag = await page.evaluate(DIAG)
        case['inventory'] = {'registered': len(diag['catalog']), 'grantable': len(diag['grantable']),
                             'nav': len(diag['source']), 'parents': len(diag['groups'])}
        if diag['catalog'] != EXPECTED:
            case['failures'].append({'inventory': 'catalog differs', 'actual': diag['catalog']})
        if sorted(diag['grantable']) != sorted(GRANTABLE) or len(diag['source']) != 37 or len(diag['groups']) != 12:
            case['failures'].append({'inventory': diag})
        for key, group in diag['groups'].items():
            group_routes = await page.evaluate('(key)=>BamcoNavigationCatalog.byKey[key].routes', key)
            expected_group = any(allowed(route) for route in group_routes if route not in INTERNAL)
            if group['shown'] != expected_group or (layout == 'launcher' and group['trigger'] != expected_group):
                case['failures'].append({'parent': key, 'detail': group})
        routes = [route for route in EXPECTED if route not in INTERNAL and allowed(route)]
        for route, source in diag['source'].items():
            if (not source['hidden'] and not source['disabled']) != allowed(route):
                case['failures'].append({'route': route, 'grant_nav_mismatch': source})
        if not allowed('accessMatrix'):
            admin = diag['source']['accessMatrix']
            if not admin['hidden'] or not admin['disabled']:
                case['failures'].append({'route': 'accessMatrix', 'unauthorized_nav': admin})
        for route in routes:
            try:
                await home(page)
                source = page.locator(f'#nav button[data-view="{route}"]')
                source_state = await source.evaluate('(n)=>({hidden:n.hidden,disabled:n.disabled,denied:n.dataset.bamcoAccessDenied})')
                assert not source_state['hidden'] and not source_state['disabled'] and source_state['denied'] != 'true', source_state
                if layout == 'launcher':
                    group = await page.evaluate('(r)=>BamcoNavigationCatalog.routeFor(r).groupKey', route)
                    await page.locator(f'#nav [data-group="{group}"] .home-group-trigger').click()
                    proxy = page.locator('.home-launcher-dialog [data-phonebook-section="office"]' if route == 'phoneBook'
                                         else f'.home-launcher-dialog [data-route="{route}"]')
                    assert await proxy.is_visible(), f'{route} missing or CSS-hidden in launcher'
                    await proxy.click()
                else:
                    assert await source.is_visible(), f'{route} CSS-hidden in cards layout'
                    await source.click()
                await page.wait_for_function('(r)=>Bamco.state.view===r&&!document.getElementById(r+"View").classList.contains("hidden")', arg=route)
                await page.wait_for_timeout(60)
                diag = await page.evaluate(DIAG)
                assert diag['route'] == route and diag['views'] == [route + 'View'], {'route': route, 'actual': diag['route'], 'views': diag['views']}
                assert await page.locator('#' + route + 'View').is_visible(), f'{route} rendered page CSS-hidden'
                # The same feature decision must also allow a direct route.
                await home(page)
                assert await page.evaluate('(r)=>BamcoNavigation.navigate(r)', route), f'{route} direct navigation failed'
                case['routes'].append(route)
            except Exception as error:
                failure = {'route': route, 'error': str(error), 'state': await page.evaluate(DIAG)}
                case['failures'].append(failure)
                print('VISIBILITY_FAILURE=' + json.dumps({'width': width, 'layout': layout, 'role': role, **failure}, ensure_ascii=False), flush=True)
        # Legacy/internal routes have no home button by design but must respect
        # their canonical feature grant when directly addressed.
        for route in INTERNAL:
            await home(page)
            if await page.evaluate('(r)=>BamcoNavigation.navigate(r)', route):
                case['failures'].append({'legacy_route': route, 'error': 'catalog-only legacy route unexpectedly rendered'})
        # Direct authorization is checked for every denied route, even when
        # a combination hides the entire parent card.
        for route in EXPECTED:
            if not allowed(route) and await page.evaluate('(r)=>BamcoNavigation.navigate(r)', route):
                case['failures'].append({'denied_route': route, 'error': 'direct navigation succeeded'})
        if role == 'owner' and not scenario:
            await home(page)
            await page.evaluate("async()=>{__testApi.featureAccess=[];await BamcoAccess.invalidate()}")
            await page.wait_for_timeout(60)
            denied = await page.evaluate(DIAG)
            for route, source in denied['source'].items():
                if not source['hidden'] or not source['disabled']:
                    case['failures'].append({'denied_route': route, 'source': source})
            for route in EXPECTED:
                if await page.evaluate('(r)=>BamcoNavigation.navigate(r)', route):
                    case['failures'].append({'denied_route': route, 'error': 'direct navigation succeeded'})
            # Realtime grant recovery must make an empty financial parent and
            # the actual invoice launcher/card immediately usable.
            await page.evaluate("()=>{__testApi.featureAccess=[{feature_key:'invoices',can_view:true}];document.dispatchEvent(new CustomEvent('bamco:domain-invalidated',{detail:{domain:'access'}}))}")
            await page.wait_for_function("()=>!document.querySelector('#nav [data-view=\"invoices\"]').hidden")
            await page.wait_for_timeout(60)
            recovered = await page.evaluate(DIAG)
            assert recovered['groups']['delivery']['shown'], 'regranted invoice has a CSS-hidden financial parent'
            if layout == 'cards':
                assert await page.locator('#nav [data-view="invoices"]').is_visible(), 'regranted invoice card CSS-hidden'
            else:
                await page.locator('#nav [data-group="delivery"] .home-group-trigger').click()
                assert await page.locator('.home-launcher-dialog [data-route="invoices"]').is_visible(), 'regranted invoice launcher option CSS-hidden'
            case['denied_routes'] = 40
            case['realtime_invoice_recovery'] = True
            # Access administration is controlled by the manage action, and
            # must work even without settings.view or people.view.
            await home(page)
            await page.evaluate("async()=>{__testApi.featureAccess=[{feature_key:'settings',can_view:false,can_manage_access:true}];await BamcoAccess.invalidate()}")
            await page.wait_for_timeout(60)
            if layout == 'launcher':
                await page.locator('#nav [data-group="people"] .home-group-trigger').click()
                await page.locator('.home-launcher-dialog [data-route="accessMatrix"]').click()
            else:
                await page.locator('#nav [data-view="accessMatrix"]').click()
            await page.wait_for_function("()=>Bamco.state.view==='accessMatrix'")
            assert await page.locator('#accessMatrixView').is_visible(), 'manage-only access matrix CSS-hidden'
            await home(page)
            assert await page.evaluate("()=>BamcoNavigation.navigate('accessMatrix')"), 'manage-only direct route rejected'
            await page.evaluate("async()=>{__testApi.featureAccess=[{feature_key:'settings',can_view:true,can_manage_access:false}];await BamcoAccess.invalidate()}")
            assert not await page.evaluate("()=>BamcoNavigation.navigate('accessMatrix')"), 'settings.view grants admin access'
            case['manage_only_access_matrix'] = True
    except Exception as error:
        case['failures'].append({'setup_or_refresh': str(error)})
    finally:
        await context.close()
    print('VISIBILITY_CASE=' + json.dumps({key: value for key, value in case.items() if key not in ('failures', 'errors')} | {'failures': len(case['failures']), 'errors': case['errors']}, ensure_ascii=False), flush=True)
    return case

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--role', choices=['owner', 'manager'])
    parser.add_argument('--width', type=int, choices=[1365, 390])
    parser.add_argument('--layout', choices=['launcher', 'cards'])
    parser.add_argument('--output', default='/tmp/bamco-access-visibility-browser.json')
    parser.add_argument('--scenario-file', help='Private anonymous scenario JSON; contents are never copied into the repository')
    parser.add_argument('--chromium', help='Optional local Chromium executable; otherwise uses the installed Playwright browser')
    args = parser.parse_args()
    handler = functools.partial(QuietHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    results = []
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True, **({'executable_path': args.chromium} if args.chromium else {}), args=['--no-sandbox'])
            scenarios = json.loads(Path(args.scenario_file).read_text())['scenarios'] if args.scenario_file else [None]
            for scenario in scenarios:
                roles = [scenario['role']] if scenario else ([args.role] if args.role else ['owner', 'manager'])
                for role in roles:
                    for width in [args.width] if args.width else [1365, 390]:
                        for layout in [args.layout] if args.layout else ['launcher', 'cards']:
                            results.append(await one_case(browser, base, width, layout, role, scenario))
            await browser.close()
    finally:
        server.shutdown()
    Path(args.output).write_text(json.dumps(results, ensure_ascii=False, indent=2))
    failures = sum(len(result['failures']) + len(result['errors']) for result in results)
    print(f'ACCESS_VISIBILITY: {len(results)} cases, {sum(len(result["routes"]) for result in results)} real route clicks, {failures} failures; {args.output}')
    if failures:
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(main())

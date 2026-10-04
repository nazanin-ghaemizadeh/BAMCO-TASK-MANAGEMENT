"""Home geometry + real touch navigation on Chromium and WebKit.

Only synthetic fixtures and a loopback server are allowed. There is no
production login or service request. Screenshots and bounds are CI artifacts.
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
SIZES = [(320, 568), (375, 812), (390, 844), (430, 932), (699, 900),
         (700, 900), (768, 1024), (844, 390), (980, 1700), (1200, 800),
         (1201, 900), (1365, 900), (1365, 600)]
GEOMETRY = r'''() => {
 const rect = n => {const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
 const visible = n => {const r=n.getBoundingClientRect(),c=getComputedStyle(n);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'};
 const nav=document.querySelector('#homeView #nav');
 const nodes=[...nav.querySelectorAll(':scope>.nav-group')].filter(visible);
 const mode=document.querySelector('#homeView').dataset.layout;
 return {mode,width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,
  scrollY,nav:rect(nav),footer:rect(document.querySelector('#homeFixedFooter')),
  columns:getComputedStyle(nav).gridTemplateColumns.split(' ').length,
  expectedOrder:mode==='custom'?bamcoHomeLayout.get().order:BamcoNavigationCatalog.groups.map(g=>g.key),
  groups:nodes.map(n=>({key:n.dataset.group,rect:rect(n),
   heading:rect(n.querySelector('.nav-group-toggle')),
   targets:[...n.querySelectorAll(mode==='cards'?'.nav-group-items>[data-view]':'.home-group-trigger')].filter(visible).map(b=>({key:b.dataset.view||n.dataset.group,rect:rect(b),text:b.textContent.trim(),scrollWidth:b.scrollWidth,clientWidth:b.clientWidth})),
   circle:mode==='cards'?null:rect(n.querySelector('.home-group-symbol')),
   label:mode==='cards'?null:rect(n.querySelector('.home-group-label'))})),
  header:[...document.querySelectorAll('.card-topbar>img,.card-topbar>strong,.card-topbar .header-tools')].map(rect),
  tools:[...document.querySelectorAll('.card-topbar #logoutBtn,.card-topbar #notificationBell,.card-topbar #headerSettingsBtn')].filter(visible).map(rect)};
}'''

def within(inner, outer, label):
    assert inner['x'] >= outer['x'] - 2 and inner['right'] <= outer['right'] + 2, (label, inner, outer)
    assert inner['y'] >= outer['y'] - 2 and inner['bottom'] <= outer['bottom'] + 2, (label, inner, outer)

def overlaps(a, b):
    return min(a['right'], b['right']) - max(a['x'], b['x']) > 2 and min(a['bottom'], b['bottom']) - max(a['y'], b['y']) > 2

def verify_home(d, width, height):
    assert d['width'] == width, ('unexpected layout viewport', d['width'], width)
    assert d['pageWidth'] <= width + 2, ('horizontal page overflow', d)
    assert len(d['groups']) == 12, ('missing groups', d)
    ordered=sorted(d['groups'],key=lambda g:(round(g['rect']['y']),-round(g['rect']['x'])))
    assert [g['key'] for g in ordered]==d['expectedOrder'], ('RTL/custom order changed',d)
    compact = width <= 1200 or height <= 680
    if compact:
        expected = (1 if width <= 620 else 2 if width <= 900 else 3) if d['mode']=='cards' else (2 if width <= 620 else 3 if width <= 900 else 4)
        assert d['columns'] == expected, ('unexpected column count', d)
    else:
        assert d['columns'] == 6, ('desktop columns changed', d)
    for index, group in enumerate(d['groups']):
        assert group['rect']['x'] >= -2 and group['rect']['right'] <= width + 2, ('group outside viewport', group)
        for target in group['targets']:
            within(target['rect'], group['rect'], target['key'])
            if compact:
                assert target['rect']['w'] >= 44 and target['rect']['h'] >= 43.5, ('small touch target', target)
                assert target['scrollWidth'] <= target['clientWidth'] + 2, ('text overflow', target)
        if group['circle']:
            within(group['circle'], group['rect'], group['key']+' circle')
            within(group['label'], group['rect'], group['key']+' label')
            assert abs(group['circle']['w'] - group['circle']['h']) < 2, ('non-circular icon', group)
        for other in d['groups'][index+1:]:
            assert not overlaps(group['rect'], other['rect']), ('overlapping groups', group, other)
    for node in d['header']:
        assert node['x'] >= -2 and node['right'] <= width + 2, ('header overflow', d)
    for index, node in enumerate(d['header']):
        for other in d['header'][index+1:]:
            assert not overlaps(node, other), ('header overlap', d)
    if width <= 760:
        assert all(r['w'] >= 44 and r['h'] >= 44 for r in d['tools']), ('small header control', d)
    if compact:
        assert d['footer']['y'] >= max(g['rect']['bottom'] for g in d['groups']) - 2, ('footer overlaps groups', d)
        rows = sorted(set(round(g['rect']['y']) for g in d['groups']))
        for top, next_top in zip(rows, rows[1:]):
            bottom = max(g['rect']['bottom'] for g in d['groups'] if abs(g['rect']['y'] - top) < 2)
            assert next_top - bottom <= 20, ('excessive row gap', d)

async def settle(page):
    await page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')

async def check_dialog(page):
    return await page.evaluate('''() => {
      const d=document.querySelector('.home-launcher-dialog'),box=d.getBoundingClientRect();
      const shown=[...d.querySelectorAll('.home-launcher-route')].map(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,w:r.width,h:r.height,scroll:n.scrollWidth,client:n.clientWidth}});
      const c=d.querySelector('.home-launcher-close').getBoundingClientRect(),routes=d.querySelector('.home-launcher-routes');
      return {open:d.open,top:box.top,bottom:box.bottom,left:box.left,right:box.right,close:{w:c.width,h:c.height,top:c.top,bottom:c.bottom},height:innerHeight,width:innerWidth,shown,scrollHeight:routes.scrollHeight,clientHeight:routes.clientHeight};
    }''')

async def one_case(browser, base, width, height, out):
    context = await browser.new_context(viewport={'width':width,'height':height},
        is_mobile=width<=1200,has_touch=width<=1200,service_workers='block')
    page=await context.new_page();page.set_default_timeout(8000)
    async def activate(locator):
        if width<=1200:await locator.tap()
        else:await locator.click()
    result={'width':width,'height':height,'layouts':[],'errors':[],'failures':[]}
    page.on('pageerror',lambda e:result['errors'].append(str(e)))
    async def offline(route):
        if urlsplit(route.request.url).netloc==urlsplit(base).netloc:
            await route.continue_()
        else: await route.abort('blockedbyclient')
    await page.route('**/*',offline)
    await page.route_web_socket('**/*',lambda socket:socket.close())
    await page.add_init_script(FIXTURE)
    try:
        await page.goto(base,wait_until='load')
        await login(page,'manager')
        await page.wait_for_function("document.body.classList.contains('home-layout-ready')")
        for mode in ['launcher','cards','custom','launcher','cards']:
            await page.evaluate('(mode)=>{bamcoShowHome();bamcoHomeLayout.set(mode)}',mode)
            if mode=='custom':
                # Set a genuinely non-default persisted order using the existing settings handler.
                await page.evaluate('''document.querySelector('#homeLayoutSettings [data-home-move="1"]').click()''')
            await settle(page)
            d=await page.evaluate(GEOMETRY);verify_home(d,width,height);result['layouts'].append(d)
            if mode in ['launcher','cards'] and sum(x['mode']==mode for x in result['layouts'])==1:
                await page.screenshot(path=str(out/f'{width}x{height}-{mode}.png'),full_page=True)
            # The final group must be reachable by normal page scrolling.
            tail=page.locator('#nav .nav-group-items>[data-view]:visible').last if mode=='cards' else page.locator('#nav .home-group-trigger:visible').last
            await tail.scroll_into_view_if_needed()
            tail_box=await tail.bounding_box()
            assert tail_box and tail_box['y']>=-1 and tail_box['y']+tail_box['height']<=height+1, ('last target clipped',tail_box)
            if mode!='cards':
                # Real tap, repeated dismiss/reopen, every route label, and
                # reaching the last item when landscape forces dialog scrolling.
                trigger=page.locator('#nav [data-group="tasks"] .home-group-trigger')
                for attempt in range(2):
                    await activate(trigger);await settle(page)
                    modal=await check_dialog(page)
                    assert modal['open'] and modal['top']>=-1 and modal['bottom']<=height+1,modal
                    assert modal['left']>=-1 and modal['right']<=width+1,modal
                    assert modal['close']['w']>=42 and modal['close']['h']>=42,modal
                    assert all(x['x']>=modal['left'] and x['right']<=modal['right']+1 and x['scroll']<=x['client']+2 for x in modal['shown']),modal
                    await page.locator('.home-launcher-route').last.scroll_into_view_if_needed()
                    scrolled=await check_dialog(page)
                    assert scrolled['close']['top']>=scrolled['top'] and scrolled['close']['bottom']<=scrolled['bottom'], ('close button scrolled away',scrolled)
                    await activate(page.locator('.home-launcher-close'))
                await activate(trigger);await activate(page.locator('.home-launcher-dialog [data-route="kanban"]'))
            else:
                await activate(page.locator('#nav [data-view="kanban"]'))
            await page.wait_for_function("Bamco.state.view==='kanban'&&!document.querySelector('#kanbanView').classList.contains('hidden')")
            await activate(page.locator('#kanbanView .content-back:visible').first)
            await page.wait_for_function("Bamco.state.view==='home'&&document.body.classList.contains('card-home-active')")
            await settle(page);verify_home(await page.evaluate(GEOMETRY),width,height)
        # Rotation changes the CSS viewport without reloading or losing mode.
        if width in [390,430]:
            await page.set_viewport_size({'width':height,'height':width})
            await settle(page);verify_home(await page.evaluate(GEOMETRY),height,width)
            await page.set_viewport_size({'width':width,'height':height})
            await settle(page);verify_home(await page.evaluate(GEOMETRY),width,height)
        if width==390:
            result['boundaries']=[]
            for boundary_width,boundary_height in [(620,844),(621,844),(760,844),(761,844),(900,844),(901,844),(1365,680),(1365,681)]:
                await page.set_viewport_size({'width':boundary_width,'height':boundary_height})
                for boundary_mode in ['launcher','cards','custom']:
                    await page.evaluate('(m)=>{bamcoShowHome();bamcoHomeLayout.set(m)}',boundary_mode)
                    await settle(page)
                    boundary=await page.evaluate(GEOMETRY)
                    verify_home(boundary,boundary_width,boundary_height)
                    result['boundaries'].append(boundary)
            await page.set_viewport_size({'width':width,'height':height})
        assert not result['errors'],result['errors']
    except Exception as error:
        result['failures'].append(str(error))
        await page.screenshot(path=str(out/f'{width}x{height}-failure.png'),full_page=True)
    finally: await context.close()
    print(json.dumps({'width':width,'height':height,'failures':result['failures']},ensure_ascii=False),flush=True)
    return result

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

async def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser',choices=['chromium','webkit'],default='chromium')
    parser.add_argument('--output',default='test-results/home-responsive')
    args=parser.parse_args();out=ROOT/args.output/args.browser;out.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=ROOT))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    results=[]
    try:
        async with async_playwright() as p:
            browser=await getattr(p,args.browser).launch(headless=True)
            for width,height in SIZES:
                results.append(await one_case(browser,f'http://127.0.0.1:{server.server_port}/',width,height,out))
            await browser.close()
    finally:server.shutdown()
    (out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    failures=sum(len(r['failures']) for r in results)
    print(f'HOME_RESPONSIVE: {args.browser}: {len(results)} viewport cases, {failures} failures')
    if failures:raise SystemExit(1)

if __name__=='__main__':asyncio.run(main())

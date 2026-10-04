"""Check rendered Persian label centering and launcher input-modality focus.

Run with --browser chromium or --browser webkit. All account/API data are
synthetic, the server is loopback-only, and external network requests are
blocked. Range rectangles measure the actual rendered text lines rather than
the full-width label containers. Screenshots and diagnostics are CI artifacts.
"""
import argparse
import asyncio
import functools
import http.server
import json
import threading
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import async_playwright, expect
from run_smoke import FIXTURE, login


ROOT = Path(__file__).resolve().parents[2]
SIZES = [(390, 844), (780, 1688), (844, 390), (1365, 900)]
ROLES = ["manager", "owner"]
TRIGGER = '#nav [data-group="phonebook"] .home-group-trigger'
DIALOG = '.home-launcher-dialog'

# Keep the owner restricted while making the phonebook scenario available.
# This changes only the in-memory browser fixture, never an account or service.
OWNER_PHONEBOOK_GRANT = r'''() => {
 const grants=window.__testApi.featureAccess;
 if(!grants.some(g=>g.feature_key==='phonebook'))grants.push({
  feature_key:'phonebook',can_view:true,can_create:false,can_edit:false,
  can_delete:false,can_export:false,can_manage_access:false,can_bypass_approval:false
 });
}'''

HOME_TEXT = r'''() => {
 const rect=n=>{const r=n.getBoundingClientRect();return {
  x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,
  center:r.x+r.width/2
 }};
 const visible=n=>{
  if(!n)return false;
  const r=n.getBoundingClientRect(),s=getComputedStyle(n);
  return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible';
 };
 const glyphLines=label=>{
  const walker=document.createTreeWalker(label,NodeFilter.SHOW_TEXT),fragments=[];
  let node;
  while((node=walker.nextNode())){
   const text=node.textContent,start=text.search(/\S/);
   if(start<0)continue;
   const end=text.length-text.match(/\s*$/)[0].length;
   const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);
   for(const r of range.getClientRects())if(r.width>0&&r.height>0){
    fragments.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});
   }
  }
  // A bidi line can contain several rectangles. Union only fragments sharing
  // that rendered line; do not merge distinct wrapped lines into one box.
  const lines=[];
  for(const r of fragments.sort((a,b)=>a.top-b.top||a.left-b.left)){
   let line=lines.find(l=>Math.abs(l.top-r.top)<1.5&&Math.abs(l.bottom-r.bottom)<1.5);
   if(!line){line={...r};lines.push(line)}
   else{line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.right)}
  }
  return lines.map(l=>({...l,width:l.right-l.left,center:(l.left+l.right)/2}));
 };
 const home=document.querySelector('#homeView'),nav=home.querySelector('#nav');
 const groups=[...nav.querySelectorAll(':scope>.nav-group')]
  .filter(g=>visible(g)&&visible(g.querySelector('.home-group-trigger')))
  .map(g=>{
   const label=g.querySelector('.home-group-label'),style=getComputedStyle(label);
   return {key:g.dataset.group,text:label.textContent.trim(),group:rect(g),
    circle:rect(g.querySelector('.home-group-symbol')),label:rect(label),
    textAlign:style.textAlign,textAlignLast:style.textAlignLast,
    font:style.font,lines:glyphLines(label)};
  });
 const shown=new Set(groups.map(g=>g.key));
 const order=home.dataset.layout==='custom'?bamcoHomeLayout.get().order:
  BamcoNavigationCatalog.groups.map(g=>g.key);
 return {mode:home.dataset.layout,width:innerWidth,height:innerHeight,
  pageWidth:document.documentElement.scrollWidth,
  expectedOrder:order.filter(key=>shown.has(key)),groups};
}'''

DIALOG_FOCUS = r'''() => {
 const dialog=document.querySelector('.home-launcher-dialog');
 const rect=n=>{const r=n.getBoundingClientRect();return {
  x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom
 }};
 const outline=n=>{const s=getComputedStyle(n);return {
  width:parseFloat(s.outlineWidth)||0,style:s.outlineStyle,color:s.outlineColor,
  offset:parseFloat(s.outlineOffset)||0,radius:s.borderRadius,
  boxShadow:s.boxShadow
 }};
 const routes=[...dialog.querySelectorAll('.home-launcher-route')];
 return {open:dialog.open,origin:dialog.dataset.focusOrigin||'',rect:rect(dialog),
  width:innerWidth,height:innerHeight,
  activeIndex:routes.indexOf(document.activeElement),
  routes:routes.map(n=>({text:n.textContent.trim(),section:n.dataset.phonebookSection,
   focused:n===document.activeElement,focusVisible:n.matches(':focus-visible'),
   rect:rect(n),outline:outline(n),
   icon:rect(n.querySelector('.home-launcher-route-icon')),
   iconOutline:outline(n.querySelector('.home-launcher-route-icon'))}))};
}'''


def visible_outline(outline):
    return (outline['width'] > 0 and outline['style'] not in ['none', 'hidden']
            and outline['color'] not in ['transparent', 'rgba(0, 0, 0, 0)'])


def verify_text(data):
    assert data['groups'], ('no visible home groups', data)
    assert data['pageWidth'] <= data['width'] + 2, ('page overflows', data)
    ordered = sorted(data['groups'], key=lambda g: (round(g['group']['y']), -round(g['group']['x'])))
    assert [g['key'] for g in ordered] == data['expectedOrder'], ('RTL order changed', data)
    for group in data['groups']:
        assert group['lines'], ('no rendered text lines', group)
        for line in group['lines']:
            assert abs(line['center'] - group['circle']['center']) <= 2, (
                'glyph line is not centered under circle', group['key'], line, group)
            assert line['left'] >= group['group']['x'] - 2, ('label clipped on left', group)
            assert line['right'] <= group['group']['right'] + 2, ('label clipped on right', group)


def verify_focus(data, origin, index=0):
    assert data['open'] and data['origin'] == origin, ('wrong focus origin', data)
    assert len(data['routes']) >= 2, ('phonebook fixture must have multiple options', data)
    assert all(route['section'] for route in data['routes']), ('wrong launcher opened', data)
    assert data['activeIndex'] == index, ('focus moved to the wrong option', data)
    for i, route in enumerate(data['routes']):
        assert not visible_outline(route['outline']), ('rectangular route outline', route, data)
        ring = route['iconOutline']
        if origin == 'keyboard' and i == index:
            assert visible_outline(ring) and ring['width'] >= 2, ('missing keyboard circle ring', route, data)
            assert abs(route['icon']['width'] - route['icon']['height']) < 2, ('focus icon is not circular', route)
            radii = ring['radius'].replace('/', ' ').split()
            assert radii and all(value == '50%' for value in radii), ('keyboard ring is not circular', route)
        else:
            assert not visible_outline(ring), ('unexpected circle ring', route, data)


async def settle(page):
    await page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')


async def clear_notices(page):
    for notice in await page.locator('.bamco-toast-close').all():
        if await notice.is_visible():
            await notice.tap()
    await settle(page)
    assert await page.locator('.bamco-toast:visible').count() == 0, 'Toast obscures visual capture'


async def restored(page):
    await page.wait_for_function("() => !document.querySelector('.home-launcher-dialog').open")
    await expect(page.locator(TRIGGER)).to_be_focused()
    await settle(page)


async def sample_focus(page, result, origin, phase, index=0):
    await settle(page)
    state = await page.evaluate(DIALOG_FOCUS)
    result['focus'].append({'phase': phase, **state})
    verify_focus(state, origin, index)


async def check_modal_flow(page, result, out, prefix):
    trigger = page.locator(TRIGGER)
    await expect(trigger).to_be_visible()
    # A real touch activation must not inherit keyboard focus styling.
    await trigger.tap()
    await sample_focus(page, result, 'pointer', 'touch-open')
    await page.screenshot(path=str(out / f'{prefix}-phonebook-touch.png'))
    await page.locator(f'{DIALOG} .home-launcher-close').tap()
    await restored(page)

    await trigger.tap()
    await sample_focus(page, result, 'pointer', 'touch-reopen')
    await page.keyboard.press('Escape')
    await restored(page)

    # Enter is a real keyboard event; programmatic focus alone does not choose
    # keyboard modality. The first route stays focused for accessibility.
    await trigger.focus()
    await trigger.press('Enter')
    await sample_focus(page, result, 'keyboard', 'keyboard-open')
    await page.screenshot(path=str(out / f'{prefix}-phonebook-keyboard.png'))
    await page.keyboard.press('Tab')
    await sample_focus(page, result, 'keyboard', 'keyboard-tab', index=1)
    await page.keyboard.press('Escape')
    await restored(page)

    # Keyboard -> touch -> keyboard catches stale modality across closes.
    await trigger.tap()
    await sample_focus(page, result, 'pointer', 'touch-after-keyboard')
    await page.locator(f'{DIALOG} .home-launcher-close').tap()
    await restored(page)
    await trigger.press('Enter')
    await sample_focus(page, result, 'keyboard', 'keyboard-after-touch')
    await page.keyboard.press('Escape')
    await restored(page)


async def one_case(browser, base, role, width, height, out):
    # Keep touch enabled even at desktop width to exercise real tap modality
    # independently from layout width. Mobile viewport emulation stays scoped.
    context = await browser.new_context(viewport={'width': width, 'height': height},
                                       is_mobile=width <= 1200, has_touch=True,
                                       service_workers='block')
    page = await context.new_page()
    page.set_default_timeout(8000)
    result = {'role': role, 'width': width, 'height': height,
              'home': [], 'focus': [], 'errors': [], 'failures': []}
    page.on('pageerror', lambda error: result['errors'].append(str(error)))

    async def offline(route):
        if urlsplit(route.request.url).netloc == urlsplit(base).netloc:
            await route.continue_()
        else:
            await route.abort('blockedbyclient')

    await page.route('**/*', offline)
    await page.route_web_socket('**/*', lambda socket: socket.close())
    await page.add_init_script(FIXTURE)
    prefix = f'{role}-{width}x{height}'
    try:
        await page.goto(base, wait_until='load')
        if role == 'owner':
            await page.evaluate(OWNER_PHONEBOOK_GRANT)
        await login(page, role)
        await page.wait_for_function("() => document.body.classList.contains('home-layout-ready')")
        await page.evaluate('() => document.fonts.ready')
        for mode in ['launcher', 'custom']:
            await page.evaluate('(mode)=>{bamcoShowHome();bamcoHomeLayout.set(mode)}', mode)
            if mode == 'custom':
                await page.evaluate('''() => {
                 const move=document.querySelector('#homeLayoutSettings [data-home-move="1"]:not(:disabled)');
                 if(!move)throw new Error('No custom-order move control');move.click();
                }''')
            await clear_notices(page)
            # A neutral real tap clears focus left by the previous keyboard
            # scenario without changing navigation or any presentation styles.
            await page.locator('.card-topbar>strong').tap()
            await settle(page)
            data = await page.evaluate(HOME_TEXT)
            result['home'].append(data)
            await page.screenshot(path=str(out / f'{prefix}-{mode}-home.png'), full_page=True)
            verify_text(data)
            await check_modal_flow(page, result, out, f'{prefix}-{mode}')
            # Returning focus must not change home alignment or custom order.
            verify_text(await page.evaluate(HOME_TEXT))
        assert not result['errors'], result['errors']
    except Exception as error:
        result['failures'].append(str(error))
        try:
            await page.screenshot(path=str(out / f'{prefix}-failure.png'), full_page=True)
        except Exception as screenshot_error:
            result['screenshotError'] = str(screenshot_error)
    finally:
        await context.close()
    print(json.dumps({'role': role, 'width': width, 'height': height,
                      'failures': result['failures']}, ensure_ascii=False), flush=True)
    return result


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', choices=['chromium', 'webkit'], default='chromium')
    parser.add_argument('--output', default='test-results/home-visual-states')
    args = parser.parse_args()
    out = ROOT / args.output / args.browser
    out.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
        functools.partial(QuietHandler, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        async with async_playwright() as playwright:
            browser = await getattr(playwright, args.browser).launch(headless=True)
            try:
                for role in ROLES:
                    for width, height in SIZES:
                        results.append(await one_case(browser,
                            f'http://127.0.0.1:{server.server_port}/', role, width, height, out))
            finally:
                await browser.close()
    finally:
        server.shutdown()
        server.server_close()
    (out / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
    failures = sum(len(result['failures']) for result in results)
    print(f'HOME_VISUAL_STATES: {args.browser}: {len(results)} role/viewport cases, {failures} failures')
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())

"""Profile-photo and plain workload-label regressions; all APIs are isolated."""
import asyncio
import functools
import http.server
import json
import os
import re
import shutil
import threading
from pathlib import Path

from playwright.async_api import async_playwright
from run_smoke import FIXTURE, home, login

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results' / 'avatar-workload'
DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')
INSTRUMENT = r"""
(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect;
  proto.clearRect = function(...args) {
    if (this.canvas.id === 'workloadChart') window.__workloadText = [];
    return clear.apply(this, args);
  };
  for (const method of ['fillText', 'strokeText']) {
    const original = proto[method];
    proto[method] = function(text, x, y, ...rest) {
      if (this.canvas.id === 'workloadChart') {
        (window.__workloadText ||= []).push({method, text: String(text), x, y, font: this.font});
      }
      return original.call(this, text, x, y, ...rest);
    };
  }
})();
"""

async def frame_settle(page):
    await page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await page.wait_for_timeout(150)

async def photo_state(page):
    return await page.evaluate('''() => {
      const avatar = document.querySelector('#avatar');
      const img = avatar?.querySelector('img');
      const rect = img?.getBoundingClientRect();
      return {count: avatar?.querySelectorAll('img').length || 0,
        decoded: !!(img?.complete && img.naturalWidth),
        width: rect?.width || 0, height: rect?.height || 0,
        fallback: avatar?.textContent.trim() || '',
        logos: document.querySelectorAll('#appView > .card-topbar > img').length};
    }''')

async def chart_state(page):
    calls = await page.evaluate('window.__workloadText || []')
    labels = [c for c in calls if c['method'] == 'fillText' and c['x'] >= 60
              and re.fullmatch(r'[0-9۰-۹]+', c['text'])]
    ticks = [c['text'].translate(DIGITS) for c in calls if c['method'] == 'fillText'
             and c['x'] < 60 and re.fullmatch(r'[0-9۰-۹]+', c['text'])]
    return {'counts': [int(c['text'].translate(DIGITS)) for c in labels],
            'outlined': any(c['method'] == 'strokeText' for c in calls),
            'ticks': ticks, 'labels': labels}

async def one_case(browser, base, width, role):
    mobile = width < 700
    context = await browser.new_context(viewport={'width': width, 'height': 844 if mobile else 900},
                                        is_mobile=mobile, has_touch=mobile)
    page = await context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    if os.getenv('BAMCO_OFFLINE') == '1':
        from offline_fixture import fixture_html
        html = fixture_html().replace('</script>', '</script><script>' + FIXTURE + '\n' + INSTRUMENT + '</script>', 1)
        await page.set_content(html, wait_until='load')
    else:
        await page.add_init_script(FIXTURE + '\n' + INSTRUMENT)
        await page.goto(base, wait_until='load')
    # The stored picture arrives late, after the welcome card has already closed.
    await page.evaluate('''() => {
      __testApi.profiles.forEach(p => p.avatar_path = p.id + '/avatar.png');
      __testApi.delay['avatar.png'] = 500;
      const p = {id:'00000000-0000-4000-8000-000000000004', full_name:'متولی دوم', role:'owner', active:true};
      __testApi.profiles.push(p);
      const original = __testApi.tasks[0];
      __testApi.tasks = [__testApi.tasks[1]];
      let id = 10;
      for (const [person, count] of [[__testApi.profiles[1],7],[p,4],[__testApi.profiles[0],1]]) {
        for (let i=0;i<count;i++) __testApi.tasks.push({...original,id:id++,owner_id:person.id,priority:i%2?'زیاد':'متوسط'});
      }
      __testApi.tasks.push({...original,id:99,status:'انجام شده',status_key:'done',archived:false});
    }''')
    await login(page, role)
    await page.wait_for_timeout(2200)
    await page.screenshot(path=str(OUT / f'{width}-{role}-home.png'))
    initial = await photo_state(page)
    # Only a genuine duplicate brand may be removed, not the profile photo.
    await page.evaluate('''() => {
      const bar=document.querySelector('#appView > .card-topbar');
      const logo=bar.querySelector(':scope > img');
      bar.append(logo.cloneNode(true));
      const marker=document.createElement('span');marker.textContent='';bar.append(marker);marker.remove();
    }''')
    await frame_settle(page)
    after_cleanup = await photo_state(page)
    await page.evaluate("window.bamcoHomeLayout.set('cards')")
    await page.locator('#nav [data-view="settings"]').click()
    await page.wait_for_timeout(800)
    preview = await page.locator('#profileAvatarPreview img').evaluate_all('(items) => items.length===1 && items[0].complete && items[0].naturalWidth>0')
    await home(page)
    await frame_settle(page)
    await page.wait_for_timeout(2200)
    after_settings = await photo_state(page)
    await page.locator('#nav [data-view="dashboard"]').click()
    await frame_settle(page)
    await page.wait_for_timeout(200)
    chart = await chart_state(page)
    await page.locator('#workloadChart').screenshot(path=str(OUT / f'{width}-{role}-workload.png'))
    await page.locator('#dashPriority').select_option(label='زیاد')
    await frame_settle(page)
    filtered = await chart_state(page)
    await page.locator('#resetDashFilters').click()
    await frame_settle(page)
    await page.set_viewport_size({'width': width+20, 'height': 844 if mobile else 900})
    await frame_settle(page)
    resized = await chart_state(page)
    # A user without a stored picture keeps the initial, not a broken image.
    await page.evaluate("state.profile.avatar_path=null; window.refreshProfileAvatar()")
    await home(page)
    await frame_settle(page)
    missing = await photo_state(page)
    result = {'width': width, 'role': role, 'initial': initial, 'after_cleanup': after_cleanup,
              'preview': preview, 'after_settings': after_settings,
              'chart': chart, 'filtered': filtered, 'resized': resized,
              'without_photo': missing, 'javascript_errors': errors}
    expected = [4,3,2,2,1] if role == 'manager' else [4,3]
    expected_filtered = [3,2] if role == 'manager' else [3]
    checks = {
        'photo_after_login': initial['count']==1 and initial['decoded'] and initial['width']>0,
        'photo_survives_cleanup': after_cleanup['count']==1 and after_cleanup['decoded'] and after_cleanup['logos']==1,
        'photo_survives_settings': bool(preview) and after_settings['count']==1 and after_settings['decoded'],
        'plain_counts': chart['counts']==expected and not chart['outlined'] and all(not c['font'].startswith('bold') for c in chart['labels']),
        'integer_axis': all(len(set(c['ticks']))==len(c['ticks']) for c in [chart,filtered,resized]),
        'filtered_counts': filtered['counts']==expected_filtered and not filtered['outlined'],
        'counts_after_resize': resized['counts']==expected and not resized['outlined'],
        'no_photo_fallback': missing['count']==0 and bool(missing['fallback']),
        'no_js_errors': not errors,
    }
    result['checks'] = checks
    result['passed'] = all(checks.values())
    await context.close()
    print(json.dumps({'width':width,'role':role,'checks':checks},ensure_ascii=False),flush=True)
    return result

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=ROOT))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    results = []
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or shutil.which('chromium'),
                                              headless=True,args=['--no-sandbox'])
            cases = [(1365,'manager'),(390,'manager'),(1365,'owner'),(390,'owner')]
            results = await asyncio.gather(*(one_case(browser,f'http://127.0.0.1:{server.server_port}/',width,role) for width,role in cases))
            await browser.close()
    finally:
        server.shutdown()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    assert all(r['passed'] for r in results), 'Avatar/workload regression failed; see test-results/avatar-workload/results.json'

if __name__ == '__main__':
    asyncio.run(main())

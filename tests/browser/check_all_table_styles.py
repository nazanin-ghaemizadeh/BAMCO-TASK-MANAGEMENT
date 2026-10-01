"""Inspect the rendered table contract on every register route with isolated data."""
import asyncio, functools, http.server, json, threading
from pathlib import Path
from playwright.async_api import async_playwright, expect
from run_smoke import MOCK, MSG_MOCK, login, click_route, home, settled

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results'/'table-style'
ROUTES=(
    'people','loginActivity','activeSessions','messageCenter','sentMessages',
    'performanceReport','systemOptions','kanban','archive','approvals',
    'requestHistory','pettyCash','vehiclePermanent','vehicleTemporary',
    'parts','lettersIncoming','lettersOutgoing','accessMatrix'
)
CONTACTS='''
const earlier=window.fetch;
window.fetch=(input,options)=>{
 const table=new URL(typeof input==='string'?input:input.url,location.href).pathname.split('/').pop();
 if(table==='phonebook_units')return Promise.resolve(new Response(JSON.stringify([
  {id:1,category:'office',title:'واحد اداری'},
  {id:2,category:'factory',title:'واحد کارخانه'},
  {id:3,category:'external',title:'واحد خارج از سازمان'}]),{status:200}));
 if(table==='contact_directory')return Promise.resolve(new Response(JSON.stringify([
  {id:11,category:'office',unit_id:1,full_name:'مخاطب اداری',role_title:'کارشناس'},
  {id:12,category:'factory',unit_id:2,full_name:'مخاطب کارخانه',role_title:'کارشناس'},
  {id:13,category:'external',unit_id:3,full_name:'مخاطب خارجی',role_title:'کارشناس'}]),{status:200}));
 return earlier(input,options);
};
'''

async def inspect(page, route, name):
    state=await page.evaluate('''id=>{
      const view=document.querySelector('#'+id+'View');
      const visible=e=>e&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0;
      const tables=[...view.querySelectorAll('table')].filter(t=>!t.closest('dialog')&&visible(t));
      const rgb=e=>getComputedStyle(e).backgroundColor;
      return tables.map(table=>{
        const th=table.tHead?.rows[0]?.cells[0],filter=table.tHead?.querySelector('tr:nth-child(2) th'),td=table.tBodies[0]?.rows[0]?.cells[0];
        const buttons=[...view.querySelectorAll('button')].filter(b=>visible(b)&&!b.closest('dialog'));
        const colors=[...new Set(buttons.map(b=>rgb(b)))];
        const coloredButtons=buttons.filter(b=>rgb(b)!=='rgb(255, 255, 255)').slice(0,4).map(b=>({html:b.outerHTML.slice(0,300),color:rgb(b)}));
        const first=table.getBoundingClientRect();
        const toolbar=[...view.querySelectorAll('.bamco-command-bar,.task-toolbar,.vehicle-toolbar,.cash-toolbar,.letter-toolbar,.manager-toolbar,.feature-toolbar-actions')].find(e=>visible(e)&&!e.closest('dialog'));
        return {head:th&&rgb(th),filter:filter&&rgb(filter),row:td&&rgb(td),font:th&&getComputedStyle(th).fontSize,
          line:th&&getComputedStyle(th).borderLeftColor,buttonColors:colors,coloredButtons,buttonCount:buttons.length,
          top:Math.round(first.top),toolbarBottom:toolbar&&Math.round(toolbar.getBoundingClientRect().bottom),
          wrapHeight:Math.round(table.parentElement.getBoundingClientRect().height),
          pager:!!view.querySelector('.table-pagination,#archivePager')};
      });
    }''',route)
    assert state, f'{name}: no visible table'
    print(name,json.dumps(state,ensure_ascii=False),flush=True)
    await page.screenshot(path=str(OUT/f'{name}.png'),full_page=False)
    for i,entry in enumerate(state):
        where=f'{name} table {i+1}'
        assert entry['head']=='rgb(232, 241, 237)', (where,'header',entry)
        assert entry['font']=='15px', (where,'font',entry)
        assert entry['line']=='rgb(214, 226, 218)', (where,'grid',entry)
        if entry['filter'] is not None: assert entry['filter']=='rgb(239, 245, 241)', (where,'filter',entry)
        assert entry['buttonColors'] in ([],['rgb(255, 255, 255)']), (where,'buttons',entry)
        if i==0 and entry['toolbarBottom'] is not None:
            assert entry['top']-entry['toolbarBottom']<180, (where,'table sits too far below toolbar',entry)
        assert entry['wrapHeight']>=40, (where,'collapsed table',entry)
    return state

async def inspect_toolbar(page, route):
    metrics = await page.locator('#'+route+'View').evaluate("""view => {
      const visible = e => e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
      const bars = [...view.querySelectorAll('.bamco-command-bar,.task-toolbar,.vehicle-toolbar,.cash-toolbar,.letter-toolbar,.manager-toolbar,.feature-toolbar-actions,.workspace-report-tools')].filter(visible);
      const controls = [...new Set(bars.flatMap(bar => [...bar.querySelectorAll('button,input[type="search"],.table-inline-search,.vehicle-search,.workspace-search')]))].filter(e => visible(e) && !e.closest('dialog'));
      return {controls: controls.map(e => ({label:e.getAttribute('aria-label') || e.textContent.trim() || e.placeholder, y:Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height/2)})), bars:bars.map(e => ({height:e.getBoundingClientRect().height,overflow:getComputedStyle(e).overflowX,client:e.clientWidth,scroll:e.scrollWidth}))};
    }""")
    assert metrics['controls'], (route, 'missing toolbar controls')
    centers = [item['y'] for item in metrics['controls']]
    assert max(centers)-min(centers) <= 6, (route, 'desktop toolbar splits across rows', metrics)
    assert all(item['height'] <= 64 for item in metrics['bars']), (route, 'oversized toolbar', metrics)
    return metrics

async def inspect_capabilities(page, route):
    view = page.locator('#'+route+'View')
    tables = view.locator('table:visible')
    count = await tables.count()
    assert count > 0, (route, 'no register table')
    assert await view.locator('.suite-table-options').count() == count, (route, 'missing or duplicated table settings')
    results = []
    for index in range(count):
        table = tables.nth(index)
        head = table.locator('thead tr').first.locator('th').first
        await expect(head).to_have_attribute('tabindex','0')
        await head.press('Enter')
        await expect(head).to_have_attribute('aria-sort','ascending')
        await head.press('Enter')
        await expect(head).to_have_attribute('aria-sort','descending')
        handle = head.locator('.suite-resize,.column-resize-handle,.vehicle-col-resize').first
        await expect(handle).to_have_attribute('tabindex','0')
        before = await head.evaluate('e=>e.getBoundingClientRect().width')
        await handle.press('ArrowLeft')
        after = await head.evaluate('e=>e.getBoundingClientRect().width')
        assert after > before + 4, (route, index, 'column width control did not resize', before, after)
        options = view.locator('.suite-table-options').nth(index)
        await options.locator('summary').click()
        await expect(options.locator('.suite-reset')).to_be_visible()
        await options.locator('.suite-reset').click()
        await options.locator('.suite-clear-sort').click()
        if await options.get_attribute('open') is not None:
            await options.locator('summary').click()
        results.append({'sort':'ascending/descending','resize':'keyboard','settings':'open/reset/clear'})
    return results

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    results={};problems=[]
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,args=['--no-sandbox'])
            page=await browser.new_page(viewport={'width':1920,'height':868})
            await page.add_init_script(MOCK+'\n'+MSG_MOCK+'\n'+CONTACTS)
            await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='commit')
            await page.wait_for_function("() => window.bamcoSelection && window.bamcoDocumentsSites && document.querySelector('#departmentEntry')")
            await login(page,'manager')
            for route in ROUTES:
                try:
                    await home(page)
                    await click_route(page,route)
                    await settled(page,route)
                    await page.wait_for_function("id=>[...document.querySelectorAll('#'+id+'View table')].some(t=>t.getBoundingClientRect().width>0)",arg=route,timeout=8000)
                    results[route]=await inspect(page,route,route)
                    results[route+'-toolbar']=await inspect_toolbar(page,route)
                    results[route+'-capabilities']=await inspect_capabilities(page,route)
                    if route in ('vehiclePermanent','vehicleTemporary'):
                        box=await page.locator(f'#{route}View .vehicle-panel').evaluate('e=>({radius:getComputedStyle(e).borderTopLeftRadius,pagerBottom:e.querySelector(".table-pagination")?.getBoundingClientRect().bottom,viewport:innerHeight,searchVisible:e.querySelector(".vehicle-search")?.getBoundingClientRect().width})')
                        assert box['radius']=='0px' and box['searchVisible']>150 and abs(box['pagerBottom']-box['viewport'])<6,(route,box)
                except Exception as exc:
                    problems.append(f'{route}: {exc}');print('STYLE_MISMATCH',route,exc,flush=True)
                    await page.screenshot(path=str(OUT/(route+'-failure.png')),full_page=False)
            for category in ('office','factory','external'):
                key='phoneBook-'+category
                try:
                    await home(page)
                    await page.evaluate('name=>window.bamcoPhonebook.open(name)',category)
                    await settled(page,'phoneBook')
                    await page.locator('#phoneBookView [data-phonebook-unit-select]').first.click()
                    await page.wait_for_function("() => document.querySelector('#phoneBookView .phonebook-table')?.getBoundingClientRect().width>0")
                    results[key]=await inspect(page,'phoneBook',key)
                    results[key+'-toolbar']=await inspect_toolbar(page,'phoneBook')
                    results[key+'-capabilities']=await inspect_capabilities(page,'phoneBook')
                    metrics=await page.locator('#phoneBookView .phonebook-table-area').evaluate('e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,viewport:innerHeight})')
                    assert abs(metrics['bottom']-metrics['viewport'])<6,(key,'footer is not at the bottom',metrics)
                    assert metrics['top']<160,(key,'table starts too low',metrics)
                except Exception as exc:
                    problems.append(f'{key}: {exc}');print('STYLE_MISMATCH',key,exc,flush=True)
                    await page.screenshot(path=str(OUT/(key+'-failure.png')),full_page=False)
            # Invoices deliberately uses cards, not an HTML register table.
            await home(page)
            await click_route(page,'invoices')
            await settled(page,'invoices')
            await expect(page.locator('#invoiceFeatureRoot .enterprise-card-list')).to_be_visible()
            results['invoices']={'layout':'cards','toolbar':await inspect_toolbar(page,'invoices')}
            await page.screenshot(path=str(OUT/'invoices-cards.png'),full_page=False)
            await page.set_viewport_size({'width':390,'height':844})
            for route in ('activeSessions','loginActivity','vehiclePermanent','vehicleTemporary'):
                await home(page)
                await click_route(page,route)
                await settled(page,route)
                bounds=await page.evaluate('({page:document.documentElement.scrollWidth,viewport:innerWidth})')
                assert bounds['page'] <= bounds['viewport']+2, (route,'mobile page overflows',bounds)
                results[route+'-mobile']=bounds
                await page.screenshot(path=str(OUT/(route+'-mobile.png')),full_page=False)
            (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
            await browser.close()
            assert not problems,problems
    finally:
        server.shutdown()

if __name__=='__main__': asyncio.run(main())

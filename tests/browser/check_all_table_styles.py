"""Inspect the rendered table contract on every register route with isolated data."""
import asyncio, functools, http.server, json, threading
from pathlib import Path
from playwright.async_api import async_playwright
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
        const first=table.getBoundingClientRect();
        const toolbar=[...view.querySelectorAll('.bamco-command-bar,.task-toolbar,.vehicle-toolbar,.cash-toolbar,.letter-toolbar,.manager-toolbar,.feature-toolbar-actions')].find(e=>visible(e)&&!e.closest('dialog'));
        return {head:th&&rgb(th),filter:filter&&rgb(filter),row:td&&rgb(td),font:th&&getComputedStyle(th).fontSize,
          line:th&&getComputedStyle(th).borderLeftColor,buttonColors:colors,buttonCount:buttons.length,
          top:Math.round(first.top),toolbarBottom:toolbar&&Math.round(toolbar.getBoundingClientRect().bottom),
          wrapHeight:Math.round(table.parentElement.getBoundingClientRect().height),
          pager:!!view.querySelector('.table-pagination,#archivePager')};
      });
    }''',route)
    assert state, f'{name}: no visible table'
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
    await page.screenshot(path=str(OUT/f'{name}.png'),full_page=False)
    return state

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    results={}
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(headless=True,args=['--no-sandbox'])
            page=await browser.new_page(viewport={'width':1920,'height':868})
            await page.add_init_script(MOCK+'\n'+MSG_MOCK+'\n'+CONTACTS)
            await page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='commit')
            await page.wait_for_function("() => window.bamcoSelection && window.bamcoDocumentsSites && document.querySelector('#departmentEntry')")
            await login(page,'manager')
            for route in ROUTES:
                await home(page)
                await click_route(page,route)
                await settled(page,route)
                await page.wait_for_function("id=>[...document.querySelectorAll('#'+id+'View table')].some(t=>t.getBoundingClientRect().width>0)",arg=route,timeout=8000)
                results[route]=await inspect(page,route,route)
                print(route,json.dumps(results[route],ensure_ascii=False),flush=True)
            for category in ('office','factory','external'):
                await home(page)
                await page.evaluate('name=>window.bamcoPhonebook.open(name)',category)
                await settled(page,'phoneBook')
                await page.locator('#phoneBookView [data-phonebook-unit-select]').first.click()
                await page.wait_for_function("() => document.querySelector('#phoneBookView .phonebook-table')?.getBoundingClientRect().width>0")
                key='phoneBook-'+category
                results[key]=await inspect(page,'phoneBook',key)
                metrics=await page.locator('#phoneBookView .phonebook-table-area').evaluate('e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,viewport:innerHeight})')
                assert abs(metrics['bottom']-metrics['viewport'])<6,(key,'footer is not at the bottom',metrics)
                assert metrics['top']<160,(key,'table starts too low',metrics)
                print(key,json.dumps(results[key],ensure_ascii=False),flush=True)
            (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
            await browser.close()
    finally:
        server.shutdown()

if __name__=='__main__': asyncio.run(main())

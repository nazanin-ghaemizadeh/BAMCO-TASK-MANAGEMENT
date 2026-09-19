"""Rendered-font regression using isolated API data. Never touches real accounts."""
import asyncio,functools,http.server,json,os,threading
from pathlib import Path
from playwright.async_api import async_playwright
from run_smoke import FIXTURE,login
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results'/'table-typography'
async def main():
 OUT.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  async with async_playwright() as p:
   kwargs={'headless':True}
   if os.environ.get('BAMCO_CHROMIUM_PATH'):kwargs['executable_path']=os.environ['BAMCO_CHROMIUM_PATH']
   browser=await p.chromium.launch(**kwargs);page=await browser.new_page(viewport={'width':1365,'height':900})
   await page.add_init_script(FIXTURE);await page.goto(f'http://127.0.0.1:{server.server_port}/');await login(page,'manager')
   await page.evaluate('''()=>{
    const dialog=document.createElement('dialog');dialog.id='fontRegression';dialog.className='bamco-dialog';
    dialog.innerHTML=`<h3>آزمایش فونت جدول</h3><table class="suite-table"><thead><tr><th>عنوان ECU</th><th>نمونه</th></tr></thead><tbody>
      <tr><td>انگلیسی</td><td><span id="latinProbe">BAMCO ECU ABS-123</span></td></tr>
      <tr><td>فارسی</td><td><span id="persianProbe">بررسی کالیبراسیون خودرو</span></td></tr>
      <tr><td>ترکیبی</td><td><span id="mixedProbe">تست ECU ABS نسخه ۲</span></td></tr>
      <tr><td>توپر</td><td><strong id="boldProbe">BAMCO ECU 123</strong></td></tr>
      <tr><td>کنترل</td><td><input id="inputProbe" value="BAMCO ECU"><select id="selectProbe"><option>BAMCO ECU</option><option>بررسی ECU</option></select></td></tr>
      <tr><td>پیوند</td><td><a id="linkProbe" href="#font">BAMCO-123</a></td></tr>
    </tbody></table>`;document.body.append(dialog);dialog.showModal();
    window.__fontClicks=0;document.querySelector('#linkProbe').addEventListener('click',e=>{e.preventDefault();window.__fontClicks++});
   }''')
   await page.evaluate('document.fonts.ready');await page.wait_for_timeout(100)
   cdp=await page.context.new_cdp_session(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');doc=await cdp.send('DOM.getDocument');results={}
   for name in ['latinProbe','persianProbe','mixedProbe','boldProbe','inputProbe','selectProbe','linkProbe']:
    selector='#'+name;style=await page.locator(selector).evaluate('e=>getComputedStyle(e).fontFamily')
    assert 'Times New Roman' in style and 'BamcoTablePersian' in style,(name,style)
    node=await cdp.send('DOM.querySelector',{'nodeId':doc['root']['nodeId'],'selector':selector});fonts=(await cdp.send('CSS.getPlatformFontsForNode',{'nodeId':node['nodeId']}))['fonts']
    results[name]={'style':style,'fonts':fonts}
   latin=results['latinProbe']['fonts'];persian=results['persianProbe']['fonts'];mixed=results['mixedProbe']['fonts']
   assert latin and all('nazanin' not in (f['familyName']+f.get('postScriptName','')).lower() for f in latin),latin
   assert any('nazanin' in (f['familyName']+f.get('postScriptName','')).lower() for f in persian),persian
   assert len(mixed)>=2,mixed
   if os.name=='nt':assert any('timesnewroman' in f.get('postScriptName','').replace('-','').lower() or f['familyName']=='Times New Roman' for f in latin),latin
   before=await page.locator('#fontRegression table').text_content();await page.locator('#linkProbe').click();assert await page.evaluate('__fontClicks')==1
   await page.wait_for_timeout(200);assert await page.locator('#fontRegression table').text_content()==before
   await page.screenshot(path=str(OUT/'desktop.png'));await page.set_viewport_size({'width':390,'height':844});await page.screenshot(path=str(OUT/'mobile.png'))
   (OUT/'fonts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('TABLE_FONTS='+json.dumps(results,ensure_ascii=False),flush=True);await browser.close()
 finally:server.shutdown()
if __name__=='__main__':asyncio.run(main())

"""Assert the post-welcome workspace and final persistent profile avatar are visible."""
import asyncio, functools, http.server, json, threading
from pathlib import Path
from playwright.async_api import async_playwright
from run_smoke import FIXTURE, login

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'test-results'/'post-welcome'

async def one_case(browser,base,width,role):
    mobile=width<700
    ctx=await browser.new_context(viewport={'width':width,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
    page=await ctx.new_page();page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.add_init_script(FIXTURE)
    await page.goto(base,wait_until='load',timeout=15000)
    await login(page,role)
    await page.wait_for_timeout(2200)
    diag=await page.evaluate('''()=>{
      const box=s=>{const n=document.querySelector(s);if(!n)return null;const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {top:Math.round(r.top),left:Math.round(r.left),width:Math.round(r.width),height:Math.round(r.height),display:c.display,visibility:c.visibility,opacity:c.opacity}};
      const groups=[...document.querySelectorAll('#homeView #nav>.nav-group')].filter(n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.width>0&&r.height>0});
      const avatar=document.querySelector('#avatar'),avatarImg=avatar?.querySelector('img[data-profile-avatar],img[data-final-top-avatar]');
      const storageCalls=(window.__testApi?.calls||[]).filter(x=>String(x.endpoint||'').includes('avatar'));
      return {innerHeight:innerHeight,scrollY:Math.round(scrollY),bodyClass:document.body.className,app:box('#appView'),topbar:box('#appView>.card-topbar'),home:box('#homeView'),nav:box('#homeView #nav'),firstGroup:groups[0]?(()=>{const r=groups[0].getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)}})():null,groups:groups.length,login:box('#loginView'),entry:box('#departmentEntry'),profile:{id:typeof state!=='undefined'?state.profile?.id:null,avatarPath:typeof state!=='undefined'?state.profile?.avatar_path:null,token:!!(typeof state!=='undefined'&&state.token),mediaGet:typeof window.bamcoMedia?.get,avatarRefresh:typeof window.bamcoTopbarAvatar?.refresh,finalAvatar:typeof window.bamcoFinalAvatar?.refresh},storageCalls,avatar:{html:avatar?.innerHTML||'',box:box('#avatar'),inTopbar:!!avatar?.closest('.card-topbar .header-tools'),hasImage:!!avatarImg,complete:!!avatarImg?.complete,naturalWidth:avatarImg?.naturalWidth||0}};
    }''')
    print('AVATAR_DIAG='+json.dumps({'width':width,'role':role,'diag':diag},ensure_ascii=False),flush=True)
    await page.screenshot(path=str(OUT/f'{width}-{role}.png'),full_page=False)
    result={'width':width,'role':role,'diag':diag,'javascript_errors':errors}
    assert not errors,result
    assert diag['app'] and abs(diag['app']['top'])<=2,result
    assert diag['topbar'] and 0<=diag['topbar']['top']<=4,result
    assert diag['home'] and diag['home']['top']<diag['innerHeight'],result
    assert diag['groups']>0 and diag['firstGroup'] and diag['firstGroup']['top']<diag['innerHeight'],result
    assert diag['bodyClass'].find('card-home-active')>=0,result
    assert diag['avatar']['inTopbar'],result
    assert diag['profile']['avatarPath'],result
    assert diag['profile']['avatarRefresh']=='function' or diag['profile']['finalAvatar']=='function',result
    assert diag['avatar']['hasImage'] and diag['avatar']['complete'] and diag['avatar']['naturalWidth']>0,result
    await ctx.close();return result

async def main():
    OUT.mkdir(parents=True,exist_ok=True)
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler);threading.Thread(target=server.serve_forever,daemon=True).start();base=f'http://127.0.0.1:{server.server_port}/'
    try:
      async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=['--no-sandbox']);results=[]
        for width,role in [(1365,'manager'),(390,'manager'),(1365,'owner'),(390,'owner')]: results.append(await one_case(browser,base,width,role))
        await browser.close()
    finally: server.shutdown()
    (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print('POST_WELCOME='+json.dumps(results,ensure_ascii=False))

if __name__=='__main__': asyncio.run(main())

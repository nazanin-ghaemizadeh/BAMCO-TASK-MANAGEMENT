"""Shipped Chromium Kanban supervision UI, all external traffic blocked."""
import argparse, asyncio, functools, http.server, json, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
from run_smoke import FIXTURE, login
ROOT=Path(__file__).resolve().parents[2]
SCRIPT=r'''(()=>{
const api=__testApi,baseFetch=window.fetch;
api.supervision=true;api.supervisorRole='head';
const child='00000000-0000-4000-8000-000000000101';
api.profiles.push({id:child,full_name:'زیرمجموعه آزمایشی',role:'owner',active:true});
api.tasks=[{id:101,legacy_id:101,title:'وظیفه زیرمجموعه آزمایشی',description:'Before',owner_id:child,created_by:child,status:'در حال انجام',priority:'متوسط',start_date:'2026-09-20',due_date:'2026-10-30',reminder_days:0,archived:false}];
api.featureAccess=[{feature_key:'kanban',can_view:false,can_edit:false},{feature_key:'dashboard',can_view:true}];
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,'https://bamco.test'),endpoint=url.pathname.split('/').pop(),method=init.method||'GET';let value;
 if(endpoint==='effective_feature_access')value={schema:'bamco.feature-access.v1',grants:api.featureAccess,kanban_supervision:api.supervision,kanban_supervised_owner_ids:api.supervision?[child]:[]};
 else if(['organization_scope_directory_with_avatars','organization_scope_directory'].includes(endpoint))value=[{position_id:1,parent_position_id:null,role_key:api.supervisorRole,occupant_id:api.profiles[1].id,occupant_full_name:'رئیس آزمایشی',occupant_active:true,is_current_position:true},{position_id:2,parent_position_id:1,role_key:'expert',occupant_id:child,occupant_full_name:'زیرمجموعه آزمایشی',occupant_active:true,is_current_position:false}];
 else if(endpoint==='task_status_view')value=api.supervision?api.tasks:[];
 else if(endpoint==='tasks'&&method==='PATCH'){
  const body=JSON.parse(init.body);api.calls.push({endpoint,method,body});const row=api.tasks.find(t=>'eq.'+t.id===url.searchParams.get('id'));Object.assign(row,body);value=[row];
 }
 if(value!==undefined)return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 return baseFetch(input,init);
};})();'''
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
async def case(browser,base,width,role,out):
 context=await browser.new_context(viewport={'width':width,'height':900})
 page=await context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 async def offline(route):
  if urlsplit(route.request.url).netloc==urlsplit(base).netloc:await route.continue_()
  else:await route.abort('blockedbyclient')
 await page.route('**/*',offline);await page.route_web_socket('**/*',lambda socket:socket.close())
 await page.add_init_script(FIXTURE+'\n'+SCRIPT+'\n__testApi.supervisorRole='+json.dumps(role)+';')
 try:
  await page.goto(base,wait_until='load');await login(page,'owner')
  await page.evaluate("async()=>{await bamcoOrganizationAccess.refresh();await refresh();BamcoNavigation.navigate('kanban')}")
  await page.locator('#kanbanBody tr[data-task-id="101"]').click()
  await page.locator('#kanbanEditBtn').click()
  await page.locator('#taskDialog').wait_for(state='visible')
  assert await page.locator('#taskDialogTitle').inner_text()=='ویرایش وظیفه'
  assert await page.locator('#taskForm [name=owner_id]').is_disabled()
  assert await page.locator('#taskForm [name=owner_id]').input_value()=='00000000-0000-4000-8000-000000000101'
  assert await page.evaluate("()=>[...document.querySelector('#taskForm [name=status]').options].filter(o=>['ثبت شده','انجام شده'].includes(o.value)).every(o=>o.disabled)")
  await page.locator('#taskForm [name=description]').fill('Edited in isolated browser')
  await page.locator('#saveTaskBtn').click()
  await page.wait_for_function("()=>__testApi.calls.some(c=>c.endpoint==='tasks'&&c.method==='PATCH')")
  patch=await page.evaluate("()=>__testApi.calls.find(c=>c.endpoint==='tasks'&&c.method==='PATCH').body")
  assert patch['owner_id']=='00000000-0000-4000-8000-000000000101' and patch['description']=='Edited in isolated browser'
  assert 'archived' not in patch
  await page.locator('#taskDialog').wait_for(state='hidden')
  await page.screenshot(path=str(out/f'{role}-{width}.png'),full_page=True)
  await page.evaluate("async()=>{__testApi.supervision=false;await BamcoAccess.invalidate()}")
  assert not await page.evaluate("()=>BamcoAccess.can('kanban','view')")
  assert not await page.evaluate("()=>bamcoOrganizationAccess.canDirectlyManageTask(__testApi.tasks[0])")
  assert not errors,errors
  return {'width':width,'role':role,'passed':True,'external_requests':'blocked'}
 finally:await context.close()
async def main():
 parser=argparse.ArgumentParser();parser.add_argument('--chromium');parser.add_argument('--width',type=int,choices=[1365,390]);parser.add_argument('--output',default='test-results/kanban-supervision');args=parser.parse_args()
 out=ROOT/args.output;out.mkdir(parents=True,exist_ok=True)
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=ROOT));threading.Thread(target=server.serve_forever,daemon=True).start()
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True,**({'executable_path':args.chromium} if args.chromium else {}),args=['--no-sandbox']);results=[]
   for width in ([args.width] if args.width else [1365,390]):
    for role in ['head','manager']:results.append(await case(browser,f'http://127.0.0.1:{server.server_port}/',width,role,out))
   await browser.close()
  (out/'results.json').write_text(json.dumps(results,indent=2));print(f'KANBAN_SUPERVISION: {len(results)} isolated Chromium cases PASS')
 finally:server.shutdown()
if __name__=='__main__':asyncio.run(main())

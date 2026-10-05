"""Shipped Chromium intake assignment UI, all external traffic blocked."""
import argparse, asyncio, functools, http.server, json, threading
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
from run_smoke import FIXTURE, login
ROOT=Path(__file__).resolve().parents[2]
SCRIPT=r'''(()=>{
const api=__testApi,baseFetch=window.fetch;
api.supervision=true;api.supervisorRole=api.supervisorRole||'head';api.actor=api.profiles[1];
const child='00000000-0000-4000-8000-000000000101',peer='00000000-0000-4000-8000-000000000102',parentManager='00000000-0000-4000-8000-000000000103';
const intakeCreators=()=>[api.profiles[1].id,child,...(api.supervisorRole==='head'?[parentManager]:[])];
api.profiles.push({id:child,full_name:'زیرمجموعه آزمایشی',role:'owner',active:true});
api.tasks=JSON.parse(sessionStorage.getItem('intake-assignment-rows')||'null')||[{id:101,legacy_id:101,title:'وظیفه ثبت‌شده برای تخصیص',description:'Before',owner_id:null,created_by:api.supervisorRole==='head'?parentManager:api.profiles[1].id,status:'ثبت شده',priority:'متوسط',start_date:null,due_date:null,reminder_days:0,archived:false,row_version:1},{id:102,title:'Outside task',owner_id:peer,created_by:peer,status:'در حال انجام',archived:false,row_version:1}];
api.featureAccess=[{feature_key:'kanban',can_view:false,can_edit:false},{feature_key:'dashboard',can_view:true}];
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,'https://bamco.test'),endpoint=url.pathname.split('/').pop(),method=init.method||'GET';let value;
 if(endpoint==='task_statuses')value=[['registered','ثبت شده','registered','none','none','none',false],['doing','در حال انجام','active','required','required','required',true],['waiting','منتظر پاسخ','waiting','required','optional','none',false],['done','انجام شده','completed','required','optional','optional',false]].map(([key,label,kind,owner_mode,start_mode,due_mode,tracks_deadline],i)=>({key,label,kind,owner_mode,start_mode,due_mode,tracks_deadline,active:true,sort_order:i+1,color:'#8b949e'}));
 else if(endpoint==='priorities')value=[{key:'medium',label:'متوسط',active:true,sort_order:1,color:'#f2a93b'}];
 else if(endpoint==='effective_feature_access')value={schema:'bamco.feature-access.v1',grants:api.featureAccess,kanban_supervision:api.supervision,kanban_assignment:api.supervision,kanban_intake_creator_ids:api.supervision?intakeCreators():[],kanban_supervised_owner_ids:api.supervision?[child]:[]};
 else if(['organization_scope_directory_with_avatars','organization_scope_directory'].includes(endpoint))value=[{position_id:1,parent_position_id:null,role_key:api.supervisorRole,occupant_id:api.profiles[1].id,occupant_full_name:'رئیس آزمایشی',occupant_active:true,is_current_position:true},{position_id:2,parent_position_id:1,role_key:'expert',occupant_id:child,occupant_full_name:'زیرمجموعه آزمایشی',occupant_active:true,is_current_position:false}];
 else if(endpoint==='task_status_view')value=api.supervision?api.tasks.filter(t=>t.owner_id===child||(!t.owner_id&&intakeCreators().includes(t.created_by))):[];
 else if(endpoint==='tasks'&&method==='PATCH'){
  const body=JSON.parse(init.body);api.calls.push({endpoint,method,body,version:url.searchParams.get('row_version')});const row=api.tasks.find(t=>'eq.'+t.id===url.searchParams.get('id')&&'eq.'+t.row_version===url.searchParams.get('row_version'));
  if(!api.supervision||!row||body.owner_id!==child)value=[];else{Object.assign(row,body,{row_version:row.row_version+1});sessionStorage.setItem('intake-assignment-rows',JSON.stringify(api.tasks));value=[row];}
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
 await page.add_init_script(FIXTURE+'\n__testApi.supervisorRole='+json.dumps(role)+';\n'+SCRIPT)
 try:
  await page.goto(base,wait_until='load');await login(page,'owner')
  await page.evaluate("async()=>{await bamcoOrganizationAccess.refresh();await refresh();await bamcoOptions.load(true);BamcoNavigation.navigate('kanban')}")
  for control in ['addTaskBtn','importBtn','kanbanDeleteBtn','kanbanExportBtn','kanbanArchiveBtn']:
   assert not await page.locator('#'+control).is_visible(),control+' exposed by view/edit-only supervision'
  await page.locator('#kanbanBody tr[data-task-id="101"]').click()
  await page.locator('#kanbanEditBtn').click()
  await page.locator('#taskDialog').wait_for(state='visible')
  assert await page.locator('#taskDialogTitle').inner_text()=='ویرایش وظیفه'
  assert not await page.evaluate("()=>BamcoAccess.isSystemManager()")
  assert not await page.evaluate("()=>BamcoAccess.canExplicit('kanban','edit')")
  if role=='head':
   assert await page.evaluate("()=>Bamco.state.editing.created_by!==Bamco.state.user.id"),'chief sees manager-created shared intake'
  assert await page.locator('#kanbanBody tr[data-task-id="102"]').count()==0
  await page.locator('#taskForm [name=status]').select_option('منتظر پاسخ')
  assert await page.locator('#taskForm [name=owner_id]').is_enabled()
  assert await page.locator('#taskForm [name=owner_id] option').evaluate_all("els=>els.map(e=>e.value)")==['','00000000-0000-4000-8000-000000000101']
  await page.locator('#taskForm [name=owner_id]').select_option('00000000-0000-4000-8000-000000000101')
  await page.locator('#taskForm [name=description]').fill('Edited in isolated browser')
  await page.locator('#saveTaskBtn').click()
  await page.wait_for_function("()=>__testApi.calls.some(c=>c.endpoint==='tasks'&&c.method==='PATCH')")
  patch=await page.evaluate("()=>__testApi.calls.find(c=>c.endpoint==='tasks'&&c.method==='PATCH').body")
  assert patch['owner_id']=='00000000-0000-4000-8000-000000000101' and patch['description']=='Edited in isolated browser'
  assert patch['status']=='منتظر پاسخ' and 'archived' not in patch
  assert await page.evaluate("()=>__testApi.calls.find(c=>c.endpoint==='tasks'&&c.method==='PATCH').version")=='eq.1'
  await page.locator('#taskDialog').wait_for(state='hidden')
  # Full browser reload reads the persisted mocked API, rather than reusing UI state.
  await page.reload(wait_until='load')
  # Authentication is intentionally memory-only: re-enter through the real login UI.
  await login(page,'owner')
  await page.wait_for_function("()=>Bamco.state.profile?.id===__testApi.profiles[1].id&&BamcoAccess.isReady()")
  await page.evaluate("async()=>{await bamcoOrganizationAccess.refresh();await refresh();await bamcoOptions.load(true);BamcoNavigation.navigate('kanban')}")
  await page.locator('#kanbanBody tr[data-task-id="101"]').click()
  await page.locator('#kanbanEditBtn').click()
  assert await page.locator('#taskForm [name=owner_id]').input_value()=='00000000-0000-4000-8000-000000000101'
  assert await page.locator('#taskForm [name=status]').input_value()=='منتظر پاسخ'
  assert await page.evaluate("()=>Bamco.state.editing.row_version")==2
  assert await page.locator('#taskForm [name=status] option').evaluate_all("els=>els.filter(o=>['ثبت شده','انجام شده'].includes(o.value)).every(o=>o.disabled)")
  await page.screenshot(path=str(out/f'{role}-{width}.png'),full_page=True)
  # A stale claim cannot overwrite the committed assignment; the server returns zero rows.
  await page.evaluate("()=>{__testApi.tasks[0].row_version++;document.querySelector('#taskForm [name=description]').value='Stale write'}")
  await page.locator('#saveTaskBtn').click()
  await page.wait_for_function("()=>document.body.textContent.includes('وظیفه یا دسترسی شما تغییر کرده است')")
  assert await page.locator('#taskDialog').is_visible()
  assert await page.evaluate("()=>__testApi.tasks[0].description")=='Edited in isolated browser'
  await page.evaluate("()=>document.querySelector('#taskDialog').close()")
  await page.evaluate("async()=>{__testApi.supervision=false;await BamcoAccess.invalidate()}")
  assert not await page.evaluate("()=>BamcoAccess.can('kanban','view')")
  assert not await page.evaluate("()=>bamcoOrganizationAccess.canDirectlyManageTask(__testApi.tasks[0])")
  assert not errors,errors
  return {'width':width,'role':role,'passed':True,'verified':'registered intake, scoped owner, atomic version claim, persistence/reload, revocation','external_requests':'blocked'}
 except Exception:
  await page.screenshot(path=str(out/f'failed-{role}-{width}.png'),full_page=True)
  print('KANBAN_FAILURE_DIAGNOSTICS='+json.dumps(await page.evaluate("()=>({invalid:[...document.querySelector('#taskForm').elements].filter(e=>e.willValidate&&!e.validity.valid).map(e=>({name:e.name,message:e.validationMessage})),notices:document.querySelector('.notice-dialog')?.textContent||'',calls:__testApi.calls.slice(-12),errors:[]})"),ensure_ascii=False),flush=True)
  raise
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

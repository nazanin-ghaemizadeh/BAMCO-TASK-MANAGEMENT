/* Real responsive layout and shared-source regression; all APIs are isolated. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'test-results/linked-organization');
const mock=fs.readFileSync(path.join(__dirname,'mock-api.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'mock-messaging-api.js'),'utf8');
const organization=`
const prior=window.fetch,person=window.__testApi.profiles[1];
const organizationData=window.__organizationData={departments:[{id:1,title:'معاونت فنی و مهندسی',active:true,revision:1}],units:[{id:1,department_id:1,title:'مهندسی توسعه و تکوین محصول',schema_name:'public',local_unit_id:1,active:true,revision:1}],members:[{schema_name:'public',user_id:person.id,unit_id:1}],packages:[],package_grants:[],bindings:[],unit_features:[],workspaces:['public','bamco_process','bamco_quality'].map(schema_name=>({schema_name,structure_version:7,people:schema_name==='public'?[person]:[],roles:[{id:1,title:'کارشناس',level_no:1}],positions:schema_name==='public'?[{id:10,title:'کارشناس محصول',role_id:1,unit_id:1,active:true}]:[],assignments:schema_name==='public'?[{position_id:10,user_id:person.id,is_primary:true}]:[],features:[{feature_key:'pettyCash',title:'تنخواه'}]}))};
window.fetch=async(input,options={})=>{const endpoint=new URL(typeof input==='string'?input:input.url,location.href).pathname.split('/').pop(),body=options.body?JSON.parse(options.body):{};let data;
 if(endpoint==='admin_org_snapshot')data=organizationData;
 else if(endpoint==='admin_org_effective')data=[{feature_key:'pettyCash',title:'تنخواه',permissions:{view:true},unit_enabled:true,direct_grants:[]}];
 else if(endpoint==='admin_org_save'){if(body.p_action==='unit'){organizationData.units[0].title=body.p_payload.title;organizationData.units[0].revision++}data={ok:true}}
 else if(endpoint==='admin-users')data={ok:true,profiles:window.__testApi.profiles};
 else return prior(input,options);
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};window.__bamcoUpdateNavigate=()=>{};
`;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));try{const content=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(content)}catch{res.statusCode=404;res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  const extra=process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader']}:{};
  browser=await chromium.launch({headless:true,...extra});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mock+'\n'+organization);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.Bamco?.state&&typeof window.enterApp==='function');
  await page.evaluate(async()=>{const s=window.Bamco.state;s.token='browser-fixture-token';s.user={id:window.__testApi.actor.id};s.profile=window.__testApi.actor;await enterApp();document.querySelector('.home-welcome-dialog')?.close();window.bamcoShowHome()});
  const open=async route=>{await page.evaluate(route=>document.querySelector('#nav [data-view="'+route+'"]').click(),route);await page.waitForFunction(route=>window.Bamco.state.view===route&&!document.querySelector('#'+route+'View').classList.contains('hidden'),route)};
  await open('people');await page.waitForFunction(()=>document.querySelector('#peopleBody tr[data-id]'));
  for(const width of [375,390,430,768,1440]){
   await page.setViewportSize({width,height:width<800?844:1000});await page.waitForTimeout(100);
   const metrics=await page.evaluate(()=>{const panel=document.querySelector('#peopleView .people-directory-panel'),wrap=panel.querySelector('.table-wrap'),pager=panel.querySelector('.table-pagination'),first=panel.querySelector('tbody td'),bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,bottom:r.bottom}};return {panel:bounds(panel),wrap:bounds(wrap),pager:pager&&bounds(pager),first:bounds(first),direction:getComputedStyle(panel).flexDirection,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}});
   assert.equal(metrics.direction,'column');assert(metrics.wrap.width>=width-30,JSON.stringify(metrics));assert(metrics.wrap.x>=-1&&metrics.wrap.right<=width+1,JSON.stringify(metrics));assert(metrics.wrap.bottom<=metrics.pager.y+2,JSON.stringify(metrics));assert(metrics.first.right<=metrics.wrap.right+2&&metrics.first.right>metrics.wrap.x,JSON.stringify(metrics));assert(metrics.documentWidth<=width+1,JSON.stringify(metrics));
   await page.screenshot({path:path.join(out,'people-'+width+'.png')});console.log('people layout',width,JSON.stringify(metrics));
  }
  await page.setViewportSize({width:390,height:844});await open('organization');await page.waitForSelector('.organization-version');await open('accessMatrix');await page.waitForSelector('[data-access-unit]');await open('organizationAdmin');await page.waitForSelector('[data-edit-unit="1"]');
  await page.locator('[data-edit-unit="1"]').click();await page.locator('#orgAdminDialog [name=title]').fill('واحد به‌روز شده');await page.locator('#orgAdminDialog [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#orgAdminDialog').open);
  assert((await page.locator('#peopleUnit').textContent()).includes('واحد به‌روز شده'));assert((await page.locator('[data-org-unit]').textContent()).includes('واحد به‌روز شده'));
  await page.screenshot({path:path.join(out,'management-mobile.png')});await open('accessMatrix');await page.waitForFunction(()=>document.querySelector('[data-access-unit]')?.textContent.includes('واحد به‌روز شده'));await page.screenshot({path:path.join(out,'access-mobile.png')});
  assert.deepEqual(errors,[]);console.log('Shared organization updates and responsive layout passed.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});

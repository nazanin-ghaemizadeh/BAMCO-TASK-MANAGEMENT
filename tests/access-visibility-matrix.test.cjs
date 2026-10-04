const {test:nodeTest}=require('node:test');
const fs=require('node:fs');
const scenarioArg=process.argv.indexOf('--scenario-file');
const scenarioFile=process.env.BAMCO_ACCESS_SCENARIO_FILE||(scenarioArg>=0?process.argv[scenarioArg+1]:null);
const test=(name,fn)=>nodeTest(name,{skip:!!scenarioFile},fn);
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

// This inventory is deliberately independent of the runtime catalog. A new
// route must be consciously included here rather than silently escaping QA.
const ROUTES={
 people:'people',accessMatrix:'settings',organization:'organization',activeSessions:'activeSessions',loginActivity:'loginActivity',
 messages:'messages',messageCenter:'messageCenter',sentMessages:'sentMessages',templates:'templates',stickers:'stickers',
 dashboard:'dashboard',performanceReport:'performanceReport',pettyCash:'pettyCash',invoices:'invoices',systemOptions:'systemOptions',
 settings:'settings',alertSettings:'settings',emailSettings:'settings',kanban:'kanban',archive:'archive',taskTimeline:'taskTimeline',
 approvals:'approvals',requestHistory:'requestHistory',projects:'projects',vehiclePermanent:'vehiclePermanent',vehicleTemporary:'vehicleTemporary',
 parts:'parts',tools:'tools',groupChat:'groupChat',directMessages:'directMessages',taskChats:'taskChats',documents:'documents',testReports:'documents',
 sitesAccess:'sitesAccess',lettersIncoming:'letters',lettersOutgoing:'letters',userGuide:'userGuide',phoneBook:'phonebook',notes:'notes',voiceAssistant:'voiceAssistant'
};
const INTERNAL=new Set(['templates','alertSettings','emailSettings']);
const GRANTABLE=Object.keys(ROUTES).filter(route=>!INTERNAL.has(route)&&route!=='accessMatrix');
const FEATURES=[...new Set(Object.values(ROUTES))];
const grant=(feature_key,can_view=true)=>({feature_key,can_view,can_create:false,can_edit:false,can_delete:false,can_export:false,can_manage_access:false,can_bypass_approval:false});
const payload=grants=>({schema:'bamco.feature-access.v1',grants});
const button=(f,route)=>f.d.querySelector(`#nav button[data-view="${route}"]`);
const available=node=>!!node&&!node.hidden&&!node.disabled&&!node.classList.contains('hidden')&&node.getAttribute('aria-hidden')!=='true';
const visibleViews=f=>[...f.d.querySelectorAll('.workspace > .view')].filter(node=>!node.classList.contains('hidden')).map(node=>node.id);
const state=f=>f.w.Bamco.state;
async function home(f){f.w.bamcoShowHome();await pause(30);assert.equal(state(f).view,'home');}
async function owner(t,initial=FEATURES.map(key=>grant(key))){
 let rows=initial;
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?payload(rows):undefined});
 t.after(()=>f.dispose());
 f.setGrants=async next=>{rows=next;await f.w.BamcoAccess.invalidate();await pause(30);};
 f.changeGrants=next=>{rows=next;};
 return f;
}

// CSS/layout is asserted separately in browser/check_access_visibility.py,
// which runs real Chromium with the shipped HTML, styles and JS bundle.
test('visibility inventory covers all 40 routes, 36 grantable cards, 37 nav entries and 12 parent groups',async t=>{
 const f=await owner(t),catalog=f.w.BamcoNavigationCatalog;
 assert.deepEqual(Object.fromEntries(Object.entries(catalog.byRoute).map(([key,r])=>[key,r.featureKey])),ROUTES);
 assert.deepEqual([...catalog.accessMatrixRoutes].sort(),[...GRANTABLE].sort());
 assert.equal(catalog.groups.length,12);
 assert.deepEqual([...f.d.querySelectorAll('#nav button[data-view]')].map(node=>node.dataset.view).sort(),Object.keys(ROUTES).filter(key=>!INTERNAL.has(key)).sort());
 for(const route of Object.keys(ROUTES))assert.equal(!!f.d.getElementById(route+'View'),!INTERNAL.has(route),`${route}: actual view or intentionally absent legacy route`);
 for(const route of GRANTABLE){assert(available(button(f,route)),`${route}: granted nav entry is available`);assert(!button(f,route).closest('.nav-group').classList.contains('hidden'),`${route}: parent is available`);}
 assert(!available(button(f,'accessMatrix')),'people grant must not expose the administrator-only access matrix');
});

test('settings manage access alone exposes and opens the access matrix while view-only settings never does',async t=>{
 const f=await owner(t,[{...grant('settings',false),can_manage_access:true}]);
 assert.equal(f.w.BamcoAccess.can('settings','view'),false);
 assert.equal(f.w.BamcoAccess.can('people','view'),false);
 assert(available(button(f,'accessMatrix')),'management action is independent of settings/people view');
 button(f,'accessMatrix').click();await until(()=>state(f).view==='accessMatrix');await pause(40);
 assert.deepEqual(visibleViews(f),['accessMatrixView']);
 await home(f);assert.equal(f.w.BamcoNavigation.navigate('accessMatrix'),true);
 await f.setGrants([grant('settings')]);
 assert(!available(button(f,'accessMatrix')),'settings viewing is not access administration');
 assert.equal(f.w.BamcoNavigation.navigate('accessMatrix'),false);
 assert.equal(state(f).view,'home');
});

test('each view-only grant independently reveals every matching route and its parent, including aliases',async t=>{
 const f=await owner(t,[]),catalog=f.w.BamcoNavigationCatalog;
 for(const key of FEATURES){
  await f.setGrants([grant(key)]);
  for(const [route,feature] of Object.entries(ROUTES)){
   assert.equal(f.w.BamcoAccess.can(feature,'view'),feature===key,`${key}: ${route} feature check`);
   for(const action of ['create','edit','delete','export','manage_access','bypass_approval'])assert.equal(f.w.BamcoAccess.can(feature,action),false,`${key}: no implicit ${action}`);
   if(!INTERNAL.has(route))assert.equal(available(button(f,route)),feature===key&&route!=='accessMatrix',`${key}: ${route} source navigation`);
  }
  for(const group of catalog.groups){
   const expected=group.routes.some(route=>!INTERNAL.has(route)&&route!=='accessMatrix'&&ROUTES[route]===key);
   assert.equal(!f.d.querySelector(`#nav .nav-group[data-group="${group.key}"]`).classList.contains('hidden'),expected,`${key}: ${group.key} parent visibility`);
  }
 }
});

test('all granted routes open through source navigation and direct navigation without another view leaking',async t=>{
 const f=await owner(t);
 for(const route of GRANTABLE){
  await home(f);button(f,route).click();
  await until(()=>state(f).view===route&&!f.d.getElementById(route+'View').classList.contains('hidden'));
  await pause(40);
  assert.equal(state(f).view,route,`${route}: source click remains on selected route`);
  assert.deepEqual(visibleViews(f),[route+'View'],`${route}: one visible workspace`);
  await home(f);assert.equal(f.w.BamcoNavigation.navigate(route),true,`${route}: direct navigation allowed`);
  assert.equal(state(f).view,route);assert.deepEqual(visibleViews(f),[route+'View']);
 }
 for(const route of INTERNAL){await home(f);assert.equal(f.w.BamcoNavigation.navigate(route),false,`${route}: catalog-only legacy route has no rendered page`);assert.deepEqual(visibleViews(f),['homeView']);}
});

test('missing and explicitly denied grants hide all cards and reject all 40 direct routes',async t=>{
 const f=await owner(t,[]);
 for(const rows of [[],FEATURES.map(key=>({...grant(key,false),effect:'deny'}))]){
  await f.setGrants(rows);
  await home(f);
  for(const route of Object.keys(ROUTES)){
   if(!INTERNAL.has(route))assert(!available(button(f,route)),`${route}: inaccessible source entry`);
   assert.equal(f.w.BamcoNavigation.navigate(route),false,`${route}: direct navigation denied`);
   assert.equal(state(f).view,'home',`${route}: stayed home`);
   assert.deepEqual(visibleViews(f),['homeView'],`${route}: no denied view leak`);
  }
 }
});

test('grant and revoke events refresh an already-open launcher and focus recovers suspended grants',async t=>{
 const f=await owner(t,[grant('pettyCash')]);f.w.bamcoHomeLayout.set('launcher');
 const trigger=f.d.querySelector('#nav [data-group="delivery"] .home-group-trigger');trigger.click();
 const dialog=f.d.querySelector('.home-launcher-dialog');assert(dialog.open);
 assert.equal(dialog.querySelector('[data-route="invoices"]'),null);
 f.changeGrants([grant('pettyCash'),grant('invoices')]);
 f.d.dispatchEvent(new f.w.CustomEvent('bamco:domain-invalidated',{detail:{domain:'access'}}));
 await until(()=>dialog.querySelector('[data-route="invoices"]'));
 assert(dialog.open,'grant update preserves an open group launcher');
 dialog.querySelector('[data-route="invoices"]').click();await until(()=>state(f).view==='invoices');
 f.changeGrants([grant('pettyCash')]);
 f.d.dispatchEvent(new f.w.CustomEvent('bamco:domain-invalidated',{detail:{domain:'access'}}));
 await until(()=>state(f).view==='home');assert(!available(button(f,'invoices')));
 f.changeGrants([grant('invoices')]);f.w.dispatchEvent(new f.w.Event('focus'));
 await until(()=>available(button(f,'invoices')));
 assert.deepEqual(visibleViews(f),['homeView'],'background regrant does not open a page');
 trigger.click();await until(()=>dialog.querySelector('[data-route="invoices"]'));
 const stale=dialog.querySelector('[data-route="invoices"]');
 await f.setGrants([]);assert(!dialog.open,'launcher closes when its final route is revoked');
 stale.click();await pause(40);assert.equal(state(f).view,'home','detached/stale proxy cannot reopen revoked route');
});

test('deactivating an account immediately removes every cached view grant and administrator bypass',async t=>{
 const f=await owner(t);
 for(const role of ['owner','manager']){
  state(f).profile.role=role;state(f).profile.active=false;
  f.w.BamcoAccess.applyNavigation();await pause(30);
  for(const feature of FEATURES)assert.equal(f.w.BamcoAccess.can(feature,'view'),false,`${role}: inactive ${feature}`);
  for(const route of Object.keys(ROUTES)){assert.equal(f.w.BamcoNavigation.navigate(route),false,`${role}: inactive ${route} route`);if(!INTERNAL.has(route))assert(!available(button(f,route)),`${role}: inactive ${route} nav`);}
 }
});

test('latest-started permission response wins even when an older same-account response arrives last',async t=>{
 const f=await owner(t,[]),pending=[];
 const oldData=f.w.BamcoData,oldRpc=oldData.rpc;
 // The existing RPC transport stays untouched; hold only this one read-only
// endpoint at the public access service boundary to control completion order.
 f.w.BamcoData=Object.freeze({...oldData,rpc:(name,body)=>name==='effective_feature_access'?new Promise(resolve=>pending.push(resolve)):oldRpc(name,body)});
 t.after(()=>{f.w.BamcoData=oldData;});
 const first=f.w.BamcoAccess.invalidate(),second=f.w.BamcoAccess.invalidate();
 await until(()=>pending.length===2);pending[1](payload([grant('invoices')]));await second;
 assert.equal(f.w.BamcoAccess.can('invoices','view'),true);
 pending[0](payload([]));await first;await pause(30);
 assert.equal(f.w.BamcoAccess.can('invoices','view'),true,'older denial must not undo a newer grant');
 assert(available(button(f,'invoices')));
});

// Optional private replay. The fixture is never copied into the repository or
// printed: only anonymous scenario labels and counts appear in diagnostics.
// Run: node tests/access-visibility-matrix.test.cjs --scenario-file /private/path.json
// Or: BAMCO_ACCESS_SCENARIO_FILE=/private/path.json node --test --test-force-exit tests/access-visibility-matrix.test.cjs
nodeTest('anonymous current-account grant scenarios agree with every rendered route and parent group',{skip:!scenarioFile},async t=>{
 const audit=JSON.parse(fs.readFileSync(scenarioFile,'utf8'));
 assert(Array.isArray(audit.scenarios)&&audit.scenarios.length,'scenario file contains replayable grants');
 const f=await owner(t,[]),catalog=f.w.BamcoNavigationCatalog;
 let allowedTotal=0,deniedTotal=0;
 for(const scenario of audit.scenarios){
  state(f).profile.role=scenario.role;state(f).profile.active=scenario.active;
  await f.setGrants(scenario.grants);await home(f);
  const rows=new Map(scenario.grants.map(row=>[row.feature_key,row]));
  const allowed=route=>scenario.active!==false&&(scenario.role==='manager'||rows.get(ROUTES[route])?.[route==='accessMatrix'?'can_manage_access':'can_view']===true);
  for(const [route,feature] of Object.entries(ROUTES)){
   const expected=allowed(route);
   assert.equal(f.w.BamcoAccess.can(feature,route==='accessMatrix'?'manage_access':'view'),expected,`${scenario.id}: canonical ${route}`);
   if(!INTERNAL.has(route))assert.equal(available(button(f,route)),expected,`${scenario.id}: source ${route}`);
   const navigable=expected&&!INTERNAL.has(route);
   assert.equal(f.w.BamcoNavigation.navigate(route),navigable,`${scenario.id}: direct ${route}`);
   if(navigable){allowedTotal++;f.w.bamcoShowHome();}else deniedTotal++;
  }
  for(const group of catalog.groups){
   const expected=group.routes.some(route=>!INTERNAL.has(route)&&allowed(route));
   assert.equal(!f.d.querySelector(`#nav .nav-group[data-group="${group.key}"]`).classList.contains('hidden'),expected,`${scenario.id}: parent ${group.key}`);
  }
 }
 t.diagnostic(`${audit.profileCount||audit.profiles?.length||0} anonymous profiles, ${audit.scenarios.length} distinct permission scenarios, ${allowedTotal} allowed and ${deniedTotal} denied direct-route checks`);
});

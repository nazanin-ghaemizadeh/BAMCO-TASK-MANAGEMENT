const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');

const SECTIONS=[
 {route:'phoneBook',section:'office',label:'اداری'},
 {route:'phoneBook',section:'factory',label:'کارخانه'},
 {route:'phoneBook',section:'external',label:'خارج از سازمان'}
];
const MODES=['cards','launcher','custom'];
const group=(d,key)=>d.querySelector(`#nav .nav-group[data-group="${key}"]`);
const source=(d,route)=>d.querySelector(`#nav button[data-view="${route}"]`);
const available=node=>!node.hidden&&!node.disabled&&!node.classList.contains('hidden');
const label=node=>[...node.children].filter(child=>child.tagName==='SPAN'&&!child.classList.contains('home-launcher-route-icon'))
 .map(child=>child.textContent.trim()).filter(Boolean).at(-1)||node.textContent.trim();
const describe=node=>({route:node.dataset.route||node.dataset.view,section:node.dataset.phonebookSection||'',label:label(node)});
function cardOptions(d,key){
 return [...group(d,key).querySelectorAll('.nav-group-items>button[data-view]:not([data-home-route-source]),.nav-group-items>.home-card-route')].filter(available);
}
function circleOptions(d,key){
 d.querySelector('.home-launcher-dialog').close();
 group(d,key).querySelector('.home-group-trigger').click();
 assert.equal(d.querySelector('.home-launcher-dialog').open,true,`${key}: category opens`);
 return [...d.querySelectorAll('.home-launcher-dialog .home-launcher-route')];
}
function home(f,mode){f.w.bamcoShowHome();f.w.bamcoHomeLayout.set(mode);}
function option(f,mode,key,route,section=''){
 home(f,mode);
 const options=mode==='cards'?cardOptions(f.d,key):circleOptions(f.d,key);
 const chosen=options.find(node=>(node.dataset.route||node.dataset.view)===route&&(node.dataset.phonebookSection||'')===section);
 assert(chosen,`${mode}: ${key}/${route}/${section} option exists`);
 return chosen;
}
const visibleViews=d=>[...d.querySelectorAll('.workspace>.view')].filter(node=>!node.classList.contains('hidden')).map(node=>node.id);

test('every home group has the same ordered options and labels in cards, circles and custom circles',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {w,d}=f;
 const expected=new Map();
 home(f,'cards');
 for(const entry of w.BamcoNavigationCatalog.groups){
  const options=cardOptions(d,entry.key).map(describe);
  assert(options.length,`${entry.key}: card has options`);
  assert.equal(new Set(options.map(item=>`${item.route}:${item.section}`)).size,options.length,`${entry.key}: no duplicate card options`);
  if(entry.key==='phonebook')assert.deepEqual(options,SECTIONS);
  else assert.deepEqual(options.map(item=>item.route),Array.from(entry.routes).filter(route=>available(source(d,route)||{hidden:true})));
  expected.set(entry.key,options);
 }
 for(const mode of ['launcher','custom','cards','launcher','cards','custom']){
  home(f,mode);
  for(const entry of w.BamcoNavigationCatalog.groups){
   const options=mode==='cards'?cardOptions(d,entry.key):circleOptions(d,entry.key);
   assert.deepEqual(options.map(describe),expected.get(entry.key),`${mode}: ${entry.key} option parity`);
  }
  w.bamcoHomeLayout.refresh();w.bamcoHomeLayout.refresh();
  assert.equal(d.querySelectorAll('#nav button[data-view="phoneBook"]').length,1,'one canonical phonebook authorization source');
  assert.equal(d.querySelectorAll('#nav .home-card-route[data-phonebook-section]').length,3,'rerenders do not accumulate phonebook proxies');
  assert.equal(d.querySelectorAll('#nav .home-group-trigger').length,12,'rerenders do not duplicate category triggers');
 }
 assert(source(d,'phoneBook').hasAttribute('data-home-route-source'),'generic source is marked for presentation-only hiding');
 assert.deepEqual(f.errors,[]);
});

test('all three phonebook choices open the chosen category from every home mode',async t=>{
 const f=await fixture({tables:{phonebook_units:SECTIONS.map((section,index)=>({id:index+1,category:section.section,title:`واحد ${section.label}`}))}});
 t.after(()=>f.dispose());const {w,d}=f;
 // Changing the order prevents an old/default category from masking a lost key.
 for(const mode of MODES)for(const section of [SECTIONS[1],SECTIONS[2],SECTIONS[0]]){
  option(f,mode,'phonebook','phoneBook',section.section).click();
  await until(()=>w.Bamco.state.view==='phoneBook'&&w.bamcoPhonebook.active()===section.section);
  await until(()=>d.querySelector('#phoneBookView .phonebook-unit-card')?.textContent.includes(`واحد ${section.label}`));
  assert.equal(d.querySelector('#phoneBookView .phonebook-section-heading h2').textContent.trim(),section.label,`${mode}: correct category heading`);
  assert.deepEqual(visibleViews(d),['phoneBookView'],`${mode}: exactly one selected workspace`);
  assert.equal(d.querySelector('.home-launcher-dialog').open,false,`${mode}: route selection closes the dialog`);
  d.querySelector('#phoneBookView [data-phonebook-home]').click();
  assert.equal(w.Bamco.state.view,'home',`${mode}: category return reaches home`);
  assert.equal(d.querySelector('#homeView').dataset.layout,mode,`${mode}: returning retains selected home mode`);
 }
 assert.deepEqual(f.errors,[]);
});

test('other home options delegate to the same native route action across cards and both circle modes',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {w,d}=f;
 const routes=w.BamcoNavigationCatalog.groups.filter(entry=>entry.key!=='phonebook')
  .flatMap(entry=>entry.routes.filter(route=>source(d,route)&&available(source(d,route))).map(route=>({key:entry.key,route})));
 for(const mode of MODES){
  home(f,mode);
  for(const {key,route} of routes){
   let sourceClicks=0;const original=source(d,route),nativeClick=original.click;
   // Native handlers themselves are covered by access-visibility-matrix. This
   // checks that changing home presentation preserves the exact source action,
   // without repeatedly rendering unrelated, expensive feature workspaces.
   original.click=()=>sourceClicks++;
   try{
    const options=mode==='cards'?cardOptions(d,key):circleOptions(d,key);
    const shortcut=options.find(node=>(node.dataset.route||node.dataset.view)===route);
    assert(shortcut,`${mode}: ${route} is available`);
    for(const action of captureActions(w,()=>shortcut.click()))action();
    assert.equal(sourceClicks,1,`${mode}: ${route} delegates exactly once to its native button`);
    assert.equal(d.querySelector('.home-launcher-dialog').open,false);
   }finally{original.click=nativeClick}
  }
 }
 assert.deepEqual(f.errors,[]);
});

test('grant revocation removes phonebook choices in every mode and makes old proxies inert',async t=>{
 let granted=true;
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{
  schema:'bamco.feature-access.v1',grants:granted?[{feature_key:'phonebook',can_view:true}]:[]
 }:undefined});t.after(()=>f.dispose());
 const {w,d}=f;
 for(const mode of MODES){
  granted=true;await w.BamcoAccess.invalidate();
  const stale=option(f,mode,'phonebook','phoneBook','external'),active=w.bamcoPhonebook.active();
  granted=false;await w.BamcoAccess.invalidate();
  assert.equal(w.BamcoAccess.can('phonebook','view'),false);
  assert(group(d,'phonebook').classList.contains('hidden'),`${mode}: denied parent is hidden`);
  assert.equal(cardOptions(d,'phonebook').length,0,`${mode}: denied card choices are absent`);
  assert.equal(d.querySelector('.home-launcher-dialog').open,false,`${mode}: denied open dialog closes`);
  stale.click();await pause(30);
  assert.equal(w.Bamco.state.view,'home',`${mode}: stale proxy does not navigate`);
  assert.equal(w.bamcoPhonebook.active(),active,`${mode}: stale proxy does not change phonebook category`);
 }
 assert.deepEqual(f.errors,[]);
});

test('background badge updates retain an open circle option and its keyboard focus',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {w,d}=f;
 // The fixture closes the welcome dialog immediately before returning; let
 // its intentional next-frame home focus complete before testing another UI.
 await new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
 for(const mode of ['launcher','custom']){
  const focused=option(f,mode,'tasks','approvals');focused.focus();
  const badge=d.querySelector('#approvalBadge');assert(badge);
  for(const count of ['7','12','3']){
   badge.textContent=count;
   await until(()=>focused.querySelector('.home-launcher-route-badge')?.textContent===count);
   await pause(20);
   assert.equal(d.querySelector('.home-launcher-dialog [data-route="approvals"]'),focused,`${mode}: background update preserves option identity`);
   assert.equal(d.activeElement,focused,`${mode}: background update preserves keyboard focus (actual ${d.activeElement.tagName}#${d.activeElement.id})`);
   assert.equal(d.querySelector('.home-launcher-dialog').open,true);
  }
 }
 assert.deepEqual(f.errors,[]);
});

// Pause only tasks queued by the shortcut itself. This deterministically tests
// the gap between user activation and delegated navigation without racing a
// MutationObserver or making the regression depend on a timer duration.
function captureActions(w,activate){
 const timeout=w.setTimeout,frame=w.requestAnimationFrame,queued=[];
 w.setTimeout=(callback,delay,...args)=>Number(delay||0)===0?(queued.push(()=>callback(...args)),0):timeout(callback,delay,...args);
 w.requestAnimationFrame=callback=>(queued.push(()=>callback(w.performance.now())),0);
 try{activate()}finally{w.setTimeout=timeout;w.requestAnimationFrame=frame}
 return queued;
}

test('inactive or detached navigation sources cannot be invoked by stale or queued home proxies',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {w,d}=f;
 const invalidations=[
  ['disabled source',({original})=>{original.disabled=true;return()=>{original.disabled=false}}],
  ['hidden source',({original})=>{original.hidden=true;return()=>{original.hidden=false}}],
  ['detached source',({original})=>{const parent=original.parentNode,next=original.nextSibling;original.remove();return()=>parent.insertBefore(original,next?.parentNode===parent?next:null)}],
  ['hidden group',({parent})=>{parent.hidden=true;return()=>{parent.hidden=false}}],
  ['detached group',({parent})=>{const nav=parent.parentNode,next=parent.nextSibling;parent.remove();return()=>nav.insertBefore(parent,next)}],
  ['inactive account',()=>{w.Bamco.state.profile.active=false;return()=>{w.Bamco.state.profile.active=true}}],
  ['changed account',()=>{const user=w.Bamco.state.user;w.Bamco.state.user={id:'test-owner'};return()=>{w.Bamco.state.user=user}}],
  ['ended session',()=>{const token=w.Bamco.state.token;w.Bamco.state.token=null;return()=>{w.Bamco.state.token=token}}]
 ];
 for(const mode of MODES)for(const route of mode==='cards'?['phoneBook']:['phoneBook','kanban']){
  const key=route==='phoneBook'?'phonebook':'tasks',section=route==='phoneBook'?'external':'';
  for(const [reason,invalidate] of invalidations)for(const phase of ['before click','after click']){
   const shortcut=option(f,mode,key,route,section),original=source(d,route),parent=group(d,key),active=w.bamcoPhonebook.active();
   let clicks=0;const count=()=>clicks++;original.addEventListener('click',count);
   let restore;
   try{
    if(phase==='before click')restore=invalidate({original,parent});
    const queued=captureActions(w,()=>shortcut.click());
    if(phase==='after click'){
     assert(queued.length,`${mode}/${route}: navigation is deferred`);
     restore=invalidate({original,parent});
    }
    for(const action of queued)action();
    assert.equal(clicks,0,`${mode}/${route}: ${reason} ${phase} prevents native source action`);
    assert.equal(w.Bamco.state.view,'home',`${mode}/${route}: ${reason} ${phase} prevents navigation`);
    assert.equal(w.bamcoPhonebook.active(),active,`${mode}/${route}: ${reason} ${phase} preserves selected phonebook category`);
   }finally{restore?.();original.removeEventListener('click',count)}
  }
 }
 assert.deepEqual(f.errors,[]);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('assets/js/card-home.js');
const reconciliation=source.slice(source.indexOf(' const groups=['),source.indexOf('\n syncGroups();'));

// A deliberately small navigation model: no browser, network, session or real data.
function fixture(){
 let writes=0;
 class Element{
  constructor(tag='div',classes=[],dataset={}){
   this.tagName=tag.toUpperCase();this.dataset=dataset;this.children=[];this.parentElement=null;this.id='';
   const tokens=new Set(classes);
   this.classList={contains:x=>tokens.has(x),remove:x=>{tokens.delete(x);writes++},toggle:(x,on)=>{on?tokens.add(x):tokens.delete(x);writes++}};
  }
  get firstElementChild(){return this.children[0]||null}
  get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null}
  insertBefore(node,anchor){if(node.parentElement)node.remove();node.parentElement=this;this.children.splice(anchor?this.children.indexOf(anchor):this.children.length,0,node);writes++}
  remove(){if(this.parentElement){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;writes++}}
  matches(selector){
   const tag=selector.match(/^\w+/)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;
   for(const [,c] of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c))return false;
   for(const [,key,val] of selector.matchAll(/\[data-([\w-]+)(?:="([^"]+)")?\]/g))if(!(key in this.dataset)||(val&&this.dataset[key]!==val))return false;
   return true;
  }
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)])}
  querySelector(s){return this.querySelectorAll(s)[0]||null}
 }
 const nav=new Element('nav'),boxes={};
 for(const key of ['conversations','vehicle','tasks','configuration','reports','messages','people','resources']){
  const group=new Element('div',['nav-group'],{group:key}),box=new Element('div',['nav-group-items']);
  group.insertBefore(new Element('h3',['nav-group-toggle']),null);group.insertBefore(box,null);nav.insertBefore(group,null);boxes[key]=box;
 }
 const button=(route,group='tasks',classes=[])=>{const b=new Element('button',classes,{view:route});boxes[group].insertBefore(b,null);return b};
 const context={nav,MutationObserver:class{disconnect(){}observe(){}}};vm.createContext(context);
 vm.runInContext(reconciliation+'\nglobalThis.sync=syncGroups;globalThis.order=groups;',context);
 return{nav,boxes,button,sync:context.sync,order:context.order,reset:()=>{writes=0},writes:()=>writes};
}

test('eight cards and each subsection follow the approved RTL reference',()=>{
 const f=fixture();for(const [,ids] of f.order)for(const id of [...ids].reverse())f.button(id);
 f.sync();assert.deepEqual(f.nav.children.map(x=>x.dataset.group),['people','messages','reports','configuration','tasks','vehicle','conversations','resources']);
 for(const [key,ids] of f.order)assert.deepEqual(f.boxes[key].children.map(x=>x.dataset.view),Array.from(ids));
});

test('only duplicate shortcuts disappear; bound actions and unique routes survive',()=>{
 const f=fixture();f.button('loginReport','reports');f.button('messageReport','reports');
 const login=f.button('loginActivity','people'),sent=f.button('sentMessages','messages');
 const unbound=f.button('kanban'),bound=f.button('kanban');bound.id='original';bound.onclick=()=>42;
 const unique=f.button('customReport','reports');f.sync();
 assert.equal(f.nav.querySelector('[data-view="loginReport"]'),null);assert.equal(f.nav.querySelector('[data-view="messageReport"]'),null);
 for(const b of [login,sent,bound,unique])assert.ok(b.parentElement);
 assert.equal(unbound.parentElement,null);assert.equal(bound.onclick(),42);
});

test('reconciliation stabilizes without DOM writes and handles late-added shortcuts',()=>{
 const f=fixture();f.button('kanban');f.sync();f.reset();f.sync();assert.equal(f.writes(),0);
 const late=f.button('settings','tasks',['nav-settings-root']);f.sync();assert.equal(late.parentElement,f.boxes.configuration);
 f.reset();f.sync();assert.equal(f.writes(),0);
});

test('role-hidden routes stay hidden; visibility changes update their group',()=>{
 const f=fixture(),b=f.button('people','people',['hidden']);f.sync();
 assert.ok(b.classList.contains('hidden'));assert.ok(f.boxes.people.parentElement.classList.contains('hidden'));
 b.classList.remove('hidden');f.sync();assert.equal(f.boxes.people.parentElement.classList.contains('hidden'),false);
});

test('home styles have one owner, loaded last; phase modules load once',()=>{
 const stagedEntry=path.resolve(__dirname,'../../review-next/index.html');
 const html=fs.readFileSync(fs.existsSync(stagedEntry)?stagedEntry:path.resolve(__dirname,'../index.html'),'utf8');
 const sheets=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(x=>x[1]);
 assert.match(sheets.at(-1),/home-post-welcome-fix-20260911\.css/);
 assert.ok(sheets.findIndex(x=>/home-stable\.css/.test(x))<sheets.length-1);
 for(const file of ['card-home','interface-refinement','visual-polish','release-fixes'])assert.doesNotMatch(read('assets/css/'+file+'.css'),/#homeView|\.card-topbar|\.card-home-active/);
 const home=read('assets/css/home-stable.css');assert.match(home,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(home,/grid-auto-rows:var\(--home-row-height/);
 for(const module of ['phase1-workflow','phase2-message-engine','phase3-response-tracking'])assert.equal(html.split('src="assets/js/'+module+'.js').length-1,1);
 assert.doesNotMatch(read('assets/js/sidebar.js'),/load\('assets\/js\/phase/);
});

test('search polishing and cell cleanup stop writing once values are stable',()=>{
 const stagedUX=path.resolve(__dirname,'../../current/assets/js/ux.js');
 const ux=fs.existsSync(stagedUX)?fs.readFileSync(stagedUX,'utf8'):read('assets/js/ux.js');
 const functions=ux.slice(ux.indexOf('  function polishSearchButtons()'),ux.indexOf('  function installTableCleaning()'));
 let writes=0;
 const cell=value=>({value,get textContent(){return this.value},set textContent(v){this.value=v;writes++},classList:{contains:()=>false},setAttribute(){}});
 const cells=Array.from({length:12},()=>cell(''));cells[0]=cell('# 41');cells[11]=cell(' انجام شده ');
 const nodes={'#kanbanView .task-search-toggle':cell('جست‌وجو'),'#archiveView .task-search-toggle':cell('جست‌وجو'),'#kanbanView':{querySelectorAll:()=>[{children:cells}]}};
 const context={q:s=>nodes[s]};vm.createContext(context);vm.runInContext(functions,context);
 context.polishSearchButtons();context.cleanTaskTable('kanbanView');assert.ok(writes>0);writes=0;
 context.polishSearchButtons();context.cleanTaskTable('kanbanView');assert.equal(writes,0);assert.equal(cells[0].textContent,'41');
});


test('welcome card contains no waiting-work UI or logic',()=>{
  const src=read('assets/js/card-home.js'),css=read('assets/css/card-home.css');
  assert.doesNotMatch(src,/welcome-waiting|syncWelcomeWaiting|openWaitingKanban|امور منتظر پاسخ/);
  assert.doesNotMatch(css,/welcome-waiting/);
});

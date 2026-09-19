'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function mediaHarness(){
 const dom=new JSDOM('<div id="a"></div><div id="b"></div><div id="c"></div>',{url:'https://bamco.test',runScripts:'outside-only'}),w=dom.window;
 const calls=[],revoked=[];let seq=0;
 w.state={user:{id:'manager'},token:'test',profile:{id:'manager'},profiles:[]};w.SB_URL='https://example.supabase.co';w.SB_KEY='public-test';
 w.AbortController=AbortController;w.Response=Response;
 w.URL.createObjectURL=()=>`blob:photo-${++seq}`;w.URL.revokeObjectURL=url=>revoked.push(url);
 w.fetch=async(url,options)=>{calls.push({url,options});return new Response('photo')};
 w.eval(read('assets/js/media-cache.js'));
 return {w,d:w.document,calls,revoked,close:()=>w.close()};
}
test('avatar cache shares a version, isolates people, and never revokes another displayed image',async t=>{
 const h=mediaHarness();t.after(h.close);const {w,d}=h;
 const one={id:'one',avatar_path:'one/avatar.png',updated_at:'2026-09-19T05:00:00Z'},two={id:'two',avatar_path:'two/avatar.png',updated_at:one.updated_at};
 await Promise.all([w.bamcoMedia.bindAvatar(d.querySelector('#a'),one),w.bamcoMedia.bindAvatar(d.querySelector('#b'),one),w.bamcoMedia.bindAvatar(d.querySelector('#c'),two)]);
 assert.equal(h.calls.length,2);assert.equal(d.querySelector('#a img').src,d.querySelector('#b img').src);assert.notEqual(d.querySelector('#a img').src,d.querySelector('#c img').src);assert.deepEqual(h.revoked,[]);
 assert.ok(h.calls.every(c=>c.options.cache==='no-store'&&c.url.includes('cacheNonce=')));
 const previous=d.querySelector('#a img').src;
 await w.bamcoMedia.bindAvatar(d.querySelector('#a'),{...one,updated_at:'2026-09-19T05:01:00Z'});
 assert.notEqual(d.querySelector('#a img').src,previous);assert.equal(d.querySelector('#b img').src,previous);assert.deepEqual(h.revoked,[]);
});
test('avatar removal, stale image completion and pending crop cannot overwrite current display',async t=>{
 const h=mediaHarness();t.after(h.close);const {w,d}=h;let finish;
 const el=d.querySelector('#a');
 w.fetch=url=>String(url).includes('/old.png')?new Promise(resolve=>{finish=()=>resolve(new Response('old'))}):Promise.resolve(new Response('new'));
 const old=w.bamcoMedia.bindAvatar(el,{id:'one',full_name:'قدیمی',avatar_path:'one/old.png'});
 await w.bamcoMedia.bindAvatar(el,{id:'one',full_name:'جدید',avatar_path:'one/new.png'});
 const latest=el.querySelector('img').src;finish();await old;assert.equal(el.querySelector('img').src,latest);
 await w.bamcoMedia.bindAvatar(el,{id:'one',full_name:'حذف',avatar_path:null});assert.equal(el.querySelector('img'),null);assert.equal(el.textContent,'ح');
 el.dataset.avatarDraft='true';el.textContent='draft';await w.bamcoMedia.bindAvatar(el,{id:'one',avatar_path:'one/new.png'});assert.equal(el.textContent,'draft');
});
test('logout discards an in-flight private avatar response',async t=>{
 const h=mediaHarness();t.after(h.close);let finish;h.w.fetch=()=>new Promise(resolve=>{finish=()=>resolve(new Response('photo'))});
 const job=h.w.bamcoMedia.bindAvatar(h.d.querySelector('#a'),{id:'one',avatar_path:'one/a.png'});
 h.w.bamcoMedia.clear();h.w.state.user={id:'different'};finish();assert.equal(await job,false);assert.equal(h.d.querySelector('#a img'),null);
});
function saveHarness({rowsFail=false}={}){
 const dom=new JSDOM('<button id="saveProfileBtn"></button><input id="profileLoginName" value="manager"><input id="profileDisplayName" value="new"><div id="profileAvatarPreview" data-avatar-draft="true"></div><div id="peopleView" class="hidden"></div><div id="userName"></div>',{url:'https://bamco.test',runScripts:'outside-only'}),w=dom.window;
 const calls=[],errors=[],synced=[];w.state={user:{id:'manager'},token:'test',profile:{id:'manager',login_name:'manager',full_name:'Manager',avatar_path:'manager/avatar.png'}};
 Object.assign(w,{SB_URL:'https://example.supabase.co',SB_KEY:'public-test',pendingBlob:new w.Blob(['photo']),pendingUrl:'blob:draft',profileChannel:null,q:s=>w.document.querySelector(s),syncProfiles:rows=>{synced.push(...rows);w.state.profile=rows[0]},renderPeople:()=>{},toast:(m,e)=>errors.push({m,e})});
 w.URL.revokeObjectURL=()=>{};w.fetch=async(url,opts)=>{calls.push({url,opts});return new Response('{}')};w.update=async(_table,_filter,data)=>rowsFail?[]:[{id:'manager',...data}];w.refreshProfileAvatar=async()=>{};
 const src=read('assets/js/shell.js'),start=src.indexOf('  async function saveProfile(){'),end=src.indexOf('  function loadSettings()',start);w.eval(src.slice(start,end));
 return {w,calls,errors,synced,close:()=>w.close()};
}
test('saving a crop publishes an immutable object path and synchronizes only the confirmed profile',async t=>{
 const h=saveHarness();t.after(h.close);await h.w.saveProfile();
 assert.match(h.calls[0].url,/manager\/avatar-[0-9a-f-]+\.png$/);assert.equal(h.calls[0].opts.headers['x-upsert'],'false');
 assert.equal(h.synced.length,1);assert.equal(h.w.pendingBlob,null);assert.equal(h.w.document.querySelector('#profileAvatarPreview').hasAttribute('data-avatar-draft'),false);assert.ok(!h.errors.some(x=>x.e));
 const first=h.calls[0].url;h.w.pendingBlob=new h.w.Blob(['second']);await h.w.saveProfile();assert.notEqual(first,h.calls[1].url);
});
test('empty profile UPDATE is a failure and retains the unsaved crop for retry',async t=>{
 const h=saveHarness({rowsFail:true});t.after(h.close);await h.w.saveProfile();assert.equal(h.synced.length,0);assert.ok(h.w.pendingBlob);assert.ok(h.errors.some(x=>x.e));assert.equal(h.w.state.profile.avatar_path,'manager/avatar.png');
});
test('default request ordering is newest first, deterministic for ties and non-mutating',()=>{
 const source=read('assets/js/app.js'),start=source.indexOf('function newestRequestRows('),end=source.indexOf('function renderRequests()',start),ctx={};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const input=[{id:1,created_at:'2026-09-17T00:00:00Z'},{id:2,created_at:'2026-09-19T00:00:00Z'},{id:9,created_at:'2026-09-19T00:00:00Z'},{id:99,created_at:'invalid'}];
 assert.deepEqual(Array.from(ctx.newestRequestRows(input),x=>x.id),[9,2,1,99]);assert.equal(input[0].id,1);
 assert.ok(source.includes('newestRequestRows(state.requests).map((r,index)=>'));assert.ok(source.includes('newestRequestRows(state.requestHistory)'));
 assert.ok(!read('assets/js/root-sync-hotfix-20260917.js').includes('MutationObserver'));
});
test('entry first-paint styles are generated from the canonical layout, and home buttons reserve slots',()=>{
 const css=read('assets/css/department-entry.css').split('/* Other small forms')[0].replace(/@import[^;]+;\s*/,'').replaceAll('../fonts/','assets/fonts/').trim();
 assert.ok(read('index.html').includes(css));
 assert.ok(read('assets/css/home-stable.css').includes('grid-auto-rows:max(164px,calc(3 * var(--home-row-height,34px) + 68px))'));
 assert.ok(!read('assets/js/runtime-fixes-20260911.js').includes('html body #departmentEntry'));
 assert.ok(read('.github/workflows/release-version.yml').includes("'assets/js/department-entry.js'"));
});
test('directory profile metadata keeps a newer local save when an older refresh finishes',async t=>{
 const {fixture,until}=require('./helpers/app-fixture.cjs');const f=await fixture();t.after(()=>f.dispose());await f.open('people');
 f.w.bamcoPeople.syncProfiles([{...f.profiles[0],avatar_path:'test-manager/new.png',updated_at:'2030-01-01T00:00:00Z'}]);
 f.w.bamcoPeople.syncProfiles([{...f.profiles[0],avatar_path:'test-manager/old.png',updated_at:'2026-01-01T00:00:00Z'}]);
 assert.equal(f.w.eval('state.profile.avatar_path'),'test-manager/new.png');
 await until(()=>f.d.querySelector('[data-profile-photo="test-manager"] img'));
 assert.equal(f.d.querySelector('[data-profile-photo="test-manager"]').dataset.avatarLoaded,'test-manager/new.png');
});

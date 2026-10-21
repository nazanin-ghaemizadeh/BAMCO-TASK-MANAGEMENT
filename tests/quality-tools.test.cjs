const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {fixture,until}=require('./helpers/app-fixture.cjs');
const root=path.join(__dirname,'..');
test('Paint Shop uses a single live source and the old local entry redirects there',()=>{
 const source='https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/';
 const dir=path.join(root,'tools/paint-shop');assert.deepEqual(fs.readdirSync(dir),['index.html']);
 assert.ok(fs.readFileSync(path.join(dir,'index.html'),'utf8').includes('0;url='+source));
 assert.equal(fs.existsSync(path.join(root,'scripts/sync-paint-shop.mjs')),false);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const frames=html.match(/frame-src ([^;]+);/)[1];assert.ok(frames.split(' ').includes(source));
 assert.match(html,/script-src 'self';/);
});
test('quality categories remain independent and live analysis is loaded only after authorized navigation',async t=>{
 const f=await fixture();t.after(()=>f.dispose());const {w,d}=f;
 assert.equal(w.BamcoNavigationCatalog.routeFor('ovenAnalysis').groupKey,'paintThermal');
 assert.equal(w.BamcoNavigationCatalog.routeFor('statisticalProcessControl').groupKey,'statisticalQuality');
 assert.equal(d.querySelector('#paintToolHost iframe'),null);
 await f.open('ovenAnalysis');await until(()=>d.querySelector('#paintToolHost iframe'));
 const frame=d.querySelector('#paintToolHost iframe');assert.equal(frame.getAttribute('src'),'https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/');assert.equal(frame.getAttribute('sandbox'),'allow-scripts allow-forms allow-downloads allow-modals');
 await f.open('statisticalProcessControl');assert.match(d.querySelector('#statisticalProcessControlView').textContent,/هنوز تعریف نشده/);
 assert.equal(d.querySelector('#paintToolHost iframe'),frame,'switching routes retains the analysis session');
 d.querySelector('#appView').classList.add('hidden');await until(()=>!d.querySelector('#paintToolHost iframe'));
 assert.deepEqual(f.errors,[]);
});
test('ungranted users cannot load the oven document even by direct route or forced view state',async t=>{
 const f=await fixture({role:'owner'});t.after(()=>f.dispose());const {w,d}=f;
 assert.equal(w.BamcoAccess.can('ovenAnalysis','view'),false);
 assert.equal(d.querySelector('[data-view="ovenAnalysis"]').hidden,true);
 assert.equal(w.BamcoNavigation.navigate('ovenAnalysis'),false);assert.equal(d.querySelector('#paintToolHost iframe'),null);
 w.Bamco.state.view='ovenAnalysis';w.dispatchEvent(new w.Event('bamco:feature-access-changed'));assert.equal(d.querySelector('#paintToolHost iframe'),null);
 assert.deepEqual(f.errors,[]);
});
test('revoking a granted user removes the running analysis document',async t=>{
 let allowed=true;
 const f=await fixture({role:'owner',fetchResult:({endpoint})=>endpoint==='effective_feature_access'?{schema:'bamco.feature-access.v1',grants:[{feature_key:'ovenAnalysis',can_view:allowed}]}:undefined});t.after(()=>f.dispose());
 await f.open('ovenAnalysis');await until(()=>f.d.querySelector('#paintToolHost iframe'));
 allowed=false;await f.w.BamcoAccess.refresh({force:true});await until(()=>!f.d.querySelector('#paintToolHost iframe'));
 assert.equal(f.w.BamcoAccess.can('ovenAnalysis','view'),false);assert.deepEqual(f.errors,[]);
});

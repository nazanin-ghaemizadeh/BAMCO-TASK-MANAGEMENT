const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,until,pause}=require('./helpers/app-fixture.cjs');
const root=path.join(__dirname,'..');

test('install identity is BAMCO with black branded icons for desktop and mobile',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal(manifest.name,'BAMCO');assert.equal(manifest.short_name,'BAMCO');
 assert.equal(manifest.theme_color,'#000000');assert.equal(manifest.background_color,'#000000');
 assert(manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 assert.match(html,/rel="manifest"/);assert.match(html,/apple-mobile-web-app-title" content="BAMCO"/);assert.match(html,/apple-touch-icon/);
 for(const file of ['bamco-icon-192.png','bamco-icon-512.png','bamco-icon-maskable-512.png','bamco-apple-touch-icon.png'])assert(fs.statSync(path.join(root,'assets/images',file)).size>1000);
});

test('changing sticker versions uses prefetched metadata and does not queue all images at once',async t=>{
 const sets=[{id:1,name:'نسخه یک',active:true},{id:2,name:'نسخه دو',active:false}];
 const stickers=sets.flatMap(set=>['state1','state2','state3','state4','state5'].flatMap(state_key=>['female','male'].map(gender=>({set_id:set.id,state_key,gender,storage_path:`${set.id}/${state_key}-${gender}.png`}))));
 const f=await fixture({tables:{sticker_sets:sets,stickers}}),{w,d}=f;t.after(()=>f.dispose());await f.open('stickers');await until(()=>d.querySelectorAll('#stickerPair img').length===2);
 const metadataCalls=()=>f.calls.filter(c=>c.endpoint==='stickers'&&c.method==='GET').length;
 const metadataBefore=metadataCalls(),before=f.calls.filter(c=>c.url.includes('/authenticated/stickers/')).length;
 d.querySelector('#stickerSet').value='2';d.querySelector('#stickerSet').dispatchEvent(new w.Event('change',{bubbles:true}));
 await until(()=>d.querySelectorAll('#stickerPair img').length===2);assert.equal(metadataCalls(),metadataBefore);
 const immediate=f.calls.filter(c=>c.url.includes('/authenticated/stickers/')).length-before;assert(immediate<=2,`expected only selected pair, got ${immediate}`);await pause(20);assert.deepEqual(f.errors,[]);
});

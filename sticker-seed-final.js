(()=>{
  const MAP={
    state1:{female:'01_happy_female',male:'01_happy_male'},
    state2:{female:'02_reminder_female',male:'02_reminder_male'},
    state3:{female:'03_concerned_female',male:'03_concerned_male'},
    state4:{female:'04_serious_female',male:'04_serious_male'},
    state5:{female:'05_urgent_female',male:'05_urgent_male'}
  };
  let running=false,done=false;
  function dataUrlToBlob(url){
    const [meta,b64]=String(url).split(',');
    const mime=(meta.match(/data:([^;]+)/)||[])[1]||'image/webp';
    const raw=atob(b64||'');
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    return new Blob([bytes],{type:mime});
  }
  async function uploadOne(setId,stateKey,gender,dataUrl){
    const blob=dataUrlToBlob(dataUrl);
    const path=`sets/${setId}/${stateKey}_${gender}.webp`;
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    const r=await fetch(`${SB_URL}/storage/v1/object/stickers/${encoded}`,{
      method:'POST',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`,'x-upsert':'true','Content-Type':blob.type||'image/webp','cache-control':'3600'},
      body:blob
    });
    if(!r.ok)throw new Error(await r.text()||'آپلود استیکر پایه انجام نشد.');
    const existing=(await select('stickers',`select=id&set_id=eq.${setId}&state_key=eq.${stateKey}&gender=eq.${gender}`))[0];
    const payload={set_id:setId,state_key:stateKey,gender,storage_path:path,mime_type:blob.type||'image/webp',size_bytes:blob.size,sha256:null};
    if(existing)await update('stickers',`id=eq.${existing.id}`,payload);else await insert('stickers',payload);
  }
  async function seed(){
    if(running||done||!state?.token||!window.BAMCO_DESKTOP_ASSETS)return;
    if((window.BAMCO_STICKER_ASSET_COUNT||0)<10)return;
    running=true;
    try{
      const sets=await select('sticker_sets','select=*&order=created_at.asc');
      const set=sets.find(s=>s.name==='واحد مهندسی محصول')||sets.find(s=>s.active);
      if(!set)return;
      const rows=await select('stickers',`select=*&set_id=eq.${set.id}`);
      const have=new Set(rows.map(r=>`${r.state_key}_${r.gender}`));
      for(const stateKey of Object.keys(MAP))for(const gender of ['female','male']){
        const pair=`${stateKey}_${gender}`;
        if(have.has(pair))continue;
        const asset=window.BAMCO_DESKTOP_ASSETS[MAP[stateKey][gender]];
        if(!asset)throw new Error(`تصویر پایه ${pair} پیدا نشد.`);
        await uploadOne(set.id,stateKey,gender,asset);
      }
      const check=await select('stickers',`select=id&set_id=eq.${set.id}`);
      done=check.length>=10;
      if(done)console.info('All ten engineering-product stickers are seeded.');
    }catch(err){console.error('Sticker seed failed',err)}finally{running=false}
  }
  window.seedEngineeringStickerSet=seed;
  document.addEventListener('click',e=>{
    if(e.target.closest?.('#nav button[data-view="stickers"]'))setTimeout(seed,50);
  },true);
  setInterval(()=>{if(!done&&state?.token)seed()},5000);
})();

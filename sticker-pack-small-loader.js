(()=>{
  const pack=window.BAMCO_STICKER_PACK_SMALL||'';
  window.BAMCO_DESKTOP_ASSETS=window.BAMCO_DESKTOP_ASSETS||{};
  if(!pack){window.BAMCO_STICKER_ASSET_COUNT=0;return;}
  try{
    const raw=atob(pack);
    const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder('utf-8').decode(bytes));
    for(const [key,value] of Object.entries(data)){
      if(typeof value==='string'&&value){
        window.BAMCO_DESKTOP_ASSETS[key]=value.startsWith('data:')?value:`data:image/webp;base64,${value}`;
      }
    }
    window.BAMCO_STICKER_ASSET_COUNT=Object.keys(data).length;
    window.dispatchEvent(new CustomEvent('bamco-stickers-ready',{detail:{count:window.BAMCO_STICKER_ASSET_COUNT}}));
  }catch(err){
    console.error('Complete sticker pack decode failed',err);
    window.BAMCO_STICKER_ASSET_COUNT=0;
  }
})();

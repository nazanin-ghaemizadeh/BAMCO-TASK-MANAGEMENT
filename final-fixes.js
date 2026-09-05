(()=>{
'use strict';

const STYLE_VERSION='20260905-4';
if(!document.querySelector('link[data-final-fixes]')){
  const l=document.createElement('link');
  l.rel='stylesheet';
  l.href=`final-fixes.css?v=${STYLE_VERSION}`;
  l.dataset.finalFixes='1';
  document.head.appendChild(l);
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function ensureHeader(){
  const logo=document.getElementById('brandLogo');
  if(!logo)return;
  const embedded=(window.BAMCO_DESKTOP_ASSETS||{}).header_logo;
  if(embedded) logo.src=embedded;
  else logo.src='bamco-logo.png';
  logo.style.setProperty('display','block','important');
  logo.style.setProperty('visibility','visible','important');
  logo.style.setProperty('opacity','1','important');
  logo.style.setProperty('filter','none','important');
}

function ensureDashboard(){
  const cards=document.getElementById('cards');
  if(cards){
    const order=['archive_total','warning','overdue','waiting','in_progress','total'];
    const current=[...cards.children].map(x=>x.dataset.key).filter(Boolean);
    const desired=order.filter(key=>current.includes(key));
    if(current.join('|')!==desired.join('|')){
      const byKey=new Map([...cards.children].map(x=>[x.dataset.key,x]));
      for(const key of desired){const el=byKey.get(key);if(el)cards.appendChild(el)}
    }
    cards.style.setProperty('direction','ltr','important');
    [...cards.children].forEach(c=>c.style.setProperty('direction','rtl','important'));
  }
  const sizes={statusChart:280,priorityChart:280,bucketChart:280,workloadChart:350,performanceChart:350};
  let changed=false;
  for(const [id,h] of Object.entries(sizes)){
    const c=document.getElementById(id);if(!c)continue;
    if(c.getAttribute('height')!==String(h)){c.setAttribute('height',String(h));changed=true}
    c.style.setProperty('width','100%','important');
    c.style.setProperty('height',`${h}px`,'important');
    c.style.setProperty('max-height',`${h}px`,'important');
    const p=c.parentElement;
    if(p){
      p.style.setProperty('height',`${h}px`,'important');
      p.style.setProperty('min-height',`${h}px`,'important');
      p.style.setProperty('max-height',`${h}px`,'important');
      p.style.setProperty('overflow','hidden','important');
    }
  }
  return changed;
}

function englishColumnIndexes(table,cols){
  const hs=[...table.querySelectorAll('thead th[data-col]')];
  return hs.map((h,i)=>cols.includes(h.dataset.col)?i:-1).filter(i=>i>=0);
}
function markEnglishTable(tableId,cols){
  const table=document.getElementById(tableId);if(!table)return;
  const idxs=englishColumnIndexes(table,cols);if(!idxs.length)return;
  const apply=()=>[...table.tBodies[0].rows].forEach(r=>idxs.forEach(i=>r.cells[i]?.classList.add('english-cell')));
  apply();
  if(!table.dataset.englishWatch){
    table.dataset.englishWatch='1';
    new MutationObserver(apply).observe(table.tBodies[0],{childList:true,subtree:true});
  }
}
function applyEnglishFonts(){
  markEnglishTable('peopleTable',['cc','email']);
  markEnglishTable('sendTable',['email']);
  markEnglishTable('followTable',['email']);
  document.querySelectorAll('input[type="email"],input[type="file"],#workbookPath,#sheetName').forEach(x=>x.classList.add('english-ui'));
}

function ensureTemplateEditor(){
  const toolbar=document.querySelector('.editor-toolbar');if(!toolbar)return;
  document.getElementById('resetTemplate')?.remove();
  document.getElementById('previewTemplate')?.remove();
}

function ensureStickerMatrix(){
  const m=document.getElementById('packMatrix');if(!m)return;
  if(m.querySelector('.state-name')&&m.querySelector('#pack_state1_female'))return;
  const inputs=[...m.querySelectorAll('input[type="file"]')];
  const byId=new Map(inputs.map(x=>[x.id,x]));
  const states=[['state1','وضعیت مطلوب'],['state2','یادآوری'],['state3','نیازمند توجه'],['state4','پیگیری جدی'],['state5','اقدام فوری']];
  m.innerHTML='<div class="pack-head">وضعیت</div><div class="pack-head">نسخه خانم</div><div class="pack-head">نسخه آقا</div>';
  for(const [key,label] of states){
    m.insertAdjacentHTML('beforeend',`<div class="pack-head state-name">${label}</div>`);
    for(const suffix of ['female','male']){
      const cell=document.createElement('div');cell.className='pack-cell';
      const old=byId.get(`pack_${key}_${suffix}`);
      if(old)cell.appendChild(old);else cell.innerHTML=`<input id="pack_${key}_${suffix}" type="file" accept="image/png,image/jpeg,image/webp">`;
      m.appendChild(cell);
    }
  }
}

function ensureBridgeDownload(){
  const a=document.querySelector('.bridge-download');
  if(!a)return;
  a.href='Start_Outlook_Bridge.bat?v=20260905-4';
  a.setAttribute('download','Start_Outlook_Bridge.bat');
  a.textContent='دانلود / به‌روزرسانی رابط ویندوز';
}

async function applyAll(){
  ensureHeader();
  const changed=ensureDashboard();
  applyEnglishFonts();
  ensureTemplateEditor();
  ensureStickerMatrix();
  ensureBridgeDownload();
  if(changed)setTimeout(()=>window.dispatchEvent(new Event('resize')),50);
}

async function init(){
  for(let i=0;i<30;i++){
    await applyAll();
    await sleep(200);
  }
  const cards=document.getElementById('cards');
  if(cards&&!cards.dataset.parityWatch){
    cards.dataset.parityWatch='1';
    new MutationObserver(()=>ensureDashboard()).observe(cards,{childList:true});
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

(()=>{
'use strict';

const STYLE_VERSION='20260905-2';
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
  if(logo && !logo.getAttribute('src')) logo.src='bamco-logo.png';
}

function englishColumnIndexes(table,cols){
  const hs=[...table.querySelectorAll('thead th[data-col]')];
  return hs.map((h,i)=>cols.includes(h.dataset.col)?i:-1).filter(i=>i>=0);
}
function markEnglishTable(tableId,cols){
  const table=document.getElementById(tableId); if(!table)return;
  const idxs=englishColumnIndexes(table,cols); if(!idxs.length)return;
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
  const toolbar=document.querySelector('.editor-toolbar'); if(!toolbar)return;
  document.getElementById('resetTemplate')?.remove();
  document.getElementById('previewTemplate')?.remove();
  if(document.getElementById('templateFontSelect') && document.getElementById('templateSizeSelect'))return;
  [...toolbar.querySelectorAll('span')].filter(s=>/^فونت:|^اندازه:/.test(s.textContent.trim())).forEach(s=>s.remove());
  const first=toolbar.querySelector('button');
  const fonts=['B Nazanin','B Mitra','B Lotus','Tahoma','Arial','Times New Roman'];
  const sizes=[10,11,12,13,14,15,16,18,20,22];
  const fl=document.createElement('label');fl.textContent='فونت';
  const fs=document.createElement('select');fs.id='templateFontSelect';fs.className='template-font-select';fs.innerHTML=fonts.map(x=>`<option>${x}</option>`).join('');fl.appendChild(fs);
  const sl=document.createElement('label');sl.textContent='اندازه';
  const ss=document.createElement('select');ss.id='templateSizeSelect';ss.className='template-size-select';ss.innerHTML=sizes.map(x=>`<option>${x}</option>`).join('');ss.value='14';sl.appendChild(ss);
  toolbar.insertBefore(fl,first);toolbar.insertBefore(sl,first);
  const apply=()=>{
    const font=fs.value||'B Nazanin',size=ss.value||'14';
    [document.getElementById('templateSubject'),document.getElementById('templateBody')].forEach(el=>{if(el){el.style.fontFamily=`${font}, Tahoma, Arial, sans-serif`;el.style.fontSize=`${size}pt`;}});
  };
  fs.onchange=apply;ss.onchange=apply;apply();
}

function ensureStickerMatrix(){
  const m=document.getElementById('packMatrix'); if(!m)return;
  const inputs=[...m.querySelectorAll('input[type="file"]')];
  if(m.querySelector('.state-name') && m.querySelector('#pack_state1_female'))return;
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

async function waitForPrimaryFixes(){
  for(let i=0;i<20;i++){
    if(document.getElementById('peopleTable') && document.getElementById('packMatrix'))break;
    await sleep(100);
  }
  ensureHeader();
  applyEnglishFonts();
  ensureTemplateEditor();
  ensureStickerMatrix();
  setTimeout(()=>{ensureHeader();applyEnglishFonts();ensureTemplateEditor();ensureStickerMatrix();},900);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForPrimaryFixes);else waitForPrimaryFixes();
})();

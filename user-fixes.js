(()=>{
'use strict';
const fixStyle=document.createElement('link');fixStyle.rel='stylesheet';fixStyle.href='user-fixes.css?v=20260905-1';document.head.appendChild(fixStyle);
const BRIDGE_BASES=['http://localhost:8765','http://127.0.0.1:8765'];
let bridgeBase='';
let selectedWorkbookFile=null;
let allowOriginalAnalyze=false;

function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function localBridge(path,payload=null,method='POST'){
  const bases=bridgeBase?[bridgeBase,...BRIDGE_BASES.filter(x=>x!==bridgeBase)]:BRIDGE_BASES;
  let last=null;
  for(const base of bases){
    const opts={method,mode:'cors',cache:'no-store'};
    if(payload!==null&&method!=='GET'){
      opts.headers={'Content-Type':'application/json'};
      opts.body=JSON.stringify(payload);
    }
    try{
      const r=await fetch(base+path,opts);
      const data=await r.json().catch(()=>({}));
      bridgeBase=base;
      if(!r.ok||data.ok===false)throw new Error(data.error||'عملیات انجام نشد.');
      return data;
    }catch(e){
      last=e;
      if(bridgeBase===base)bridgeBase='';
      const m=String(e?.message||'');
      if(m && !/Failed to fetch|NetworkError|Load failed|fetch/i.test(m))throw e;
    }
  }
  throw new Error(last?.message||'رابط ویندوز متصل نیست.');
}

function showAppMessage(title,message){
  const d=document.getElementById('alertDialog');
  if(!d){window.alert(message);return}
  document.getElementById('alertTitle').textContent=title;
  document.getElementById('alertBody').textContent=message;
  document.getElementById('alertCancel')?.classList.add('hidden');
  if(!d.open)d.showModal();
}

function addBridgeControls(){
  const sheet=document.getElementById('sheetName');
  if(!sheet||document.getElementById('bridgeStatus'))return;
  const row=document.createElement('div');
  row.className='bridge-row';
  row.innerHTML='<span id="bridgeStatus" class="bridge-status checking">در حال بررسی ارتباط…</span><button id="checkBridge" class="btn" type="button">بررسی اتصال</button><a class="btn bridge-download" href="BAMCO_Local_Bridge.zip" download>دانلود رابط ویندوز</a>';
  sheet.closest('.form-row')?.insertAdjacentElement('afterend',row);
  document.getElementById('checkBridge').addEventListener('click',checkBridgeStatus);
}

async function checkBridgeStatus(){
  const el=document.getElementById('bridgeStatus');
  if(!el)return;
  el.textContent='در حال بررسی ارتباط…';el.className='bridge-status checking';
  try{
    await localBridge('/health',null,'GET');
    el.textContent='اتصال Outlook و فایل TM آماده است';el.className='bridge-status ok';
  }catch{
    el.textContent='رابط ویندوز متصل نیست';el.className='bridge-status bad';
  }
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})
}

function installBrowserWorkbookPicker(){
  const choose=document.getElementById('chooseWorkbook'),analyze=document.getElementById('analyzeWorkbook'),pathBox=document.getElementById('workbookPath');
  if(!choose||!analyze||!pathBox)return;
  const picker=document.createElement('input');
  picker.type='file';picker.accept='.xlsx,.xlsm,.xls';picker.hidden=true;picker.id='workbookBrowserPicker';
  document.body.appendChild(picker);

  choose.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    picker.value='';picker.click();
  },true);
  picker.addEventListener('change',()=>{
    selectedWorkbookFile=picker.files?.[0]||null;
    pathBox.value=selectedWorkbookFile?.name||'';
  });

  analyze.addEventListener('click',async e=>{
    if(allowOriginalAnalyze||!selectedWorkbookFile)return;
    e.preventDefault();e.stopImmediatePropagation();
    const originalLabel=analyze.textContent;
    analyze.disabled=true;analyze.textContent='در حال آماده‌سازی فایل…';
    try{
      const dataUrl=await fileToDataURL(selectedWorkbookFile);
      const d=await localBridge('/workbook/upload',{filename:selectedWorkbookFile.name,data_url:dataUrl});
      if(!d.path)throw new Error('مسیر فایل محلی ایجاد نشد.');
      pathBox.value=d.path;
      allowOriginalAnalyze=true;
      analyze.disabled=false;analyze.textContent=originalLabel;
      analyze.click();
    }catch(err){
      analyze.disabled=false;analyze.textContent=originalLabel;
      showAppMessage('ارتباط با فایل TM','فایل انتخاب شد، اما رابط ویندوز در دسترس نیست. ابتدا «دانلود رابط ویندوز» را اجرا کنید و اگر Chrome اجازه Local network access خواست، Allow را انتخاب کنید.\n\n'+String(err?.message||''));
      checkBridgeStatus();
    }finally{
      allowOriginalAnalyze=false;
    }
  },true);
}

const TEMPLATE_FONTS=['B Nazanin','B Mitra','B Lotus','Tahoma','Arial','Times New Roman'];
const TEMPLATE_SIZES=[10,11,12,13,14,15,16,18,20,22];
function templateKey(){return document.getElementById('templateKey')?.value||'state1'}
function styleStorageKey(key){return 'bamco_template_style_'+key}
function applyEditorStyle(){
  const font=document.getElementById('templateFontSelect')?.value||'B Nazanin';
  const size=document.getElementById('templateSizeSelect')?.value||'14';
  for(const el of [document.getElementById('templateSubject'),document.getElementById('templateBody')]){
    if(!el)continue;
    el.style.fontFamily=`${font}, Tahoma, Arial, sans-serif`;
    el.style.fontSize=`${size}pt`;
  }
}
async function loadTemplateStyle(){
  const key=templateKey();
  let pref=null;
  try{
    const d=await localBridge('/config',null,'GET');
    const t=d.config?.templates?.[key]||{};
    if(t.font_family||t.font_size)pref={font_family:t.font_family||'B Nazanin',font_size:t.font_size||14};
  }catch{}
  if(!pref){try{pref=JSON.parse(localStorage.getItem(styleStorageKey(key))||'null')}catch{}}
  pref=pref||{font_family:'B Nazanin',font_size:14};
  const fs=document.getElementById('templateFontSelect'),ss=document.getElementById('templateSizeSelect');
  if(fs)fs.value=TEMPLATE_FONTS.includes(pref.font_family)?pref.font_family:'B Nazanin';
  if(ss)ss.value=String(TEMPLATE_SIZES.includes(Number(pref.font_size))?Number(pref.font_size):14);
  applyEditorStyle();
}
async function persistTemplateStyle(key,font_family,font_size){
  localStorage.setItem(styleStorageKey(key),JSON.stringify({font_family,font_size}));
  try{
    const d=await localBridge('/config',null,'GET');
    const cfg=d.config||{};cfg.templates=cfg.templates||{};cfg.templates[key]=cfg.templates[key]||{};
    cfg.templates[key].font_family=font_family;cfg.templates[key].font_size=font_size;
    await localBridge('/config/save',{config:cfg});
  }catch{}
}
function installTemplateControls(){
  const toolbar=document.querySelector('.editor-toolbar');
  if(!toolbar||document.getElementById('templateFontSelect'))return;
  [...toolbar.querySelectorAll('span')].filter(s=>/^فونت:|^اندازه:/.test(s.textContent.trim())).forEach(s=>s.remove());
  const firstButton=toolbar.querySelector('button');
  const holder=document.createElement('div');holder.style.display='contents';
  const fontLabel=document.createElement('label');fontLabel.innerHTML='فونت ';
  const font=document.createElement('select');font.id='templateFontSelect';font.className='template-font-select';font.innerHTML=TEMPLATE_FONTS.map(x=>`<option>${x}</option>`).join('');fontLabel.appendChild(font);
  const sizeLabel=document.createElement('label');sizeLabel.innerHTML='اندازه ';
  const size=document.createElement('select');size.id='templateSizeSelect';size.className='template-size-select';size.innerHTML=TEMPLATE_SIZES.map(x=>`<option>${x}</option>`).join('');sizeLabel.appendChild(size);
  const note=document.createElement('span');note.className='english-font-note';note.textContent='English: Times New Roman';
  toolbar.insertBefore(fontLabel,firstButton);toolbar.insertBefore(sizeLabel,firstButton);toolbar.insertBefore(note,firstButton);
  font.addEventListener('change',applyEditorStyle);size.addEventListener('change',applyEditorStyle);

  document.getElementById('resetTemplate')?.remove();
  document.getElementById('previewTemplate')?.remove();
  document.getElementById('editTemplate')?.addEventListener('click',()=>setTimeout(loadTemplateStyle,0));
  document.getElementById('templateKey')?.addEventListener('change',()=>{if(document.getElementById('templateDialog')?.open)setTimeout(loadTemplateStyle,0)});
  document.getElementById('templateForm')?.addEventListener('submit',async()=>{
    const key=templateKey(),font_family=font.value,font_size=Number(size.value||14);
    localStorage.setItem(styleStorageKey(key),JSON.stringify({font_family,font_size}));
    for(let i=0;i<12;i++){
      await wait(250);
      if(!document.getElementById('templateDialog')?.open){await persistTemplateStyle(key,font_family,font_size);break}
    }
  });
}

function transposeStickerMatrix(){
  const m=document.getElementById('packMatrix');
  if(!m)return;
  const states=[['state1','وضعیت مطلوب'],['state2','یادآوری'],['state3','نیازمند توجه'],['state4','پیگیری جدی'],['state5','اقدام فوری']];
  m.innerHTML='<div class="pack-head">وضعیت</div><div class="pack-head">نسخه خانم</div><div class="pack-head">نسخه آقا</div>';
  for(const [key,label] of states){
    m.insertAdjacentHTML('beforeend',`<div class="pack-head state-name">${label}</div>`);
    for(const [gender,suffix] of [['خانم','female'],['آقا','male']]){
      m.insertAdjacentHTML('beforeend',`<div class="pack-cell"><input id="pack_${key}_${suffix}" type="file" accept="image/png,image/jpeg,image/webp" aria-label="${label} ${gender}"></div>`);
    }
  }
}

function normalizeEnglishCells(){
  document.querySelectorAll('#peopleTable tbody tr').forEach(tr=>{
    const cells=tr.cells;if(cells.length>=6){cells[1].classList.add('ltr');if(cells[1].textContent.includes('؛'))cells[1].textContent=cells[1].textContent.replaceAll('؛',';')}
  });
}
function watchPeopleTable(){
  const body=document.querySelector('#peopleTable tbody');if(!body)return;
  normalizeEnglishCells();new MutationObserver(normalizeEnglishCells).observe(body,{childList:true,subtree:true});
}

function init(){
  addBridgeControls();
  installBrowserWorkbookPicker();
  installTemplateControls();
  transposeStickerMatrix();
  watchPeopleTable();
  checkBridgeStatus();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})();

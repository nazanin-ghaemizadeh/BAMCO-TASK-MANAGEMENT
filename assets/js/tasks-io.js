(()=>{
let preview=[],importArchived=false,importFile=null,committing=false;
const key=(o,...ks)=>{for(const k of ks)if(o[k]!==undefined&&String(o[k]).trim()!=='')return o[k];return null};
const iso=v=>{if(!v)return null;if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'&&window.XLSX?.SSF){const d=window.XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null}const s=en(String(v).trim()).replace(/-/g,'/');if(/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)){const [y,m,d]=s.split('/').map(Number);if(y<1700&&typeof jalaliToISO==='function')return jalaliToISO(y,m,d);const out=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const test=new Date(out+'T12:00:00');return Number.isNaN(test.getTime())?null:out}return null};
function owner(value){const s=norm(value).toLowerCase();return state.profiles.find(p=>norm(p.full_name).toLowerCase()===s||norm(p.excel_name).toLowerCase()===s||String(p.email||'').toLowerCase()===s)}
const escAttr=s=>safe(s).replace(/"/g,'&quot;');
function setupDialog(){
 const d=document.querySelector('#importDialog');if(!d||d.dataset.errorEditor==='1')return;d.dataset.errorEditor='1';
 d.innerHTML=`<div class="modal-head"><div><h3>اصلاح خطاهای ورود از اکسل</h3><p id="importSummary"></p></div><button type="button" data-close="importDialog">×</button></div><div class="table-wrap import-error-wrap"><table class="import-error-table"><thead><tr><th>ردیف</th><th>شناسه</th><th>عنوان</th><th>متولی</th><th>وضعیت</th><th>اولویت</th><th>تاریخ شروع</th><th>تاریخ انجام</th><th>تاریخ پایان</th><th>علت مشکل</th></tr></thead><tbody id="importPreviewBody"></tbody></table></div><div class="modal-actions"><button type="button" class="ghost" data-close="importDialog">انصراف</button><button id="commitImportBtn" type="button" class="primary">بررسی و ورود</button></div>`;
 d.querySelector('[data-close="importDialog"]')?.addEventListener('click',()=>d.close());
 d.querySelector('.modal-actions [data-close="importDialog"]')?.addEventListener('click',()=>d.close());
 d.querySelector('#commitImportBtn')?.addEventListener('click',commit);
 d.querySelector('#importPreviewBody')?.addEventListener('input',editRow);
 d.querySelector('#importPreviewBody')?.addEventListener('change',editRow);
}
function dateText(v){return v?String(v):''}
function validateAll(){
 const ids=new Map();preview.forEach(r=>{const id=Number(r.data.legacy_id)||null;if(id)ids.set(id,(ids.get(id)||0)+1)});
 preview.forEach(r=>{
  const errors=[],data=r.data;
  if(!String(data.title||'').trim())errors.push('عنوان خالی است');
  if(!data.owner_id)errors.push('متولی معتبر انتخاب نشده است');
  if(data.legacy_id&&state.tasks.some(t=>Number(t.legacy_id||t.id)===Number(data.legacy_id)))errors.push('شناسه قبلاً در سامانه وجود دارد');
  if(data.legacy_id&&(ids.get(Number(data.legacy_id))||0)>1)errors.push('شناسه در همین فایل تکراری است');
  for(const [raw,label,field] of [[r.rawStart,'تاریخ شروع','start_date'],[r.rawDone,'تاریخ انجام','done_date'],[r.rawDue,'تاریخ پایان','due_date']]){if(String(raw||'').trim()&&!data[field])errors.push(`${label} نامعتبر است`)}
  try{const candidate={...data};window.bamcoOptions.normalizeTask(candidate,null);Object.assign(data,candidate);if(importArchived&&!window.bamcoOptions.status(data)?.archivable)errors.push('این وضعیت اجازه ورود مستقیم به آرشیو ندارد')}catch(error){errors.push(error.message)}
  r.errors=[...new Set([...errors,r.serverError].filter(Boolean))];
 });
 return preview.filter(r=>r.errors.length);
}
function ownerOptions(selected){return '<option value="">انتخاب متولی</option>'+state.profiles.filter(p=>p.active!==false).map(p=>`<option value="${escAttr(p.id)}" ${String(p.id)===String(selected)?'selected':''}>${safe(p.full_name||p.excel_name||p.email||'—')}</option>`).join('')}
function options(type,value){const rows=window.bamcoOptions.ordered(type,preview.map(r=>r.data[type])).filter(Boolean);return rows.map(v=>`<option ${String(v)===String(value)?'selected':''}>${safe(v)}</option>`).join('')}
function renderErrors(){
 setupDialog();const bad=validateAll(),body=document.querySelector('#importPreviewBody'),summary=document.querySelector('#importSummary');
 if(summary)summary.textContent=bad.length?`${fa(bad.length)} ردیف نیاز به اصلاح دارد. علت هر خطا در ستون آخر نوشته شده است.`:'همه ردیف‌ها آماده ورود هستند.';
 if(body)body.innerHTML=bad.map(r=>`<tr class="row-overdue" data-row="${r.row}"><td>${fa(r.row)}</td><td><input data-field="legacy_id" inputmode="numeric" value="${escAttr(r.data.legacy_id||'')}"></td><td><input data-field="title" value="${escAttr(r.data.title)}"></td><td><select data-field="owner_id">${ownerOptions(r.data.owner_id)}</select></td><td><select data-field="status">${options('status',r.data.status)}</select></td><td><select data-field="priority">${options('priority',r.data.priority)}</select></td><td><input data-field="rawStart" value="${escAttr(dateText(r.rawStart))}" placeholder="۱۴۰۵/۰۱/۰۱"></td><td><input data-field="rawDone" value="${escAttr(dateText(r.rawDone))}" placeholder="۱۴۰۵/۰۱/۰۱"></td><td><input data-field="rawDue" value="${escAttr(dateText(r.rawDue))}" placeholder="۱۴۰۵/۰۱/۰۱"></td><td class="import-error-reason">${safe(r.errors.join('؛ '))}</td></tr>`).join('');
 const d=document.querySelector('#importDialog');if(bad.length&&!d.open)d.showModal();
 return bad;
}
function editRow(e){
 const input=e.target.closest('[data-field]'),tr=e.target.closest('tr[data-row]');if(!input||!tr)return;const r=preview.find(x=>String(x.row)===String(tr.dataset.row));if(!r)return;const f=input.dataset.field,v=input.value;r.serverError='';
 if(f==='legacy_id')r.data.legacy_id=Number(en(v))||null;
 else if(f==='rawStart'){r.rawStart=v;r.data.start_date=iso(v)}
 else if(f==='rawDone'){r.rawDone=v;r.data.done_date=iso(v)}
 else if(f==='rawDue'){r.rawDue=v;r.data.due_date=iso(v)}
 else r.data[f]=v;
 window.clearTimeout(editRow.timer);editRow.timer=window.setTimeout(renderErrors,80);
}
async function parse(file){
  setupDialog();importFile=file;await window.bamcoOptions.load(true);
  const XLSX=await window.ensureBamcoXLSX();
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  preview=rows.map((r,i)=>{
    const rawOwner=key(r,'متولی','نام در اکسل','ایمیل','owner'),who=owner(rawOwner);
    const title=key(r,'عنوان فعالیت','عنوان کار','عنوان','title');
    const rawStart=key(r,'تاریخ شروع','start_date')||'',rawDone=key(r,'تاریخ انجام','done_date')||'',rawDue=key(r,'تاریخ پایان','due_date')||'';
    const data={legacy_id:Number(en(key(r,'شناسه','ID','id')||''))||null,title:String(title||''),description:String(key(r,'توضیحات','description')||''),owner_id:who?.id||null,status:String(key(r,'وضعیت','status')||window.bamcoOptions.label('status','registered')),priority:String(key(r,'اولویت','priority')||window.bamcoOptions.label('priority','medium')),start_date:iso(rawStart),done_date:iso(rawDone),due_date:iso(rawDue),reminder_days:Number(en(key(r,'یادآور','reminder_days')||0))||0,manager_notes:String(key(r,'توضیحات مدیر','manager_notes')||''),archived:importArchived,archived_at:importArchived?new Date().toISOString():null,source:'excel'};
    return{row:i+2,errors:[],data,rawOwner,rawStart,rawDone,rawDue};
  });
  if(!preview.length){toast('فایل انتخاب‌شده ردیف قابل ورود ندارد.',true);return}
  const bad=renderErrors();if(!bad.length)await commit();
}
async function commit(){
 if(committing)return;preview.forEach(r=>r.serverError='');const bad=renderErrors();if(bad.length){toast(`${fa(bad.length)} ردیف هنوز نیاز به اصلاح دارد.`,true);return}
 committing=true;const button=document.querySelector('#commitImportBtn');if(button)button.disabled=true;let ok=0,failed=0,firstError='';const remaining=[];
 try{
  for(const r of preview){try{await insert('tasks',{...r.data,created_by:state.profile.id});ok++}catch(e){failed++;r.serverError=e.message;remaining.push(r);if(!firstError)firstError=e.message}}
  if(!failed)document.querySelector('#importDialog')?.close();toast(`${fa(ok)} رکورد وارد شد${failed?`؛ ${fa(failed)} خطا`:' و خطایی وجود نداشت.'}${firstError?' '+firstError:''}`,failed>0);preview=remaining;if(!failed)importFile=null;try{await refresh()}finally{if(failed)renderErrors()}
 }finally{committing=false;if(button)button.disabled=false;const file=document.querySelector('#importFile');if(file)file.value=''}
}
async function exportRows(archived){
  await window.bamcoOptions.load(true);
  const XLSX=await window.ensureBamcoXLSX();
  const chosen=new Set(window.bamcoSelection?.ids(archived?'#archiveBody':'#kanbanBody')||[]),rows=state.tasks.filter(t=>!!t.archived===archived&&(!chosen.size||chosen.has(String(t.id)))),headers=['شناسه','عنوان فعالیت','توضیحات','متولی','وضعیت','اولویت','تاریخ شروع','تاریخ انجام','تاریخ پایان','یادآور','آخرین به‌روزرسانی','وضعیت دیرکرد','توضیحات مدیر',...(archived?['تأخیر','تعجیل']:[])];
  const asDate=value=>value?jalaliText(value):'';
  const data=rows.map(t=>[Number(displayId(t)),t.title,t.description||'',ownerName(t),t.status,t.priority,asDate(t.start_date),asDate(t.done_date),asDate(t.due_date),fa(t.reminder_days||0),t.last_updated_at?jalaliDateTime(t.last_updated_at):'',t.due_state||'عادی',t.manager_notes||'',...(archived?[Number(t.delay_days||0),Number(t.advance_days||0)]:[])]);
  const ws=XLSX.utils.aoa_to_sheet([headers,...data]),range=XLSX.utils.decode_range(ws['!ref']);
  const border={top:{style:'thin',color:{rgb:'7F8C87'}},bottom:{style:'thin',color:{rgb:'7F8C87'}},left:{style:'thin',color:{rgb:'7F8C87'}},right:{style:'thin',color:{rgb:'7F8C87'}}};
  for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){
    const address=XLSX.utils.encode_cell({r,c}),cell=ws[address]||(ws[address]={t:'s',v:''}),persian=/[\u0600-\u06ff]/.test(String(cell.v??''));
    cell.s=r===0?{font:{name:'B Nazanin',sz:14,bold:true,color:{rgb:'FFFFFF'}},fill:{patternType:'solid',fgColor:{rgb:'176B4D'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2,wrapText:false},border}:{font:{name:persian?'B Nazanin':'Times New Roman',sz:12},alignment:{horizontal:persian?'right':'left',vertical:'center',readingOrder:persian?2:1,wrapText:true},border};
  }
  for(let r=1;r<=rows.length;r++)for(const [c,type]of [[4,'status'],[5,'priority']]){const cell=ws[XLSX.utils.encode_cell({r,c})],hex=window.bamcoOptions.color(type,rows[r-1]).slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),light=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];cell.s.fill={patternType:'solid',fgColor:{rgb:hex}};cell.s.font.color={rgb:light>.179?'000000':'FFFFFF'}}
  ws['!views']=[{rightToLeft:true}];ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:range.e.r,c:range.e.c}})};ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
  for(let r=1;r<=range.e.r;r++){for(const c of [6,7,8])if(ws[XLSX.utils.encode_cell({r,c})]?.v)ws[XLSX.utils.encode_cell({r,c})].z='yyyy/mm/dd';if(ws[XLSX.utils.encode_cell({r,c:10})]?.v)ws[XLSX.utils.encode_cell({r,c:10})].z='yyyy/mm/dd hh:mm'}
  ws['!rows']=[{hpt:28},...rows.map(()=>({hpt:24}))];ws['!cols']=headers.map((h,i)=>({wch:[10,28,42,24,18,12,15,15,15,10,22,18,30,10,10][i]||14}));
  const wb=XLSX.utils.book_new();wb.__bamcoCatalogColors=true;wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,archived?'آرشیو':'کانبان');XLSX.writeFile(wb,`خروجی ${archived?'آرشیو':'کانبان'}_${jalaliText(new Date().toISOString()).replaceAll('/','-')}.xlsx`,{compression:true});toast('فایل Excel راست‌چین و قالب‌بندی‌شده آماده شد.');
}
setupDialog();
document.querySelector('#importBtn')?.addEventListener('click',()=>{importArchived=false;document.querySelector('#importFile').click()});document.querySelector('#archiveImportBtn')?.addEventListener('click',()=>{importArchived=true;document.querySelector('#importFile').click()});document.querySelector('#importFile')?.addEventListener('change',e=>e.target.files?.[0]&&parse(e.target.files[0]).catch(x=>toast(x.message,true)));document.querySelector('#kanbanExportBtn')?.addEventListener('click',()=>exportRows(false));document.querySelector('#archiveExportBtn')?.addEventListener('click',()=>exportRows(true));
window.BAMCO_DATA_IO={iso,exportRows,parse};
})();

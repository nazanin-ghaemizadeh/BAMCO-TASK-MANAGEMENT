(()=>{'use strict';
const q=(s,r=document)=>r?.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fa=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),money=v=>fa(window.BamcoMoney.format(v??'0')),bucket='petty-cash-private';
const categories=['بنزین','هوش مصنوعی','تنخواه ماموریت','ملزومات مصرفی','اثاثه','ایاب و ذهاب','خدمات','نگهداری و تعمیرات','آموزش'].sort((a,b)=>a.localeCompare(b,'fa'));
const categoryOptions=current=>'<option value="">انتخاب دسته‌بندی</option>'+[...(current&&!categories.includes(current)?[current]:[]),...categories].map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');
let entries=[],attachments=[],loaded=false,busy=false,loadPending=null;const signed=e=>e.status==='void'?'0':e.entry_type==='receipt'?String(e.amount||'0'):window.BamcoMoney.subtract('0',e.amount||'0');
const has=action=>window.BamcoAccess?.can?.('pettyCash',action||'view')===true;
const denied=action=>window.BamcoAccess?.denied?.('pettyCash',action||'view');
async function ensureAccess(action='view'){const access=window.BamcoAccess;if(state?.token&&!access?.isReady?.())await access?.refresh?.();return !!state?.token&&has(action)}
async function load(){if(loadPending)return loadPending;if(!await ensureAccess())return;if(loadPending)return loadPending;busy=true;loadPending=(async()=>{try{[entries,attachments]=await Promise.all([selectAll('petty_cash_entries','select=id,entry_no,event_date,entry_type,amount::text,category,counterparty,responsible_id,description,document_no,payment_method,cost_center,notes,status,void_reason,created_by,updated_by,created_at,updated_at,version&order=event_date.asc,entry_no.asc'),selectAll('petty_cash_attachments','select=*&order=created_at.desc')]);loaded=true;render()}catch(e){const error=q('#pettyCashError');if(error)error.textContent=e.message}finally{busy=false;loadPending=null}})();return loadPending}
const orderedEntries=()=>entries.filter(e=>e.status!=='void').sort((a,b)=>String(a.event_date||'').localeCompare(String(b.event_date||''))||Number(a.entry_no||0)-Number(b.entry_no||0)||String(a.id).localeCompare(String(b.id)));
const validEntry=e=>e.status!=='void';
const activeExpense=e=>validEntry(e)&&e.entry_type==='expense';
const attachmentCount=e=>attachments.filter(a=>String(a.entry_id)===String(e.id)).length;
// Compute each historical balance oldest first, then present newest first.
function reportEntries(){
 let balance='0';
 const ordered=orderedEntries();
 for(const [index,e] of ordered.entries()){balance=window.BamcoMoney.add(balance,signed(e));e._balance=balance;e._rowNumber=index+1}
 return ordered.reverse();
}
function render(){
 let balance='0',received='0',spent='0';
 const ordered=reportEntries();
 for(const e of ordered){
  balance=window.BamcoMoney.add(balance,signed(e));
  if(e.entry_type==='receipt')received=window.BamcoMoney.add(received,e.amount);
  else spent=window.BamcoMoney.add(spent,e.amount);
 }
 q('#pettyCashSummary').innerHTML=`<article><small>مانده تنخواه</small><strong>${money(balance)} ریال</strong></article><article><small>جمع دریافت</small><strong>${money(received)} ریال</strong></article><article><small>جمع هزینه</small><strong>${money(spent)} ریال</strong></article><article><small>تعداد رویداد</small><strong>${fa(ordered.length)}</strong></article>`;
 q('#pettyCashBody').innerHTML=ordered.map(e=>`<tr class="${e.status==='void'?'void':''}" data-entry="${e.id}"><td>${fa(e._rowNumber)}</td><td>${jalaliText(e.event_date)}</td><td><span class="cash-type ${e.entry_type}">${e.entry_type==='receipt'?'دریافت':'هزینه'}</span></td><td>${money(e.amount)}</td><td>${money(e._balance)}</td><td>${esc(e.category||'')}</td><td>${esc(profileLabel(e.responsible_id))}</td><td>${esc(e.payment_method||'—')}</td><td>${esc(e.description||'')}</td><td>${fa(attachmentCount(e))}</td><td><button class="ghost" data-detail="${e.id}">مشاهده</button></td></tr>`).join('')||'<tr><td colspan="11">هنوز رویداد مالی ثبت نشده است.</td></tr>';
 window.bamcoReferenceTable?.refresh?.(q('#pettyCashView .cash-table table'),{filters:true});
}
const profileOptions=()=>[...(state.profiles||[]),state.profile].filter((p,i,a)=>p&&p.active!==false&&a.findIndex(x=>x.id===p.id)===i).map(p=>`<option value="${p.id}">${esc(p.display_name||p.full_name)}</option>`).join('');
function form(row){let committedPayload=null;const uploadedFiles=new Set(),action=row?'edit':'create';if(!has(action))return denied(action);let d=q('#pettyCashDialog');if(!d){d=document.createElement('dialog');d.id='pettyCashDialog';d.className='modal cash-dialog';document.body.append(d)}d.innerHTML=`<form><div class="modal-head"><div><h3>${row?'ویرایش رویداد':'ثبت رویداد مالی'}</h3><p>مبالغ به ریال ثبت می‌شوند.</p></div><button type="button" data-close>×</button></div><div class="cash-form"><label>نوع<select name="entry_type"><option value="expense">هزینه</option><option value="receipt">دریافت</option></select></label><label>تاریخ<input type="date" name="event_date" required></label><label>مبلغ (ریال)<input type="text" inputmode="decimal" name="amount" data-money-input data-money-digits="fa" data-money-min="1" data-money-scale="0" data-money-integer-digits="18" required></label><label>متولی<select name="responsible_id" required>${profileOptions()}</select></label><label>دسته‌بندی<select name="category" required>${categoryOptions(row?.category)}</select></label><label>روش پرداخت<select name="payment_method"><option>کارت</option><option>نقدی</option><option>انتقال بانکی</option><option>چک</option><option>سایر</option></select></label><label class="wide">شرح رویداد (اختیاری)<textarea name="description" maxlength="1500"></textarea></label><label class="wide">ضمیمه‌ها<input type="file" name="files" multiple accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"><small>هر فایل حداکثر ۲۵ مگابایت</small></label></div><p class="form-error"></p><div class="modal-actions"><button type="button" class="ghost" data-close>انصراف</button><button class="primary" type="submit">ذخیره</button></div></form>`;const f=d.querySelector('form'),set=(n,v)=>{if(f.elements[n])f.elements[n].value=v??''};if(row)['entry_type','event_date','amount','responsible_id','category','payment_method','description'].forEach(n=>set(n,row[n]));else{set('event_date',new Date().toISOString().slice(0,10));set('responsible_id',state.profile.id)}window.BamcoMoney.bind(f);d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());f.onsubmit=async ev=>{ev.preventDefault();if(!has(action))return denied(action);const button=f.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;try{for(const file of f.elements.files.files)if(file.size>25*1024*1024)throw Error(`حجم «${file.name}» بیش از ۲۵ مگابایت است.`);const data=Object.fromEntries(new FormData(f));delete data.files;delete data.event_date_text;data.amount=window.BamcoMoney.raw(f.elements.amount);data.updated_by=state.profile.id;const signature=JSON.stringify(data);let saved;if(row&&signature===committedPayload)saved=row;else if(row){if(!has('edit'))throw Error('اجازهٔ ویرایش رویداد ثبت‌شده را ندارید.');data.version=row.version+1;saved=(await update('petty_cash_entries',`id=eq.${row.id}&version=eq.${row.version}`,data))[0];if(!saved)throw Error('رویداد هم‌زمان تغییر کرده؛ تازه‌سازی کنید.')}else saved=(await insert('petty_cash_entries',{...data,created_by:state.profile.id}))[0];if(!saved)throw Error('ثبت رویداد تأیید نشد؛ تازه‌سازی کنید.');row=saved;committedPayload=signature;for(const file of f.elements.files.files){if(uploadedFiles.has(file))continue;await upload(saved.id,file);uploadedFiles.add(file)}d.close();toast('رویداد مالی ذخیره شد.');await load()}catch(e){f.querySelector('.form-error').textContent=committedPayload?`رویداد مالی ذخیره شده است؛ ${e.message} برای تکمیل ضمیمه‌های باقی‌مانده دوباره ذخیره کنید.`:e.message}finally{button.disabled=false}};d.showModal()}
async function upload(entryId,file){if(!has('edit')&&!has('create'))throw Error('اجازهٔ بارگذاری ضمیمه را ندارید.');if(file.size>25*1024*1024)throw Error(`حجم «${file.name}» بیش از ۲۵ مگابایت است.`);const ext=file.name.split('.').pop().toLowerCase(),path=`${entryId}/${crypto.randomUUID()}.${ext}`,encoded=path.split('/').map(encodeURIComponent).join('/'),r=await fetch(`${SB_URL}/storage/v1/object/${bucket}/${encoded}`,{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':file.type},body:file});if(!r.ok)throw Error('بارگذاری ضمیمه انجام نشد.');try{await insert('petty_cash_attachments',{entry_id:entryId,storage_path:path,file_name:file.name,mime_type:file.type,file_size:file.size,uploaded_by:state.profile.id})}catch(e){await fetch(`${SB_URL}/storage/v1/object/${bucket}`,{method:'DELETE',headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]})});throw e}}
function detail(id){const e=entries.find(x=>x.id===id);if(!e)return;let d=q('#pettyCashDetail');if(!d){d=document.createElement('dialog');d.id='pettyCashDetail';d.className='modal cash-detail';document.body.append(d)}const files=attachments.filter(a=>a.entry_id===id);d.innerHTML=`<div class="modal-head"><div><h3>رویداد ردیف ${fa(e._rowNumber)}</h3><p>${e.status==='void'?'باطل‌شده':e.entry_type==='receipt'?'دریافت':'هزینه'}</p></div><button data-close>×</button></div><dl>${[['تاریخ',fa(e.event_date)],['مبلغ',money(e.amount)+' ریال'],['دسته‌بندی',e.category],['روش پرداخت',e.payment_method],['شرح',e.description]].map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(b||'—')}</dd></div>`).join('')}</dl><h4>ضمیمه‌ها</h4><div class="cash-files">${files.map(a=>`<button class="ghost" data-file="${a.id}"${has('export')?'':' disabled'}>${esc(a.file_name)}</button>`).join('')||'ضمیمه‌ای ندارد.'}</div><div class="modal-actions">${has('edit')?'<button class="ghost" data-edit>ویرایش</button>':''}${e.status==='active'&&has('delete')?'<button class="danger" data-delete>حذف رویداد</button>':''}<button class="ghost" data-close>بستن</button></div>`;d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>d.close());d.querySelector('[data-edit]')?.addEventListener('click',()=>{d.close();form(e)});d.querySelector('[data-delete]')?.addEventListener('click',async event=>{if(!has('delete'))return denied('delete');const button=event.currentTarget;if(!await window.bamcoConfirm('این رویداد از گزارش تنخواه و خروجی اکسل حذف شود؟'))return;if(button.disabled)return;button.disabled=true;try{const saved=await update('petty_cash_entries',`id=eq.${e.id}&version=eq.${e.version}`,{status:'void',void_reason:'حذف رویداد توسط کاربر',version:e.version+1,updated_by:state.profile.id});if(!saved?.length)throw Error('رویداد هم‌زمان تغییر کرده؛ تازه‌سازی کنید.');d.close();await load();toast('رویداد حذف شد.')}catch(error){toast(error.message,true)}finally{button.disabled=false}});d.onclick=async ev=>{const b=ev.target.closest('[data-file]');if(!b)return;if(!has('export'))return denied('export');const a=files.find(x=>x.id===b.dataset.file),path=a.storage_path.split('/').map(encodeURIComponent).join('/'),r=await fetch(`${SB_URL}/storage/v1/object/authenticated/${bucket}/${path}`,{headers:{apikey:SB_KEY,Authorization:'Bearer '+state.token}});if(!r.ok)return toast('دریافت ضمیمه انجام نشد.',true);const url=URL.createObjectURL(await r.blob()),x=document.createElement('a');x.href=url;x.download=a.file_name;x.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};d.showModal()}
// Monetary values are kept exact. Excel receives numeric cells only within
// JavaScript's safe integer range; larger rial values remain lossless text.
const excelRials=value=>{
 const digits=String(value??'0').trim();
 const number=Number(digits);
 return Number.isSafeInteger(number)?number:digits;
};
async function exportExcel(){
 if(!has('export'))return denied('export');
 if(!loaded||loadPending)await load();
 if(!loaded)throw new Error('گزارش تنخواه بارگذاری نشده است؛ ابتدا تازه‌سازی کنید.');
 const XLSX=await window.ensureBamcoXLSX();
 const ordered=reportEntries(),categoryTotals=new Map();
 let balance='0',received='0',spent='0',expenseCount=0;
 const headers=['ردیف','تاریخ','نوع','مبلغ (ریال)','مانده (ریال)','دسته‌بندی','متولی','روش پرداخت','شرح','ضمیمه'];
 const detailed=ordered.map((e,index)=>{
  balance=window.BamcoMoney.add(balance,signed(e));
  if(validEntry(e)){
   if(e.entry_type==='receipt')received=window.BamcoMoney.add(received,e.amount);
   else{
    spent=window.BamcoMoney.add(spent,e.amount);
    expenseCount++;
    const category=String(e.category||'بدون دسته‌بندی').trim()||'بدون دسته‌بندی';
    const group=categoryTotals.get(category)||{count:0,total:'0'};
    group.count++;
    group.total=window.BamcoMoney.add(group.total,e.amount);
    categoryTotals.set(category,group);
   }
  }
  return [e._rowNumber,e.event_date?jalaliText(e.event_date):'',e.entry_type==='receipt'?'دریافت':'هزینه',
   excelRials(e.amount),excelRials(e._balance),e.category||'',profileLabel(e.responsible_id),
   e.payment_method||'—',e.description||'',attachmentCount(e)];
 });
 const categories=[...categoryTotals.entries()].sort(([a],[b])=>a.localeCompare(b,'fa'));
 const categoryHeaders=['ردیف','دسته‌بندی','تعداد هزینه','جمع هزینه (ریال)'];
 const summary=categories.map(([category,value],index)=>[index+1,category,value.count,excelRials(value.total)]);
 summary.push(['','جمع کل هزینه‌ها',expenseCount,excelRials(spent)]);
 summary.push(['','جمع دریافت‌ها','',excelRials(received)]);
 summary.push(['','مانده تنخواه','',excelRials(balance)]);
 summary.push(['','توضیح','', 'رویدادهای حذف‌شده در گزارش منظور نشده‌اند. ریز رویدادها از جدید به قدیم مرتب شده و مانده هر سطر پس از همان رویداد محاسبه شده است.']);
 const detailSheet=XLSX.utils.aoa_to_sheet([headers,...detailed]);
 detailSheet['!cols']=[9,16,12,23,23,25,27,18,45,12].map(wch=>({wch}));
 detailSheet['!views']=[{rightToLeft:true}];
 detailSheet['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
 const summarySheet=XLSX.utils.aoa_to_sheet([categoryHeaders,...summary]);
 summarySheet['!cols']=[9,31,18,29].map(wch=>({wch}));
 summarySheet['!views']=[{rightToLeft:true}];
 summarySheet['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
 const wb=XLSX.utils.book_new();
 wb.Workbook={Views:[{RTL:true}]};
 XLSX.utils.book_append_sheet(wb,detailSheet,'ریز تنخواه');
 XLSX.utils.book_append_sheet(wb,summarySheet,'جمع‌بندی دسته‌بندی');
 const date=typeof jalaliText==='function'?jalaliText(new Date().toISOString().slice(0,10)).replaceAll('/','-'):new Date().toISOString().slice(0,10);
 XLSX.writeFile(wb,`گزارش تنخواه_${date}.xlsx`,{compression:true});
 toast('فایل اکسل ریز تنخواه و جمع‌بندی دسته‌بندی تهیه شد.');
}
function init(){const v=q('#pettyCashView');if(!v)return;v.innerHTML=`<section class="cash-panel"><header class="register-heading"><h3>گزارش تنخواه</h3></header><div class="cash-toolbar"><button class="content-back ghost" type="button">بازگشت به خانه</button><button class="primary" id="addCashEntry">ثبت رویداد</button><button class="ghost" id="refreshCash">تازه‌سازی</button><button class="ghost" id="exportCash">خروجی اکسل</button><button class="ghost hidden" id="pettyCashAccess" data-feature-access-control="local">مدیریت دسترسی</button><button class="ghost" id="cashDashboardToggle">نمایش داشبورد</button></div><p id="pettyCashError" class="form-error"></p><div id="pettyCashSummary" class="cash-summary hidden"></div><div class="table-wrap cash-table"><table data-table-suite="off" data-no-pagination="true"><thead><tr><th>ردیف</th><th>تاریخ</th><th>نوع</th><th>مبلغ (ریال)</th><th>مانده (ریال)</th><th>دسته‌بندی</th><th>متولی</th><th>روش پرداخت</th><th>شرح</th><th>ضمیمه</th><th>عملیات</th></tr></thead><tbody id="pettyCashBody"></tbody></table></div></section>`;try{titles.pettyCash='گزارش تنخواه'}catch{}const sync=()=>{q('#addCashEntry').disabled=!has('create');q('#exportCash').disabled=!has('export');q('#pettyCashAccess').classList.toggle('hidden',!has('manage_access'));q('#pettyCashError').textContent='';render()};q('#addCashEntry').onclick=()=>form();q('#refreshCash').onclick=load;q('#exportCash').onclick=()=>{void exportExcel().catch(error=>toast(error.message,true))};q('#pettyCashAccess').onclick=()=>window.bamcoAccessEditor?.open?.({featureKey:'pettyCash',title:'دسترسی به گزارش تنخواه'});q('#cashDashboardToggle').onclick=e=>{const box=q('#pettyCashSummary'),show=box.classList.toggle('hidden');e.currentTarget.textContent=show?'نمایش داشبورد':'پنهان‌کردن داشبورد'};q('.content-back',v).onclick=()=>window.bamcoShowHome?.();v.onclick=e=>{const b=e.target.closest('[data-detail]');if(b)detail(b.dataset.detail)};new MutationObserver(()=>{if(!v.classList.contains('hidden')&&!loaded)void load()}).observe(v,{attributes:true,attributeFilter:['class']});const app=q('#appView');if(app)new MutationObserver(()=>{if(!app.classList.contains('hidden'))void ensureAccess().then(sync)}).observe(app,{attributes:true,attributeFilter:['class']});window.addEventListener('bamco:feature-access-changed',()=>{void ensureAccess().then(sync)});void ensureAccess().then(sync)}

let cashDateField=null;
function prepareCashDate(){const form=q('#pettyCashDialog form'),iso=form?.elements?.event_date;if(!iso||iso.dataset.jalaliReady)return;iso.dataset.jalaliReady='1';iso.type='hidden';const wrap=document.createElement('span');wrap.className='cash-date-field';wrap.innerHTML='<input class="jalali-input" name="event_date_text" readonly required><button type="button" class="ghost bamco-icon-button" data-cash-calendar aria-label="انتخاب تاریخ">▦</button>';iso.before(wrap);const visible=wrap.querySelector('input');visible.value=iso.value&&typeof jalaliText==='function'?jalaliText(iso.value):'';wrap.onclick=e=>{if(!e.target.closest('input,button'))return;cashDateField={visible,iso};const p=iso.value&&typeof persianParts==='function'?persianParts(iso.value):currentJalali(),now=currentJalali();q('#calendarLabel').textContent='تاریخ رویداد مالی';q('#calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${fa(y)}</option>`).join('');q('#calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');q('#calYear').value=String(p.y);q('#calMonth').value=String(p.m);fillCalendarDays();q('#calDay').value=String(p.d);q('#calendarDialog').showModal()}}
function prepareCashFiles(){const form=q('#pettyCashDialog form'),input=form?.elements?.files;if(!input||input.dataset.pickerReady)return;input.dataset.pickerReady='1';const label=input.closest('label');label.classList.add('cash-file-picker');const choice=document.createElement('span');choice.className='cash-file-choice';choice.innerHTML='<span class="ghost">انتخاب فایل</span><b data-cash-file-name>فایلی انتخاب نشده است</b>';input.after(choice);input.addEventListener('change',()=>{const files=[...input.files],name=q('[data-cash-file-name]',label);name.textContent=!files.length?'فایلی انتخاب نشده است':files.length===1?files[0].name:`${fa(files.length)} فایل انتخاب شد`})}
function prepareCashDialog(){prepareCashDate();prepareCashFiles()}
new MutationObserver(prepareCashDialog).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(!cashDateField)return;if(e.target.closest('#setDateBtn')){e.preventDefault();e.stopImmediatePropagation();const iso=jalaliToISO(q('#calYear').value,q('#calMonth').value,q('#calDay').value);if(!iso)return toast('تاریخ انتخاب‌شده معتبر نیست.',true);cashDateField.iso.value=iso;cashDateField.visible.value=jalaliText(iso);cashDateField=null;q('#calendarDialog').close()}else if(e.target.closest('#clearDateBtn')){e.preventDefault();e.stopImmediatePropagation();cashDateField.iso.value='';cashDateField.visible.value='';cashDateField=null;q('#calendarDialog').close()}},true);
function registerNavigation(){
  window.BamcoNavigation?.configure?.({state,titles:{pettyCash:'گزارش تنخواه'}});
  try{window.BamcoNavigation?.registerView?.('pettyCash',{activate:()=>{if(!loaded&&!loadPending)void load()}})}catch{}
}
registerNavigation();
window.bamcoPettyCash={load,refresh:load};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();

(()=>{
let preview=[];
const key=(o,...ks)=>{for(const k of ks)if(o[k]!==undefined&&String(o[k]).trim()!=='')return o[k];return null};
const iso=v=>{if(!v)return null;if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'&&XLSX?.SSF){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:null}const s=String(v).trim();return /^\d{4}-\d{1,2}-\d{1,2}$/.test(s)?s.split('-').map((x,i)=>i?x.padStart(2,'0'):x).join('-'):null};
function owner(value){const s=norm(value).toLowerCase();return state.profiles.find(p=>norm(p.full_name).toLowerCase()===s||norm(p.excel_name).toLowerCase()===s||String(p.email).toLowerCase()===s)}
async function parse(file){
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  preview=rows.map((r,i)=>{
    const who=owner(key(r,'متولی','نام در اکسل','ایمیل','owner'));
    const title=key(r,'عنوان فعالیت','عنوان کار','عنوان','title');
    const status=String(key(r,'وضعیت','status')||'ثبت شده'),errors=[];
    if(!title)errors.push('عنوان خالی');if(!who)errors.push('متولی نامعتبر');
    if(!['ثبت شده','منتظر پاسخ','در حال انجام','انجام شده'].includes(status))errors.push('وضعیت نامعتبر');
    return{row:i+2,errors,data:{legacy_id:Number(key(r,'شناسه','ID','id'))||null,title:String(title||''),description:String(key(r,'توضیحات','description')||''),owner_id:who?.id,status,priority:String(key(r,'اولویت','priority')||'متوسط'),start_date:iso(key(r,'تاریخ شروع','start_date')),done_date:iso(key(r,'تاریخ انجام','done_date')),due_date:status==='منتظر پاسخ'?null:iso(key(r,'تاریخ پایان','due_date')),reminder_days:Number(key(r,'یادآور','reminder_days')||0),manager_notes:String(key(r,'توضیحات مدیر','manager_notes')||''),source:'excel'}};
  });
  renderPreview(rows.length);
}
function renderPreview(total){const bad=preview.filter(x=>x.errors.length).length;document.querySelector('#importSummary').textContent=`${fa(total)} رکورد بررسی شد؛ ${fa(total-bad)} معتبر و ${fa(bad)} دارای خطاست.`;document.querySelector('#importPreviewBody').innerHTML=preview.slice(0,100).map(x=>`<tr class="${x.errors.length?'row-overdue':''}"><td>${fa(x.row)}</td><td>${fa(x.data.legacy_id||'—')}</td><td>${safe(x.data.title)}</td><td>${safe(ownerName(x.data))}</td><td>${safe(x.errors.join('، ')||'آماده ورود')}</td></tr>`).join('');document.querySelector('#importDialog').showModal()}
async function commit(){const mode=document.querySelector('#duplicateMode').value,valid=preview.filter(x=>!x.errors.length);let ok=0,failed=0;for(const r of valid){try{const exists=r.data.legacy_id?state.tasks.find(t=>Number(t.legacy_id||t.id)===r.data.legacy_id):null;if(exists&&mode==='reject')continue;if(exists&&mode==='update')await update('tasks',`id=eq.${exists.id}`,{...r.data,legacy_id:exists.legacy_id});else await insert('tasks',{...r.data,legacy_id:exists&&mode==='create'?null:r.data.legacy_id,created_by:state.profile.id});ok++}catch{failed++}}document.querySelector('#importDialog').close();toast(`${fa(ok)} رکورد وارد شد؛ ${fa(failed)} خطا.`);await refresh()}
function exportRows(archived){const rows=state.tasks.filter(t=>!!t.archived===archived);const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheetXml(archived?'Archive':'KANBAN',rows)}</Workbook>`,a=document.createElement('a');a.href=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'}));a.download=`BAMCO_${archived?'Archive':'KANBAN'}_${new Date().toISOString().slice(0,10)}.xls`;a.click();URL.revokeObjectURL(a.href)}
document.querySelector('#importBtn')?.addEventListener('click',()=>document.querySelector('#importFile').click());document.querySelector('#importFile')?.addEventListener('change',e=>e.target.files?.[0]&&parse(e.target.files[0]).catch(x=>toast(x.message,true)));document.querySelector('#commitImportBtn')?.addEventListener('click',commit);document.querySelector('#kanbanExportBtn')?.addEventListener('click',()=>exportRows(false));document.querySelector('#archiveExportBtn')?.addEventListener('click',()=>exportRows(true));
})();

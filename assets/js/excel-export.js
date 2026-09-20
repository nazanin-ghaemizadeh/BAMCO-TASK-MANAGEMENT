(()=>{
'use strict';
const q=s=>document.querySelector(s);
const faDigits=v=>String(v??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const latinDigits=v=>String(v??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const normalizeHeader=v=>latinDigits(v).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
const dateHeaders=new Set(['تاریخ شروع','تاریخ انجام','تاریخ پایان','start_date','done_date','due_date']);
function normalizeDateValue(value,XLSX){
 if(value===null||value===undefined||value==='')return value;
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 let raw=latinDigits(value).trim();if(!raw)return '';
 raw=raw.replace(/[،,]/g,' ').replace(/\u200c/g,' ').trim();
 if(/^\d{4,6}(?:\.0+)?$/.test(raw)){
  const n=Number(raw);if(n>=20000&&n<=80000&&XLSX?.SSF){const p=XLSX.SSF.parse_date_code(n);if(p)return `${p.y}/${String(p.m).padStart(2,'0')}/${String(p.d).padStart(2,'0')}`}
 }
 const compact=raw.match(/^(\d{4})(\d{2})(\d{2})$/);if(compact)return `${compact[1]}/${Number(compact[2])}/${Number(compact[3])}`;
 const nums=raw.match(/\d+/g)||[];
 if(nums.length>=3){
  let y,m,d;
  if(nums[0].length===4){[y,m,d]=nums.slice(0,3)}
  else if(nums[2].length===4){d=nums[0];m=nums[1];y=nums[2]}
  if(y){const yn=Number(y),mn=Number(m),dn=Number(d);if(mn>=1&&mn<=12&&dn>=1&&dn<=31)return `${yn}/${mn}/${dn}`}
 }
 const parsed=new Date(raw);if(!Number.isNaN(parsed.getTime())&&/\d{4}/.test(raw))return `${parsed.getFullYear()}/${parsed.getMonth()+1}/${parsed.getDate()}`;
 return value;
}
async function normalizedFile(file){
 const XLSX=await window.ensureBamcoXLSX();
 const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
 for(const name of wb.SheetNames){
  const ws=wb.Sheets[name],ref=ws['!ref'];if(!ref)continue;const range=XLSX.utils.decode_range(ref),dateCols=[];
  for(let c=range.s.c;c<=range.e.c;c++){
   const addr=XLSX.utils.encode_cell({r:range.s.r,c}),cell=ws[addr];if(!cell)continue;const normalized=normalizeHeader(cell.v);cell.v=normalized;cell.t='s';if(dateHeaders.has(normalized))dateCols.push(c);
  }
  for(let r=range.s.r+1;r<=range.e.r;r++)for(const c of dateCols){const addr=XLSX.utils.encode_cell({r,c}),cell=ws[addr];if(!cell||cell.v==='')continue;const fixed=normalizeDateValue(cell.v,XLSX);cell.v=fixed;cell.t=fixed instanceof Date?'d':typeof fixed==='number'?'n':'s'}
 }
 const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array',cellDates:true,compression:true});
 return new File([bytes],file.name.replace(/\.(xls|csv)$/i,'.xlsx'),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',lastModified:file.lastModified||Date.now()});
}
async function exportRows(archived){
 await window.bamcoOptions.load(true);const XLSX=await window.ensureBamcoXLSX();
 const chosen=new Set(window.bamcoSelection?.ids(archived?'#archiveBody':'#kanbanBody')||[]),rows=state.tasks.filter(t=>!!t.archived===archived&&(!chosen.size||chosen.has(String(t.id))));
 const headers=['شناسه','عنوان فعالیت','توضیحات','متولی','وضعیت','اولویت','تاریخ شروع','تاریخ انجام','تاریخ پایان','یادآور','آخرین به‌روزرسانی','وضعیت دیرکرد','توضیحات مدیر',...(archived?['تأخیر','تعجیل']:[])];
 const asDate=value=>value?jalaliText(value):'';
 const data=rows.map(t=>[Number(displayId(t)),t.title,t.description||'',ownerName(t),t.status,t.priority,asDate(t.start_date),asDate(t.done_date),asDate(t.due_date),faDigits(t.reminder_days||0),t.last_updated_at?jalaliDateTime(t.last_updated_at):'',t.due_state||'فاقد شرایط دیرکرد',t.manager_notes||'',...(archived?[Number(t.delay_days||0),Number(t.advance_days||0)]:[])]);
 const ws=XLSX.utils.aoa_to_sheet([headers,...data]),range=XLSX.utils.decode_range(ws['!ref']);
 const border={top:{style:'thin',color:{rgb:'7F8C87'}},bottom:{style:'thin',color:{rgb:'7F8C87'}},left:{style:'thin',color:{rgb:'7F8C87'}},right:{style:'thin',color:{rgb:'7F8C87'}}};
 for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){
  const address=XLSX.utils.encode_cell({r,c}),cell=ws[address]||(ws[address]={t:'s',v:''}),persian=/[\u0600-\u06ff]/.test(String(cell.v??''));
  cell.s=r===0?{font:{name:'B Nazanin',sz:14,bold:true,color:{rgb:'FFFFFF'}},fill:{patternType:'solid',fgColor:{rgb:'176B4D'}},alignment:{horizontal:'center',vertical:'center',readingOrder:2,wrapText:false},border}:{font:{name:persian?'B Nazanin':'Times New Roman',sz:12,color:{rgb:'203E30'}},fill:{patternType:'solid',fgColor:{rgb:'FFFFFF'}},alignment:{horizontal:persian?'right':'left',vertical:'center',readingOrder:persian?2:1,wrapText:true},border};
 }
 // Warning and overdue rows are colored across the row first. Status/priority cells
 // are intentionally excluded from that row color because their catalog colors win.
 for(let r=1;r<=rows.length;r++){
  const due=normalizeHeader(rows[r-1].due_state),rowFill=due==='دیرکرد'?'FBE4E2':due.includes('هشدار')?'FFF1CA':null;
  if(rowFill)for(let c=range.s.c;c<=range.e.c;c++){if(c===4||c===5)continue;const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell)cell.s.fill={patternType:'solid',fgColor:{rgb:rowFill}}}
  for(const [c,type]of [[4,'status'],[5,'priority']]){const cell=ws[XLSX.utils.encode_cell({r,c})],hex=window.bamcoOptions.color(type,rows[r-1]).slice(1),rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),light=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];cell.s.fill={patternType:'solid',fgColor:{rgb:hex}};cell.s.font.color={rgb:light>.179?'000000':'FFFFFF'}}
 }
 ws['!views']=[{rightToLeft:true}];ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:range.e.r,c:range.e.c}})};ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
 ws['!rows']=[{hpt:28},...rows.map(()=>({hpt:24}))];ws['!cols']=headers.map((h,i)=>({wch:[10,28,42,24,18,12,15,15,15,10,22,18,30,10,10][i]||14}));
 const wb=XLSX.utils.book_new();wb.__bamcoCatalogColors=true;wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,archived?'آرشیو':'کانبان');
 XLSX.writeFile(wb,`خروجی ${archived?'آرشیو':'کانبان'}_${jalaliText(new Date().toISOString()).replaceAll('/','-')}.xlsx`,{compression:true});
 toast('فایل Excel راست‌چین و قالب‌بندی‌شده آماده شد.');
}
function install(){
 const input=q('#importFile');if(input&&input.dataset.flexibleExcelImport!=='1'){
  input.dataset.flexibleExcelImport='1';input.addEventListener('change',e=>{
   const file=e.target.files?.[0];if(!file)return;e.preventDefault();e.stopImmediatePropagation();
   void normalizedFile(file).then(f=>window.BAMCO_DATA_IO.parse(f)).catch(err=>toast(err.message||'خواندن فایل Excel انجام نشد.',true));
  },true);
 }
 for(const [selector,archived]of [['#kanbanExportBtn',false],['#archiveExportBtn',true]])q(selector)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();void exportRows(archived).catch(err=>toast(err.message,true))},true);
 if(window.BAMCO_DATA_IO)window.BAMCO_DATA_IO.exportRows=exportRows;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

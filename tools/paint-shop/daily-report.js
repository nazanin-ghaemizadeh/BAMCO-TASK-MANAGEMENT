/* Daily summaries keep their own uploads and never change the oven workspaces. */
'use strict';
(function(){
  const ovens=[{id:'ed',name:'ED Oven',reference:'ed'},{id:'primer',name:'Primer Oven',reference:'primer'},{id:'sealer',name:'Sealer Oven',reference:''},{id:'bc',name:'Base Coat Oven',reference:'bc'}];
  const slots=Object.fromEntries(ovens.map(o=>[o.id,{reference:o.reference,records:[],sheet:0,name:'',error:'',warnings:[],pending:false,version:0}]));
  const state={date:''};
  let refreshActive=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalizeDate(value){
    const text=String(value||'').trim().replace(/[۰-۹٠-٩]/g,c=>{const n=c.charCodeAt(0);return String(n>=1776?n-1776:n-1632);});
    const match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match)return null;
    const [,year,month,day]=match.map(Number);
    if(year<1300||year>2099||month<1||month>12||day<1)return null;
    const max=year<1700?(month<=6?31:30):new Date(Date.UTC(year,month,0)).getUTCDate();
    return day<=max?text:null;
  }
  function entries(){
    const pages=ovens.flatMap(oven=>{
      const slot=slots[oven.id],record=slot.records[slot.sheet];
      if(slot.pending)throw Error('Wait for '+oven.name+' to finish loading.');
      if(slot.error)throw Error(oven.name+': '+slot.error+' Clear or replace this file.');
      if(!record)return [];
      const allowed=window.BAMCOBakingWindows.references(oven.id);
      const reference=allowed.some(ref=>ref.id===slot.reference)?window.BAMCOBakingWindows.get(slot.reference):null;
      if(!reference)throw Error('No active baking window is available for '+oven.name+'.');
      const results=window.BAMCOEnhance.evaluate(record,slot.reference);
      if(!results.length)throw Error('No channel cards are available for '+oven.name+'.');
      return [{results,options:{ovenName:oven.name,manufacturer:reference.manufacturer,threshold:reference.threshold,rules:reference.rules}}];
    });
    if(!pages.length)throw Error('Upload at least one valid Excel file.');
    return pages;
  }
  function cardHTML(oven){
    const references=window.BAMCOBakingWindows.references(oven.id),slot=slots[oven.id];
    if(!references.some(ref=>ref.id===slot.reference))slot.reference=references[0]?.id||'';
    const disabled=references.length?'':' disabled';
    return '<section class="daily-oven-card daily-oven-'+oven.id+'" data-daily-slot="'+oven.id+'"><div class="daily-oven-heading"><span class="daily-oven-icon" aria-hidden="true">'+window.BAMCOEnhance.ovenIcon(oven.id)+'</span><h3>'+oven.name+'</h3></div>'
      +'<label for="daily-reference-'+oven.id+'">Baking-window manufacturer</label><select id="daily-reference-'+oven.id+'" data-daily-reference="'+oven.id+'"'+disabled+'>'+(references.length?references.map(ref=>'<option value="'+ref.id+'" '+(slot.reference===ref.id?'selected':'')+'>'+esc(ref.name)+'</option>').join(''):'<option value=""></option>')+'</select>'
      +'<label for="daily-file-'+oven.id+'">Excel recording</label><input id="daily-file-'+oven.id+'" data-daily-file="'+oven.id+'" type="file" accept=".xls,.xlsx"'+disabled+'><div class="daily-file-status"><div class="daily-slot-status" aria-live="polite"></div><button type="button" class="daily-clear-file" data-daily-clear="'+oven.id+'" aria-label="Clear '+oven.name+' file" hidden>×</button></div><div class="daily-sheet-picker"></div></section>';
  }
  function open(host,onBack){
    host.innerHTML='<div class="daily-report-container"><div class="window-topbar"><div><span class="window-eyebrow">THERMAL WORKSPACE</span><h1>Daily report</h1></div><button type="button" class="window-change-oven" data-daily-back>← Back to ovens</button></div>'
      +'<form class="daily-report-form"><div class="daily-date-row"><div><h2>Daily oven summary</h2></div><label for="daily-date">Report date<input id="daily-date" type="text" inputmode="numeric" dir="ltr" placeholder="1405-06-05" autocomplete="off" required value="'+esc(state.date)+'"><small>YYYY-MM-DD · entered manually</small></label></div>'
      +'<div class="daily-oven-grid">'+ovens.map(cardHTML).join('')+'</div>'
      +'<div class="daily-report-footer"><p class="daily-report-error" role="alert"></p><button type="submit" class="primary-action">Download daily summary PDF <span aria-hidden="true">→</span></button><small>Only uploaded ovens are included · A4 landscape</small></div></form></div>';
    const form=host.querySelector('.daily-report-form'),date=form.querySelector('#daily-date'),error=form.querySelector('.daily-report-error'),button=form.querySelector('[type="submit"]');
    let generating=false;
    host.querySelector('[data-daily-back]').addEventListener('click',()=>{state.date=date.value;refreshActive=null;onBack();});
    date.addEventListener('input',()=>{state.date=date.value;error.textContent='';date.setCustomValidity('');});
    function update(id){
      const slot=slots[id],card=form.querySelector('[data-daily-slot="'+id+'"]');
      card.querySelector('.daily-slot-status').textContent=slot.pending?'Reading workbook…':slot.error||slot.name;
      card.querySelector('.daily-slot-status').classList.toggle('has-error',!!slot.error);
      card.querySelector('.daily-slot-status').title=slot.error||slot.name;
      card.querySelector('.daily-clear-file').hidden=!slot.name;
      card.querySelector('.daily-sheet-picker').innerHTML=slot.records.length>1?'<label for="daily-sheet-'+id+'">Worksheet</label><select id="daily-sheet-'+id+'" data-daily-sheet="'+id+'">'+slot.records.map((record,i)=>'<option value="'+i+'" '+(slot.sheet===i?'selected':'')+'>'+esc(record.sheetName)+'</option>').join('')+'</select>':slot.warnings.length?'<small>'+esc(slot.warnings.join('; '))+'</small>':'';
      button.disabled=generating||Object.values(slots).some(s=>s.pending);
    }
    refreshActive=()=>ovens.forEach(o=>update(o.id));
    refreshActive();
    form.addEventListener('click',event=>{
      const clear=event.target.closest('[data-daily-clear]');if(!clear)return;
      const id=clear.dataset.dailyClear,slot=slots[id];
      ++slot.version;Object.assign(slot,{records:[],sheet:0,name:'',error:'',warnings:[],pending:false});
      form.querySelector('#daily-file-'+id).value='';error.textContent='';refreshActive?.();
    });
    form.addEventListener('change',async event=>{
      const target=event.target,id=target.dataset.dailyFile;
      error.textContent='';
      if(target.dataset.dailyReference){slots[target.dataset.dailyReference].reference=target.value;return;}
      if(target.dataset.dailySheet){slots[target.dataset.dailySheet].sheet=Number(target.value);return;}
      if(!id)return;
      const slot=slots[id],file=target.files?.[0];
      // A cancelled file dialog retains the previous selection.
      if(!file)return;
      const version=++slot.version;
      Object.assign(slot,{records:[],sheet:0,name:file.name,error:'',warnings:[],pending:true});update(id);
      try{
        const parsed=await window.BAMCO_CORE.readWorkbook(file);
        if(version!==slot.version)return;
        if(!parsed.records.length)throw Error(parsed.errors.join('; ')||'No valid readings table was found.');
        slot.records=parsed.records;slot.warnings=parsed.errors;
      }catch(problem){if(version===slot.version)slot.error=problem.message;}
      finally{if(version===slot.version){slot.pending=false;refreshActive?.();}}
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(generating)return;error.textContent='';
      const reportDate=normalizeDate(date.value);
      if(!reportDate){error.textContent='Enter a valid report date, for example 1405-06-05.';date.focus();return;}
      state.date=reportDate;date.value=reportDate;
      try{
        const pages=entries();
        generating=true;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Creating summary PDF…';
        await window.BAMCOSummaryPDF.downloadReport(pages,reportDate);
      }catch(problem){error.textContent=problem.message;}
      finally{generating=false;button.disabled=generating||Object.values(slots).some(s=>s.pending);button.removeAttribute('aria-busy');button.textContent='Download daily summary PDF →';}
    });
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  window.BAMCODailyReport={open};
})();

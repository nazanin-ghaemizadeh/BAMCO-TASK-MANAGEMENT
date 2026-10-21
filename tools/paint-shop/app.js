/* Browser-only port of BAMCO Paint Shop. No R interpreter or server is required. */
'use strict';
(() => {
const STAGES={ed:'ED',primer:'Primer',sealer:'Sealer',bc:'BC'};
const COLORS={Ch1:'#167F83',Ch2:'#D08B4F',Ch3:'#526AC1',Ch4:'#9C5B83',Ch5:'#657C3C',Ch6:'#B75151'};
const states=Object.fromEntries(Object.keys(STAGES).map(k=>[k,{files:[],selected:null,sheet:0,visibility:{},errors:[]}]));
// Large libraries are loaded only when the user uploads a workbook; startup stays lightweight.
const dependencyPromises=new Map();
function loadDependency(name,urls){
 if(window[name])return Promise.resolve();
 if(dependencyPromises.has(name))return dependencyPromises.get(name);
 const promise=(async()=>{
  for(const url of urls){
   try{
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');
     script.src=url;script.async=true;
     script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Unable to load '+url));};
     document.head.appendChild(script);
    });
    if(window[name])return;
   }catch(e){ /* Try the alternate CDN. */ }
  }
  throw Error('Unable to load '+name+'. Check your network connection and retry.');
 })();
 dependencyPromises.set(name,promise);
 promise.catch(()=>{if(dependencyPromises.get(name)===promise)dependencyPromises.delete(name);});
 return promise;
}
const ensureXLSX=()=>loadDependency('XLSX',[
 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
]);
const ensurePlotly=()=>loadDependency('Plotly',[
 'https://cdn.plot.ly/plotly-cartesian-2.35.2.min.js',
 'https://cdn.jsdelivr.net/npm/plotly.js-cartesian-dist-min@2.35.2/plotly-cartesian.min.js'
]);
let tab='ed',uid=0,drawVersion=0,chartsPreparedVersion=-1;
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>typeof x==='number'&&Number.isFinite(x);
const nice=(x,k=2)=>num(x)?String(+x.toFixed(k)):'N/A';
const clock=ms=>new Date(ms).toISOString().slice(11,19);
const color=ch=>COLORS[ch]||`hsl(${((parseInt(ch.slice(2),10)||1)*222.49)%360},48%,46%)`;
const current=()=>states[tab];
const file=()=>current().files.find(f=>f.id===current().selected);
const record=()=>file()?.records[current().sheet];
const selected=r=>current().visibility[current().selected+':'+current().sheet]||r.channels;
const channels=r=>selected(r).filter(ch=>r.channels.includes(ch));
const fileName=r=>STAGES[tab]+'_'+r.fileName.replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9_.-]/g,'_');
const font={family:'Times New Roman, Times, serif',color:'#20354B',size:13};
const config={displaylogo:false,responsive:true,scrollZoom:false,modeBarButtonsToRemove:['toImage','lasso2d','select2d']};
function plotLayout(x,y,b=88){return {xaxis:{title:{text:x,standoff:13},gridcolor:'#E5EBF1',zeroline:false,automargin:true},yaxis:{title:{text:y,standoff:12},gridcolor:'#E5EBF1',zeroline:false,automargin:true},paper_bgcolor:'white',plot_bgcolor:'white',font,margin:{l:80,r:30,t:46,b},hovermode:'closest',legend:{orientation:'h',x:.5,xanchor:'center',y:-.26,yanchor:'top',entrywidth:112,entrywidthmode:'pixels',tracegroupgap:24,font:{family:'Times New Roman, Times, serif',size:13}}};}
function excelTime(v,date1904){
 if(v instanceof Date)return v.getTime();
 if(num(v)&&v>10000&&v<100000){const d=XLSX.SSF.parse_date_code(v,{date1904:!!date1904});return d?Date.UTC(d.y,d.m-1,d.d,d.H,d.M,d.S,Math.round((d.u||0)*1000)):NaN;}
 if(typeof v==='string'&&v.trim()){
   let s=v.trim();let t=Date.parse(s.replace(/\//g,'-'));if(num(t))return t;
   let m=s.match(/^(\d\d?):(\d\d):(\d\d)$/);if(m)return Date.UTC(2000,0,1,+m[1],+m[2],+m[3]);
 }return NaN;
}
// Preserve the calendar date written in the workbook, without timezone conversion.
function excelRecordingDate(value,date1904){
 const iso=(y,m,d)=>String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.toISOString().slice(0,10):null;
 if(num(value)&&value>10000&&value<100000){
  const d=XLSX.SSF.parse_date_code(value,{date1904:!!date1904});
  return d?iso(d.y,d.m,d.d):null;
 }
 if(typeof value!=='string')return null;
 const text=value.trim(),match=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
 if(match)return iso(+match[1],+match[2],+match[3]);
 if(/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text))return null;
 const parsed=new Date(excelTime(value,date1904));
 return Number.isFinite(parsed.getTime())?iso(parsed.getFullYear(),parsed.getMonth()+1,parsed.getDate()):null;
}
// Limit visible worksheet numerics to three decimal places; never round the underlying Excel data.
function worksheetNumber(value){
 if(!Number.isFinite(value))return String(value);
 // toFixed keeps the display predictable for the engineering measurements used here.
 return String(Number(value.toFixed(3)));
}
function display(c){
 if(!c||c.v===undefined||c.v===null)return '';
 if(c.t==='d'&&c.v instanceof Date)return c.v.toISOString().slice(0,19).replace('T',' ');
 // Dates, clock times and Excel durations must keep their workbook formatting.
 if(c.t==='n'&&c.z&&/[ymdhHsS]/.test(c.z)&&c.w)return String(c.w);
 if(c.t==='n'&&typeof c.v==='number')return worksheetNumber(c.v);
 return String(c.v);
}
function parseSheet(ws,fn,sheet,date1904,buffer){
 const range=XLSX.utils.decode_range(ws['!ref']||'A1'),rows=[];
 for(let i=0;i<=range.e.r;i++){let a=[];for(let j=0;j<=range.e.c;j++)a.push(ws[XLSX.utils.encode_cell({r:i,c:j})]||null);rows.push(a);}
 let head=-1,time=-1,number=-1,cols=[];
 for(let i=0;i<rows.length;i++){
  const a=rows[i].map(display).map(s=>s.trim());let cc=a.flatMap((v,j)=>/^Ch\s*\d+\s*\(/i.test(v)?[j]:[]);
  let tc=a.findIndex(s=>/^(date\s*(&|and)\s*time|timestamp)$/i.test(s));
  if(cc.length&&tc>=0){head=i;time=tc;cols=cc;number=a.findIndex(s=>/^number$/i.test(s));break;}
 }
 if(head<0)throw Error('No Elcometer readings table found (Date & Time, Ch1...).');
 const chs=cols.map(j=>'Ch'+display(rows[head][j]).match(/Ch\s*(\d+)/i)[1]);
 if(new Set(chs).size!==chs.length)throw Error('Duplicate channel names.');
 if(cols.some(j=>/\(\s*°?\s*F\s*\)/i.test(display(rows[head][j]))))throw Error('Fahrenheit temperatures are unsupported. Export in Celsius.');
 let reads=[];
 for(let i=head+1;i<rows.length;i++){
  const t=excelTime(rows[i][time]?.v,date1904),n=number>=0?Number(rows[i][number]?.v):reads.length+1;
  if(!num(t)||(number>=0&&!num(n)))continue;
  let values={};cols.forEach((j,k)=>{let cell=rows[i][j];let val=cell&&cell.v!==''?Number(cell.v):NaN;values[chs[k]]=num(val)?val:NaN;});
  reads.push({row:i,ts:t,number:n,values});
 }
 if(reads.length<2)throw Error('At least two valid readings with timestamps are required.');
 for(let i=1;i<reads.length;i++)if(reads[i].ts<=reads[i-1].ts)throw Error('Reading timestamps must be strictly increasing.');
 let dt=reads.slice(1).map((r,i)=>(r.ts-reads[i].ts)/1000).sort((a,b)=>a-b),step=dt[Math.floor(dt.length/2)]||1;
 const active=chs.filter(ch=>reads.some(r=>num(r.values[ch])));
 if(!active.length)throw Error('No numeric channel temperatures were found.');
 function meta(key){for(let i=0;i<head;i++)if(display(rows[i][0]).trim().toLowerCase()===key.toLowerCase())return rows[i].slice(1).map(display).find(x=>x.trim())||'';return '';}
 const labels={};active.forEach(ch=>{const s=meta('Channel '+ch.slice(2));labels[ch]=s?ch+' - '+s:ch+' (unlabelled)';});
 reads.forEach(r=>r.elapsed=(r.ts-reads[0].ts)/60000);
 let notes=[];
 active.forEach(ch=>{if(reads.some(r=>!num(r.values[ch])))notes.push(ch+' contains missing readings; shown as gaps.');});
 if(reads.some((r,i)=>i>0&&r.ts-reads[i-1].ts>step*1500+1))notes.push('Long sampling gaps are displayed as breaks in the curves.');
 return {fileName:fn,sheetName:sheet,ws,rows,head,reads,step,channels:active,allChannels:chs,labels,notes,project:meta('Name')||fn.replace(/\.[^.]+$/,''),device:meta('Type'),recordingDate:excelRecordingDate(rows[reads[0].row][time]?.v,date1904),start:reads[0].ts,end:reads.at(-1).ts,duration:reads.at(-1).elapsed,merges:ws['!merges']||[],buffer};
}
async function readFile(f){
 if(!/\.(xls|xlsx)$/i.test(f.name))throw Error('Only .xls and .xlsx are supported.');
 const buffer=await f.arrayBuffer(),wb=XLSX.read(buffer,{type:'array',cellNF:true,cellText:true}),date1904=!!wb.Workbook?.WBProps?.date1904;
 let records=[],errors=[];
 for(const s of wb.SheetNames){try{records.push(parseSheet(wb.Sheets[s],f.name,s,date1904,buffer));}catch(e){errors.push(f.name+' / '+s+': '+e.message);}}
 return {records,errors};
}
function stageHTML(){return `<div class="stage-layout"><aside class="upload-panel">
 <h3>${STAGES[tab]} recordings</h3>
 
 <div class="upload-control"><label class="control-label" for="files">Excel files</label>
 <div class="upload-file-stack">
  <div class="input-group"><span class="input-group-btn"><label class="btn" for="files">Browse files</label></span><input class="form-control" id="filename" type="text" readonly value="No files selected"></div>
  <input class="hidden-file" type="file" id="files" multiple accept=".xls,.xlsx">
  <div id="file-list"></div>
 </div></div>
 <div id="worksheet-picker"></div><div id="source-label"></div><div id="errors"></div>
 </aside><main class="chart-panel" id="chart-panel"></main></div>`;}
function chooseTab(t){tab=t;document.querySelectorAll('[data-stage]').forEach(x=>x.classList.toggle('active',x.dataset.stage===t));$('workspace').innerHTML=stageHTML();
 $('files').onchange=async e=>{
  const picked=Array.from(e.target.files);e.target.value='';if(!picked.length)return;
  const s=current();if(s.files.length+picked.length>30){s.errors=['Keep at most 30 workbooks in each process tab.'];return render();}
  $('errors').innerHTML='<div class="field-note" role="status">Preparing Excel and chart libraries...</div>';
  try{await Promise.all([ensureXLSX(),ensurePlotly()]);}
  catch(ex){s.errors=[ex.message];return render();}
  $('errors').textContent='Reading temperature profiles...';
  for(const f of picked){let id='file_'+(++uid);try{const p=await readFile(f);s.files.push({id,name:f.name,...p});}catch(ex){s.files.push({id,name:f.name,records:[],errors:[f.name+': '+ex.message]});}if(!s.selected)s.selected=id;}
  s.errors=[];s.sheet=0;render();
 };
 render();
}
function renderControls(){
 const s=current(),f=file(),r=record();
 $('filename').value=s.files.length===0?'No files selected':s.files.length===1?s.files[0].name:s.files.length+' files uploaded';
 $('file-list').innerHTML=s.files.length?'<div class="uploaded-list" role="group" aria-label="Uploaded files">'+s.files.map(f=>`<div class="uploaded-row ${f.id===s.selected?'is-selected':''}"><button class="uploaded-select" data-pick="${f.id}" title="${esc(f.name)}">${esc(f.name)}</button><button class="uploaded-remove" data-remove="${f.id}" title="Remove ${esc(f.name)}">×</button></div>`).join('')+'</div>':'<p class="field-note">Your uploaded files will appear here.</p>';
 document.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{s.selected=x.dataset.pick;s.sheet=0;render();});
 document.querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{const i=s.files.findIndex(f=>f.id===x.dataset.remove);s.files.splice(i,1);if(s.selected===x.dataset.remove){s.selected=s.files[Math.min(i,s.files.length-1)]?.id||null;s.sheet=0;}render();});
 $('worksheet-picker').innerHTML=f?.records.length>1?'<label class="control-label" for="sheet">Worksheet</label><select id="sheet" class="form-control">'+f.records.map((r,i)=>`<option value="${i}" ${s.sheet===i?'selected':''}>${esc(r.sheetName)}</option>`).join('')+'</select>':'';
 if($('sheet'))$('sheet').onchange=e=>{s.sheet=+e.target.value;render();};
 if(r){
  const key=s.selected+':'+s.sheet;
  if(!(key in s.visibility))s.visibility[key]=[...r.channels];
  $('source-label').innerHTML=`<div class="source-label">${s.files.length} uploaded file(s)<br>${s.files.reduce((n,f)=>n+f.records.length,0)} readable worksheet(s)</div>`;
 }else $('source-label').innerHTML='';
 const errors=[...s.errors,...s.files.flatMap(f=>f.errors)];
 $('errors').innerHTML=errors.length?'<div class="import-errors" role="alert"><strong>Import notes</strong><ul>'+errors.map(e=>`<li>${esc(e)}</li>`).join('')+'</ul></div>':'';
}
function empty(f){return `<div class="empty-state"><div class="empty-mark">°C</div><p class="eyebrow">${STAGES[tab].toUpperCase()} WORKSPACE</p><h2>${f?'No readable worksheets':'Every channel. One clear view.'}</h2><p>${f?'Review the import notes for this file, or choose another uploaded file.':'Upload your Excel files, then select a file from the list on the left.'}</p>${f?'':'<div class="empty-steps"><span>01  Upload Excel</span><span>02  Select a file</span><span>03  Explore your profile</span></div>'}</div>`;}
function render(){renderControls();renderMain();}
function renderMain(){
 const s=current(),f=file(),r=record(),v=++drawVersion;
 if(!r){$('chart-panel').innerHTML=empty(!!f);window.BAMCOEnhance?.refresh?.();return;}
 const chs=channels(r),others=s.files.filter(x=>x.records.length).map(x=>x.records.find(y=>y.sheetName===r.sheetName)||x.records[0]);
 $('chart-panel').innerHTML=`<div class="chart-heading"><div><p class="eyebrow">${STAGES[tab]} / TEMPERATURE PROFILE</p><h2>${esc(r.project)}</h2><p class="secondary">${clock(r.start)} - ${clock(r.end)} | ${esc(r.fileName)}</p></div><span class="device-label">${esc(r.device)}</span></div>
 <div class="metrics"><div class="metric"><span>Recorded duration</span><strong>${nice(r.duration)} min</strong></div><div class="metric"><span>Time samples</span><strong>${r.reads.length}</strong></div><div class="metric"><span>Visible channels</span><strong>${chs.length}</strong></div><div class="metric"><span>Median interval</span><strong>${nice(r.step)} s</strong></div></div>
 ${r.notes.length?'<div class="import-errors"><ul>'+r.notes.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':''}
 <div class="chart-topbar"><div class="chart-topbar-title"><h3>Temperature analysis</h3></div><div class="chart-actions"><button class="btn" id="download-xlsx" disabled>Download Excel</button><button class="btn" id="download-png" disabled>Download all charts (PNG)</button></div></div>
 <section class="chart-channel-controls" aria-label="Visible channels for all four charts"><div class="chart-channel-heading"><h3>Visible channels</h3></div><div id="channel-picker" class="chart-channel-options"></div></section>
 <div class="analysis-card"><div class="chart-card-heading"><h3>Temperature profile</h3><button type="button" class="btn chart-png-btn" data-download-chart="profile" disabled>Download PNG</button></div><div class="plot-surface" id="plot-profile" style="height:650px"></div><div class="channel-legend" id="legend-profile" aria-label="Channel colors for temperature profile"></div></div>
 <div class="analysis-card"><div class="chart-card-heading"><h3>Channel temperature spread</h3><button type="button" class="btn chart-png-btn" data-download-chart="spread" disabled>Download PNG</button></div><div class="plot-surface" id="plot-spread" style="height:370px"></div></div>
 <div class="analysis-card"><div class="chart-card-heading"><h3>Time in temperature bands</h3><button type="button" class="btn chart-png-btn" data-download-chart="bands" disabled>Download PNG</button></div><div class="plot-surface" id="plot-bands" style="height:420px"></div></div>
 <div class="analysis-card"><div class="chart-card-heading"><h3>Peak temperatures by uploaded file</h3><button type="button" class="btn chart-png-btn" data-download-chart="peaks" disabled>Download PNG</button></div><div class="plot-surface" id="plot-peaks" style="height:360px"></div><div class="channel-legend" id="legend-peaks" aria-label="Channel colors for peak temperatures"></div></div>
 <h3 class="section-title">Uploaded worksheet</h3><div id="source-sections"></div>`;
 $('download-xlsx').onclick=downloadExcel;$('download-png').onclick=downloadPNG;
 const key=s.selected+':'+s.sheet;
 $('channel-picker').innerHTML=r.channels.map(ch=>'<label class="chart-channel-choice"><input type="checkbox" data-channel="'+ch+'" '+(chs.includes(ch)?'checked':'')+'><span class="chart-channel-dot" style="background:'+color(ch)+'"></span><span>'+esc(r.labels[ch])+'</span></label>').join('');
 document.querySelectorAll('#channel-picker [data-channel]').forEach(input=>input.onchange=()=>{
  s.visibility[key]=[...document.querySelectorAll('#channel-picker [data-channel]:checked')].map(item=>item.dataset.channel);
  renderMain();
 });
 document.querySelectorAll('[data-download-chart]').forEach(btn=>btn.onclick=()=>downloadSingleChart(btn.dataset.downloadChart,btn));
 renderChannelLegends(chs);
 // Avoid blocking the initial chart paint with a potentially very long worksheet table.
 const later=()=>{if(v===drawVersion&&$('source-sections'))renderSource(r);};
 if('requestIdleCallback' in window)requestIdleCallback(later,{timeout:1800});
 else setTimeout(later,80);
 // Build the final sidebar/layout first. Plotly must never paint
 // the legacy DOM and then be moved into the new tabbed dashboard.
 window.BAMCOEnhance?.refresh?.();
 if(document.body.dataset.section==='charts')renderPlots();
}
function updateChartExportButtons(){
 const available=id=>Boolean($('plot-'+id)?.data);
 const ready=['profile','spread','bands','peaks'].every(available)
   &&!document.querySelector('.view-charts')?.classList.contains('charts-drawing');
 for(const id of ['profile','spread','bands','peaks']){
  const btn=document.querySelector('[data-download-chart="'+id+'"]');
  if(btn)btn.disabled=!available(id);
 }
 const png=$('download-png'),excel=$('download-xlsx');
 if(png)png.disabled=!ready;
 if(excel)excel.disabled=!ready;
}
function renderPlots(){
 const v=drawVersion,r=record();
 const section=$('plot-profile')?.closest('.view-charts');
 if(!r||!section||document.body.dataset.section!=='charts')return;
 if(chartsPreparedVersion===v){
  // Ignore re-entrant calls while the same chart set is still rendering.
  if(section.classList.contains('charts-drawing'))return;
  updateChartExportButtons();
  // Returning to an already rendered tab only requires a resize.
  requestAnimationFrame(()=>{
   if(v!==drawVersion||document.body.dataset.section!=='charts'||!window.Plotly)return;
   for(const id of ['profile','spread','bands','peaks']){
    const el=$('plot-'+id);
    if(el?.data)try{Plotly.Plots.resize(el);}catch(_){}
   }
  });
  return;
 }
 chartsPreparedVersion=v;
 section.classList.add('charts-drawing');
 section.classList.remove('charts-ready');
 const chs=channels(r);
 const s=current();
 const others=s.files.filter(x=>x.records.length).map(x=>x.records.find(y=>y.sheetName===r.sheetName)||x.records[0]);
 if(!chs.length){
  for(const n of ['profile','spread','bands','peaks'])$('plot-'+n).textContent='Select at least one channel.';
  section.classList.remove('charts-drawing');
  section.classList.add('charts-ready');
  updateChartExportButtons();
  return;
 }
 const b=bands(r,chs);
 $('plot-bands').style.height=Math.max(420,180+25*b.labels.length)+'px';
 $('plot-peaks').style.height=Math.max(440,210+50*others.length)+'px';
 // Plot only in their visible final containers; hide intermediate redraws.
 requestAnimationFrame(()=>{
  if(v!==drawVersion||document.body.dataset.section!=='charts'){
   if(v===drawVersion)chartsPreparedVersion=-1;
   return;
  }
  if(!window.Plotly){
   for(const n of ['profile','spread','bands','peaks'])$('plot-'+n).textContent='Chart library unavailable.';
   section.classList.remove('charts-drawing');
   section.classList.add('charts-ready');
   updateChartExportButtons();
   return;
  }
  Promise.allSettled([profile(r,chs),spread(r,chs),heatmap(chs,b),peaks(others,chs)]).then(results=>{
   if(v!==drawVersion||!section.isConnected)return;
   results.forEach((result,i)=>{
    if(result.status==='rejected'){
     const node=$('plot-'+['profile','spread','bands','peaks'][i]);
     if(node)node.textContent='Chart error: '+(result.reason?.message||'Unknown error');
    }
   });
   section.classList.remove('charts-drawing');
   section.classList.add('charts-ready');
   updateChartExportButtons();
  });
 });
}
function renderChannelLegends(chs){
 const markup='<div class="channel-legend-track">'+chs.map(ch=>
  `<span class="channel-legend-item"><span class="legend-symbol" style="--channel-color:${color(ch)}"><i></i></span><span>${esc(ch)}</span></span>`
 ).join('')+'</div>';
 for(const id of ['legend-profile','legend-peaks']){const node=$(id);if(node)node.innerHTML=markup;}
}
function segments(r,ch){const out=[];let part=[],last=null;
 for(const d of r.reads){let t=d.values[ch];if(!num(t)){if(part.length)out.push(part);part=[];last=null;continue;}
  if(last!==null&&d.ts-last>r.step*1500+1){if(part.length)out.push(part);part=[];}
  part.push(d);last=d.ts;
 }if(part.length)out.push(part);return out;
}
function profile(r,chs){
 const data=[];for(const ch of chs){segments(r,ch).forEach((seg,i)=>data.push({
  x:seg.map(d=>d.elapsed),y:seg.map(d=>d.values[ch]),type:'scatter',mode:seg.length===1?'markers':'lines',name:ch,legendgroup:ch,showlegend:i===0,
  line:{color:color(ch),width:2.8},marker:{size:6,color:color(ch)},connectgaps:false,
  text:seg.map(d=>ch+'<br>'+d.elapsed.toFixed(2)+' min<br>'+d.values[ch].toFixed(1)+' C<br>'+clock(d.ts)),hoverinfo:'text'
 }));}
 let all=[];for(const d of r.reads)for(const ch of chs)if(num(d.values[ch]))all.push({x:d.elapsed,y:d.values[ch],ch});
 const lay=plotLayout('Elapsed time from first reading (min)','Recorded temperature (°C)',88);lay.showlegend=false;
 if(all.length){let hi=-Infinity,lo=Infinity,p=all[0];for(let a of all){if(a.y>hi){hi=a.y;p=a;}lo=Math.min(lo,a.y);}
  const span=Math.max(1,hi-lo);lay.xaxis.range=[0,r.duration];lay.yaxis.range=[lo-span*.08,hi+span*.14];
  lay.annotations=[{x:p.x,y:p.y,text:'Peak: '+p.y.toFixed(1)+' C ('+p.ch+')',showarrow:true,arrowhead:2,ax:p.x>r.duration/2?-65:65,ay:-38,font:{family:'Times New Roman',size:13,color:'#243247'}}];
 }
 return Plotly.newPlot('plot-profile',data,lay,config);
}
function spread(r,chs){
 let traces=[],part=[];function add(){if(part.length)traces.push({x:part.map(d=>d.x),y:part.map(d=>d.y),type:'scatter',mode:'lines+markers',showlegend:false,line:{color:'#167F83',width:2.7},marker:{size:3,color:'#167F83'},fill:'tozeroy',fillcolor:'rgba(22,127,131,.10)',hovertemplate:'%{x:.2f} min<br>Spread: %{y:.1f} °C<extra></extra>'});part=[];}
 r.reads.forEach((d,i)=>{const v=chs.map(c=>d.values[c]),ok=chs.length>=2&&v.every(num),gap=i>0&&d.ts-r.reads[i-1].ts>r.step*1500+1;if(gap||!ok)add();if(ok)part.push({x:d.elapsed,y:Math.max(...v)-Math.min(...v)});});add();
 const lay=plotLayout('Elapsed time (min)','Channel spread (°C)');lay.showlegend=false;
 if(chs.length<2)lay.annotations=[{text:'Select at least two channels to calculate spread.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false}];
 return Plotly.newPlot('plot-spread',traces,lay,config);
}
function validIntervals(r,ch){
 let out=[];for(let i=1;i<r.reads.length;i++){const a=r.reads[i-1],b=r.reads[i],dt=(b.ts-a.ts)/60000;
  if(num(a.values[ch])&&num(b.values[ch])&&dt>0&&dt<=r.step/60*1.5+.001/60)out.push({a:a.values[ch],b:b.values[ch],dt});
 }return out;
}
function bands(r,chs){
 let lo=Infinity,hi=-Infinity;for(const d of r.reads)for(const ch of chs){let x=d.values[ch];if(num(x)){lo=Math.min(lo,x);hi=Math.max(hi,x);}}
 if(!Number.isFinite(lo))return {labels:[],values:[],coverage:chs.map(()=>0)};
 const width=Math.max(10,Math.ceil((hi-lo)/30/10)*10),start=Math.floor(lo/width)*width,end=(Math.floor(hi/width)+1)*width;
 const edges=[];for(let x=start;x<=end+.000001;x+=width)edges.push(x);
 const labels=edges.slice(0,-1).map((n,i)=>n+'–'+edges[i+1]),values=labels.map(()=>chs.map(()=>0)),coverage=chs.map(()=>0);
 chs.forEach((ch,j)=>{const ints=validIntervals(r,ch);coverage[j]=ints.reduce((a,b)=>a+b.dt,0);
  if(!ints.length){values.forEach(row=>row[j]=null);return;}
  for(const p of ints){const a=Math.min(p.a,p.b),b=Math.max(p.a,p.b);
   if(a===b){values[Math.max(0,Math.min(labels.length-1,Math.floor((a-start)/width)))][j]+=p.dt;continue;}
   for(let i=0;i<labels.length;i++){const overlap=Math.max(0,Math.min(b,edges[i+1])-Math.max(a,edges[i]));values[i][j]+=p.dt*overlap/(b-a);}
  }
 });return {labels,values,coverage};
}
function heatmap(chs,b){
 const max=Math.max(1,...b.values.flat().filter(num)),data=[{x:chs,y:b.labels,z:b.values,type:'heatmap',zmin:0,zmax:max,
  colorscale:[[0,'#EDF5F5'],[.333,'#83BCB8'],[.667,'#167F83'],[1,'#123C52']],xgap:2,ygap:2,
  colorbar:{title:'Minutes'},hovertemplate:'%{x}<br>%{y} °C<br>%{z:.2f} min<extra></extra>',
  text:b.values.map(row=>row.map(v=>num(v)?v.toFixed(1):'N/A')),
  texttemplate:'%{text}',textfont:{family:'Times New Roman',size:12,color:'#14283F'}}];
 const lay=plotLayout('Channel','Temperature band (°C)');lay.showlegend=false;
 lay.xaxis={type:'category',title:'Channel',automargin:true};lay.yaxis={type:'category',categoryorder:'array',categoryarray:b.labels,title:'Temperature band (°C)',automargin:true};
 return Plotly.newPlot('plot-bands',data,lay,config);
}
function peaks(records,chs){
 const data=[];
 for(const ch of chs){let x=[],y=[],text=[];
  for(const [i,r] of records.entries()){if(!r.channels.includes(ch))continue;
   let peak=-Infinity;for(const d of r.reads)if(num(d.values[ch]))peak=Math.max(peak,d.values[ch]);
   if(!Number.isFinite(peak))continue;
   x.push(i+1);y.push(peak);text.push(r.fileName+'<br>'+r.sheetName+'<br>'+ch);
  }
  if(x.length)data.push({type:'scatter',mode:'markers',x,y,text,name:ch,marker:{size:11,color:color(ch)},hovertemplate:'%{text}<br>Peak: %{y:.1f} °C<extra></extra>'});
 }
 const lay=plotLayout('File name','Peak temperature (°C)',125);lay.showlegend=false;
 lay.xaxis.tickmode='array';lay.xaxis.tickvals=records.map((r,i)=>i+1);lay.xaxis.ticktext=records.map(r=>r.fileName);lay.xaxis.range=[.5,records.length+.5];lay.xaxis.tickangle=records.some(r=>r.fileName.length>20)?-20:0;

 return Plotly.newPlot('plot-peaks',data,lay,config);
}
function sourceSections(r){
 const text=r.rows.map(row=>row.map(display)),occ=text.map(x=>x.some(y=>y.length)),titles=[],summaries=[];
 for(const m of r.merges)if(m.s.r===m.e.r&&m.s.c===0&&m.e.c>=r.rows[0].length-2&&occ[m.s.r])titles.push(m.s.r);
 const known=['Project','Gauge','Batch','Paint Type','Logger','Triggers','Note'];
 text.forEach((a,i)=>{if(a.filter(Boolean).length===1&&known.includes(a[0].trim()))titles.push(i);if(a.filter(x=>/^Ch\d+$/i.test(x)).length>=2)summaries.push(i);});
 const start=[...new Set([0,...titles,...summaries,r.head])].sort((a,b)=>a-b);
 return start.map((n,i)=>({start:n,end:i+1<start.length?start[i+1]-1:r.rows.length-1,
  kind:n===r.head?'readings':summaries.includes(n)?'summary':'metadata',skip:titles.includes(n),
  title:n===r.head?'Readings':summaries.includes(n)?'Channel summary — from workbook':titles.includes(n)?text[n][0]:'Worksheet content'}));
}

 // Compact workbook channel-summary display. The original sheet cells remain
 // unmodified for uploads/exports; consecutive value + unit cells are shown
 // together per sensor while retaining every nonempty source value.
function renderCompactSummary(r,sec,rowIndexes,hidden,section){
 const header=r.rows[sec.start]||[];
 const sensorColumns=header.map((v,j)=>({j,label:display(v).trim()}))
  .filter(x=>/^Ch\d+$/i.test(x.label));
 if(sensorColumns.length<2)return false;
 const firstSensor=sensorColumns[0].j;
 const lastColumn=Math.max(...rowIndexes.map(i=>r.rows[i]?.length||0),header.length);
 const table=document.createElement('table');
 table.className='table source-compact-summary';
 const head=document.createElement('thead'),headerRow=document.createElement('tr');
 const metricHead=document.createElement('th');metricHead.textContent='Parameter';metricHead.scope='col';metricHead.className='source-parameter';
 headerRow.appendChild(metricHead);
 for(const sensor of sensorColumns){
  const th=document.createElement('th');th.textContent=sensor.label;th.scope='col';th.className='source-sensor-column';
  headerRow.appendChild(th);
 }
 head.appendChild(headerRow);table.appendChild(head);
 const body=document.createElement('tbody');
 for(const i of rowIndexes){
  if(i===sec.start)continue;
  const row=r.rows[i]||[];
  const texts=(from,to)=>{const out=[];for(let j=from;j<to;j++){
    if(hidden.has(i+','+j))continue;
    const value=display(row[j]);
    if(value.trim())out.push(value.trim());
   }return out;
  };
  const tr=document.createElement('tr'),name=document.createElement('th');
  name.scope='row';name.className='source-parameter';
  name.textContent=texts(0,firstSensor).join(' · ');
  tr.appendChild(name);
  for(let k=0;k<sensorColumns.length;k++){
   const from=sensorColumns[k].j;
   const to=k+1<sensorColumns.length?sensorColumns[k+1].j:lastColumn;
   const td=document.createElement('td');
   td.className='source-sensor-value';
   const parts=texts(from,to);
   if(parts.length){
    const value=document.createElement('span');value.className='source-measure-value';value.textContent=parts[0];
    td.appendChild(value);
    if(parts.length>1){
     const unit=document.createElement('span');unit.className='source-measure-unit';unit.textContent=parts.slice(1).join(' ');
     td.appendChild(unit);
    }
   }
   tr.appendChild(td);
  }
  body.appendChild(tr);
 }
 if(!body.childElementCount)return false;
 table.appendChild(body);
 const grid=document.createElement('div');grid.className='source-grid source-summary-grid';
 grid.appendChild(table);section.appendChild(grid);return true;
}
// Display only the primary, named column for each sensor in Readings.
// Raw worksheet source and exported Excel remain unchanged.
function renderReadings(r,sec,rowIndexes,hidden,section){
 const headers=r.rows[r.head]||[];
 const named=headers.map((cell,j)=>({j,label:display(cell).trim()}))
  .filter(x=>x.label&&!hidden.has(r.head+','+x.j));
 const firstSensor=named.find(x=>/^Ch\d+\b/i.test(x.label))?.j;
 if(firstSensor===undefined)return false;
 const seenSensors=new Set();
 const selected=named.filter(x=>{
  const ch=x.label.match(/^Ch(\d+)\b/i);
  if(ch){
   if(seenSensors.has(ch[1]))return false;
   seenSensors.add(ch[1]);return true;
  }
  // Source files may contain a second, auxiliary column per channel.
  // Keep pre-sensor identifiers and the optional trailing comment column.
  return x.j<firstSensor||/^(?:Comment|Remarks?|Notes?)$/i.test(x.label);
 });
 const grid=document.createElement('div');grid.className='source-grid source-readings';
 const table=document.createElement('table');table.className='table source-readings-table';
 const cols=document.createElement('colgroup');
 selected.forEach(({label})=>{const c=document.createElement('col');
  c.style.width=/^Number$/i.test(label)?'8%':/^(?:Date\s*&?\s*Time|Timestamp)$/i.test(label)?'18%':'auto';
  cols.appendChild(c);
 });
 table.appendChild(cols);
 const thead=document.createElement('thead'),hr=document.createElement('tr');
 selected.forEach(({label})=>{const th=document.createElement('th');th.scope='col';th.textContent=label;hr.appendChild(th);});
 thead.appendChild(hr);table.appendChild(thead);
 const tbody=document.createElement('tbody');
 rowIndexes.forEach(i=>{if(i===r.head)return;
  const tr=document.createElement('tr');
  selected.forEach(({j})=>{const td=document.createElement('td');td.textContent=hidden.has(i+','+j)?'':display(r.rows[i]?.[j]);tr.appendChild(td);});
  tbody.appendChild(tr);
 });
 table.appendChild(tbody);grid.appendChild(table);section.appendChild(grid);return true;
}
function renderSource(r){
 const container=$('source-sections'),top=new Map(),hidden=new Set();
 if(!container)return;
 for(const m of r.merges){
  top.set(m.s.r+','+m.s.c,m);
  for(let i=m.s.r;i<=m.e.r;i++)for(let j=m.s.c;j<=m.e.c;j++)
   if(i!==m.s.r||j!==m.s.c)hidden.add(i+','+j);
 }
 const frag=document.createDocumentFragment();
 for(const sec of sourceSections(r)){
  const first=sec.start+(sec.skip?1:0);
  const isMetadata=sec.kind==='metadata';
  // Only real nonempty values count. Merged blanks and worksheet formatting
  // must not create unwanted empty rows at the bottom of any source table.
  const rowIndexes=[];
  for(let i=first;i<=sec.end;i++){
   const values=r.rows[i].map((cell,j)=>hidden.has(i+','+j)?'':display(cell));
   if(values.some(x=>x.trim()!==''))rowIndexes.push(i);
  }
  if(!rowIndexes.length)continue;
  const section=document.createElement('section');section.className='source-section';
  const heading=document.createElement('h4');heading.textContent=sec.title;section.appendChild(heading);
  if(sec.kind==='summary'&&renderCompactSummary(r,sec,rowIndexes,hidden,section)){
   frag.appendChild(section);
   continue;
  }
  if(sec.kind==='readings'&&renderReadings(r,sec,rowIndexes,hidden,section)){
   frag.appendChild(section);
   continue;
  }
  const grid=document.createElement('div');grid.className='source-grid'+(sec.kind==='readings'?' source-readings':'');
  const table=document.createElement('table');table.className='table'+(isMetadata?' source-metadata-table':'');
  if(isMetadata){
   const cols=document.createElement('colgroup');
   const firstCol=document.createElement('col');firstCol.style.width='50%';
   const secondCol=document.createElement('col');secondCol.style.width='50%';
   cols.append(firstCol,secondCol);table.appendChild(cols);
  }
  const tbody=document.createElement('tbody');
  for(const i of rowIndexes){
   const tr=document.createElement('tr');
   if(isMetadata){
    const values=r.rows[i].map((cell,j)=>hidden.has(i+','+j)?'':display(cell))
     .filter(x=>x.trim()!=='');
    // Keep every value in its original order, even when the sheet stores its
    // value in column F rather than B or contains additional details.
    const label=document.createElement('td');label.textContent=values[0]||'';
    const value=document.createElement('td');
    if(values.length>1){
     values.slice(1).forEach((v,j)=>{
      if(j>0)value.appendChild(document.createTextNode(' | '));
      value.appendChild(document.createTextNode(v));
     });
    }
    tr.append(label,value);
   }else{
    for(let j=0;j<r.rows[i].length;j++){
     const k=i+','+j;if(hidden.has(k))continue;
     const cell=document.createElement(i===r.head||(sec.kind==='summary'&&i===sec.start)?'th':'td');
     cell.textContent=display(r.rows[i][j]);const m=top.get(k);
     if(m){cell.rowSpan=m.e.r-m.s.r+1;cell.colSpan=m.e.c-m.s.c+1;}
     tr.appendChild(cell);
    }
   }
   if(tr.childElementCount)tbody.appendChild(tr);
  }
  if(!tbody.childElementCount)continue;
  table.appendChild(tbody);grid.appendChild(table);section.appendChild(grid);frag.appendChild(section);
 }
 container.replaceChildren(frag);
}
function saveBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}
async function downloadSingleChart(id,button){
 const names={profile:'temperature_profile',spread:'channel_temperature_spread',
  bands:'time_in_temperature_bands',peaks:'peak_temperatures_by_file'};
 if(!Object.hasOwn(names,id))return;
 const chart=$('plot-'+id);
 if(!chart?.data||!window.Plotly)return;
 button.disabled=true;
 try{
  const image=await Plotly.toImage(chart,{format:'png',width:1400,
   height:id==='profile'?850:id==='bands'?750:700,scale:1.5});
  const link=document.createElement('a');
  link.href=image;
  link.download=fileName(record())+'_'+names[id]+'.png';
  document.body.appendChild(link);link.click();link.remove();
 }catch(error){alert('Chart PNG export failed: '+error.message);}
 finally{button.disabled=false;}
}
async function images(){
 const ids=['profile','spread','bands','peaks'];if(ids.some(k=>!$('plot-'+k)?.data))throw Error('Select channels and ensure that all four charts have rendered.');
 const data=[];for(let i=0;i<4;i++)data.push(await Plotly.toImage($('plot-'+ids[i]),{format:'png',width:1200,height:i===2?600:540,scale:1.5}));
 return data;
}
async function downloadPNG(){
 const btn=$('download-png');btn.disabled=true;
 try{let imgs=await images(),names=['Temperature profile','Channel temperature spread','Time in temperature bands','Peak temperatures by uploaded file'];
  const h=[810,810,900,810],gap=96,c=document.createElement('canvas');c.width=1800;c.height=h.reduce((a,b)=>a+b,0)+gap*5;
  const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#14283f';ctx.font='bold 32px Times New Roman';let y=gap;
  for(let i=0;i<4;i++){ctx.fillText(names[i],45,y-24);const img=new Image();img.src=imgs[i];await img.decode();ctx.drawImage(img,0,y,1800,h[i]);y+=h[i]+gap;}
  const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG canvas could not be exported.');saveBlob(blob,fileName(record())+'_all_charts.png');
 }catch(e){alert('PNG export failed: '+e.message);}finally{btn.disabled=false;}
}
let excelPromise=null;
function excelJS(){if(window.ExcelJS)return Promise.resolve();if(!excelPromise)excelPromise=new Promise((resolve,reject)=>{
 const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';s.onload=()=>window.ExcelJS?resolve():reject(Error('ExcelJS unavailable.'));s.onerror=()=>reject(Error('Unable to load ExcelJS.'));document.head.appendChild(s);
});return excelPromise;}
function newSourceWorkbook(r){
 const wb=new ExcelJS.Workbook();wb.creator='Nazanin Ghaemi-Zadeh';const sh=wb.addWorksheet(r.sheetName.slice(0,31)||'Source');
 for(let i=0;i<r.rows.length;i++)for(let j=0;j<r.rows[i].length;j++){
  let cell=r.rows[i][j];if(!cell||cell.v===undefined||cell.v===null||cell.t==='z')continue;
  let dest=sh.getCell(i+1,j+1);dest.value=cell.v;if(cell.z&&cell.z!=='General')dest.numFmt=cell.z;
 }
 for(const m of r.merges)try{sh.mergeCells(m.s.r+1,m.s.c+1,m.e.r+1,m.e.c+1);}catch(e){}
 (r.ws['!cols']||[]).forEach((col,i)=>{if(col)sh.getColumn(i+1).width=col.wch||col.width||12;});
 (r.ws['!rows']||[]).forEach((row,i)=>{if(row?.hpt)sh.getRow(i+1).height=row.hpt;});
 return {wb,sh};
}
function recolor(sh,r){
 const head=new Set(sourceSections(r).filter(s=>s.kind!=='metadata'||s.skip).map(s=>s.start+1));
 sh.eachRow({includeEmpty:true},(row,i)=>row.eachCell({includeEmpty:true},cell=>{
  cell.font={...(cell.font||{}),name:'Times New Roman',size:11,color:{argb:head.has(i)?'FFFFFFFF':'FF20354B'}};
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:head.has(i)?'FF14283F':i%2===0?'FFF0F5F8':'FFFFFFFF'}};
  cell.border={bottom:{style:'hair',color:{argb:'FFE4EAF0'}}};
  cell.alignment={...(cell.alignment||{}),vertical:'middle'};
 }));sh.views=[{state:'normal',showGridLines:false}];
}
async function downloadExcel(){
 const btn=$('download-xlsx');btn.disabled=true;
 try{
  const r=record(),imgs=await images();await excelJS();let wb,sh;
  if(/\.xlsx$/i.test(r.fileName)){
   try{wb=new ExcelJS.Workbook();await wb.xlsx.load(r.buffer);for(const x of [...wb.worksheets])if(x.name!==r.sheetName)wb.removeWorksheet(x.id);sh=wb.getWorksheet(r.sheetName);if(!sh)throw Error('Missing worksheet');}
   catch(e){({wb,sh}=newSourceWorkbook(r));}
  }else({wb,sh}=newSourceWorkbook(r));
  recolor(sh,r);
  const charts=wb.addWorksheet(sh.name==='Charts'?'Report Charts':'Charts');charts.getColumn(1).width=22;charts.getColumn(2).width=22;
  charts.getCell('A1').value='BAM Automotive Company — '+STAGES[tab];charts.getCell('A1').font={name:'Times New Roman',size:18,bold:true,color:{argb:'FF14283F'}};
  const names=['Temperature profile','Channel temperature spread','Time in temperature bands','Peak temperatures by uploaded file'];let row=3;
  for(let i=0;i<4;i++){let c=charts.getCell('A'+row);c.value=names[i];c.font={name:'Times New Roman',bold:true,size:14,color:{argb:'FF14283F'}};
   const id=wb.addImage({base64:imgs[i],extension:'png'});charts.addImage(id,{tl:{col:0,row:row+1},ext:{width:1200,height:i===2?600:540}});row+=i===2?43:39;
  }
  const evaluation=window.BAMCOEnhance?.evaluationForExport?.();
  if(evaluation){
    let erow=row+4;
    const headerAt=erow+2;
    charts.getCell(erow,1).value=evaluation.window+' — Channel Evaluation';
    charts.getCell(erow,1).font={name:'Times New Roman',size:16,bold:true,color:{argb:'FF14283F'}};
    erow=headerAt;
    for(const entry of [evaluation.headers,...evaluation.rows]){
      for(let k=0;k<entry.length;k++){
        const cell=charts.getCell(erow,k+1);const v=entry[k];cell.value=v===null?'N/A':v;
        cell.font={name:'Times New Roman',size:11,bold:erow===headerAt,color:{argb:'FF20354B'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:erow===headerAt?'FFE3F1E8':erow%2===0?'FFF4F9F7':'FFFFFFFF'}};
        cell.alignment={vertical:'middle'};
        if(typeof v==='number')cell.numFmt='0.000';
      }
      erow++;
    }
    charts.getColumn(1).width=42;
    for(let col=2;col<=evaluation.headers.length;col++)charts.getColumn(col).width=22;
  }
  const blob=new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});saveBlob(blob,fileName(r)+'_report.xlsx');
 }catch(e){alert('Excel export failed: '+e.message);}finally{btn.disabled=false;}
}
window.BAMCO_CORE={getStage:()=>tab,getRecord:record,getFile:file,getState:current,chooseTab,renderPlots,
 readWorkbook:async input=>{await ensureXLSX();return readFile(input);}};
function init(){document.querySelectorAll('[data-stage]').forEach(btn=>btn.onclick=()=>chooseTab(btn.dataset.stage));chooseTab(tab);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

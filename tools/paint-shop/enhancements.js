/* BAMCO Paint Shop — oven onboarding, workspace navigation and ED compliance.
   All calculations run locally in the browser. No uploaded data leaves the device. */
'use strict';
(function () {
  // Start downloading and decoding the official ED image as the initial welcome page loads.
  const ED_WINDOW_ASSET='assets/ed-baking-window-original.avif?v=20261021-5';
  const edWindowPreload=new Image();
  edWindowPreload.decoding='async';
  edWindowPreload.src=ED_WINDOW_ASSET;
  if(typeof edWindowPreload.decode==='function')edWindowPreload.decode().catch(()=>{});
  const getWindow=(stage=core()?.getStage()||choice)=>window.BAMCOBakingWindows.get(stage);
  const ovens = [
    {id:'ed',name:'ED Oven',description:'Electrodeposition coating',symbol:'01'},
    {id:'primer',name:'Primer Oven',description:'Primer curing process',symbol:'02'},
    {id:'sealer',name:'Sealer Oven',description:'Sealing and thermal treatment',symbol:'03'},
    {id:'bc',name:'Base Coat Oven',description:'Base coat temperature profiles',symbol:'04'}
  ];

  // Distinct oven illustrations, drawn as transparent SVG vectors.
  const OVEN_ART={
    ed:'<path d="M13 57h70v17a8 8 0 0 1-8 8H21a8 8 0 0 1-8-8z" fill="currentColor" fill-opacity=".08"/>'
      +'<path d="M13 57h70v17a8 8 0 0 1-8 8H21a8 8 0 0 1-8-8z"/>'
      +'<path d="M20 66c6-4 11-4 17 0s11 4 17 0 11-4 17 0 10 4 13 1" class="oven-icon-soft"/>'
      +'<path d="M29 51l6-13h27l6 13M25 53h48M37 51v-5h24v5"/>'
      +'<path d="M54 10 39 28h12l-8 18 19-24H50z" fill="currentColor" fill-opacity=".17"/>'
      +'<path d="M54 10 39 28h12l-8 18 19-24H50z"/>',
    primer:'<path d="M12 28h29l9 8-9 8H22l-10-7z" fill="currentColor" fill-opacity=".12"/>'
      +'<path d="M12 28h29l9 8-9 8H22l-10-7z"/>'
      +'<path d="M26 44v24h13l5 10M35 44l-2 13h10"/>'
      +'<path d="M14 28v-8h14v8"/>'
      +'<path d="M74 19v58M83 19v58" class="oven-icon-soft"/>'
      +'<circle cx="56" cy="30" r="2.5" fill="currentColor" stroke="none"/>'
      +'<circle cx="64" cy="36" r="2.5" fill="currentColor" stroke="none"/>'
      +'<circle cx="56" cy="43" r="2" fill="currentColor" stroke="none"/>'
      +'<circle cx="66" cy="47" r="2" fill="currentColor" stroke="none"/>',
    sealer:'<rect x="17" y="27" width="47" height="17" rx="5" fill="currentColor" fill-opacity=".12"/>'
      +'<rect x="17" y="27" width="47" height="17" rx="5"/>'
      +'<path d="M64 30h11l10 6-10 6H64M25 44v14h15l5 20H33l-10-18V44"/>'
      +'<path d="M17 23v-4h11M13 36h-6M52 27V17h9"/>'
      +'<path d="M15 81h67M13 69c12-8 20-8 31 0s21 8 37-1" class="oven-icon-soft"/>',
    bc:'<path d="M19 29 47 16l29 13-29 14z" fill="currentColor" fill-opacity=".08"/>'
      +'<path d="M19 29 47 16l29 13-29 14z"/>'
      +'<path d="M19 43 47 56l29-13M19 55l28 13 29-13M19 67l28 13 29-13" class="oven-icon-soft"/>'
      +'<path d="M19 43v24M76 43v24"/>'
      +'<path d="M12 19c5 0 6-5 11-5M73 19c5 0 6-5 11-5"/>'
      +'<circle cx="16" cy="16" r="2" fill="currentColor" stroke="none"/>'
      +'<circle cx="78" cy="14" r="2" fill="currentColor" stroke="none"/>'
  };
  function ovenIcon(id){
    return '<svg class="oven-icon oven-icon-'+(OVEN_ART[id]?id:'ed')+'" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round">'+(OVEN_ART[id]||OVEN_ART.ed)+'</svg>';
  }
  const sections = [
    {id:'upload',label:'Upload & File Management',icon:'⇧'},
    {id:'information',label:'Information Tables',icon:'▤'},
    {id:'charts',label:'Charts',icon:'▥'},
    {id:'analysis',label:'Baking Window Analysis',icon:'◎'},
    {id:'comparison',label:'File & Window Comparison',icon:'⇄'}
  ];
  let choice='ed',step=1,activeSection='upload',gateway;
  const core=()=>window.BAMCO_CORE;
  const esc=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const fmt=(v,n=3)=>Number.isFinite(v)?v.toFixed(n):'N/A';
  // Display durations as mm:ss, retaining numeric minutes in calculations and exports.
  const mmss=v=>{
    if(!Number.isFinite(v))return 'N/A';
    const secs=Math.round(Math.abs(v)*60);
    return (v<0&&secs?'-':'')+String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
  };
  const signedTime=v=>Number.isFinite(v)?(v>0?'+':'')+mmss(v):'N/A';
  const CHANNEL_COLORS=['#087d8c','#e19a24','#4364c5','#ce4e68','#865ac2','#0e946e','#bb627f','#7d8737'];
  function channelColor(ch){const n=Number(String(ch).replace(/\D/g,''));return CHANNEL_COLORS[(Number.isFinite(n)&&n>0?n-1:0)%CHANNEL_COLORS.length];}
  function svgChart(points=[],small=false,config=getWindow()){
    if(!config)return '';
    const w=790,h=small?340:485,L=65,R=23,top=26,B=small?82:126;
    const X=x=>L+(x-config.xRange[0])/(config.xRange[1]-config.xRange[0])*(w-L-R),Y=y=>h-B-(y-config.yRange[0])/(config.yRange[1]-config.yRange[0])*(h-top-B);
    const poly=config.vertices.map(p=>X(p[0])+','+Y(p[1])).join(' ');
    const lines=[];
    for(const x of config.xTicks){
      lines.push('<line x1="'+X(x)+'" y1="'+top+'" x2="'+X(x)+'" y2="'+(h-B)+'" stroke="#dfebe7" stroke-dasharray="4 5"/>');
      lines.push('<text x="'+X(x)+'" y="'+(h-B+20)+'" text-anchor="middle" font-size="12" fill="#708983">'+mmss(x)+'</text>');
    }
    for(const y of config.yTicks){
      lines.push('<line x1="'+L+'" y1="'+Y(y)+'" x2="'+(w-R)+'" y2="'+Y(y)+'" stroke="#dfebe7" stroke-dasharray="4 5"/>');
      lines.push('<text x="'+(L-13)+'" y="'+(Y(y)+4)+'" text-anchor="end" font-size="12" fill="#708983">'+y+'</text>');
    }
    let dots='',legend='';
    config.vertices.forEach(([x,y])=>dots+='<circle cx="'+X(x)+'" cy="'+Y(y)+'" r="4.5" fill="#237e4b" stroke="white" stroke-width="1.6"/>');
    points.forEach((p,i)=>{
      if(!Number.isFinite(p.d)||!Number.isFinite(p.t))return;
      const x=X(p.d),y=Y(p.t),c=channelColor(p.ch);
      // One precise, small colored circle per channel; no attached label or halo.
      dots+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="'+c+'" stroke="white" stroke-width="0.7"/>'
        +'<title>'+esc(p.ch)+' — '+mmss(p.d)+', '+fmt(p.t,1)+'°C — '+esc(p.status)+'</title>';
      const column=i%5,row=Math.floor(i/5);
      const lx=L+20+column*133,ly=h-34+row*18;
      legend+='<circle cx="'+lx+'" cy="'+(ly-4)+'" r="5" fill="'+c+'"/>'
        +'<text x="'+(lx+13)+'" y="'+ly+'" font-size="12" fill="#344b52">'+esc(p.ch)+' · '+esc(p.status)+'</text>';
    });
    return '<svg class="window-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(config.name)+' with measured channel points" xmlns="http://www.w3.org/2000/svg">'
      +'<rect width="'+w+'" height="'+h+'" rx="12" fill="#fff"/>'
      +lines.join('')+'<line x1="'+L+'" y1="'+top+'" x2="'+L+'" y2="'+(h-B)+'" stroke="#82969c"/>'
      +'<line x1="'+L+'" y1="'+(h-B)+'" x2="'+(w-R)+'" y2="'+(h-B)+'" stroke="#82969c"/>'
      +'<polygon points="'+poly+'" fill="#74c990" fill-opacity=".26" stroke="#277f47" stroke-width="3.1" stroke-linejoin="round"/>'
      +dots
      +'<text x="'+(w/2)+'" y="'+(h-B+46)+'" fill="#344b52" font-size="14" text-anchor="middle">Duration at or above '+config.threshold+'°C (mm:ss)</text>'
      +'<text transform="translate(19 '+((h-B+top)/2)+') rotate(-90)" text-anchor="middle" fill="#344b52" font-size="14">Peak Temperature (°C)</text>'
      +legend+'</svg>';
  }
  function preview(stage=choice){
    const config=getWindow(stage);if(!config)return '';
    return '<div class="window-photo-card ed-reference-image"><img src="'+config.image+'" alt="'+esc(config.name+' — '+config.manufacturer)+'" class="window-photo" width="1448" height="1086" decoding="async" loading="eager"></div>';
  }
  function applyGatewayHeader(){
    const slot=gateway?.querySelector('.gate-header-slot');
    const source=document.querySelector('.app-shell > .app-header');
    if(!slot||!source)return;
    const header=source.cloneNode(true);
    header.removeAttribute('id');
    header.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    slot.replaceChildren(header);
  }
  function renderGate(){
    if(!gateway)return;
    const oven=ovens.find(x=>x.id===choice),config=getWindow(choice);
    if(step===1){
      gateway.innerHTML='<div class="gate-container"><div class="gate-header-slot"></div>'
      +'<div class="gate-intro"><h1>Precision starts with <span>every degree.</span></h1></div>'
      +'<div class="oven-grid">'+ovens.map(o=>'<button class="oven-choice" data-oven="'+o.id+'"><span class="oven-number">'+o.symbol+'</span><span class="oven-graphic" aria-hidden="true">'+ovenIcon(o.id)+'</span><strong>'+o.name+'</strong><small>'+o.description+'</small><span class="oven-cta">Select oven →</span></button>').join('')+'</div>'
      +'<div class="daily-entry"><div><h2>Daily report</h2><p>Four oven summaries in one PDF.</p></div><button type="button" class="primary-action" data-open-daily>Create daily report →</button></div>'
      +'</div>';
    } else {
      gateway.innerHTML='<div class="gate-container gate-window-container">'
      +'<div class="window-topbar"><div><span class="window-eyebrow">THERMAL WORKSPACE</span><h1>'+oven.name+'</h1></div><button class="window-change-oven" data-go-back>← Change oven</button></div>'
      +(config
        ?'<div class="window-selection"><section class="window-description"><span class="approved-flag">VALIDATED REFERENCE</span><h2>'+esc(oven.name)+' baking window</h2><p class="window-supplier">'+esc(config.manufacturer)+'</p><div class="window-spec"><span>Minimum duration <b>'+mmss(config.minDuration)+'</b></span><span>Maximum duration <b>'+mmss(config.maxDuration)+'</b></span><span>Peak temperature <b>'+config.minTemp+'–'+config.maxTemp+'°C</b></span></div><div class="window-actions"><button class="primary-action" data-enter>Start '+esc(oven.name.replace(' Oven',''))+' analysis <span aria-hidden="true">→</span></button></div></section>'+preview()+'</div>'
        :'<div class="window-selection no-window"><section class="window-description"><span class="pending-flag">REFERENCE PENDING</span><h2>Explore your recordings</h2><p>No validated baking window has been configured for '+oven.name+'. You can upload recordings and explore temperature tables and charts.</p><p class="window-pending-note">Baking-window evaluation will show “Not configured”.</p><div class="window-actions"><button class="primary-action" data-enter>Continue to workspace <span aria-hidden="true">→</span></button></div></section></div>')
      +'</div>';
    }
    applyGatewayHeader();
  }
  function scrollToPageTop(){
    // The welcome page can be taller than the upload view. Reset the retained
    // scroll offset without animating, even when html uses smooth scrolling.
    window.scrollTo({top:0,left:0,behavior:'instant'});
  }
  function enter(){
    const body=document.body;
    // Prepare the entire selected oven workspace behind the welcome screen.
    // Do not expose the legacy upload layout while it is being rebuilt.
    const initialSection=getWindow(choice)?'analysis':'upload';
    activeSection=initialSection;
    body.dataset.section=initialSection;
    body.classList.add('bamco-building');
    try {
      core().chooseTab(choice);
      body.classList.add('bamco-entered');
      refresh(); // Mount the left navigation and final layout before revealing.
      switchSection(initialSection);
      scrollToPageTop();
    } finally {
      body.classList.remove('bamco-building');
    }
  }
  function openGate(){
    step=1;document.body.classList.remove('bamco-entered');renderGate();
    scrollToPageTop();
    requestAnimationFrame(scrollToPageTop);
  }
  function navHTML(){
    const oven=ovens.find(x=>x.id===core().getStage());
    const labels={upload:'Upload & Files',information:'Information',charts:'Charts',analysis:'Baking Analysis',comparison:'Comparison'};
    return '<nav class="workspace-nav" aria-label="Workspace navigation">'
      +'<div class="nav-oven"><span class="nav-oven-symbol">'+ovenIcon(core().getStage())+'</span><div><strong>'+esc(oven.name)+'</strong><small>'+(getWindow()?.shortManufacturer||'Temperature analytics')+'</small></div></div>'
      +'<div class="nav-links">'+sections.map(s=>'<button type="button" class="workspace-nav-link '+(activeSection===s.id?'is-active':'')+'" data-section="'+s.id+'" aria-label="'+esc(s.label)+'" title="'+esc(s.label)+'"'+(activeSection===s.id?' aria-current="page"':'')+'><span class="nav-icon" aria-hidden="true">'+s.icon+'</span><span>'+labels[s.id]+'</span></button>').join('')+'</div>'
      +'<button type="button" class="change-oven" data-change-oven>↻ Change oven / window</button></nav>';
  }
  function switchSection(s){
    activeSection=s;document.body.dataset.section=s;
    document.querySelectorAll('.workspace-nav-link').forEach(b=>{
      const selected=b.dataset.section===s;
      b.classList.toggle('is-active',selected);
      if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
    const sectionName=sections.find(a=>a.id===s)?.label||'Workspace';
    const h=document.getElementById('selected-section-name');if(h)h.textContent=sectionName;
    if(s==='charts')core()?.renderPlots?.();
    // Build the comparison contents before the browser paints the active tab.
    // An empty intermediate frame shrinks the page and clamps its scroll position.
    if(s==='comparison')window.BAMCOCompare?.render?.();
  }
  function elapsedDuration(reads,ch,step,threshold){
    // Evaluate the available numeric samples; missing readings are not a baking rule.
    const samples=reads.filter(x=>Number.isFinite(x.ts)&&Number.isFinite(x.values[ch]));
    if(samples.length<2)return {duration:null,error:'Insufficient numeric samples'};
    let duration=0;
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i],dt=(b.ts-a.ts)/60000;
      if(!(dt>0))continue;
      const A=a.values[ch],B=b.values[ch];
      if(A>=threshold&&B>=threshold)duration+=dt;
      else if(A<threshold&&B>=threshold&&A!==B)duration+=dt*(B-threshold)/(B-A);
      else if(A>=threshold&&B<threshold&&A!==B)duration+=dt*(A-threshold)/(A-B);
    }
    return {duration,error:null};
  }
  function evaluate(r,stage=core()?.getStage()||choice){
    const config=getWindow(stage);
    if(!config||!r||!r.channels)return [];
    return r.channels.map(ch=>{
      const temps=r.reads.map(q=>q.values[ch]).filter(Number.isFinite);
      const T=temps.length?Math.max(...temps):null;
      const durationResult=elapsedDuration(r.reads,ch,r.step,config.threshold);
      const D=durationResult.duration;
      let violations=[],status='PASS';
      if(!Number.isFinite(D)||!Number.isFinite(T)||r.reads.length<2){
        status='NO DATA';
      }else{
        for(const [id,description,formula,violated] of config.rules){if(violated(D,T))violations.push(id+' — '+description);}
        if(violations.length)status='FAIL';
      }
      const dMin=Number.isFinite(T)?config.durationMin(T):null;
      const dMax=Number.isFinite(T)?config.durationMax(T):null;
      const tMin=Number.isFinite(D)?config.temperatureMin(D):null;
      const tMax=Number.isFinite(D)?config.temperatureMax(D):null;
      return {ch, label:r.labels[ch]||ch, D,T,status,violations,dMin,dMax,tMin,tMax,threshold:config.threshold,
        mdMin:Number.isFinite(D)&&dMin!==null?D-dMin:null,
        mdMax:Number.isFinite(D)&&dMax!==null?dMax-D:null,
        mtMin:Number.isFinite(T)&&tMin!==null?T-tMin:null,
        mtMax:Number.isFinite(T)&&tMax!==null?tMax-T:null,
        mdAbs:Number.isFinite(D)?config.maxDuration-D:null,
        mtAbs:Number.isFinite(T)?config.maxTemp-T:null};
    });
  }
  function tag(status){
    return '<span class="eval-tag '+(status==='PASS'?'pass':status==='FAIL'?'fail':'pending')+'">'+esc(status)+'</span>';
  }
  function signed(v,n=3,unit=''){return v===null?'N/A':(v>0?'+':'')+fmt(v,n)+(unit?' '+unit:'');}
  function summaryRows(data,config){
    const row=(label,key,digits=3,unit='',kind='')=>'<tr><th>'+label+'</th>'+data.map(v=>'<td class="'+((kind==='margin'||kind==='time-margin')&&v[key]<0?'negative':'')+'">'+(kind==='time'?mmss(v[key]):kind==='time-margin'?signedTime(v[key]):kind==='margin'?signed(v[key],digits,unit):v[key]===null?'N/A':fmt(v[key],digits)+(unit?' '+unit:''))+'</td>').join('')+'</tr>';
    return '<div class="matrix-scroll"><table class="eval-matrix"><thead><tr><th>Evaluation parameter</th>'+data.map(v=>'<th>'+esc(v.ch)+'</th>').join('')+'</tr></thead><tbody>'
      +'<tr><th>Probe location</th>'+data.map(v=>'<td>'+esc(v.label.replace(/^Ch\d+\s*[-–]\s*/,''))+'</td>').join('')+'</tr>'
      +row('Duration at or above '+config.threshold+'°C','D',3,'','time')+row('Peak temperature','T',1,'°C')
      +'<tr class="matrix-group"><th colspan="'+(data.length+1)+'">ALLOWED BAKING WINDOW</th></tr>'
      +row('Min duration at peak temperature','dMin',3,'','time')
      +row('Max duration at peak temperature','dMax',3,'','time')
      +row('Min temperature at actual duration','tMin',1,'°C')
      +row('Max temperature at actual duration','tMax',1,'°C')
      +'<tr class="matrix-group"><th colspan="'+(data.length+1)+'">DISTANCE TO LIMITS (SIGNED MARGINS)</th></tr>'
      +row('Minimum duration margin','mdMin',3,'','time-margin')
      +row('Maximum duration margin','mdMax',3,'','time-margin')
      +row('Minimum peak temperature margin','mtMin',1,'°C','margin')
      +row('Maximum temperature margin','mtMax',1,'°C','margin')
      +'<tr class="matrix-group"><th colspan="'+(data.length+1)+'">RULE EVALUATION</th></tr>'
      +'<tr><th>Violated rules</th>'+data.map(v=>'<td>'+(v.violations.length?esc(v.violations.map(x=>x.split(' — ')[0]).join(', ')):'—')+'</td>').join('')+'</tr>'
      +'<tr class="status-row"><th>Final status</th>'+data.map(v=>'<td>'+tag(v.status)+'</td>').join('')+'</tr>'
      +'</tbody></table></div>';
  }
  // Shared no-recordings screen across all non-upload workspace tabs and oven types.
  function emptyState(){
    return '<div class="compare-empty-wrap" role="status"><h3>No recordings uploaded yet</h3>'
      +'<button type="button" data-section="upload" class="primary-action">Go to uploads →</button></div>';
  }
  function renderAnalysis(r,stage){
    const config=getWindow(stage);
    if(!config){
      return '<div class="no-analysis"><span class="pending-flag">NOT CONFIGURED</span><h2>No validated baking window for this oven</h2><p>The ED reference is never applied to another process. Configure the manufacturer-approved polygon before enabling pass/fail decisions here.</p></div>';
    }
    if(!r){
      return '<div class="no-analysis"><h2>Ready to evaluate '+esc(config.name)+'.</h2>'+preview(stage)+'<button type="button" class="primary-action" data-section="upload">Upload a workbook →</button></div>';
    }
    const results=evaluate(r,stage);
    const pass=results.filter(v=>v.status==='PASS').length,fail=results.filter(v=>v.status==='FAIL').length,invalid=results.filter(v=>v.status==='NO DATA').length;
    const overall=invalid?'NO DATA':fail?'FAIL':results.length?'PASS':'NO DATA';
    let cards=results.map(v=>'<article class="probe-card '+(v.status==='PASS'?'good':'bad')+'"><div class="probe-head"><h3>'+esc(v.ch)+'</h3>'+tag(v.status)+'</div>'
      +'<p class="probe-location">'+esc(v.label)+'</p>'
      +'<div class="probe-numbers"><span><small>Time ≥'+config.threshold+'°C</small><b>'+mmss(v.D)+' <em>mm:ss</em></b></span><span><small>Peak temperature</small><b>'+fmt(v.T,1)+' <em>°C</em></b></span></div>'
      +'<div class="probe-margins"><span>Min time margin <b class="'+(v.mdMin<0?'negative':'')+'">'+signedTime(v.mdMin)+'</b></span>'
      +'<span>Max time margin <b>'+signedTime(v.mdMax)+'</b></span>'
      +'<span>Min temp margin <b>'+signed(v.mtMin,1,'°C')+'</b></span>'
      +'<span>Max temp margin <b>'+signed(v.mtMax,1,'°C')+'</b></span></div>'
      +'<div class="probe-reason">'+(v.violations.length?esc(v.violations.join('; ')):v.status==='NO DATA'?'No numeric samples to evaluate':'All baking window rules satisfied')+'</div></article>').join('');
    return '<div class="analysis-titlebar"><div><h2>Baking Window Evaluation</h2></div><div class="chart-actions"><button type="button" class="btn" data-download-summary>Summary PDF</button>'+tag(overall)+'</div></div>'
      +'<div class="eval-stats"><div><small>Total probes</small><strong>'+results.length+'</strong></div><div><small>Passed</small><strong class="text-green">'+pass+'</strong></div><div><small>Failed</small><strong class="text-red">'+fail+'</strong></div><div><small>No data</small><strong>'+invalid+'</strong></div></div>'
      +'<div class="window-analysis-plot"><h3>'+esc(config.name)+' — Measured Channel Points</h3>'+svgChart(results.map(v=>({ch:v.ch,d:v.D,t:v.T,status:v.status})),false,config)
      +'</div>'
      +'<div class="analysis-table-title"><h3>Channel Comparison Matrix</h3></div>'
      +summaryRows(results,config)
      +'<div class="probe-grid">'+cards+'</div>'
      +'<div class="rule-explanation"><strong>Rule logic</strong>'+config.rules.map(([id,description,formula])=>'<span>'+esc(id+': '+formula)+'</span>').join('')+'</div>';

  }
  // Use the date in the uploaded filename shown in Upload & Files.
  // Keep Persian calendar dates as written; do not substitute a worksheet date.
  function uploadedFileDate(filename){
    const name=String(filename||'').replace(/[۰-۹٠-٩]/g,char=>{
      const n=char.charCodeAt(0);return String(n>=1776?n-1776:n-1632);
    });
    const valid=(year,month,day)=>{
      year=Number(year);month=Number(month);day=Number(day);
      if(year<1300||year>2099||month<1||month>12||day<1)return null;
      const max=year<1700?(month<=6?31:30):new Date(Date.UTC(year,month,0)).getUTCDate();
      return day<=max?year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'):null;
    };
    const patterns=[
      {regex:/(?:^|[^\d])((?:13|14|19|20)\d{2})[-_.\s]+(\d{1,2})[-_.\s]+(\d{1,2})(?!\d)/g,order:[1,2,3]},
      {regex:/(?:^|[^\d])((?:13|14|19|20)\d{2})(\d{2})(\d{2})(?!\d)/g,order:[1,2,3]},
      {regex:/(?:^|[^\d])(\d{1,2})[-_.\s]+(\d{1,2})[-_.\s]+((?:13|14|19|20)\d{2})(?!\d)/g,order:[3,2,1]}
    ];
    for(const {regex,order} of patterns){
      for(const match of name.matchAll(regex)){
        const date=valid(...order.map(index=>match[index]));if(date)return date;
      }
    }
    return null;
  }
  async function downloadSummary(button){
    const r=core()?.getRecord();
    if(!getWindow()||!r)return;
    const results=evaluate(r);
    const label=button.textContent;
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Creating PDF...';
    try{
      if(!window.BAMCOSummaryPDF)throw Error('PDF export is unavailable. Reload the page and try again.');
      const ovenName=ovens.find(oven=>oven.id===core().getStage())?.name||core().getStage();
      const sourceFile=core().getFile?.()?.name||r.fileName;
      const config=getWindow();
      await window.BAMCOSummaryPDF.download(results,{ovenName,recordingDate:uploadedFileDate(sourceFile),manufacturer:config.manufacturer,threshold:config.threshold,rules:config.rules});
    }catch(error){alert('Summary PDF export failed: '+error.message);}
    finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=label;}
  }
  function evaluationForExport(){
    const r=core()?.getRecord(),config=getWindow();if(!config||!r)return null;
    const data=evaluate(r);
    return {window:config.name,headers:['Parameter',...data.map(x=>x.ch)],rows:[
      ['Time at or above '+config.threshold+'C (min)',...data.map(x=>x.D)],
      ['Peak temperature (C)',...data.map(x=>x.T)],
      ['Min duration at peak (min)',...data.map(x=>x.dMin)],
      ['Max duration at peak (min)',...data.map(x=>x.dMax)],
      ['Min peak temperature at duration (C)',...data.map(x=>x.tMin)],
      ['Max temperature at duration (C)',...data.map(x=>x.tMax)],
      ['Min duration margin (min)',...data.map(x=>x.mdMin)],
      ['Max duration margin (min)',...data.map(x=>x.mdMax)],
      ['Min temperature margin (C)',...data.map(x=>x.mtMin)],
      ['Max temperature margin (C)',...data.map(x=>x.mtMax)],
      ['Violated rules',...data.map(x=>x.violations.join('; '))],
      ['Final status',...data.map(x=>x.status)]
    ]};
  }
  function refresh(){
    if(!document.body.classList.contains('bamco-entered'))return;
    const layout=document.querySelector('.stage-layout');
    if(!layout)return;
    // Update the navigation host, not a nested <nav>. This avoids creating
    // another navigation tree on every uploaded-file or tab refresh.
    let nav=layout.querySelector(':scope > .workspace-nav-slot');
    if(!nav){nav=document.createElement('div');nav.className='workspace-nav-slot';layout.insertBefore(nav,layout.firstChild);}
    nav.innerHTML=navHTML();
    const main=document.getElementById('chart-panel'),r=core().getRecord();
    if(!main)return;
    if(!main.querySelector('.bamco-views')){
      const children=Array.from(main.children);
      const holder=document.createElement('div');holder.className='bamco-views';
      const top=document.createElement('div');top.className='view-intro';
      const charts=document.createElement('section');charts.className='view-charts';
      const info=document.createElement('section');info.className='view-information';
      const analysis=document.createElement('section');analysis.className='view-analysis';
      const comparison=document.createElement('section');comparison.className='view-comparison';
      let afterTitle=false;
      children.forEach(el=>{
        if(el.classList.contains('chart-heading')||el.classList.contains('metrics')||el.classList.contains('import-errors'))top.appendChild(el);
        else if(el.classList.contains('section-title')){afterTitle=true;info.appendChild(el);}
        else if(afterTitle)info.appendChild(el);
        else charts.appendChild(el);
      });
      if(!r&&!core().getState().files.length){
        top.replaceChildren();
        charts.innerHTML=emptyState();
        info.innerHTML=emptyState();
        analysis.innerHTML=renderAnalysis(r,core().getStage());
      }else{
        if(!r)info.innerHTML='<div class="no-analysis"><h2>No worksheet loaded yet</h2><p>Choose Upload & File Management to add a workbook.</p></div>';
        analysis.innerHTML=renderAnalysis(r,core().getStage());
      }
      holder.append(top,charts,info,analysis,comparison);main.appendChild(holder);
    }else{
      const analysis=main.querySelector('.view-analysis');
      if(analysis)analysis.innerHTML=renderAnalysis(r,core().getStage());
    }
    window.BAMCOCompare?.mount?.();
    switchSection(activeSection);
  }
  function init(){
    gateway=document.createElement('div');gateway.id='bamco-gateway';document.body.insertBefore(gateway,document.body.firstChild);
    renderGate();
    document.addEventListener('click',function(e){
      const b=e.target.closest('button');if(!b)return;
      if(b.dataset.oven){choice=b.dataset.oven;step=2;renderGate();scrollToPageTop();requestAnimationFrame(scrollToPageTop);}
      else if(b.hasAttribute('data-open-daily'))window.BAMCODailyReport.open(gateway,renderGate);
      else if(b.hasAttribute('data-go-back')){step=1;renderGate();scrollToPageTop();requestAnimationFrame(scrollToPageTop);}
      else if(b.hasAttribute('data-enter'))enter();
      else if(b.hasAttribute('data-change-oven'))openGate();
      else if(b.hasAttribute('data-download-summary'))downloadSummary(b);
      else if(b.dataset.section)switchSection(b.dataset.section);
    });
    refresh();
  }
  window.BAMCOEnhance={refresh,evaluate,evaluationForExport,emptyState,ovenIcon};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();


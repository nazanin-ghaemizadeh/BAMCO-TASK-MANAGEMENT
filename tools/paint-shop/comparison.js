/* BAMCO Paint Shop — local multi-file chart & curing-window comparisons. */
'use strict';
(function(){
  const getCore=()=>window.BAMCO_CORE;
  const CHANNEL_COLORS=['#087d8c','#e19a24','#4364c5','#ce4e68','#865ac2','#0e946e','#bb627f','#7d8737'];
  const FILE_DASHES=['solid','dash','dot','dashdot','longdash','longdashdot'];
  const FILE_DASH_PATTERNS=['none','10 6','2 6','10 4 2 4','16 6','16 4 4 4'];
  const FILE_SYMBOLS=['circle','square','diamond','cross','triangle-up','star','triangle-down'];
  const MODES=[
    {id:'profile',label:'Temperature profiles — overlay curves'},
    {id:'spread',label:'Temperature spread — compare files'}
  ];
  const state={stage:null,ids:[],channels:[],mode:'profile',initialized:false,renderVersion:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  const fmt=(x,p=2)=>Number.isFinite(x)?Number(x).toFixed(p):'N/A';
  // Baking-window durations are stored as numeric minutes, displayed as mm:ss.
  const mmss=x=>{
    if(!Number.isFinite(x))return 'N/A';
    const secs=Math.round(Math.abs(x)*60);
    return (x<0&&secs?'-':'')+String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
  };
  const channelColor=ch=>{const n=parseInt(String(ch).replace(/\D/g,''),10);return CHANNEL_COLORS[((Number.isFinite(n)?n:1)-1+CHANNEL_COLORS.length)%CHANNEL_COLORS.length];};
  const fileDash=i=>FILE_DASHES[i%FILE_DASHES.length];
  const fileSymbol=i=>FILE_SYMBOLS[i%FILE_SYMBOLS.length];
  const fileStyleSvg=i=>'<svg class="compare-file-style" viewBox="0 0 36 12" aria-hidden="true"><path d="M2 6 H34" fill="none" stroke="#307460" stroke-width="2.5" stroke-dasharray="'+FILE_DASH_PATTERNS[i%FILE_DASH_PATTERNS.length]+'"/></svg>';
  function records(){
    const core=getCore();
    if(!core)return [];
    const x=core.getState();
    const current=core.getRecord();
    return x.files.filter(f=>f.records?.length)
      .map((f,i)=>({id:f.id,name:f.name,fileIndex:i,
          r:f.records.find(q=>q.sheetName===current?.sheetName)||f.records[0]}));
  }
  function sync(rec){
    const stage=getCore()?.getStage();
    if(stage!==state.stage){state.stage=stage;state.initialized=false;state.ids=[];state.channels=[];state.mode='profile';}
    const allIds=rec.map(x=>x.id);
    if(!state.initialized){
      state.ids=allIds.slice(0,Math.min(allIds.length,3));state.initialized=true;
      state.channels=[...new Set(rec.flatMap(x=>x.r.channels))];
    }else{
      state.ids=state.ids.filter(id=>allIds.includes(id));
      const allChannels=[...new Set(rec.flatMap(x=>x.r.channels))];
      state.channels=state.channels.filter(c=>allChannels.includes(c));
      if(!state.channels.length&&rec.length)state.channels=[...allChannels];
    }
  }
  function active(rec){return rec.filter(x=>state.ids.includes(x.id));}
  function channelList(rec){return [...new Set(rec.flatMap(x=>x.r.channels))].sort((a,b)=>Number(a.slice(2))-Number(b.slice(2)));}
  function mount(){
    const main=document.querySelector('.bamco-views .view-comparison');
    if(main&&!main.dataset.compareReady){
      main.dataset.compareReady='1';
      main.addEventListener('change',e=>{
        const node=e.target;
        if(node.matches('[data-cmp-file]')){
          const id=node.dataset.cmpFile;
          if(node.checked&&!state.ids.includes(id))state.ids.push(id);
          if(!node.checked)state.ids=state.ids.filter(x=>x!==id);
          render();
        }else if(node.matches('[data-cmp-channel]')){
          const ch=node.dataset.cmpChannel;
          if(node.checked&&!state.channels.includes(ch))state.channels.push(ch);
          if(!node.checked)state.channels=state.channels.filter(x=>x!==ch);
          render();
        }else if(node.id==='cmp-mode'){state.mode=node.value;render();}
      });
      main.addEventListener('click',e=>{
        const b=e.target.closest('button');
        if(!b)return;
        if(b.dataset.cmpAction==='all'){state.ids=records().map(x=>x.id);render();}
        if(b.dataset.cmpAction==='clear'){state.ids=[];render();}
        if(b.dataset.cmpAction==='download-chart')exportPlot('cmp-chart','_chart_comparison.png');
        if(b.dataset.cmpAction==='download-window')exportPlot('cmp-window','_window_comparison.png');
      });
    }
  }
  function controls(files,selected,channels){
    return '<div class="compare-controls">'
      +'<div class="compare-control-header"><h3>01 · Choose recordings</h3><div><button type="button" data-cmp-action="all">Select all</button><button type="button" data-cmp-action="clear">Clear</button></div></div>'
      +'<div class="compare-file-list">'+files.map(f=>'<label class="compare-file-choice"><input type="checkbox" data-cmp-file="'+esc(f.id)+'" '+(state.ids.includes(f.id)?'checked':'')+'/>'+fileStyleSvg(f.fileIndex)+'<span class="compare-filename" title="'+esc(f.name)+'">'+esc(f.name)+'</span></label>').join('')+'</div>'
      +'<div class="compare-small-title">02 · Channels</div>'
      +'<div class="compare-channel-list">'+channels.map(ch=>'<label class="compare-channel-choice"><input data-cmp-channel="'+ch+'" type="checkbox" '+(state.channels.includes(ch)?'checked':'')+'/><span class="channel-color-swatch" style="background:'+channelColor(ch)+'"></span><span>'+esc(ch)+'</span></label>').join('')+'</div>'
      +'<div class="compare-small-title">03 · Chart type</div>'
      +'<select class="compare-select" id="cmp-mode" aria-label="Chart to compare">'+MODES.map(m=>'<option value="'+m.id+'" '+(state.mode===m.id?'selected':'')+'>'+m.label+'</option>').join('')+'</select>'
      +'</div>';
  }
  function chartLayout(title,yTitle,bar=false){
    return {title:{text:title,font:{family:'Times New Roman',size:17,color:'#214d4c'},x:0.02},
      font:{family:'Times New Roman',size:12,color:'#38535d'},
      xaxis:{title:bar?'Uploaded file':'Elapsed time (min)',automargin:true,gridcolor:'#e5efec',zeroline:false,tickangle:bar?-18:0},
      yaxis:{title:yTitle,automargin:true,gridcolor:'#e5efec',zeroline:false},
      height:535,margin:{l:75,r:26,b:bar?132:92,t:60},
      legend:{orientation:'h',y:-.25,x:0,font:{size:11}},
      paper_bgcolor:'#fff',plot_bgcolor:'#fff',barmode:'group',hovermode:bar?'closest':'x unified',
      autosize:true};
  }

  // One reusable hover panel for both comparisons: exact file glyph, two rows,
  // then additional horizontal columns when more recordings are selected.
  function tooltipSwatch(fileIndex,color,kind){
    if(kind!=='window')return '<svg class="tooltip-swatch" viewBox="0 0 24 16" aria-hidden="true">'
      +'<path d="M1 8H23" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-dasharray="'+FILE_DASH_PATTERNS[fileIndex%FILE_DASH_PATTERNS.length]+'"/></svg>';
    const shape=fileSymbol(fileIndex), fill='fill="'+color+'"',line='stroke="'+color+'" stroke-width="2.6" stroke-linecap="round"';
    let svg;
    if(shape==='square')svg='<rect x="5" y="3" width="12" height="12" rx="1.1" '+fill+'/>';
    else if(shape==='diamond')svg='<path d="M11 1L19 9L11 17L3 9Z" '+fill+'/>';
    else if(shape==='cross')svg='<path d="M11 2V16M4 9H18" '+line+'/>';
    else if(shape==='triangle-up')svg='<path d="M11 1L20 16H2Z" '+fill+'/>';
    else if(shape==='triangle-down')svg='<path d="M2 2H20L11 17Z" '+fill+'/>';
    else if(shape==='star')svg='<path d="M11 1L13.7 6.4L20 7.3L15.5 11.6L16.6 18L11 15L5.4 18L6.5 11.6L2 7.3L8.3 6.4Z" '+fill+'/>';
    else svg='<circle cx="11" cy="9" r="6.1" '+fill+'/>';
    return '<svg class="tooltip-swatch" viewBox="0 0 22 19" aria-hidden="true">'+svg+'</svg>';
  }
  function comparisonTooltip(plot,kind){
    const tip=document.createElement('div');
    tip.className='bamco-compare-tooltip';
    tip.setAttribute('role','status');
    tip.hidden=true;plot.appendChild(tip);
    plot.on('plotly_hover',event=>{
      const pts=(event.points||[]).filter(p=>Number.isFinite(p.y)&&p.data?.meta?.fileName);
      if(!pts.length){tip.hidden=true;return;}
      const groups=new Map();
      for(const p of pts){
        const m=p.data.meta,custom=p.customdata||[],label=kind==='window'?String(custom[0]||''):String(m.channel||'');
        if(!groups.has(m.fileId))groups.set(m.fileId,{name:m.fileName,rows:new Map()});
        const g=groups.get(m.fileId);
        const value=kind==='window'?'Peak '+fmt(p.y,1)+'°C · '+esc(String(custom[1]||'')):fmt(p.y,2)+'°C';
        const marker=tooltipSwatch(m.fileIndex||0,channelColor(label),kind);
        g.rows.set(label,'<div class="tooltip-line"><span class="tooltip-channel">'+marker+esc(label)+'</span><span>'+value+'</span></div>');
      }
      const heading=mmss(pts[0].x);
      tip.innerHTML='<div class="tooltip-value">'+esc(heading)+'</div><div class="tooltip-groups">'
        +[...groups.values()].map(g=>'<div class="tooltip-file"><strong title="'+esc(g.name)+'">'+esc(g.name)+'</strong>'+[...g.rows.values()].join('')+'</div>').join('')+'</div>';
      tip.hidden=false;
      const rect=plot.getBoundingClientRect(),e=event.event;
      const x=Number.isFinite(e?.clientX)?e.clientX-rect.left:rect.width/2;
      const y=Number.isFinite(e?.clientY)?e.clientY-rect.top:rect.height/2;
      const w=tip.offsetWidth,h=tip.offsetHeight;
      tip.style.left=Math.max(6,Math.min(x+14,rect.width-w-6))+'px';
      tip.style.top=Math.max(6,Math.min(y+12,rect.height-h-6))+'px';
    });
    // Keep the panel available for scrolling when many recordings exceed two rows.
    plot.on('plotly_unhover',()=>{if(!tip.matches(':hover'))tip.hidden=true;});
    tip.addEventListener('mouseleave',()=>{tip.hidden=true;});
    plot.addEventListener('mouseleave',()=>{tip.hidden=true;});
  }
  function plotChart(items,channels){
    const element=document.getElementById('cmp-chart');
    if(!element)return;
    const valid=items.length&&channels.length;
    if(!valid){element.innerHTML='<div class="compare-empty">Choose at least one file and one channel to draw the comparison.</div>';return;}
    if(!window.Plotly){element.innerHTML='<div class="compare-empty">Chart library unavailable. Upload an Excel file to load plotting tools.</div>';return;}
    const data=[];
    const mode=state.mode;
    if(mode==='profile'){
      items.forEach((file,fi)=>channels.forEach((ch,ci)=>{
        if(!file.r.channels.includes(ch))return;
        const groups=[],rs=file.r.reads;let g=[],last=null;
        const flush=()=>{if(g.length)groups.push(g);g=[];};
        rs.forEach(read=>{const v=read.values[ch];
          if(!Number.isFinite(v)){flush();last=null;return;}
          if(last!==null&&(read.ts-last)>file.r.step*1500+1)flush();
          g.push(read);last=read.ts;
        });flush();
        groups.forEach((group,j)=>data.push({type:'scatter',mode:group.length===1?'markers':'lines',
          x:group.map(p=>p.elapsed),y:group.map(p=>p.values[ch]),
          name:file.name+' · '+ch,legendgroup:file.id+ch,showlegend:j===0,meta:{fileId:file.id,fileName:file.name,fileIndex:file.fileIndex,channel:ch},hoverinfo:'none',
          line:{color:channelColor(ch),width:2.5,dash:fileDash(file.fileIndex)},
          marker:{size:5,color:channelColor(ch)}}));
      }));
    }else if(mode==='spread'){
      items.forEach(file=>{
        let x=[],y=[];for(let i=0;i<file.r.reads.length;i++){
          const read=file.r.reads[i];
          const vals=channels.map(ch=>read.values[ch]);
          x.push(read.elapsed);
          const gap=i>0&&read.ts-file.r.reads[i-1].ts>file.r.step*1500+1;
          y.push(!gap&&channels.length>=2&&vals.every(Number.isFinite)?Math.max(...vals)-Math.min(...vals):null);
        }
        data.push({type:'scatter',mode:'lines',x,y,name:file.name,meta:{fileId:file.id,fileName:file.name,fileIndex:file.fileIndex,channel:'Spread'},hoverinfo:'none',
          line:{color:'#246d6d',width:2.8,dash:fileDash(file.fileIndex)},connectgaps:false});
      });
    }
    const title=MODES.find(x=>x.id===mode)?.label||'Comparison';
    const layout=chartLayout(title,mode==='spread'?'Temperature spread (°C)':'Temperature (°C)');
    // Channel colors and file dash patterns are already identified beside the chart.
    if(mode==='profile'){layout.showlegend=false;layout.margin.b=65;}
    if(mode==='spread'&&channels.length<2)element.innerHTML='<div class="compare-empty">Select at least two channels to compare temperature spread.</div>';
    else if(!data.length)element.innerHTML='<div class="compare-empty">No valid numeric data exists for the selected channel(s).</div>';
    else Plotly.newPlot(element,data,layout,{responsive:true,displaylogo:false,modeBarButtonsToRemove:['lasso2d','select2d']})
      .then(plot=>comparisonTooltip(plot,'chart'))
      .catch(e=>element.textContent='Comparison chart error: '+e.message);
  }
  function windowResults(items,channels){
    const all=[];
    items.forEach((f,fi)=>channels.forEach((ch,ci)=>{
      if(!f.r.channels.includes(ch))return;
      const result=window.BAMCOEnhance.evaluate(f.r).find(x=>x.ch===ch);
      if(result)all.push({...result,fileId:f.id,fileName:f.name,fileIndex:f.fileIndex,chIndex:ci});
    }));
    return all;
  }
  function windowPlot(items,channels){
    const element=document.getElementById('cmp-window'),legend=document.getElementById('cmp-window-matrix');
    if(!element)return;
    const stage=getCore()?.getStage(),config=window.BAMCOBakingWindows.get(stage);
    if(!config){element.innerHTML='<div class="compare-empty">A validated baking window has not been configured for this oven. Chart comparison remains available.</div>';legend.innerHTML='';return;}
    const data=windowResults(items,channels);
    if(!data.length){element.innerHTML='<div class="compare-empty">Select uploaded files and channels to compare baking-window compliance.</div>';legend.innerHTML='';return;}
    if(!window.Plotly){element.innerHTML='<div class="compare-empty">Plotting library unavailable.</div>';return;}
    const polygon={type:'scatter',mode:'lines',x:[...config.vertices,config.vertices[0]].map(p=>p[0]),y:[...config.vertices,config.vertices[0]].map(p=>p[1]),
      fill:'toself',fillcolor:'rgba(98,194,129,.20)',line:{color:'#25925c',width:3},name:config.name,hoverinfo:'skip',showlegend:true};
    const records=[polygon];
    items.forEach(f=>{
      const arr=data.filter(v=>v.fileId===f.id);
      if(!arr.length)return;
      records.push({type:'scatter',mode:'markers',name:f.name,showlegend:true,
        x:arr.map(v=>v.D),y:arr.map(v=>v.T),
        customdata:arr.map(v=>[v.ch,v.status,f.name,mmss(v.D)]),meta:{fileId:f.id,fileName:f.name,fileIndex:f.fileIndex},hoverinfo:'none',
        marker:{size:8,color:arr.map(v=>channelColor(v.ch)),line:{width:0.6,color:'#fff'},symbol:fileSymbol(f.fileIndex)}});
    });
    const l=chartLayout(config.name+' · selected files','Peak temperature (°C)');
    l.xaxis.title='Duration at or above '+config.threshold+'°C (mm:ss)';
    l.xaxis.range=config.xRange;
    l.xaxis.tickmode='array';
    l.xaxis.tickvals=config.xTicks;
    l.xaxis.ticktext=l.xaxis.tickvals.map(mmss);
    l.yaxis.range=config.yRange;l.height=510;
    l.legend={orientation:'h',y:-.28,x:0,font:{size:11}};
    Plotly.newPlot(element,records,l,{responsive:true,displaylogo:false,modeBarButtonsToRemove:['lasso2d','select2d']})
      .then(plot=>comparisonTooltip(plot,'window'))
      .catch(e=>element.textContent=e.message);
    // Each file receives one dedicated row of channel cards.
    legend.innerHTML='<div class="comparison-file-groups">'+items.map(file=>{
      const values=data.filter(v=>v.fileId===file.id);
      if(!values.length)return '';
      const cards=values.map(v=>'<div class="comparison-point" style="--point-color:'+channelColor(v.ch)+'">'
        +'<div class="comparison-point-head"><span class="point-symbol">'+fileSymbol(v.fileIndex).replace('triangle-up','▲').replace('triangle-down','▼').replace('circle','●').replace('square','■').replace('diamond','◆').replace('cross','✚').replace('star','★')+'</span>'
        +'<strong>'+esc(v.ch)+'</strong><span class="compare-status '+(v.status==='PASS'?'ok':'issue')+'">'+esc(v.status)+'</span></div>'
        +'<small>'+mmss(v.D)+' · '+fmt(v.T,1)+'°C</small></div>').join('');
      return '<section class="comparison-file-group"><h4 class="comparison-file-name">'+fileStyleSvg(file.fileIndex)+'<span>'+esc(file.name)+'</span></h4>'
        +'<div class="comparison-file-cards">'+cards+'</div></section>';
    }).join('')+'</div>';
  }
  async function exportPlot(id,suffix){
    const el=document.getElementById(id);
    if(!window.Plotly||!el?.data){alert('Please render the comparison chart first.');return;}
    try{
      const url=await Plotly.toImage(el,{format:'png',width:1500,height:850,scale:1.5});
      const a=document.createElement('a');a.href=url;a.download=(state.stage||'oven')+suffix;a.click();
    }catch(e){alert('Unable to export PNG: '+e.message);}
  }
  function render(){
    const el=document.querySelector('.view-comparison');
    if(!el||document.body.dataset.section!=='comparison')return;
    const files=records();sync(files);const selected=active(files),chs=channelList(files);
    el.innerHTML=files.length?'<div class="compare-layout">'+controls(files,selected,chs)
        +'<div class="compare-results"><div class="compare-panel"><div class="compare-panel-title"><div><h3>Chart comparison</h3></div><button type="button" class="compare-download" data-cmp-action="download-chart">↓ Download PNG</button></div><div id="cmp-chart" class="compare-plot"></div></div>'
        +'<div class="compare-panel"><div class="compare-panel-title"><div><h3>Baking-window comparison</h3></div><button type="button" class="compare-download" data-cmp-action="download-window">↓ Window PNG</button></div><div id="cmp-window" class="compare-plot"></div><div id="cmp-window-matrix"></div></div>'
        +'</div></div>'
        :(window.BAMCOEnhance?.emptyState?.()||'<div class="compare-empty-wrap"><h3>No recordings uploaded yet</h3><button type="button" data-section="upload" class="primary-action">Go to uploads →</button></div>');
    if(!files.length)return;
    const req=++state.renderVersion;
    requestAnimationFrame(()=>{
      if(req!==state.renderVersion||document.body.dataset.section!=='comparison')return;
      plotChart(selected,state.channels);windowPlot(selected,state.channels);
    });
  }
  window.BAMCOCompare={render,mount};
})();

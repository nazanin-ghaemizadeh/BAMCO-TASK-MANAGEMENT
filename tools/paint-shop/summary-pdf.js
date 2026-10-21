/* Single-page A4 landscape export of baking-analysis cards. No remote dependencies. */
'use strict';
(function(){
  const PAGE_W=841.8898,PAGE_H=595.2756,SCALE=4,CONTENT_TOP=86;
  function details(options={}){
    const ovenName=String(options.ovenName||'Oven');
    const recordingDate=options.recordingDate||null;
    return {ovenName,recordingDate,manufacturer:String(options.manufacturer||''),
      threshold:options.threshold,rules:Array.isArray(options.rules)?options.rules.map(rule=>rule.slice(0,3)):[]};
  }
  const pdfString=value=>'<FEFF'+Array.from({length:String(value).length},(_,i)=>String(value).charCodeAt(i).toString(16).padStart(4,'0')).join('')+'>';
  const finite=Number.isFinite;
  const fmt=(v,n=1)=>finite(v)?v.toFixed(n):'N/A';
  const time=v=>{
    if(!finite(v))return 'N/A';
    const seconds=Math.round(Math.abs(v)*60);
    return (v<0&&seconds?'-':'')+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  };
  const timeMargin=v=>finite(v)?(v>0?'+':'')+time(v):'N/A';
  const tempMargin=v=>finite(v)?(v>0?'+':'')+fmt(v)+' °C':'N/A';
  function layout(count,bottom=24){
    const availableW=PAGE_W-48,availableH=PAGE_H-CONTENT_TOP-bottom,gap=12;
    let best=null;
    for(let columns=1;columns<=count;columns++){
      const rows=Math.ceil(count/columns);
      const scale=Math.min(1.1,(availableW-(columns-1)*gap)/(columns*240),(availableH-(rows-1)*gap)/(rows*280));
      if(!best||scale>best.scale)best={columns,rows,scale,gap};
    }
    return best;
  }
  function draw(ctx,results,info){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE_W,PAGE_H);
    const font=(size,bold=false)=>{ctx.font=(bold?'bold ':'')+size+'px "Times New Roman", Times, serif';};
    const text=(s,x,y,size=10,color='#25443b',bold=false,align='left')=>{
      font(size,bold);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(s),x,y);ctx.textAlign='left';
    };
    const box=(x,y,w,h,r,fill,stroke)=>{
      ctx.beginPath();ctx.roundRect(x,y,w,h,r);
      if(fill){ctx.fillStyle=fill;ctx.fill();}
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke();}
    };
    const wrap=(value,maxWidth,size)=>{
      font(size);const out=[];let line='';
      for(const word of String(value).split(/\s+/)){
        const candidate=line?line+' '+word:word;
        if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue;}
        if(line){out.push(line);line='';}
        // Long unbroken labels must also fit inside a card.
        for(const char of word){
          if(line&&ctx.measureText(line+char).width>maxWidth){out.push(line);line='';}
          line+=char;
        }
      }
      if(line)out.push(line);return out;
    };
    const wrapped=(value,x,y,w,h,size,color)=>{
      let lines=wrap(value,w,size);
      while(lines.length*size*1.2>h){size*=.94;lines=wrap(value,w,size);}
      lines.forEach((line,i)=>text(line,x,y+i*size*1.2,size,color));
    };
    text('Summary',24,43,27,'#25443b',true);
    text(info.ovenName,24,64,12,'#536d60',true);
    if(info.manufacturer)text(info.manufacturer,PAGE_W-24,64,10,'#536d60',false,'right');
    text('Date: '+(info.recordingDate||'Not available'),PAGE_W-24,43,11,'#536d60',false,'right');
    const bottom=info.rules.length?78:24;
    const grid=layout(results.length,bottom),cw=240*grid.scale,ch=280*grid.scale;
    const gridHeight=grid.rows*ch+(grid.rows-1)*grid.gap;
    const startY=CONTENT_TOP+(PAGE_H-CONTENT_TOP-bottom-gridHeight)/2;
    results.forEach((v,i)=>{
      const row=Math.floor(i/grid.columns),col=i%grid.columns;
      const rowCount=Math.min(grid.columns,results.length-row*grid.columns);
      const left=(PAGE_W-(rowCount*cw+(rowCount-1)*grid.gap))/2;
      ctx.save();ctx.translate(left+col*(cw+grid.gap),startY+row*(ch+grid.gap));ctx.scale(grid.scale,grid.scale);
      const good=v.status==='PASS',invalid=v.status==='NO DATA';
      const accent=good?'#257557':invalid?'#946d2e':'#c43945';
      const pale=good?'#edf8f1':invalid?'#fff7e8':'#fff0f2';
      box(0,0,240,280,12,'#fff',good?'#bbdfca':invalid?'#ebd5aa':'#efbdc3');
      ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(13,1);ctx.lineTo(227,1);ctx.stroke();
      text(v.ch,14,27,18,'#25443b',true);
      font(9,true);const badgeWidth=ctx.measureText(v.status).width+16;
      box(226-badgeWidth,13,badgeWidth,21,6,pale);
      text(v.status,226-badgeWidth/2,27,9,accent,true,'center');
      wrapped(v.label||v.ch,14,46,212,23,10,'#708078');
      box(14,70,102,49,7,'#f1f7f4');box(122,70,104,49,7,'#f1f7f4');
      text('Time ≥'+(v.threshold??165)+'°C',23,85,9,'#6b8075');
      text(time(v.D),23,106,17,'#25443b',true);
      text('mm:ss',105,106,7,'#6b8075',false,'right');
      text('Peak temperature',131,85,9,'#6b8075');
      text(fmt(v.T)+' °C',131,106,17,'#25443b',true);
      const margins=[
        ['Min time margin',timeMargin(v.mdMin),v.mdMin],
        ['Max time margin',timeMargin(v.mdMax),v.mdMax],
        ['Min temp margin',tempMargin(v.mtMin),v.mtMin],
        ['Max temp margin',tempMargin(v.mtMax),v.mtMax]
      ];
      margins.forEach(([label,value,number],j)=>{
        const y=140+j*22;
        text(label,14,y,10,'#536d60');text(value,226,y,10,finite(number)&&number<0?'#c43945':'#25443b',true,'right');
        ctx.strokeStyle='#e5ede7';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(14,y+8);ctx.lineTo(226,y+8);ctx.stroke();
      });
      box(14,223,212,43,7,pale);
      wrapped(v.violations?.length?v.violations.join('; '):v.status==='NO DATA'?'No numeric samples to evaluate':'All baking window rules satisfied',23,237,194,28,9,accent);
      ctx.restore();
    });
    if(info.rules.length){
      const y=PAGE_H-62,columnWidth=(PAGE_W-48)/3;
      ctx.strokeStyle='#dce7e1';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(24,y);ctx.lineTo(PAGE_W-24,y);ctx.stroke();
      text('Rules (failure conditions)',24,y+12,8.5,'#536d60',true);
      const threshold=finite(info.threshold)?info.threshold:results.find(v=>finite(v.threshold))?.threshold;
      text('D = time'+(finite(threshold)?' ≥'+threshold+'°C':' above threshold')+' (min); T = peak temperature (°C)',PAGE_W-24,y+12,8,'#708078',false,'right');
      info.rules.forEach(([id,description,formula],i)=>{
        wrapped(id+' - '+description+': '+formula,24+(i%3)*columnWidth,y+26+Math.floor(i/3)*18,columnWidth-12,17,8,'#536d60');
      });
    }
  }
  // One image per landscape A4 page; every oven retains its own summary page.
  function pdfBytes(pages,title){
    const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
    const append=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
    const object=(id,body)=>{offsets[id]=length;append(id+' 0 obj\n'+body+'\nendobj\n');};
    append('%PDF-1.4\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Kids ['+pages.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] /Count '+pages.length+' >>');
    pages.forEach(({jpeg,width,height},i)=>{
      const pageId=3+i*3,imageId=pageId+1,contentId=pageId+2;
      object(pageId,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PAGE_W+' '+PAGE_H+'] /Resources << /XObject << /PageImage '+imageId+' 0 R >> >> /Contents '+contentId+' 0 R >>');
      offsets[imageId]=length;
      append(imageId+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n');
      append(jpeg);append('\nendstream\nendobj\n');
      const commands='q\n'+PAGE_W+' 0 0 '+PAGE_H+' 0 0 cm\n/PageImage Do\nQ\n';
      object(contentId,'<< /Length '+encoder.encode(commands).length+' >>\nstream\n'+commands+'endstream');
    });
    const infoId=3+pages.length*3,size=infoId+1;
    object(infoId,'<< /Title '+pdfString(title)+' /Subject (Baking analysis cards) /Creator (BAMCO Paint Shop) >>');
    const xref=length;append('xref\n0 '+size+'\n0000000000 65535 f \n');
    for(let i=1;i<size;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    append('trailer\n<< /Size '+size+' /Root 1 0 R /Info '+infoId+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    const output=new Uint8Array(length);let position=0;
    parts.forEach(bytes=>{output.set(bytes,position);position+=bytes.length;});return output;
  }
  async function pageImage(results,options={}){
    if(!Array.isArray(results)||!results.length)throw Error('No channel cards are available to export.');
    const info=details(options);
    if(document.fonts?.ready)await document.fonts.ready;
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(PAGE_W*SCALE);canvas.height=Math.ceil(PAGE_H*SCALE);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('The PDF canvas is unavailable.');
    ctx.scale(canvas.width/PAGE_W,canvas.height/PAGE_H);draw(ctx,results,info);
    const data=atob(canvas.toDataURL('image/jpeg',.96).split(',')[1]);
    const jpeg=Uint8Array.from(data,char=>char.charCodeAt(0));
    return {jpeg,width:canvas.width,height:canvas.height,info};
  }
  async function build(results,options={}){
    const page=await pageImage(results,options),info=page.info;
    return pdfBytes([page],'Summary - '+info.ovenName+' - '+(info.recordingDate||'Undated'));
  }
  async function buildReport(entries,recordingDate){
    if(!Array.isArray(entries)||!entries.length||entries.length>4)throw Error('Upload between one and four oven recordings.');
    if(!recordingDate)throw Error('Enter the report date.');
    const pages=[];
    for(const entry of entries)pages.push(await pageImage(entry.results,{...entry.options,recordingDate}));
    return pdfBytes(pages,'Daily Summary - '+recordingDate);
  }
  function save(bytes,filename){
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);
    a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function download(results,options={}){
    const info=details(options),bytes=await build(results,info);
    const ovenFile=info.ovenName.replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').trim().replace(/\s+/g,'_');
    save(bytes,'Summary_'+ovenFile+'_'+(info.recordingDate||'Undated')+'.pdf');
  }
  async function downloadReport(entries,recordingDate){
    save(await buildReport(entries,recordingDate),'Daily_Summary_'+recordingDate+'.pdf');
  }
  window.BAMCOSummaryPDF={build,download,buildReport,downloadReport};
})();

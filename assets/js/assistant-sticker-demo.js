/* Independent sticker demo. No assistant session, microphone or API credentials. */
(()=>{'use strict';
const image=document.getElementById('stickerSource'),canvas=document.getElementById('stickerCanvas'),stage=document.getElementById('stickerStage'),audio=document.getElementById('demoAudio'),status=document.getElementById('demoState'),still=document.getElementById('stillMode'),play=document.getElementById('playDemo');
const VERTEX=`attribute vec2 position;varying vec2 uv;uniform float time,motion,speech;
void main(){vec2 p=position;uv=p/vec2(768.,1024.);
float h=(1.-smoothstep(386.,493.,p.y))*smoothstep(145.,230.,p.x)*(1.-smoothstep(560.,650.,p.x));
float a=motion*(.009*sin(time*.83)+.004*sin(time*1.57+.8)+speech*.009*sin(time*2.7));
vec2 d=p-vec2(390.,478.);p+=h*vec2(-a*d.y,a*d.x);
float upper=(1.-smoothstep(620.,900.,p.y));p.x+=motion*upper*(1.3*sin(time*.7)+.45*sin(time*1.19));
p.y+=motion*upper*(1.6*sin(time*1.65)+speech*.9*sin(time*3.1));
float arm=(1.-smoothstep(240.,310.,p.x))*smoothstep(410.,485.,p.y)*(1.-smoothstep(570.,630.,p.y));
p.x+=motion*arm*(.8*sin(time*1.3)+speech*.8*sin(time*2.2));p.y+=motion*arm*(1.1*sin(time*1.6+.8));
gl_Position=vec4(p.x/384.-1.,1.-p.y/512.,0.,1.);}`;
const FRAGMENT=`precision mediump float;varying vec2 uv;uniform sampler2D art;uniform float mouth,roundness,wide,blink,motion;
float remap(float distance,float radius,float scale,float outer){float inner=radius*scale;return distance<inner?distance/max(scale,.045):radius+(distance-inner)*(outer-radius)/(outer-inner);}
vec2 squeeze(vec2 p,vec2 c,vec2 r,float scaleY,float scaleX){vec2 d=p-c;float outerY=r.y*2.3;float outerX=r.x*2.;float xfade=1.-smoothstep(r.x*.8,outerX,abs(d.x));float yfade=1.-smoothstep(r.y*.7,outerY,abs(d.y));float sy=mix(1.,scaleY,xfade);float sx=mix(1.,scaleX,yfade);if(abs(d.y)<outerY&&abs(d.x)<outerX){d.y=sign(d.y)*remap(abs(d.y),r.y,sy,outerY);d.x=sign(d.x)*remap(abs(d.x),r.x,sx,outerX);}return c+d;}
void main(){vec2 p=uv*vec2(768.,1024.);p=squeeze(p,vec2(392.,411.),vec2(40.,25.),mouth,1.-roundness*.24+wide*.08);p=squeeze(p,vec2(330.,340.),vec2(38.,39.),1.-blink*.92,1.);p=squeeze(p,vec2(448.,328.),vec2(37.,40.),1.-blink*.92,1.);gl_FragColor=texture2D(art,p/vec2(768.,1024.));}`;
function mouthFor(phone){
 if(['pau','sil','m','b','p'].includes(phone))return [.06,0,0];
 if(['uw','uh','ow','oy','w'].includes(phone))return [.72,1,0];
 if(['iy','ih','ey','eh','y'].includes(phone))return [.43,0,1];
 if(['aa','ae','ah','ao','aw','ay'].includes(phone))return [.92,phone==='ao'?.4:0,0];
 if(['f','v'].includes(phone))return [.23,0,.25];
 if(['s','z','sh','zh','ch','jh'].includes(phone))return [.32,.25,.1];
 return [.38,0,.1];
}
function shapeAt(cues,t){let i=cues.findIndex(c=>t>=c.start&&t<c.end);if(i<0)return [.08,0,0];const c=cues[i],target=mouthFor(c.phone),next=cues[i+1];if(next){const blend=Math.max(0,(t-(c.end-.035))/.035)*.35;const n=mouthFor(next.phone);return target.map((v,j)=>v*(1-blend)+n[j]*blend)}return target}
window.BamcoStickerDemoMath=Object.freeze({mouthFor,shapeAt});
function cpuRenderer(){
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas');
 canvas.width=480;canvas.height=640;const scale=canvas.width/768;
 const xs=[0,128,192,240,270,295,315,330,345,355,365,375,385,395,405,415,425,435,450,465,485,510,550,600,680,768];
 const ys=[0,100,180,240,270,290,305,320,335,350,365,380,390,398,406,414,422,430,438,450,465,490,530,600,700,820,920,1024];
 const points=ys.flatMap(y=>xs.map(x=>({x,y}))),triangles=[];
 for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const i=y*xs.length+x;triangles.push([i,i+1,i+xs.length],[i+1,i+xs.length+1,i+xs.length])}
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
 function reshape(p,cx,cy,rx,ry,sy,sx){
  let dx=p.x-cx,dy=p.y-cy;const ox=rx*2,oy=ry*2.3;
  if(Math.abs(dx)>=ox||Math.abs(dy)>=oy)return p;
  const yy=1+(sy-1)*(1-smooth(rx*.8,ox,Math.abs(dx))),xx=1+(sx-1)*(1-smooth(ry*.7,oy,Math.abs(dy)));
  const forward=(d,r,k,o)=>Math.abs(d)<r?d*k:Math.sign(d)*(r*k+(Math.abs(d)-r)*(o-r*k)/(o-r));
  return{x:cx+forward(dx,rx,xx,ox),y:cy+forward(dy,ry,yy,oy)};
 }
 function position(point,v){let p=reshape({...point},392,411,40,25,v.mouth,1-v.roundness*.24+v.wide*.08);
  p=reshape(p,330,340,38,39,1-v.blink*.92,1);p=reshape(p,448,328,37,40,1-v.blink*.92,1);
  const h=(1-smooth(386,493,p.y))*smooth(145,230,p.x)*(1-smooth(560,650,p.x)),a=v.motion*(.009*Math.sin(v.time*.83)+.004*Math.sin(v.time*1.57+.8)+v.speech*.009*Math.sin(v.time*2.7)),dx=p.x-390,dy=p.y-478;
  p.x-=h*a*dy;p.y+=h*a*dx;const upper=1-smooth(620,900,p.y);p.x+=v.motion*upper*(1.3*Math.sin(v.time*.7)+.45*Math.sin(v.time*1.19));p.y+=v.motion*upper*(1.6*Math.sin(v.time*1.65)+v.speech*.9*Math.sin(v.time*3.1));return{x:p.x*scale,y:p.y*scale};
 }
 function triangle(src,dst){
  const [p,q,r]=src,[a,b,c]=dst,den=p.x*(q.y-r.y)+q.x*(r.y-p.y)+r.x*(p.y-q.y);if(Math.abs(den)<1e-6)return;
  const coeff=key=>[(a[key]*(q.y-r.y)+b[key]*(r.y-p.y)+c[key]*(p.y-q.y))/den,(a[key]*(r.x-q.x)+b[key]*(p.x-r.x)+c[key]*(q.x-p.x))/den,(a[key]*(q.x*r.y-r.x*q.y)+b[key]*(r.x*p.y-p.x*r.y)+c[key]*(p.x*q.y-q.x*p.y))/den];
  const X=coeff('x'),Y=coeff('y'),center={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3};
  ctx.save();ctx.beginPath();dst.forEach((d,i)=>{const dx=d.x-center.x,dy=d.y-center.y,l=Math.hypot(dx,dy)||1;ctx[i?'lineTo':'moveTo'](d.x+dx/l*.28,d.y+dy/l*.28)});ctx.closePath();ctx.clip();ctx.setTransform(X[0],Y[0],X[1],Y[1],X[2],Y[2]);ctx.drawImage(image,0,0);ctx.restore();
 }
 let lastDraw=0;
 return values=>{if(values.time-lastDraw<1/30)return;lastDraw=values.time;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);const output=points.map(p=>position(p,values));for(const ids of triangles)triangle(ids.map(i=>points[i]),ids.map(i=>output[i]))};
}
async function init(){
 await image.decode();const data=await fetch('assets/audio/assistant-sticker-demo-cues.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('cue load');return r.json()});
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
 let paint,release;
 if(gl){

 function shader(kind,source){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const vertices=[],nx=48,ny=64;for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const x0=x*768/nx,x1=(x+1)*768/nx,y0=y*1024/ny,y1=(y+1)*1024/ny;vertices.push(x0,y0,x1,y0,x0,y1,x1,y0,x1,y1,x0,y1)}
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(program,'art'),0);
 const uniforms=Object.fromEntries(['time','motion','speech','mouth','roundness','wide','blink'].map(k=>[k,gl.getUniformLocation(program,k)]));

 paint=values=>{gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);for(const [k,v]of Object.entries(values))gl.uniform1f(uniforms[k],v);gl.drawArrays(gl.TRIANGLES,0,vertices.length/2);};release=()=>{gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program)};
 }else{paint=cpuRenderer();release=()=>{}}
 let raf=0,last=performance.now(),m=.08,r=0,w=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;const running=!audio.paused&&!audio.ended;let target=running?shapeAt(data.cues,audio.currentTime):[.08,0,0];if(still.checked)target=[1,0,0];const s=still.checked?1:1-Math.exp(-dt*28);m+=(target[0]-m)*s;r+=(target[1]-r)*s;w+=(target[2]-w)*s;const t=now/1000,phase=t%4.65;const blink=still.checked||reduced?0:phase>.08&&phase<.24?Math.sin((phase-.08)/.16*Math.PI):0;
 paint({time:t,motion:still.checked||reduced?0:1,speech:running?1:0,mouth:m,roundness:r,wide:w,blink});raf=requestAnimationFrame(frame)}
 stage.classList.add('ready');status.textContent='آمادهٔ پخش نمونه';raf=requestAnimationFrame(frame);
 play.onclick=async()=>{if(!audio.paused){audio.pause();return}if(audio.ended)audio.currentTime=0;try{await audio.play()}catch{status.textContent='برای پخش، کنترل صدا را انتخاب کنید.'}};
 document.getElementById('stopDemo').onclick=()=>{audio.pause();audio.currentTime=0;status.textContent='پخش متوقف شد'};
 audio.onplay=()=>{play.textContent='مکث';status.textContent='در حال پخش صدای نمونه و حرکت دهان'};audio.onpause=()=>{play.textContent='پخش دمو با صدا';status.textContent=audio.ended?'پخش نمونه تمام شد':'پخش متوقف است'};audio.onended=()=>{play.textContent='پخش دوبارهٔ دمو';status.textContent='پخش نمونه تمام شد'};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);audio.pause()}else{last=performance.now();raf=requestAnimationFrame(frame)}});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);audio.pause();release()},{once:true});
}
init().catch(error=>{canvas.hidden=true;status.textContent='نمایش حرکت در این مرورگر آماده نشد؛ استیکر اصلی نمایش داده می‌شود.';play.disabled=true;console.warn('Sticker demo:',error.message)});
})();

/* Animated 2D puppet for the assistant. The existing character artwork stays intact;
   a small GPU mesh moves the head and arms, while facial layers follow the output audio. */
(()=>{
'use strict';
const W=1122,H=1402;
const VERTEX=`
attribute vec2 aPosition;
uniform float uTime,uSpeech,uListening,uThinking,uGreeting,uEmphasis,uAudio;
uniform float uBeat,uExplain,uCount,uNod,uQuestion;
varying vec2 vUv;
float bell(float x,float center,float radius){float t=(x-center)/radius;return exp(-t*t*2.0);}
void main(){
 vec2 p=aPosition;
 vUv=p/vec2(${W}.0,${H}.0);
 float breath=sin(uTime*1.75)*1.65;
 float sway=sin(uTime*.74)+.34*sin(uTime*1.21+.8);
 float headWeight=(1.0-smoothstep(525.0,675.0,p.y))*smoothstep(150.0,310.0,p.x)*(1.0-smoothstep(835.0,990.0,p.x));
 vec2 neck=vec2(565.0,580.0);
 float headAngle=.013*sin(uTime*.86+.4)+.006*sin(uTime*1.41)+uAudio*.006+.016*uListening-.014*uThinking+.023*uQuestion-.013*uNod;
 vec2 fromNeck=p-neck;
 vec2 turned=vec2(fromNeck.x-headAngle*fromNeck.y,fromNeck.y+headAngle*fromNeck.x);
 p+=headWeight*(turned-fromNeck+vec2(3.1*sway+uListening*3.0,breath+7.0*uNod-4.0*uBeat*uSpeech));
 float hair=(1.0-smoothstep(470.0,610.0,aPosition.y))*smoothstep(160.0,280.0,aPosition.x)*(1.0-smoothstep(845.0,975.0,aPosition.x));
 p.x+=hair*(1.2*sin(uTime*1.31+.5+aPosition.y*.008)+.8*sin(uTime*.69+aPosition.x*.012));
 float leftWeight=(1.0-smoothstep(420.0,535.0,p.x))*smoothstep(565.0,660.0,p.y)*(1.0-smoothstep(775.0,900.0,p.y));
 vec2 leftArm=p-vec2(452.0,633.0);
 float leftAngle=.024*sin(uTime*1.17+.2)+.009*sin(uTime*2.31)+.13*uGreeting+.16*uExplain+.10*uEmphasis+.075*uBeat*uSpeech-.034*uListening;
 p+=leftWeight*vec2(-leftAngle*leftArm.y,leftAngle*leftArm.x);
 float leftHand=leftWeight*(1.0-smoothstep(310.0,410.0,aPosition.x))*smoothstep(635.0,710.0,aPosition.y);
 p+=leftHand*vec2(1.9*sin(uTime*2.1+1.0),2.2*sin(uTime*1.7+.4)+3.0*uGreeting);
 float rightWeight=smoothstep(615.0,720.0,p.x)*smoothstep(605.0,705.0,p.y)*(1.0-smoothstep(790.0,925.0,p.y));
 vec2 rightArm=p-vec2(730.0,634.0);
 float rightAngle=.019*sin(uTime*.93+1.7)+.012*sin(uTime*1.89)+.15*uCount+.11*uEmphasis+.065*uBeat*uSpeech+.055*uThinking;
 p+=rightWeight*vec2(-rightAngle*rightArm.y,rightAngle*rightArm.x);
 float rightHand=rightWeight*smoothstep(675.0,730.0,aPosition.x)*smoothstep(720.0,780.0,aPosition.y);
 p+=rightHand*vec2(2.0*sin(uTime*1.9+.5),-2.5*sin(uTime*2.0)+3.0*uCount);
 float torso=bell(p.x,560.0,360.0)*smoothstep(555.0,710.0,p.y)*(1.0-smoothstep(970.0,1120.0,p.y));
 p.x+=torso*(1.6*sway+.9*uBeat*uSpeech);
 p.y+=torso*(breath*.72-3.0*uBeat*uSpeech);
 float scarf=bell(aPosition.x,565.0,85.0)*smoothstep(575.0,635.0,aPosition.y)*(1.0-smoothstep(710.0,765.0,aPosition.y));
 p.x+=scarf*(2.4*sin(uTime*1.4+.9)+1.4*uBeat*uSpeech);
 gl_Position=vec4(2.0*p.x/${W}.0-1.0,1.0-2.0*p.y/${H}.0,0.0,1.0);
}`;
const FRAGMENT=`
precision mediump float;
varying vec2 vUv;
uniform sampler2D uBody,uRest,uBlink,uBrows;
uniform float uMouth,uRound,uWide,uBlinkAmount,uBrowAmount,uGaze;
float ellipse(vec2 point,vec2 center,vec2 radius){
 vec2 d=(point-center)/radius;
 return 1.0-smoothstep(.73,1.05,length(d));
}
void main(){
 vec4 color=texture2D(uBody,vUv);
 vec2 center=vec2(.502,.352);
 float mouth=ellipse(vUv,center,vec2(.073,.044));
 vec4 closed=texture2D(uRest,vUv);
 float width=1.0-.23*uRound+.12*uWide;
 float height=mix(.54,1.15,clamp(uMouth,0.0,1.0))*(1.0-.18*uWide+.07*uRound);
 vec2 shape=vec2(width,height);
 vec2 mouthUv=center+(vUv-center)/shape;
 vec4 open=texture2D(uBody,mouthUv);
 color=mix(color,closed,mouth);
 float openMouth=ellipse(vUv,center,vec2(.070*width,.038*height));
 color=mix(color,open,openMouth*smoothstep(.025,.33,uMouth));
 float eyes=max(ellipse(vUv,vec2(.419,.276),vec2(.072,.052)),ellipse(vUv,vec2(.584,.268),vec2(.072,.052)));
 vec2 eyeUv=vUv-vec2(uGaze/${W}.0,0.0);
 color=mix(color,texture2D(uBody,eyeUv),eyes*min(1.0,abs(uGaze)*.13));
 color=mix(color,texture2D(uBlink,vUv),eyes*clamp(uBlinkAmount,0.0,1.0));
 float brows=max(ellipse(vUv,vec2(.416,.215),vec2(.060,.026)),ellipse(vUv,vec2(.576,.205),vec2(.060,.026)));
 color=mix(color,texture2D(uBrows,vUv),brows*clamp(uBrowAmount,0.0,1.0));
 gl_FragColor=color;
}`;
function shader(gl,type,source){
 const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
 if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){const reason=gl.getShaderInfoLog(item);gl.deleteShader(item);throw Error(reason)}
 return item;
}
function setup(gl){
 const program=gl.createProgram(),vertex=shader(gl,gl.VERTEX_SHADER,VERTEX),fragment=shader(gl,gl.FRAGMENT_SHADER,FRAGMENT);
 gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
 gl.deleteShader(vertex);gl.deleteShader(fragment);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);
 const locations={};
 for(const name of ['uTime','uSpeech','uListening','uThinking','uGreeting','uEmphasis','uAudio','uBeat','uExplain','uCount','uNod','uQuestion','uMouth','uRound','uWide','uBlinkAmount','uBrowAmount','uGaze'])locations[name]=gl.getUniformLocation(program,name);
 for(const [index,name] of ['uBody','uRest','uBlink','uBrows'].entries())gl.uniform1i(gl.getUniformLocation(program,name),index);
 const columns=42,rows=54,points=[],indices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)points.push(x*W/columns,y*H/rows);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;indices.push(a,c,b,b,c,d)}
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
 const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const elements=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
 return{locations,count:indices.length};
}
function texture(gl,image,index){
 gl.activeTexture(gl.TEXTURE0+index);const item=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,item);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 // Mesh UVs use the artwork's top-left origin; flipping the upload inverts the character.
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
 return item;
}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const bell2=(x,c,r)=>Math.exp(-2*((x-c)/r)**2);
function patch(image,width,height,cx,cy,rx,ry){
 const layer=document.createElement('canvas');layer.width=width;layer.height=height;
 const context=layer.getContext('2d');context.drawImage(image,0,0,width,height);
 context.globalCompositeOperation='destination-in';context.save();context.translate(cx*width/W,cy*height/H);context.scale(rx*width/W,ry*height/H);
 const fade=context.createRadialGradient(0,0,.70,0,0,1.08);fade.addColorStop(0,'#000');fade.addColorStop(.70,'#000');fade.addColorStop(1.08,'transparent');
 context.fillStyle=fade;context.fillRect(-2,-2,4,4);context.restore();return layer;
}
function warp(x,y,time,u){
 let px=x,py=y;
 const breath=Math.sin(time*1.75)*1.65,sway=Math.sin(time*.74)+.34*Math.sin(time*1.21+.8);
 const head=(1-smooth(525,675,y))*smooth(150,310,x)*(1-smooth(835,990,x));
 const angle=.013*Math.sin(time*.86+.4)+.006*Math.sin(time*1.41)+u.uAudio*.006+.016*u.uListening-.014*u.uThinking+.023*u.uQuestion-.013*u.uNod;
 px+=head*(-angle*(y-580)+3.1*sway+u.uListening*3);
 py+=head*(angle*(x-565)+breath+7*u.uNod-4*u.uBeat*u.uSpeech);
 const hair=(1-smooth(470,610,y))*smooth(160,280,x)*(1-smooth(845,975,x));
 px+=hair*(1.2*Math.sin(time*1.31+.5+y*.008)+.8*Math.sin(time*.69+x*.012));
 const left=(1-smooth(420,535,px))*smooth(565,660,py)*(1-smooth(775,900,py));
 const leftAngle=.024*Math.sin(time*1.17+.2)+.009*Math.sin(time*2.31)+.13*u.uGreeting+.16*u.uExplain+.10*u.uEmphasis+.075*u.uBeat*u.uSpeech-.034*u.uListening;
 px+=left*(-leftAngle*(py-633));py+=left*leftAngle*(x-452);
 const leftHand=left*(1-smooth(310,410,x))*smooth(635,710,y);
 px+=leftHand*1.9*Math.sin(time*2.1+1);py+=leftHand*(2.2*Math.sin(time*1.7+.4)+3*u.uGreeting);
 const right=smooth(615,720,px)*smooth(605,705,py)*(1-smooth(790,925,py));
 const rightAngle=.019*Math.sin(time*.93+1.7)+.012*Math.sin(time*1.89)+.15*u.uCount+.11*u.uEmphasis+.065*u.uBeat*u.uSpeech+.055*u.uThinking;
 px+=right*(-rightAngle*(py-634));py+=right*rightAngle*(x-730);
 const rightHand=right*smooth(675,730,x)*smooth(720,780,y);
 px+=rightHand*2*Math.sin(time*1.9+.5);py+=rightHand*(-2.5*Math.sin(time*2)+3*u.uCount);
 const torso=bell2(px,560,360)*smooth(555,710,py)*(1-smooth(970,1120,py));
 px+=torso*(1.6*sway+.9*u.uBeat*u.uSpeech);py+=torso*(breath*.72-3*u.uBeat*u.uSpeech);
 const scarf=bell2(x,565,85)*smooth(575,635,y)*(1-smooth(710,765,y));
 px+=scarf*(2.4*Math.sin(time*1.4+.9)+1.4*u.uBeat*u.uSpeech);
 return [px,py];
}
function triangle(context,image,a,b,c,da,db,dc){
 const x0=a[0],y0=a[1],x1=b[0],y1=b[1],x2=c[0],y2=c[1],det=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
 const A=((db[0]-da[0])*(y2-y0)-(dc[0]-da[0])*(y1-y0))/det;
 const C=((dc[0]-da[0])*(x1-x0)-(db[0]-da[0])*(x2-x0))/det;
 const B=((db[1]-da[1])*(y2-y0)-(dc[1]-da[1])*(y1-y0))/det;
 const D=((dc[1]-da[1])*(x1-x0)-(db[1]-da[1])*(x2-x0))/det;
 const center=[(da[0]+db[0]+dc[0])/3,(da[1]+db[1]+dc[1])/3];
 const outer=[da,db,dc].map(point=>[center[0]+(point[0]-center[0])*1.04,center[1]+(point[1]-center[1])*1.04]);
 context.save();context.beginPath();context.moveTo(...outer[0]);context.lineTo(...outer[1]);context.lineTo(...outer[2]);context.closePath();context.clip();
 context.setTransform(A,B,C,D,da[0]-A*x0-C*y0,da[1]-B*x0-D*y0);context.drawImage(image,0,0);context.restore();
}
function create(view){
 const scene=view.querySelector('[data-avatar-scene]');if(!scene)return null;
 let canvas=null,gl=null,rig=null,context2d=null,face=null,faceContext=null,layers=null,frame=0,running=false,ready=false,loading=null,startedAt=0,lastFrame=0,lastPaint=0,nextGaze=0,gaze=0,targetGaze=0,step=1;
 const values={speech:0,listening:0,thinking:0,greeting:0,emphasis:0,explain:0,count:0,nod:0,question:0,audio:0,beat:0,mouth:0,round:0,wide:0,brows:0,blink:0};
 const set=(name,value,rate=.16)=>{values[name]+=(value-values[name])*(1-Math.pow(1-rate,step));return values[name]};
 async function prepare(){
  if(ready||loading)return loading;
  loading=(async()=>{
   const images=['.assistant-avatar-frame.speaking','.assistant-avatar-face.mouth-rest','.assistant-avatar-face.eyes-blink','.assistant-avatar-face.brows-emphasis'].map(selector=>scene.querySelector(selector));
   if(images.some(image=>!image))throw Error('Missing assistant artwork');
   await Promise.all(images.map(image=>image.decode?.()||Promise.resolve()));
   canvas=document.createElement('canvas');canvas.className='assistant-avatar-canvas';canvas.width=672;canvas.height=840;canvas.setAttribute('aria-hidden','true');
   gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
   if(gl){
    rig=setup(gl);images.forEach((image,index)=>texture(gl,image,index));gl.viewport(0,0,canvas.width,canvas.height);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop();view.classList.remove('assistant-avatar-puppet-ready');canvas.remove();canvas=null;gl=null;rig=null;ready=false;loading=null});
   }else{
    canvas.width=448;canvas.height=560;context2d=canvas.getContext('2d',{alpha:true});if(!context2d)throw Error('Canvas unavailable');
    face=document.createElement('canvas');face.width=canvas.width;face.height=canvas.height;faceContext=face.getContext('2d');
    layers={rest:patch(images[1],face.width,face.height,563,493,88,57),open:patch(images[0],face.width,face.height,563,493,82,54),blink:[patch(images[2],face.width,face.height,470,388,80,68),patch(images[2],face.width,face.height,655,375,80,68)],brows:[patch(images[3],face.width,face.height,470,300,72,40),patch(images[3],face.width,face.height,650,286,72,40)]};
   }
   scene.prepend(canvas);ready=true;
  })().catch(error=>{canvas?.remove();canvas=null;gl=null;rig=null;context2d=null;loading=null;console.warn('Assistant animation fallback:',error)});
  return loading;
 }
 function draw2d(now,u){
  if(lastPaint&&now-lastPaint<32)return;lastPaint=now;
  const width=face.width,height=face.height,scale=width/W;
  faceContext.setTransform(1,0,0,1,0,0);faceContext.clearRect(0,0,width,height);
  const image=scene.querySelector('.assistant-avatar-frame.speaking');faceContext.drawImage(image,0,0,width,height);
  faceContext.drawImage(layers.rest,0,0);
  if(u.uMouth>.01){
   faceContext.save();faceContext.globalAlpha=smooth(.025,.33,u.uMouth);
   faceContext.translate(563*scale,493*scale);
   faceContext.scale(1-.23*u.uRound+.12*u.uWide,(.54+.61*u.uMouth)*(1-.18*u.uWide+.07*u.uRound));
   faceContext.translate(-563*scale,-493*scale);faceContext.drawImage(layers.open,0,0);faceContext.restore();
  }
  faceContext.save();faceContext.globalAlpha=u.uBlinkAmount;for(const layer of layers.blink)faceContext.drawImage(layer,0,0);faceContext.restore();
  faceContext.save();faceContext.globalAlpha=u.uBrowAmount;for(const layer of layers.brows)faceContext.drawImage(layer,0,0);faceContext.restore();
  context2d.setTransform(1,0,0,1,0,0);context2d.clearRect(0,0,width,height);
  const columns=16,rows=22,source=[],dest=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
   const sx=x*W/columns,sy=y*H/rows;source.push([sx*scale,sy*scale]);dest.push(warp(sx,sy,u.uTime,u).map(value=>value*scale));
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
   const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
   triangle(context2d,face,source[a],source[c],source[b],dest[a],dest[c],dest[b]);
   triangle(context2d,face,source[b],source[c],source[d],dest[b],dest[c],dest[d]);
  }
 }
 function render(now){
  if(!running||!ready)return;
  step=Math.max(.5,Math.min(2.5,(now-lastFrame)/16.67||1));lastFrame=now;
  const time=(now-startedAt)/1000,state=view.dataset.avatarState||'idle',speaking=state==='speaking';
  if(!speaking){values.mouth=0;values.beat=0}
  const audioStyle=parseFloat(view.style.getPropertyValue('--assistant-mouth-open'))||0;
  const sound=speaking?Math.max(0,Math.min(1,audioStyle)):0;
  const beatStyle=parseFloat(view.style.getPropertyValue('--assistant-speech-beat'))||0;
  const viseme=view.dataset.avatarViseme||'rest';
  const activeMouth=!speaking||viseme==='rest'?0:viseme==='mbp'?sound*.06:viseme==='fv'?sound*.26:viseme==='sz'?sound*.38:sound;
  const mouth=set('mouth',activeMouth,activeMouth>values.mouth?.44:.32);
  const audio=set('audio',sound);
  const beat=set('beat',speaking?Math.max(0,Math.min(1,beatStyle)):0,.32);
  const speech=set('speech',speaking?1:0,.16);
  const listening=set('listening',state==='listening'?1:0,.12);
  const thinking=set('thinking',state==='thinking'?1:0,.12);
  const gesture=view.dataset.avatarGesture;
  const greeting=set('greeting',gesture==='greet'?1:0,.18);
  const emphasis=set('emphasis',gesture==='emphasis'?1:0,.18);
  const explain=set('explain',gesture==='explain'?1:0,.18);
  const count=set('count',gesture==='count'?1:0,.18);
  const nod=set('nod',gesture==='acknowledge'?1:0,.22);
  const question=set('question',gesture==='question'?1:0,.18);
  const brows=set('brows',gesture==='emphasis'?1:gesture==='question'?.65:0,.22);
  const blink=set('blink',view.dataset.avatarBlink==='true'?1:0,view.dataset.avatarBlink==='true'?.55:.33);
  const round=set('round',viseme==='o'||viseme==='u'?1:0,.36);
  const wide=set('wide',viseme==='i'||viseme==='e'?1:0,.36);
  if(now>nextGaze){targetGaze=(Math.random()-.5)*6.8;nextGaze=now+2500+Math.random()*2300}
  gaze+=(targetGaze-gaze)*(1-Math.pow(.94,step));
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1;
  const uniforms={uTime:time*motion,uSpeech:speech*motion,uListening:listening*motion,uThinking:thinking*motion,uGreeting:greeting*motion,uEmphasis:emphasis*motion,uExplain:explain*motion,uCount:count*motion,uNod:nod*motion,uQuestion:question*motion,uBeat:beat*motion,uAudio:audio,uMouth:mouth,uRound:round,uWide:wide,uBlinkAmount:blink,uBrowAmount:brows,uGaze:gaze*motion};
  if(gl){
   for(const [name,value] of Object.entries(uniforms))gl.uniform1f(rig.locations[name],value);
   gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,rig.count,gl.UNSIGNED_SHORT,0);
  }else draw2d(now,uniforms);
  view.classList.add('assistant-avatar-puppet-ready');
  frame=requestAnimationFrame(render);
 }
 function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=0}
 async function start(){
  running=true;await prepare();if(!running||!ready||frame)return;
  startedAt=performance.now();lastFrame=startedAt;nextGaze=startedAt+1400;render(startedAt);
 }
 return{start,stop,get ready(){return ready}};
}
window.BamcoAssistantPuppet=Object.freeze({create});
})();

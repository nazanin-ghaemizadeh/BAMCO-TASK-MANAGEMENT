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
function create(view){
 const scene=view.querySelector('[data-avatar-scene]');if(!scene)return null;
 let canvas=null,gl=null,rig=null,frame=0,running=false,ready=false,loading=null,startedAt=0,lastFrame=0,nextGaze=0,gaze=0,targetGaze=0,step=1;
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
   if(!gl)throw Error('WebGL unavailable');
   rig=setup(gl);images.forEach((image,index)=>texture(gl,image,index));gl.viewport(0,0,canvas.width,canvas.height);
   canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop();view.classList.remove('assistant-avatar-puppet-ready');canvas.remove();canvas=null;gl=null;rig=null;ready=false;loading=null});
   scene.prepend(canvas);ready=true;
  })().catch(error=>{canvas?.remove();canvas=null;gl=null;rig=null;loading=null;console.warn('Assistant animation fallback:',error)});
  return loading;
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
  for(const [name,value] of Object.entries(uniforms))gl.uniform1f(rig.locations[name],value);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,rig.count,gl.UNSIGNED_SHORT,0);
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

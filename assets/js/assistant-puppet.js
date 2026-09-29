/* Animated 2D puppet for the assistant. The existing character artwork stays intact;
   a small GPU mesh moves the head and arms, while facial layers follow the output audio. */
(()=>{
'use strict';
const W=1122,H=1402;
const VERTEX=`
attribute vec2 aPosition;
uniform float uTime,uSpeech,uListening,uThinking,uGreeting,uEmphasis,uAudio;
varying vec2 vUv;
float bell(float x,float center,float radius){float t=(x-center)/radius;return exp(-t*t*2.0);}
void main(){
 vec2 p=aPosition;
 vUv=p/vec2(${W}.0,${H}.0);
 float breath=sin(uTime*2.15)*1.9;
 float headWeight=(1.0-smoothstep(520.0,670.0,p.y))*smoothstep(150.0,310.0,p.x)*(1.0-smoothstep(835.0,990.0,p.x));
 vec2 neck=vec2(565.0,580.0);
 float headAngle=.016*sin(uTime*1.05+.4)+.009*sin(uTime*.47)+uAudio*.007+.012*uListening-.014*uThinking;
 vec2 fromNeck=p-neck;
 vec2 turned=vec2(fromNeck.x-headAngle*fromNeck.y,fromNeck.y+headAngle*fromNeck.x);
 p+=headWeight*(turned-fromNeck+vec2(3.3*sin(uTime*.78)+uListening*3.0,breath-1.2*uAudio));
 float leftWeight=(1.0-smoothstep(420.0,535.0,p.x))*smoothstep(565.0,660.0,p.y)*(1.0-smoothstep(775.0,900.0,p.y));
 vec2 leftArm=p-vec2(452.0,633.0);
 float leftAngle=.032*sin(uTime*2.3)+.023*sin(uTime*.71)+.075*uGreeting+.04*uEmphasis+.045*uSpeech-.025*uListening;
 p+=leftWeight*vec2(-leftAngle*leftArm.y,leftAngle*leftArm.x);
 float rightWeight=smoothstep(615.0,720.0,p.x)*smoothstep(605.0,705.0,p.y)*(1.0-smoothstep(790.0,925.0,p.y));
 vec2 rightArm=p-vec2(730.0,634.0);
 float rightAngle=.029*sin(uTime*1.85+1.7)+.03*uSpeech*sin(uTime*3.2)+.06*uEmphasis+.035*uThinking;
 p+=rightWeight*vec2(-rightAngle*rightArm.y,rightAngle*rightArm.x);
 float torso=bell(p.x,560.0,360.0)*smoothstep(555.0,710.0,p.y)*(1.0-smoothstep(970.0,1120.0,p.y));
 p.y+=torso*breath*.65;
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
 float mouth=ellipse(vUv,vec2(.502,.352),vec2(.070,.038));
 vec4 closed=texture2D(uRest,vUv);
 vec2 shape=vec2(max(.76,1.0-.22*uRound+.10*uWide),max(.73,1.0-.19*uWide));
 vec2 mouthUv=vec2(.502,.352)+(vUv-vec2(.502,.352))/shape;
 vec4 open=texture2D(uBody,mouthUv);
 color=mix(color,closed,mouth);
 color=mix(color,open,mouth*clamp(uMouth,0.0,1.0));
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
 for(const name of ['uTime','uSpeech','uListening','uThinking','uGreeting','uEmphasis','uAudio','uMouth','uRound','uWide','uBlinkAmount','uBrowAmount','uGaze'])locations[name]=gl.getUniformLocation(program,name);
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
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
 return item;
}
function create(view){
 const scene=view.querySelector('[data-avatar-scene]');if(!scene)return null;
 let canvas=null,gl=null,rig=null,frame=0,running=false,ready=false,loading=null,startedAt=0,blinkAt=0,blinkUntil=0,nextGaze=0,gaze=0,targetGaze=0;
 const values={speech:0,listening:0,thinking:0,greeting:0,emphasis:0,audio:0,mouth:0,brows:0};
 const set=(name,value)=>{values[name]+=(value-values[name])*.16;return values[name]};
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
   canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stop();view.classList.remove('assistant-avatar-puppet-ready')});
   scene.prepend(canvas);ready=true;view.classList.add('assistant-avatar-puppet-ready');
  })().catch(error=>{canvas?.remove();canvas=null;gl=null;rig=null;loading=null;console.warn('Assistant animation fallback:',error)});
  return loading;
 }
 function render(now){
  if(!running||!ready)return;
  const time=(now-startedAt)/1000,state=view.dataset.avatarState||'idle',speaking=state==='speaking';
  const audioStyle=parseFloat(view.style.getPropertyValue('--assistant-mouth-open'))||0;
  const sound=Math.max(0,Math.min(1,audioStyle));
  const viseme=view.dataset.avatarViseme||'rest';
  const fallback=(.34+.22*Math.sin(time*16)+.13*Math.sin(time*23))*Math.max(0,Math.sin(time*3.5));
  const activeMouth=speaking?Math.max(sound,viseme==='rest'?0:fallback):0;
  const mouth=speaking?set('mouth',activeMouth):(values.mouth=0);
  const audio=set('audio',sound);
  const speech=set('speech',speaking?1:0);
  const listening=set('listening',state==='listening'?1:0);
  const thinking=set('thinking',state==='thinking'?1:0);
  const greeting=set('greeting',view.dataset.avatarGesture==='greet'?1:0);
  const emphasis=set('emphasis',view.dataset.avatarGesture==='emphasis'?1:0);
  const brows=set('brows',view.dataset.avatarGesture==='emphasis'?1:0);
  if(now>blinkAt){blinkAt=now+2400+Math.random()*3300;blinkUntil=now+155}
  const autoBlink=now<blinkUntil?Math.sin(Math.PI*(blinkUntil-now)/155):0;
  if(now>nextGaze){targetGaze=(Math.random()-.5)*5;nextGaze=now+1600+Math.random()*2600}
  gaze+=(targetGaze-gaze)*.045;
  const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1;
  const uniforms={uTime:time*motion,uSpeech:speech*motion,uListening:listening*motion,uThinking:thinking*motion,uGreeting:greeting*motion,uEmphasis:emphasis*motion,uAudio:audio,uMouth:mouth,uRound:viseme==='o'||viseme==='u'?1:0,uWide:viseme==='i'||viseme==='e'?1:0,uBlinkAmount:view.dataset.avatarBlink==='true'||autoBlink>.5?1:0,uBrowAmount:brows,uGaze:gaze*motion};
  for(const [name,value] of Object.entries(uniforms))gl.uniform1f(rig.locations[name],value);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,rig.count,gl.UNSIGNED_SHORT,0);
  frame=requestAnimationFrame(render);
 }
 function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=0}
 async function start(){
  running=true;await prepare();if(!running||!ready||frame)return;
  startedAt=performance.now();blinkAt=startedAt+2100;nextGaze=startedAt+1400;frame=requestAnimationFrame(render);
 }
 return{start,stop,get ready(){return ready}};
}
window.BamcoAssistantPuppet=Object.freeze({create});
})();

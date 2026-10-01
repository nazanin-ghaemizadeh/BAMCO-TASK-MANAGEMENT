/* BAMCO's layered 2D assistant rig. Ten moods and ten independent body actions
   form 100 addressable poses. Joints interpolate continuously between them. */
(()=>{
'use strict';
const W=1122,H=1402,S=.5,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const keys=['lean','shift','lift','head','headX','headY','left','right','brow','gaze'];
const moods={
 neutral:[0,0,0,0,0,0,0,0,0,0],
 warm:[-.015,2,0,.035,0,-2,.05,-.05,.12,0],
 upbeat:[-.025,-4,-8,-.045,0,-5,.12,-.12,.4,0],
 curious:[.025,2,-2,.09,7,-2,.05,.08,.7,5],
 thoughtful:[.035,6,3,-.09,-4,2,-.08,.1,.32,8],
 focused:[-.03,0,-3,.015,0,-5,.07,-.04,.23,0],
 concerned:[.03,-3,2,.11,3,3,-.07,.06,.58,-4],
 reassuring:[-.035,0,0,.05,-2,-2,-.03,-.09,.28,0],
 excited:[-.05,-6,-15,-.07,0,-8,.2,-.15,.78,0],
 proud:[-.04,3,-4,-.055,1,-3,.08,-.11,.35,3]
};
const actions={
 rest:[0,0,0,0,0,0,-.34,.32,0,0],
 listen:[.035,0,0,.08,6,0,-.48,-.08,.2,5],
 ponder:[.025,6,1,-.13,-5,1,-.17,.37,.12,9],
 presentLeft:[-.025,-9,-4,-.04,-2,-2,.23,.48,.15,-3],
 presentRight:[.025,8,-3,.045,4,-2,-.35,-.32,.15,4],
 explain:[-.04,-2,-5,.025,0,-4,.42,-.48,.18,0],
 welcome:[-.04,-5,-10,-.035,0,-5,.98,-.22,.38,0],
 emphasize:[-.065,-8,-12,-.09,-3,-7,.63,-.57,.7,0],
 question:[.045,2,-2,.13,7,-1,.46,.09,.85,7],
 celebrate:[-.07,-10,-19,-.06,0,-10,1.12,-.82,.9,0]
};
const poses=Object.fromEntries(Object.entries(moods).flatMap(([mood,emotion])=>Object.entries(actions).map(([action,gesture])=>{
 const result={};keys.forEach((key,i)=>{result[key]=clamp(emotion[i]+gesture[i],...({lean:[-.14,.14],shift:[-36,36],lift:[-36,25],head:[-.3,.3],headX:[-18,18],headY:[-18,18],left:[-.65,1.32],right:[-.99,.7],brow:[0,1],gaze:[-13,13]}[key]))});
 return[mood+'/'+action,Object.freeze(result)]
})));
const library=Object.freeze({moods:Object.freeze(Object.keys(moods)),actions:Object.freeze(Object.keys(actions)),count:Object.keys(poses).length,list:Object.freeze(Object.keys(poses)),get:key=>poses[key]||null});
window.BamcoAssistantMotions=library;
const art={torso:'assistant-rig-torso-v3.webp',left:'assistant-rig-left-arm-v3.webp',right:'assistant-rig-right-arm-v3.webp',head:'assistant-rig-head-open-v3.webp',rest:'assistant-rig-head-rest-v3.webp',blink:'assistant-rig-head-blink-v3.webp',curious:'assistant-rig-head-curious-v3.webp',concerned:'assistant-rig-head-concerned-v3.webp'};
function patch(image,cx,cy,rx,ry){
 const canvas=document.createElement('canvas');canvas.width=W*S;canvas.height=H*S;
 const c=canvas.getContext('2d');c.drawImage(image,0,0,canvas.width,canvas.height);c.globalCompositeOperation='destination-in';
 c.save();c.translate(cx*S,cy*S);c.scale(rx*S,ry*S);
 const fade=c.createRadialGradient(0,0,.65,0,0,1.08);fade.addColorStop(0,'#000');fade.addColorStop(.65,'#000');fade.addColorStop(1,'transparent');
 c.fillStyle=fade;c.fillRect(-2,-2,4,4);c.restore();return canvas;
}
function create(view){
 const scene=view.querySelector('[data-avatar-scene]');if(!scene)return null;
 let canvas,ctx,headFace,headCtx,images={},mouthPatch,blinkPatches,gazePatches,expressions={},loading=null,ready=false,running=false,frame=0,last=0,started=0,speechStart=0,previousState='',actionIndex=0;
 const channels=Object.fromEntries(keys.map(k=>[k,{value:poses['neutral/rest'][k],velocity:0}]));
 let mouth=0,blink=0,audio=0,bright=0,concern=0,lastAction='rest',gestureAt=0;
 async function prepare(){
  if(ready||loading)return loading;
  loading=(async()=>{
   await Promise.all(Object.entries(art).map(async([name,file])=>{const img=new Image();img.src='assets/images/'+file;await(img.decode?.()||Promise.resolve());images[name]=img}));
   canvas=document.createElement('canvas');canvas.className='assistant-avatar-canvas';canvas.width=W*S;canvas.height=H*S;canvas.setAttribute('aria-hidden','true');
   ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('2D avatar canvas unavailable');
   headFace=document.createElement('canvas');headFace.width=canvas.width;headFace.height=canvas.height;headCtx=headFace.getContext('2d',{alpha:true});
   mouthPatch=patch(images.head,560,885,118,87);
   gazePatches=[patch(images.rest,442,729,86,59),patch(images.rest,707,708,86,59)];
   blinkPatches=[patch(images.blink,442,729,105,85),patch(images.blink,707,708,105,85)];
   expressions={bright:patch(images.curious,560,664,350,245),concern:patch(images.concerned,560,664,350,245)};
   scene.prepend(canvas);ready=true;
  })().catch(error=>{canvas?.remove();canvas=null;loading=null;console.warn('Assistant layered rig fallback:',error)});
  return loading;
 }
 function targetKey(now,state){
  const override=view.dataset.avatarMotion;if(poses[override])return override;
  if(state==='listening')return'curious/listen';
  if(state==='thinking')return'thoughtful/ponder';
  if(state==='warning'||state==='error')return'concerned/question';
  if(state==='success')return'proud/celebrate';
  if(state!=='speaking')return view.dataset.avatarGesture==='greet'?'warm/welcome':'warm/rest';
  const spokenMood=Object.prototype.hasOwnProperty.call(moods,view.dataset.avatarEmotion)?view.dataset.avatarEmotion:'warm';
  const gesture=view.dataset.avatarGesture||'neutral';
  const mapping={greet:'welcome',explain:'explain',count:'presentRight',emphasis:'emphasize',acknowledge:'presentLeft',question:'question'};
  if(mapping[gesture]){lastAction=mapping[gesture];gestureAt=now;return spokenMood+'/'+lastAction}
  if(now-gestureAt<1100)return spokenMood+'/'+lastAction;
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return spokenMood+'/rest';
  const cycle=['explain','presentLeft','rest','presentRight','rest'];
  actionIndex=Math.floor((now-speechStart)/2450)%cycle.length;
  return spokenMood+'/'+cycle[actionIndex];
 }
 function updatePose(target,dt){
  for(const key of keys){const p=channels[key];p.velocity+=(target[key]-p.value)*55*dt;p.velocity*=Math.exp(-10*dt);p.value+=p.velocity*dt}
 }
 function paintFace(open,closedEyes,viseme,gaze){
  headCtx.setTransform(1,0,0,1,0,0);headCtx.globalAlpha=1;headCtx.clearRect(0,0,headFace.width,headFace.height);
  headCtx.drawImage(images.rest,0,0,headFace.width,headFace.height);
  headCtx.save();headCtx.globalAlpha=bright;headCtx.drawImage(expressions.bright,0,0);headCtx.restore();
  headCtx.save();headCtx.globalAlpha=concern;headCtx.drawImage(expressions.concern,0,0);headCtx.restore();
  if(open>.01){headCtx.save();headCtx.globalAlpha=clamp(open*1.4);
   headCtx.translate(560*S,885*S);headCtx.scale(viseme==='o'||viseme==='u'?.82:viseme==='i'?1.14:1,.62+.5*open);
   headCtx.translate(-560*S,-885*S);headCtx.drawImage(mouthPatch,0,0);headCtx.restore()}
  if(Math.abs(gaze)>.05){headCtx.save();headCtx.translate(clamp(gaze,-8,8)*S,0);for(const eye of gazePatches)headCtx.drawImage(eye,0,0);headCtx.restore()}
  if(closedEyes>.01){headCtx.save();headCtx.globalAlpha=closedEyes;for(const eye of blinkPatches)headCtx.drawImage(eye,0,0);headCtx.restore()}
 }
 function render(now){
  if(!running||!ready)return;
  const dt=clamp((now-last)/1000||.016,.008,.04);last=now;
  const state=view.dataset.avatarState||'idle';if(state!==previousState){previousState=state;if(state==='speaking'){speechStart=now;gestureAt=0}}
  const key=targetKey(now,state),target=poses[key];
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced){for(const name of keys){channels[name].value=target[name];channels[name].velocity=0}}else updatePose(target,dt);
  const speaking=state==='speaking',sound=speaking?clamp(parseFloat(view.style.getPropertyValue('--assistant-mouth-open'))||0):0;
  const viseme=view.dataset.avatarViseme||'rest';const phoneme=viseme==='rest'||viseme==='mbp'?0:viseme==='fv'?sound*.23:viseme==='sz'?sound*.38:sound;
  mouth+=(phoneme-mouth)*(1-Math.exp(-dt*(phoneme>mouth?24:18)));if(!speaking)mouth=0;
  blink+=((view.dataset.avatarBlink==='true'?1:0)-blink)*(1-Math.exp(-dt*22));
  audio+=(sound-audio)*(1-Math.exp(-dt*8));
  const p=Object.fromEntries(keys.map(k=>[k,channels[k].value])),t=(now-started)/1000;
  const mood=key.split('/')[0],curiosity=['curious','upbeat','excited','proud'].includes(mood),empathy=['concerned','reassuring','thoughtful'].includes(mood);
  bright+=(clamp((curiosity?.7:.08)+p.brow*.2)-bright)*(1-Math.exp(-dt*8));
  concern+=((empathy?.75:0)-concern)*(1-Math.exp(-dt*8));
  const beat=clamp(parseFloat(view.style.getPropertyValue('--assistant-speech-beat'))||0)*Number(speaking);
  paintFace(mouth,blink,viseme,reduced?0:p.gaze);
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(S,0,0,S,0,0);
  ctx.save();ctx.translate(560+p.shift,1305+p.lift+(reduced?0:3*Math.sin(t*1.7)-14*beat));
  ctx.rotate(p.lean+(reduced?0:.012*Math.sin(t*.8)+.015*beat));
  ctx.scale(1+(reduced?0:.007*Math.sin(t*1.7)+.01*beat),1-(reduced?0:.006*Math.sin(t*1.7)+.015*beat));
  ctx.translate(-560,-1305);
  ctx.drawImage(images.torso,0,60,W,H);
  ctx.save();ctx.translate(405,433);ctx.rotate(p.left+(reduced?0:.025*Math.sin(t*2.2)+.045*beat));ctx.scale(.39,.39);ctx.drawImage(images.left,-795,-540,W,H);ctx.restore();
  ctx.save();ctx.translate(712,433);ctx.rotate(p.right+(reduced?0:.026*Math.sin(t*1.9+1)+.04*beat));ctx.scale(.44,.44);ctx.drawImage(images.right,-410,-445,W,H);ctx.restore();
  ctx.save();ctx.translate(557+p.headX,401+p.headY+(reduced?0:3*Math.sin(t*1.6)));ctx.rotate(p.head+(reduced?0:.018*Math.sin(t*.95)+.025*audio));
  ctx.scale(.5,.5);ctx.drawImage(headFace,-550,-990,W,H);ctx.restore();ctx.restore();
  view.dataset.avatarPose=key;view.classList.add('assistant-avatar-puppet-ready');
  frame=requestAnimationFrame(render);
 }
 function stop(){running=false;if(frame)cancelAnimationFrame(frame);frame=0}
 async function start(){running=true;await prepare();if(!running||!ready||frame)return;started=last=performance.now();render(last)}
 return{start,stop,get ready(){return ready},get pose(){return view.dataset.avatarPose||''}};
}
window.BamcoAssistantPuppet=Object.freeze({create});
})();

/* Articulated body-language prototype. Main application remains static. */
(()=>{'use strict';
const W=1122,H=1402,q=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const definitions={
 neutral:{left:[350,710,1],right:[765,710,-1],head:0,lean:0,stern:0,concern:0},
 explain:{left:[225,550,-1],right:[855,590,1],head:-.025,lean:-.012,stern:0,concern:0},
 assertive:{left:[365,705,1],right:[840,515,1],head:0,lean:-.015,stern:.8,concern:0},
 thinking:{left:[350,715,1],right:[620,418,-1],head:-.115,lean:.018,stern:.12,concern:.15},
 crossed:{left:[640,595,1],right:[490,620,-1],head:.035,lean:.005,stern:.85,concern:0},
 concern:{left:[250,580,-1],right:[745,680,-1],head:.085,lean:-.012,stern:.35,concern:.45},
 agree:{left:[250,530,-1],right:[820,605,1],head:0,lean:0,stern:0,concern:0}
};
function classify(text){const s=String(text||'').replace(/ي/g,'ی').replace(/ك/g,'ک').toLowerCase();if(/موافق نیست|قبول ندار|مخالفت|اعتراض|دست.?به.?سینه|do not agree|disagree|reject/.test(s))return'crossed';if(/فکر|شاید|بررسی کنم|think|consider|perhaps/.test(s))return'thinking';if(/نگران|خطر|هشدار|مراقب|risk|careful|worry/.test(s))return'concern';if(/باید|حتما|حتماً|ضروری|تمرکز|must|important|priority|needs to/.test(s))return'assertive';if(/بله|عالی|درست|موافقم|تبریک|yes|good result|exactly/.test(s))return'agree';return'explain'}
function ik(root,end,a=140,b=190,side=1){let x=end[0]-root[0],y=end[1]-root[1],d=Math.hypot(x,y);d=clamp(d,Math.abs(a-b)+.1,a+b-.1);const base=Math.atan2(y,x),u=base+side*Math.acos(clamp((a*a+d*d-b*b)/(2*a*d),-1,1)),elbow=[root[0]+a*Math.cos(u),root[1]+a*Math.sin(u)],v=Math.atan2(end[1]-elbow[1],end[0]-elbow[0]);return{upper:u,fore:v,elbow}}
function mouthFor(p){if(['pau','sil','m','b','p'].includes(p))return [0,0,0];if(['uw','uh','ow','oy','w'].includes(p))return [.75,1,0];if(['iy','ih','ey','eh'].includes(p))return [.55,0,1];if(['f','v','s','z','sh','ch','jh'].includes(p))return [.3,.2,.2];return [.9,0,0]}
function shapeAt(cues,time){const c=cues.find(x=>time>=x.start&&time<x.end);return c?mouthFor(c.phone):[0,0,0]}
window.BamcoBodyDemoMath=Object.freeze({classify,ik,definitions,shapeAt});
const canvas=q('#bodyCanvas'),status=q('#bodyStatus'),audio=q('#bodyAudio'),stage=q('#bodyStage'),text=q('#bodyText'),buttons=q('#bodySamples'),caption=q('#bodyCaption'),run=q('#runBodyText'),all=q('#playAllBodies');
const files={torso:'assistant-rig-torso-v3.webp',left:'assistant-rig-left-arm-v3.webp',right:'assistant-rig-right-arm-v3.webp',head:'assistant-rig-head-rest-v3.webp',open:'assistant-rig-head-open-v3.webp',blink:'assistant-rig-head-blink-v3.webp',concern:'assistant-rig-head-concerned-v3.webp',stern:'assistant-head-assertive-v1.webp',cross:'assistant-crossed-arms-v1.webp'};
function polygon(image,points){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.beginPath();points.forEach((p,i)=>x[i?'lineTo':'moveTo'](...p));x.closePath();x.clip();x.drawImage(image,0,0,W,H);return c}
function patch(image,cx,cy,rx,ry){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.drawImage(image,0,0,W,H);x.globalCompositeOperation='destination-in';x.translate(cx,cy);x.scale(rx,ry);const g=x.createRadialGradient(0,0,.7,0,0,1);g.addColorStop(0,'#000');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(-1,-1,2,2);return c}
async function init(){
 const images={};await Promise.all(Object.entries(files).map(async([key,file])=>{const i=new Image();i.src='assets/images/'+file;await i.decode();images[key]=i}));
 const samples=await fetch('assets/audio/assistant-body-samples.json').then(r=>{if(!r.ok)throw Error('samples');return r.json()});
 const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas');canvas.width=W;canvas.height=H;
 const layers={
  lu:polygon(images.left,[[620,525],[885,520],[905,820],[790,1015],[630,1030],[570,890],[620,750]]),
  lf:polygon(images.left,[[95,610],[540,610],[650,805],[750,890],[745,1045],[520,1065],[310,975],[90,870]]),
  ru:polygon(images.right,[[320,395],[560,395],[655,760],[675,935],[520,1000],[390,945],[330,760]]),
  rf:polygon(images.right,[[445,790],[650,755],[830,650],[990,750],[1010,985],[700,1055],[465,1010]]),
  mouth:patch(images.open,560,885,112,80),eyes:patch(images.blink,445,725,105,82),eyeR:patch(images.blink,707,710,105,82)
 };
 const face=document.createElement('canvas');face.width=W;face.height=H;const fx=face.getContext('2d');
 let kind='neutral',selected=null,cues=[],changed=performance.now()/1000,auto=false,autoIndex=0,raf=0,last=performance.now(),frames=0,customSpeaking=false;
 const values={head:0,lean:0,stern:0,concern:0,cross:0,mouth:0,round:0,wide:0};
 const channels={};for(const [side,root,pose]of [['l',[405,440],definitions.neutral.left],['r',[712,440],definitions.neutral.right]]){const a=ik(root,pose,140,190,pose[2]);channels[side+'u']={value:a.upper,v:0};channels[side+'f']={value:a.fore,v:0}}
 function spring(key,target,dt){const c=channels[key];let delta=target-c.value;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;c.v+=(delta*38-c.v*12)*dt;c.value+=c.v*dt;return c.value}
 function choose(next){if(!definitions[next])return;kind=next;changed=performance.now()/1000;stage.dataset.pose=kind;for(const b of buttons.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.kind===kind));status.textContent='حالت: '+(samples.find(x=>x.key===kind)?.title||'آرام')}
 function segment(img,start,end,root,tip,width=.4){const sa=Math.atan2(end[1]-start[1],end[0]-start[0]),ta=Math.atan2(tip[1]-root[1],tip[0]-root[0]),len=Math.hypot(tip[0]-root[0],tip[1]-root[1])/Math.hypot(end[0]-start[0],end[1]-start[1]);ctx.save();ctx.translate(...root);ctx.rotate(ta);ctx.scale(len,width);ctx.rotate(-sa);ctx.translate(-start[0],-start[1]);ctx.drawImage(img,0,0);ctx.restore()}
 function arm(side,root,pose,time,speaking,dt){const target=[...pose];if(!matchMedia('(prefers-reduced-motion: reduce)').matches){target[0]+=Math.sin(time*1.55+(side==='l'?0:1.3))*(speaking?8:2);target[1]+=Math.sin(time*1.9+(side==='l'?.5:0))*(speaking?5:2)}const desired=ik(root,target,140,190,pose[2]),upper=spring(side+'u',desired.upper,dt),fore=spring(side+'f',desired.fore,dt),elbow=[root[0]+140*Math.cos(upper),root[1]+140*Math.sin(upper)],hand=[elbow[0]+190*Math.cos(fore),elbow[1]+190*Math.sin(fore)];
  if(side==='l'){segment(layers.lu,[780,600],[680,910],root,elbow,.4);segment(layers.lf,[680,910],[125,760],elbow,hand,.4)}else{segment(layers.ru,[415,495],[535,895],root,elbow,.4);segment(layers.rf,[535,895],[953,835],elbow,hand,.4)}return hand}
 function frame(now){const dt=clamp((now-last)/1000||.016,.002,.04);last=now;const t=now/1000,pose=definitions[kind],speaking=!audio.paused&&!audio.ended||customSpeaking,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,s=1-Math.exp(-dt*5.5);
  for(const k of ['head','lean','stern','concern'])values[k]+=(pose[k]-values[k])*s;
  const cross=kind==='crossed'&&t-changed>.65?1:0;values.cross+=(cross-values.cross)*(1-Math.exp(-dt*6));
  const mouth=!audio.paused?shapeAt(cues,audio.currentTime):customSpeaking?[.35+.25*Math.sin(t*13),0,0]:[0,0,0];for(const [i,k]of ['mouth','round','wide'].entries())values[k]+=(mouth[i]-values[k])*(1-Math.exp(-dt*24));
  fx.clearRect(0,0,W,H);fx.drawImage(images.head,0,0,W,H);fx.globalAlpha=values.concern;fx.drawImage(images.concern,0,0,W,H);fx.globalAlpha=values.stern;fx.drawImage(images.stern,0,0,W,H);fx.globalAlpha=1;
  if(values.mouth>.01){fx.save();fx.globalAlpha=clamp(values.mouth*1.4,0,1);fx.translate(560,885);fx.scale(1-values.round*.2+values.wide*.07,.72+.28*values.mouth);fx.translate(-560,-885);fx.drawImage(layers.mouth,0,0);fx.restore()}
  const phase=t%4.4,blink=reduced?0:phase>.1&&phase<.26?Math.sin((phase-.1)/.16*Math.PI):0;if(blink>.01){fx.globalAlpha=blink;fx.drawImage(layers.eyes,0,0);fx.drawImage(layers.eyeR,0,0);fx.globalAlpha=1}
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(560,1310);ctx.rotate(values.lean+(reduced?0:.004*Math.sin(t*.8)));ctx.translate(-560,-1310+(reduced?0:2*Math.sin(t*1.65)));ctx.drawImage(images.torso,0,60,W,H);
  ctx.globalAlpha=1-values.cross;const left=arm('l',[405,440],pose.left,t,speaking,dt),right=arm('r',[712,440],pose.right,t,speaking,dt);ctx.globalAlpha=1;
  if(values.cross>.001){ctx.globalAlpha=values.cross;ctx.drawImage(images.cross,191,148,1160,722,340,430,460,286);ctx.globalAlpha=1}
  const nod=reduced?0:(kind==='agree'?8*Math.sin(t*5.2):kind==='assertive'&&speaking?4*Math.sin(t*4):2*Math.sin(t*1.3));ctx.save();ctx.translate(557,401+nod);ctx.rotate(values.head+(reduced?0:kind==='crossed'&&speaking?.025*Math.sin(t*3.2):.012*Math.sin(t*.9)));ctx.scale(.5,.5);ctx.drawImage(face,-550,-990,W,H);ctx.restore();ctx.restore();
  canvas.dataset.frames=String(++frames);canvas.dataset.hands=[...left,...right].map(n=>n.toFixed(1)).join(',');raf=requestAnimationFrame(frame)
 }
 async function playSample(sample,{sequence=false}={}){auto=sequence;selected=sample;cues=sample.cues;choose(classify(sample.fa));text.value=sample.fa;caption.textContent=sample.en;try{speechSynthesis.cancel()}catch{}customSpeaking=false;audio.pause();audio.src=sample.audio;try{await audio.play()}catch{status.textContent='حالت بدنی انتخاب شد؛ برای صدا دکمهٔ پخش را بزنید.'}}
 for(const sample of samples){const b=document.createElement('button');b.type='button';b.textContent=sample.title;b.dataset.kind=sample.key;b.setAttribute('aria-pressed','false');b.onclick=()=>playSample(sample);buttons.append(b)}
 all.disabled=false;run.disabled=false;all.onclick=()=>{autoIndex=0;void playSample(samples[0],{sequence:true})};q('#stopBody').onclick=()=>{auto=false;audio.pause();try{speechSynthesis.cancel()}catch{}customSpeaking=false;status.textContent='توقف؛ حالت بدنی فعلی حفظ شد'};
 audio.onended=()=>{if(auto&&++autoIndex<samples.length)void playSample(samples[autoIndex],{sequence:true});else{auto=false;status.textContent='پخش تمام شد؛ حالت: '+selected?.title}};
 run.onclick=()=>{auto=false;audio.pause();try{speechSynthesis.cancel()}catch{}customSpeaking=false;const value=text.value.trim();if(!value)return;choose(classify(value));caption.textContent='زبان بدن با واژه‌های متن انتخاب می‌شود؛ این بخش آزمایشی است.';const voice=window.speechSynthesis?.getVoices().find(v=>/^fa/i.test(v.lang));if(voice){const u=new SpeechSynthesisUtterance(value);u.voice=voice;u.lang='fa-IR';u.onstart=()=>{customSpeaking=true};u.onend=u.onerror=()=>{customSpeaking=false};speechSynthesis.speak(u)}else status.textContent+=' — صدای فارسی در این مرورگر موجود نیست؛ حرکت بدن اجرا می‌شود.'};
 stage.classList.add('ready');status.textContent='آماده؛ یک موضوع را انتخاب کن';raf=requestAnimationFrame(frame);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);audio.pause();try{speechSynthesis.cancel()}catch{}customSpeaking=false}else{last=performance.now();raf=requestAnimationFrame(frame)}});window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);audio.pause();try{speechSynthesis.cancel()}catch{}},{once:true});
}
init().catch(error=>{status.textContent='آماده‌سازی دمو انجام نشد؛ صفحه را تازه کن.';console.warn('Body demo',error.message)});
})();

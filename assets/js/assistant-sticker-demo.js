/* Independent, continuous sticker animation with pre-authored facial patches.
   The sample's phoneme clock controls the mouth. No user session or microphone. */
(()=>{'use strict';
const image=document.getElementById('stickerSource'),canvas=document.getElementById('stickerCanvas'),stage=document.getElementById('stickerStage'),audio=document.getElementById('demoAudio'),status=document.getElementById('demoState'),still=document.getElementById('stillMode'),play=document.getElementById('playDemo');
function mouthFor(phone){
 if(['pau','sil','m','b','p'].includes(phone))return [.06,0,0];
 if(['uw','uh','ow','oy','w'].includes(phone))return [.72,1,0];
 if(['iy','ih','ey','eh','y'].includes(phone))return [.43,0,1];
 if(['aa','ae','ah','ao','aw','ay'].includes(phone))return [.92,phone==='ao'?.4:0,0];
 if(['f','v'].includes(phone))return [.23,0,.25];
 if(['s','z','sh','zh','ch','jh'].includes(phone))return [.32,.25,.1];
 return [.38,0,.1];
}
function shapeAt(cues,t){const i=cues.findIndex(c=>t>=c.start&&t<c.end);if(i<0)return [.08,0,0];const c=cues[i],target=mouthFor(c.phone),next=cues[i+1];if(next){const blend=Math.max(0,(t-(c.end-.035))/.035)*.35,n=mouthFor(next.phone);return target.map((v,j)=>v*(1-blend)+n[j]*blend)}return target}
window.BamcoStickerDemoMath=Object.freeze({mouthFor,shapeAt});
function patch(source,sx,sy,sw,sh,width,height){
 const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(source,sx,sy,sw,sh,0,0,width,height);
 ctx.globalCompositeOperation='destination-in';ctx.translate(width/2,height/2);ctx.scale(width/2,height/2);const mask=ctx.createRadialGradient(0,0,.78,0,0,1);mask.addColorStop(0,'rgba(0,0,0,1)');mask.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=mask;ctx.fillRect(-1,-1,2,2);return c;
}
async function init(){
 await image.decode();const closed=new Image();closed.src='assets/images/assistant-status1-face-closed-v2.png';await closed.decode();
 const data=await fetch('assets/audio/assistant-sticker-demo-cues.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('cue load');return r.json()});
 canvas.width=800;canvas.height=1000;const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('Canvas');
 const face=document.createElement('canvas');face.width=800;face.height=1000;const f=face.getContext('2d');
 // Local patches are aligned to facial landmarks; the original nose, cheeks,
 // silhouette, hair, limbs and clothing are never stretched or cut apart.
 const rest=patch(closed,458,550,170,100,118,70);
 const open=patch(image,334,375,120,80,120,80);
 const leftEye=patch(closed,364,440,150,126,105,94);
 const rightEye=patch(closed,556,420,160,136,112,100);
 let raf=0,last=performance.now(),m=.8,r=0,w=0,painted=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;const running=!audio.paused&&!audio.ended,target=running?shapeAt(data.cues,audio.currentTime):[.8,0,0],s=1-Math.exp(-dt*30);m+=(target[0]-m)*s;r+=(target[1]-r)*s;w+=(target[2]-w)*s;
  const t=now/1000,phase=t%4.65,blink=still.checked||reduced?0:phase>.08&&phase<.24?Math.sin((phase-.08)/.16*Math.PI):0;
  f.clearRect(0,0,800,1000);f.drawImage(image,0,0,800,1000);
  if(!still.checked){
   f.drawImage(rest,335,376);const amount=Math.max(0,Math.min(1,(m-.08)/.65));
   if(amount>.001){const width=120*(1-r*.19+w*.06),height=80*(.72+.28*m);f.globalAlpha=amount;f.drawImage(open,394-width/2,415-height/2,width,height);f.globalAlpha=1;}
   if(blink>.001){f.globalAlpha=blink;f.drawImage(leftEye,278,291);f.drawImage(rightEye,392,278);f.globalAlpha=1;}
  }
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,800,1000);ctx.save();
  if(!still.checked&&!reduced){const sway=.004*Math.sin(t*.77)+.002*Math.sin(t*1.39),breath=1.6*Math.sin(t*1.65);ctx.translate(400,910);ctx.rotate(sway);ctx.translate(-400,-910+breath);}
  ctx.drawImage(face,0,0);ctx.restore();painted++;canvas.dataset.renderedFrames=String(painted);raf=requestAnimationFrame(frame);
 }
 stage.classList.add('ready');status.textContent='آمادهٔ پخش نمونه';raf=requestAnimationFrame(frame);
 play.onclick=async()=>{if(!audio.paused){audio.pause();return}if(audio.ended)audio.currentTime=0;try{await audio.play()}catch{status.textContent='برای پخش، کنترل صدا را انتخاب کنید.'}};
 document.getElementById('stopDemo').onclick=()=>{audio.pause();audio.currentTime=0;status.textContent='پخش متوقف شد'};
 audio.onplay=()=>{play.textContent='مکث';status.textContent='در حال پخش صدای نمونه و حرکت دهان'};audio.onpause=()=>{play.textContent='پخش دمو با صدا';status.textContent=audio.ended?'پخش نمونه تمام شد':'پخش متوقف است'};audio.onended=()=>{play.textContent='پخش دوبارهٔ دمو';status.textContent='پخش نمونه تمام شد'};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);audio.pause()}else{last=performance.now();raf=requestAnimationFrame(frame)}});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);audio.pause()},{once:true});
}
init().catch(error=>{canvas.style.display='none';status.textContent='نمایش حرکت در این مرورگر آماده نشد؛ استیکر اصلی نمایش داده می‌شود.';play.disabled=true;console.warn('Sticker demo:',error.message)});
})();

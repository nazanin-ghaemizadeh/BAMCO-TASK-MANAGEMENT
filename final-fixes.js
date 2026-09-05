(()=>{
'use strict';
const V='20260905-5';
if(!document.querySelector('link[data-final-fixes]')){
  const l=document.createElement('link');
  l.rel='stylesheet';l.href=`final-fixes.css?v=${V}`;l.dataset.finalFixes='1';document.head.appendChild(l);
}
function apply(){
  const logo=document.getElementById('brandLogo');
  if(logo){logo.src=`BAMCO_TASK_LOGO_WHITE_HEADER.png?v=${V}`;logo.alt='BAMCO TASK MANAGEMENT';logo.style.setProperty('display','block','important');logo.style.setProperty('visibility','visible','important');logo.style.setProperty('opacity','1','important');logo.style.setProperty('filter','none','important');}
  const brand=document.querySelector('.top-brand');if(brand){brand.style.setProperty('direction','rtl','important');brand.style.setProperty('display','flex','important');brand.style.setProperty('flex-direction','row','important');}
  const cards=document.getElementById('cards');if(cards)cards.style.setProperty('direction','ltr','important');
  const heights={statusChart:280,priorityChart:280,bucketChart:280,workloadChart:350,performanceChart:350};
  for(const [id,h] of Object.entries(heights)){const c=document.getElementById(id);if(c){c.dataset.logicalHeight=String(h);c.style.setProperty('height',`${h}px`,'important');}}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{apply();setTimeout(apply,400)});else{apply();setTimeout(apply,400)}
})();

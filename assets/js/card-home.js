/* Card navigation reuses existing buttons, handlers and role visibility. */
(()=>{
'use strict';
function install(){
 const q=s=>document.querySelector(s), app=q('#appView'), workspace=q('.workspace'), nav=q('#nav');
 if(!app||!workspace||!nav||q('#homeView'))return;
 document.body.classList.add('card-navigation');
 const top=document.createElement('header');top.className='card-topbar';
 top.innerHTML='<img src="assets/images/bamco-white-cropped.png" width="180" height="86" alt="خودروسازان بم"><strong>سامانه مدیریت، پایش و پیگیری امور</strong><button type="button" class="home-return">⌂ خانه</button>';
 app.prepend(top);const tools=q('.header-tools');if(tools)top.append(tools);
 const home=document.createElement('section');home.id='homeView';home.className='view hidden card-home';home.tabIndex=-1;home.setAttribute('aria-label','میز کار');
 workspace.append(home);home.append(nav);
 nav.querySelector('.nav-login-root')?.remove();
 const footer=document.createElement('footer');footer.id='homeFixedFooter';footer.innerHTML='<a href="https://www.linkedin.com/company/bam-automotive-company/" target="_blank" rel="noopener noreferrer">شرکت خودروسازان بم</a> | واحد توسعه و تکوین محصول | <a href="https://www.linkedin.com/in/shahab-tanhaiyan-b1156a10a/" target="_blank" rel="noopener noreferrer">شهاب‌الدین تنهائیان</a> و <a href="https://www.linkedin.com/in/nazanin-ghaemizadeh/" target="_blank" rel="noopener noreferrer">نازنین قائمی</a>';app.append(footer);
 const groups=[
  ['people',['people','loginActivity','activeSessions']],
  ['messages',['messages','messageCenter','sentMessages','responseTracking','stickers']],
  ['reports',['dashboard','performanceReport','responseReport','requestReport']],
  ['configuration',['systemOptions','alertSettings','emailSettings','settings']],
  ['tasks',['kanban','archive','taskTimeline','approvals','requestHistory','approvalChains']],
  ['vehicle',['vehiclePermanent','vehicleTemporary']],
  ['conversations',['groupChat','directMessages','taskChats']],
  ['resources',['documents','letters','sitesAccess']]
 ];
 const aliases={loginReport:'loginActivity',messageReport:'sentMessages'};
 const groupObserver=new MutationObserver(()=>syncGroups());
 function syncGroups(){
  groupObserver.disconnect();
  try{
   for(const [alias,target] of Object.entries(aliases)){
    if(nav.querySelector(`button[data-view="${target}"]`))nav.querySelectorAll(`button[data-view="${alias}"]`).forEach(b=>b.remove());
   }
   const routes=new Set(),buttons=new Map();
   nav.querySelectorAll('button[data-view]').forEach(button=>{
    const key=button.dataset.view;
    if(routes.has(key)){
     const kept=buttons.get(key);
     if(!kept.id&&!kept.dataset.runtimeBound&&!kept.onclick&&(button.id||button.dataset.runtimeBound||button.onclick)){kept.remove();buttons.set(key,button)}else button.remove();
    }else{routes.add(key);buttons.set(key,button)}
   });
   let previous=null;
   for(const [key,ids] of groups){
    const group=nav.querySelector(`.nav-group[data-group="${key}"]`);if(!group)continue;
    const next=previous?previous.nextElementSibling:nav.firstElementChild;
    if(next!==group)nav.insertBefore(group,next);previous=group;
    const box=group.querySelector('.nav-group-items');if(!box)continue;
    let previousButton=null;
    for(const id of ids){
     const button=buttons.get(id);if(!button)continue;
     if(button.classList.contains('nav-settings-root'))button.classList.remove('nav-settings-root');
     const nextButton=previousButton?previousButton.nextElementSibling:box.firstElementChild;
     if(nextButton!==button)box.insertBefore(button,nextButton);previousButton=button;
    }
    const toggle=group.querySelector('button.nav-group-toggle');
    if(toggle){const heading=document.createElement('h3');heading.className='nav-group-toggle';heading.innerHTML=toggle.innerHTML;toggle.replaceWith(heading)}
   }
   nav.querySelectorAll('.nav-group').forEach(group=>{
    const visible=[...group.querySelectorAll('[data-view]')].some(b=>!b.classList.contains('hidden'));
    if(group.classList.contains('hidden')===visible)group.classList.toggle('hidden',!visible);
   });
  }finally{groupObserver.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})}
 }
 syncGroups();
 const dialog=document.createElement('dialog');dialog.className='home-welcome-dialog';dialog.setAttribute('aria-labelledby','homeWelcomeTitle');dialog.innerHTML='<button class="welcome-dismiss" type="button" aria-label="بستن خوشامدگویی" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button><div class="home-welcome-copy"><p class="welcome-person"></p><h2 id="homeWelcomeTitle">به سامانه مدیریت، پایش و پیگیری امور خوش آمدید</h2></div><img class="home-sticker female" alt="استیکر زن در وضعیت مطلوب"><img class="home-sticker male" alt="استیکر مرد در وضعیت مطلوب">';document.body.append(dialog);
 let welcomeStickerPromise=null,welcomeStickerGeneration=0,welcomeStickerReadyToken=null;
 async function loadWelcomeStickers(generation){
  const token=typeof state!=='undefined'?state.token:null;if(!token)return;
  const images=[...dialog.querySelectorAll('.home-sticker')];images.forEach(image=>image.style.visibility='hidden');
  try{const sets=await select('sticker_sets','active=eq.true&select=id&order=created_at.desc&limit=1'),set=sets[0];if(!set)return;
   const rows=await select('stickers',`set_id=eq.${encodeURIComponent(set.id)}&state_key=eq.state1&gender=in.(female,male)&select=set_id,gender,storage_path`);
   const loaded=await Promise.all(['female','male'].map(async gender=>{const row=rows.find(r=>r.gender===gender&&String(r.set_id)===String(set.id));if(!row)throw Error('استیکر وضعیت مطلوب نسخه فعال کامل نیست.');return{gender,url:await bamcoMedia.get('stickers',row.storage_path)}}));
   if(generation!==welcomeStickerGeneration||state.token!==token)return;
   welcomeStickerReadyToken=token;
   for(const item of loaded){const image=dialog.querySelector('.'+item.gender);image.src=item.url;image.style.visibility='visible';image.dataset.stickerSet=String(set.id)}
  }catch(err){if(generation===welcomeStickerGeneration)console.warn('welcome-stickers',err.message)}
 }
 function stickers(force=false){if(!force&&welcomeStickerReadyToken&&welcomeStickerReadyToken===state.token)return Promise.resolve();if(force)welcomeStickerReadyToken=null;if(welcomeStickerPromise&&!force)return welcomeStickerPromise;const generation=++welcomeStickerGeneration,job=loadWelcomeStickers(generation);welcomeStickerPromise=job;return job.finally(()=>{if(welcomeStickerPromise===job)welcomeStickerPromise=null})}
 window.bamcoPrepareWelcomeStickers=()=>stickers();window.addEventListener('bamco-stickers-ready',()=>stickers(true));document.addEventListener('bamco:stickers-changed',()=>stickers(true));
 let homeExpected=false,repairFrame=0,homeEpoch=0,homeTimers=[];
 function clearHomeTimers(){homeTimers.forEach(clearTimeout);homeTimers=[]}
 function leaveHome(){
  homeExpected=false;homeEpoch++;clearHomeTimers();
  if(repairFrame){cancelAnimationFrame(repairFrame);repairFrame=0}
 }
 function resetHomeScroll(){
  try{window.scrollTo({top:0,left:0,behavior:'auto'})}catch{window.scrollTo(0,0)}
  for(const node of [document.documentElement,document.body,app,workspace,home])if(node&&node.scrollTop)node.scrollTop=0;
 }
 function showHome(){
  if(app.classList.contains('hidden'))return;
  homeExpected=true;
  if(!home.isConnected)workspace.append(home);
  if(nav.parentElement!==home)home.append(nav);
  if(!top.isConnected||top.parentElement!==app)app.prepend(top);else if(app.firstElementChild!==top)app.prepend(top);
  if(!footer.isConnected||footer.parentElement!==app)app.append(footer);
  workspace.querySelectorAll(':scope > .view').forEach(v=>v.classList.toggle('hidden',v!==home));
  for(const node of [home,nav,top,footer]){
   node.classList.remove('hidden');node.removeAttribute('hidden');node.style.removeProperty('display');node.style.removeProperty('visibility');node.style.removeProperty('opacity');
  }
  document.body.classList.add('card-navigation','card-home-active');
  document.body.classList.remove('welcome-active','content-only');
  if(typeof state!=='undefined')state.view='home';
  const title=q('#viewTitle');if(title)title.textContent='میز کار';q('#addTaskBtn')?.classList.add('hidden');
  syncGroups();resetHomeScroll();
 }
 function homeBroken(){
  if(!homeExpected||dialog.open||app.classList.contains('hidden'))return false;
  return !home.isConnected||home.classList.contains('hidden')||nav.parentElement!==home||!top.isConnected||top.classList.contains('hidden')||document.body.classList.contains('content-only')||!document.body.classList.contains('card-home-active');
 }
 function scheduleHomeRepair(){
  if(repairFrame||!homeBroken())return;
  const epoch=homeEpoch;
  repairFrame=requestAnimationFrame(()=>{repairFrame=0;if(epoch===homeEpoch&&homeBroken())showHome()});
 }
 function settleHome(){
  clearHomeTimers();homeExpected=true;const epoch=++homeEpoch;showHome();
  homeTimers=[0,40,120,300,700,1400].map(ms=>setTimeout(()=>{
   if(epoch!==homeEpoch||!homeExpected||dialog.open||app.classList.contains('hidden'))return;
   if(homeBroken())showHome();
  },ms));
 }
 function syncMode(){const loggedIn=!app.classList.contains('hidden'),atHome=!home.classList.contains('hidden');document.body.classList.toggle('card-home-active',loggedIn&&atHome);document.body.classList.toggle('content-only',loggedIn&&!atHome);if(homeExpected&&!dialog.open)scheduleHomeRepair()}
 const repairObserver=new MutationObserver(scheduleHomeRepair);
 repairObserver.observe(app,{childList:true,attributes:true,attributeFilter:['class']});
 repairObserver.observe(workspace,{childList:true});
 repairObserver.observe(home,{attributes:true,attributeFilter:['class','style','hidden']});
 repairObserver.observe(top,{attributes:true,attributeFilter:['class','style','hidden']});
 repairObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 new MutationObserver(syncMode).observe(home,{attributes:true,attributeFilter:['class']});
 nav.addEventListener('click',e=>{if(e.target.closest('button[data-view]'))leaveHome()},true);
 window.bamcoLeaveHome=leaveHome;
 window.bamcoShowHome=settleHome;
 let welcomed=false;
 window.bamcoOpenHomeWelcome=()=>{if(welcomed||app.classList.contains('hidden'))return;if(typeof state!=='undefined'&&state.profile?.must_change_password)return;welcomed=true;clearHomeTimers();homeExpected=true;homeEpoch++;showHome();dialog.querySelector('.welcome-person').textContent=(q('#userName')?.textContent||'همکار')+' عزیز';dialog.showModal();void stickers()};
 dialog.querySelector('.welcome-dismiss').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  if(homeExpected&&(typeof state==='undefined'||state.view==='home'))settleHome();
  if(homeExpected)requestAnimationFrame(()=>home.focus({preventScroll:true}));
 });
 dialog.addEventListener('cancel',()=>{if(homeExpected)requestAnimationFrame(settleHome)});
 top.querySelector('.home-return').addEventListener('click',()=>{settleHome();home.focus({preventScroll:true})});
 new MutationObserver(()=>{if(app.classList.contains('hidden')){leaveHome();welcomed=false;if(dialog.open)dialog.close();document.body.classList.remove('card-home-active','content-only')}else if(homeExpected&&!dialog.open)scheduleHomeRepair()}).observe(app,{attributes:true,attributeFilter:['class']});
 addEventListener('pageshow',()=>{if(homeExpected&&!dialog.open&&!app.classList.contains('hidden'))settleHome()});
 if(!app.classList.contains('hidden'))window.bamcoOpenHomeWelcome();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
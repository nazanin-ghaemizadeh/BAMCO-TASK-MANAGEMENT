/* Header and settings use the same versioned avatar binding as the directory. */
(()=>{'use strict';
const q=s=>document.querySelector(s);let frame=0;
function ensureHeaderAccount(){
 const app=q('#appView'),top=q('#appView>.card-topbar'),tools=q('.header-tools'),account=q('.account');
 if(!app||app.classList.contains('hidden')||!top)return false;
 if(tools&&tools.parentElement!==top)top.appendChild(tools);
 if(tools&&account&&account.parentElement!==tools)tools.prepend(account);
 return !!(tools&&account&&account.parentElement===tools);
}
async function refresh(){
 if(typeof state==='undefined'||!state.profile||!state.token)return false;
 ensureHeaderAccount();
 return Promise.all([q('#avatar'),q('#profileAvatarPreview')].filter(Boolean).map(el=>window.bamcoMedia.bindAvatar(el,state.profile)));
}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;if(!q('#appView')?.classList.contains('hidden'))void refresh()})}
function boot(){
 window.refreshProfileAvatar=refresh;
 window.bamcoTopbarAvatar={refresh,repair:ensureHeaderAccount,reset:()=>{}};
 const app=q('#appView');if(app)new MutationObserver(schedule).observe(app,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',e=>{if(e.target.closest('[data-view="settings"],.welcome-dismiss,.home-return'))schedule()});
 addEventListener('pageshow',schedule);schedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

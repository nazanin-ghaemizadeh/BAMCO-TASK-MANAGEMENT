/* Shared live Paint Shop workspace, authorized by the canonical access service. */
(()=>{'use strict';
 const nav=document.querySelector('#nav'),workspace=document.querySelector('.workspace');if(!nav||!workspace)return;
 const routes=[['ovenAnalysis','♨','تحلیل دمای کوره'],['statisticalProcessControl','▥','کنترل آماری فرایند (SPC)']];
 for(const [route,icon,title] of routes){
  const button=document.createElement('button');button.type='button';button.dataset.view=route;button.dataset.featureKey=route;button.className='hidden';button.innerHTML=`<b>${icon}</b><span>${title}</span>`;nav.append(button);
  const view=document.createElement('section');view.id=route+'View';view.className='view hidden quality-tool-view';view.dataset.featureKey=route;
  view.innerHTML=`<header class="feature-toolbar quality-tool-toolbar"><h3>${title}</h3><div class="quality-tool-actions"><button type="button" class="ghost" data-quality-home data-home-action>بازگشت به خانه</button>${route==='ovenAnalysis'?'<button type="button" class="ghost" data-quality-fullscreen>نمایش تمام‌صفحه</button>':''}</div></header>${route==='ovenAnalysis'?'<div class="paint-tool-host" id="paintToolHost"></div>':'<div class="quality-tool-empty"><b>کنترل آماری فرایند (SPC)</b><p>ابزارهای این بخش هنوز تعریف نشده‌اند.</p></div>'}`;
  view.querySelector('[data-quality-home]').onclick=()=>window.bamcoShowHome?.();
  view.querySelector('[data-quality-fullscreen]')?.addEventListener('click',()=>{void view.requestFullscreen?.()?.catch(()=>{})});workspace.append(view);
 }
 const host=document.querySelector('#paintToolHost');
 const currentState=()=>window.Bamco?.state||{};
 const identity=()=>`${currentState().user?.id||''}:${window.bamcoAuth?.snapshot?.().generation??''}`;
 function sync(){
  const state=currentState(),allowed=!!state.token&&window.BamcoAccess?.can?.('ovenAnalysis','view')===true;
  const frame=host.querySelector('iframe');
  if(!allowed||frame&&frame.dataset.identity!==identity()){host.replaceChildren();if(document.fullscreenElement?.id==='ovenAnalysisView')void document.exitFullscreen?.()?.catch(()=>{})}
  if(!allowed||state.view!=='ovenAnalysis'||host.querySelector('iframe'))return;
  const iframe=document.createElement('iframe');iframe.title='تحلیل دمای کوره سالن رنگ';iframe.dataset.identity=identity();
  // No account token or portal storage is exposed to the analysis document.
  iframe.setAttribute('sandbox','allow-scripts allow-forms allow-downloads allow-modals');
  iframe.setAttribute('allow','fullscreen');iframe.referrerPolicy='no-referrer';
  // A single live source serves both the standalone site and this portal.
  iframe.src='https://nazanin-ghaemizadeh.github.io/BAMCO-PAINT-SHOP/';host.append(iframe);
 }
 window.Bamco?.lifecycle?.on?.('navigation-after',sync);
 window.addEventListener('bamco:feature-access-changed',sync);
 const app=document.querySelector('#appView');if(app)new MutationObserver(()=>{if(app.classList.contains('hidden'))host.replaceChildren();else sync()}).observe(app,{attributes:true,attributeFilter:['class']});
})();

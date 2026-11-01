/* Consistent iconography and unique accent colors across home categories and subcategories. */
(()=>{
 const palette=['#087e76','#8652c6','#c27b18','#b253bd','#108ca2','#c64976','#b44d51','#4277ce','#aa6633','#00877d','#7754c6','#d04479','#1796a8'];
 const svg=(paths)=>'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
 const icons={
  emission:svg('<rect x="2" y="10" width="11" height="9" rx="2"/><path d="M5 10V6h8l3 3h5M16 13h5M16 17h4M5 19v2M10 19v2"/>'),
  faces:svg('<circle cx="8" cy="9" r="6"/><path d="M5 10q3 4 6 0M6 7h.01M10 7h.01"/><circle cx="16" cy="16" r="6"/><path d="M13 19q3-4 6 0M14 14h.01M18 14h.01M19 15l1 2-1 1"/>'),
  heat:svg('<rect x="4" y="15" width="16" height="5" rx="1.5"/><path d="M7 12c-2-2 2-3 0-6M12 12c-2-2 2-4 0-8M17 12c-2-2 2-3 0-6"/>'),
  quality:svg('<path d="m12 2 8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="m8 12 2.6 2.6L16 9"/>')
 };
 const name=(el)=>[el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ').replace(/\s+/g,' ');
 const apply=()=>{
  const groups=[...document.querySelectorAll('#homeView #nav > .nav-group')];
  groups.forEach((group,i)=>{
   const accent=palette[i%palette.length];group.style.setProperty('--tile-accent',accent);
   const title=group.querySelector('.home-group-trigger');if(title)title.style.setProperty('color',accent,'important');
   const label=group.querySelector('.home-group-label,.home-group-title,.nav-group-title');if(label)label.style.setProperty('color',accent,'important');
   const symbol=group.querySelector('.home-group-symbol');if(symbol){const n=name(group);const key=group.dataset.group==='emissionTests'?'emission':/پایش حرارتی|سالن رنگ|thermal|paint shop/i.test(n)?'heat':/کنترل.*کیفیت|quality control/i.test(n)?'quality':null;if(key&&symbol.dataset.bamcoIcon!==key){symbol.innerHTML=icons[key];symbol.dataset.bamcoIcon=key;}}
  });
  // Every submenu is assigned its own accent, not the parent's color.
  const submenus=[...document.querySelectorAll('.home-launcher-routes')];
  submenus.forEach((routes,groupIndex)=>{
   [...routes.querySelectorAll('.home-launcher-route')].forEach((route,i)=>{
    const hue=(groupIndex*137+i*47+16)%360;
    const accent='hsl('+hue+' 64% 39%)';
    route.style.setProperty('--tile-accent',accent,'important');
    route.style.setProperty('color',accent,'important');
    const label=route.querySelector('span:last-child');if(label)label.style.setProperty('color',accent,'important');
    const symbol=route.querySelector('.home-launcher-route-icon');if(!symbol)return;
    symbol.style.setProperty('color',accent,'important');
    symbol.style.setProperty('border-color','hsl('+hue+' 54% 80%)','important');
    symbol.style.setProperty('background','hsl('+hue+' 75% 95%)','important');
    const n=name(route);const key=route.dataset.route==='emissionTests'?'faces':/پایش حرارتی|سالن رنگ|thermal|paint shop/i.test(n)?'heat':/کنترل.*کیفیت|quality control/i.test(n)?'quality':null;
    if(key&&symbol.dataset.bamcoIcon!==key){symbol.innerHTML=icons[key];symbol.dataset.bamcoIcon=key;}
    symbol.querySelectorAll('svg').forEach(svg=>{svg.style.setProperty('stroke',accent,'important');svg.style.setProperty('width','54%','important');svg.style.setProperty('height','54%','important');});
   });
  });
 };
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
})();


/* Emissions category and fuel-economy grade calculation shortcut. */
(()=>{
 'use strict';
 const URL='https://nazanin-ghaemizadeh.github.io/BAMCO-CO2-ENERGY-CALCULATOR/';
 const routeId='fuelEconomyGrade';
 function apply(){
  const group=document.querySelector('#homeView #nav [data-group="emissionTests"]')||
    document.querySelector('.nav-group[data-group="emissionTests"]');
  if(!group)return;
  const heading=group.querySelector('.home-group-label,.home-group-title,.nav-group-title,.home-group-trigger');
  if(heading){
   const textNodes=document.createTreeWalker(heading,NodeFilter.SHOW_TEXT);
   let n;while((n=textNodes.nextNode())){if(/تست\s*آلایندگی/.test(n.nodeValue))n.nodeValue=n.nodeValue.replace(/تست\s*آلایندگی/g,'آلایندگی');}
  }
  const routes=group.querySelector('.home-launcher-routes')||
   document.querySelector('.home-launcher-dialog[open] .home-launcher-routes');
  if(!routes||routes.querySelector('[data-route="'+routeId+'"]'))return;
  const existing=routes.querySelector('.home-launcher-route');
  const item=document.createElement(existing?.tagName?.toLowerCase()==='a'?'a':'button');
  item.className='home-launcher-route';
  item.dataset.route=routeId;
  item.type=item.tagName==='BUTTON'?'button':undefined;
  if(item.tagName==='A'){item.href=URL;item.target='_blank';item.rel='noopener noreferrer';}
  item.setAttribute('aria-label','محاسبه گرید مصرف سوخت و انرژی');
  const icon=document.createElement('span');icon.className='home-launcher-route-icon';
  icon.innerHTML='<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20h14M7 16l3-4 3 2 5-8"/><path d="M5 4v16h15"/><circle cx="18" cy="6" r="2"/></svg>';
  const label=document.createElement('span');label.textContent='محاسبه گرید مصرف سوخت و انرژی';
  item.append(icon,label);routes.append(item);
 }
 document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target.closest('[data-route="'+routeId+'"]'):null;
  if(!target)return;
  if(target.tagName!=='A'){event.preventDefault();event.stopImmediatePropagation();window.open(URL,'_blank','noopener,noreferrer');}
 },true);
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
})();

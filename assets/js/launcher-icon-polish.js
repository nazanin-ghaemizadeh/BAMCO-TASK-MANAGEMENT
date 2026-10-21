/* Consistent iconography and unique accent colors across home categories and subcategories. */
(()=>{
 const palette=['#087e76','#8652c6','#c27b18','#b253bd','#108ca2','#c64976','#b44d51','#4277ce','#aa6633','#00877d','#7754c6','#d04479','#1796a8'];
 const svg=(paths)=>'<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
 const icons={
  heat:svg('<rect x="4" y="15" width="16" height="5" rx="1.5"/><path d="M7 12c-2-2 2-3 0-6M12 12c-2-2 2-4 0-8M17 12c-2-2 2-3 0-6"/>'),
  quality:svg('<path d="m12 2 8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"/><path d="m8 12 2.6 2.6L16 9"/>')
 };
 const name=(el)=>[el.textContent,el.getAttribute('aria-label'),el.getAttribute('title')].filter(Boolean).join(' ').replace(/\\s+/g,' ');
 const apply=()=>{
  const groups=[...document.querySelectorAll('#homeView #nav > .nav-group')];
  groups.forEach((group,i)=>{
   const accent=palette[i%palette.length];group.style.setProperty('--tile-accent',accent);
   const title=group.querySelector('.home-group-trigger');if(title)title.style.setProperty('color',accent,'important');
   const label=group.querySelector('.home-group-label,.home-group-title,.nav-group-title');if(label)label.style.setProperty('color',accent,'important');
   const symbol=group.querySelector('.home-group-symbol');if(symbol){const n=name(group);const key=/پایش حرارتی|سالن رنگ|thermal|paint shop/i.test(n)?'heat':/کنترل.*کیفیت|quality control/i.test(n)?'quality':null;if(key&&symbol.dataset.bamcoIcon!==key){symbol.innerHTML=icons[key];symbol.dataset.bamcoIcon=key;}}
  });
  document.querySelectorAll('.home-launcher-routes').forEach(routes=>{
   [...routes.querySelectorAll('.home-launcher-route')].forEach((route,i)=>{
    const accent=palette[i%palette.length];route.style.setProperty('--tile-accent',accent);
    const label=route.querySelector('span:last-child');if(label)label.style.setProperty('color',accent,'important');
    const symbol=route.querySelector('.home-launcher-route-icon');if(!symbol)return;
    const n=name(route);const key=/پایش حرارتی|سالن رنگ|thermal|paint shop/i.test(n)?'heat':/کنترل.*کیفیت|quality control/i.test(n)?'quality':null;
    if(key&&symbol.dataset.bamcoIcon!==key){symbol.innerHTML=icons[key];symbol.dataset.bamcoIcon=key;}
   });
  });
 };
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
})();

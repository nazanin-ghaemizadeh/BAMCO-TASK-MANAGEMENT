(()=>{
const n=4;
const BAD_SIZE="function sizeCanvas(c){const dpr=window.devicePixelRatio||1,w=Math.max(600,c.parentElement.clientWidth),h=Number(c.getAttribute('height')||300);if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h}}";
const GOOD_SIZE="function sizeCanvas(c){const dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(600,c.parentElement.clientWidth),h=Number(c.dataset.logicalHeight||c.getAttribute('height')||300),pw=Math.round(w*dpr),ph=Math.round(h*dpr);c.dataset.logicalHeight=String(h);c.style.width='100%';c.style.height=`${h}px`;if(c.width!==pw)c.width=pw;if(c.height!==ph)c.height=ph;const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h}}";
const BAD_RESIZE="window.addEventListener('resize',()=>{if(document.getElementById('view-dashboard').classList.contains('active-view'))renderDashboard()})";
const GOOD_RESIZE="let dashboardResizeFrame=0;window.addEventListener('resize',()=>{if(!document.getElementById('view-dashboard').classList.contains('active-view'))return;if(dashboardResizeFrame)cancelAnimationFrame(dashboardResizeFrame);dashboardResizeFrame=requestAnimationFrame(()=>{dashboardResizeFrame=0;renderDashboard()})})";
Promise.all(Array.from({length:n},(_,i)=>fetch(`webapp_parts/webapp_${String(i+1).padStart(2,'0')}.part?v=20260905-6`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`webapp part ${i+1}`);return r.text()}))).then(parts=>{
 let source=parts.join('');
 source=source.replace(BAD_SIZE,GOOD_SIZE).replace(BAD_RESIZE,GOOD_RESIZE);
 if(!source.includes(GOOD_SIZE))throw new Error('Dashboard stability patch did not apply');
 Function(source)();
 const loadFinal=()=>{const f=document.createElement('script');f.src='final-fixes.js?v=20260905-6';document.head.appendChild(f)};
 const s=document.createElement('script');s.src='user-fixes.js?v=20260905-6';s.onload=loadFinal;s.onerror=loadFinal;document.head.appendChild(s);
}).catch(e=>{console.error(e);document.body.innerHTML=`<pre dir="rtl" style="padding:30px;font-family:Tahoma">خطا در بارگذاری برنامه: ${e.message}</pre>`});
})();

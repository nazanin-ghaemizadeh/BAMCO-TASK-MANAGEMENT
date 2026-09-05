(()=>{
const n=4;
const BAD_SIZE="function sizeCanvas(c){const dpr=window.devicePixelRatio||1,w=Math.max(600,c.parentElement.clientWidth),h=Number(c.getAttribute('height')||300);if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h}}";
const GOOD_SIZE="function sizeCanvas(c){const dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(600,c.parentElement.clientWidth),h=Number(c.dataset.logicalHeight||c.getAttribute('height')||300),pw=Math.round(w*dpr),ph=Math.round(h*dpr);c.dataset.logicalHeight=String(h);c.style.width='100%';c.style.height=`${h}px`;if(c.width!==pw)c.width=pw;if(c.height!==ph)c.height=ph;const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h}}";
const BAD_RESIZE="window.addEventListener('resize',()=>{if(document.getElementById('view-dashboard').classList.contains('active-view'))renderDashboard()})";
const GOOD_RESIZE="let dashboardResizeFrame=0;window.addEventListener('resize',()=>{if(!document.getElementById('view-dashboard').classList.contains('active-view'))return;if(dashboardResizeFrame)cancelAnimationFrame(dashboardResizeFrame);dashboardResizeFrame=requestAnimationFrame(()=>{dashboardResizeFrame=0;renderDashboard()})})";
const BAD_LOGO="document.getElementById('brandLogo').src=A().header_logo||'bamco-logo.png';";
const FOLLOWUP_CALL="await bridge('/followups/inspect',{people:activePeople(),date_from:from,date_to:to})";
const TIMED_FOLLOWUP_CALL="await Promise.race([bridge('/followups/inspect',{people:activePeople(),date_from:from,date_to:to}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('بررسی پاسخ‌ها بیش از حد معمول طول کشید. رابط ویندوز را به‌روزرسانی و دوباره اجرا کنید.')),120000))])";
const FASTER_FOLLOWUP_CALL="await Promise.race([bridge('/followups/inspect',{people:activePeople(),date_from:from,date_to:to}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('بررسی پاسخ‌ها متوقف شد؛ رابط ویندوز پاسخ نداد. رابط را ببندید و نسخه جدید را اجرا کنید.')),60000))])";
Promise.all(Array.from({length:n},(_,i)=>fetch(`webapp_parts/webapp_${String(i+1).padStart(2,'0')}.part?v=20260905-16`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`webapp part ${i+1}`);return r.text()}))).then(parts=>{
 let source=parts.join('');
 source=source.replace(BAD_SIZE,GOOD_SIZE).replace(BAD_RESIZE,GOOD_RESIZE).replace(BAD_LOGO,'').replace(FOLLOWUP_CALL,FASTER_FOLLOWUP_CALL).replace(TIMED_FOLLOWUP_CALL,FASTER_FOLLOWUP_CALL);
 source=source.replace('cx=Math.min(w*.38,360),cy=h*.55,r=Math.min(95,h*.31)','plotRight=w-235,cx=(45+plotRight)/2,cy=h*.56,r=Math.min(120,h*.34)');
 source=source.replace('`${fa(Math.round(v/total*100))}٪`','`${fa(v)} (${fa(Math.round(v/total*100))}٪)`');
 source=source.replaceAll('w-145','w-42').replaceAll('w-155','w-62').replaceAll('w-130','w-42').replaceAll('w-140','w-62');
 source=source.replaceAll('right=w-160','right=w-235').replaceAll('right=w-180','right=w-235').replaceAll('right=w-170','right=w-235');
 source=source.replace('let x=left+gap;labels.forEach','const used=labels.length*bw+Math.max(0,labels.length-1)*gap;let x=left+Math.max(gap,(right-left-used)/2);ctx.strokeStyle=\'#8fa39a\';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();labels.forEach');
 source=source.replace('let x=left+gap;for(const [owner,parts] of rows.slice(0,12))','const visibleRows=rows.slice(0,12),used=visibleRows.length*bw+Math.max(0,visibleRows.length-1)*gap;let x=left+Math.max(gap,(right-left-used)/2);ctx.strokeStyle=\'#8fa39a\';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();for(const [owner,parts] of visibleRows)');
 source=source.replace('let x=left+gap;for(const [owner,delay,accel] of rows.slice(0,10))','const visibleRows=rows.slice(0,10),used=visibleRows.length*gw+Math.max(0,visibleRows.length-1)*gap;let x=left+Math.max(gap,(right-left-used)/2);ctx.strokeStyle=\'#8fa39a\';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,bottom);ctx.stroke();ctx.strokeStyle=\'#176b4d\';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);ctx.stroke();for(const [owner,delay,accel] of visibleRows)');
 source=source.replace("ctx.fillStyle='#c94f5d';ctx.fillRect(x+4,bottom-dh,bw,dh);ctx.fillStyle='#f0b429';ctx.fillRect(x+12+bw,bottom-ah,bw,ah)","ctx.fillStyle='#c94f5d';if(delay)ctx.fillRect(x+4,bottom-dh,bw,dh);else ctx.fillRect(x+4,bottom-2,bw,2);ctx.fillStyle='#f0b429';if(accel)ctx.fillRect(x+12+bw,bottom-ah,bw,ah);else ctx.fillRect(x+12+bw,bottom-2,bw,2)");
 if(!source.includes(GOOD_SIZE))throw new Error('Dashboard stability patch did not apply');
 Function(source)();
 const loadFinal=()=>{const f=document.createElement('script');f.src='final-fixes.js?v=20260905-16';document.head.appendChild(f)};
 const s=document.createElement('script');s.src='user-fixes.js?v=20260905-16';s.onload=loadFinal;s.onerror=loadFinal;document.head.appendChild(s);
}).catch(e=>{console.error(e);document.body.innerHTML=`<pre dir="rtl" style="padding:30px;font-family:Tahoma">خطا در بارگذاری برنامه: ${e.message}</pre>`});
})();

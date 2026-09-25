(()=>{
  'use strict';
  if(window.__bamcoTaskTimeline)return;
  window.__bamcoTaskTimeline=true;
  const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const faNum=n=>typeof fa==='function'?fa(n):String(n??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const monthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const weekNames=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
  let colorMode='priority';
  let mode='calendar',month=null,filters={owner:'',status:'',priority:'',search:''};

  function appState(){try{return typeof state!=='undefined'?state:null}catch{return null}}
  function currentMonth(){const p=typeof currentJalali==='function'?currentJalali():null;return p||{y:1405,m:6,d:1}}
  function activeTasks(){const s=appState();return (s?.tasks||[]).filter(t=>!t.archived)}
  function ownerNameLocal(t){try{return typeof ownerName==='function'?ownerName(t):window.BamcoProfiles?.label?.(t?.owner_id)||(appState()?.profiles||[]).find(p=>p.id===t.owner_id)?.display_name||(appState()?.profiles||[]).find(p=>p.id===t.owner_id)?.full_name||'—'}catch{return'—'}}
  function taskId(t){try{return typeof displayId==='function'?displayId(t):(t.legacy_id||t.id)}catch{return t.legacy_id||t.id}}
  function isWaiting(t){return window.bamcoOptions.kind(t)==='waiting'}
  function temporalState(t){if(window.bamcoTaskPresentation)return window.bamcoTaskPresentation(t).temporal;if(isWaiting(t)||!t.due_date||t.status==='انجام شده')return 'فاقد شرایط دیرکرد';const now=new Date().toISOString().slice(0,10);if(t.due_date<now)return 'دیرکرد';const limit=new Date();limit.setDate(limit.getDate()+Math.max(0,Number(t.reminder_days)||0));return t.due_date<=limit.toISOString().slice(0,10)?'هشدار':'عادی'}
  function colorFor(t){return window.bamcoOptions.color(colorMode==='status'||isWaiting(t)?'status':'priority',t)}

  function toParts(iso){try{return typeof persianParts==='function'?persianParts(iso):null}catch{return null}}
  function isoFor(y,m,d){try{return typeof jalaliToISO==='function'?jalaliToISO(y,m,d):null}catch{return null}}
  function daysInMonth(y,m){try{return typeof daysInJalaliMonth==='function'?daysInJalaliMonth(y,m):(m<=6?31:m<=11?30:29)}catch{return m<=6?31:m<=11?30:29}}
  function dateIndex(iso,y,m){const p=toParts(iso);return p&&p.y===y&&p.m===m?p.d:null}
  function monthIsoRange(){const max=daysInMonth(month.y,month.m);return {start:isoFor(month.y,month.m,1),end:isoFor(month.y,month.m,max),max}}
  function filtered(){
    const term=filters.search.trim().toLowerCase();
    return activeTasks().filter(t=>(!filters.owner||t.owner_id===filters.owner)&&(!filters.status||String(t.status)===filters.status)&&(!filters.priority||String(t.priority)===filters.priority)&&(!term||[taskId(t),t.title,t.description,ownerNameLocal(t),t.status,t.priority].some(v=>String(v??'').toLowerCase().includes(term))));
  }
  function openKanban(t){
    if(window.bamcoOpenTaskInKanban?.(t.id))return;
    q('#nav button[data-view="kanban"]')?.click();window.bamcoFocusMessageTask?.(t.id);
  }

  function ensure(){
    if(q('#taskTimelineView'))return;
    const archive=q('#nav button[data-view="archive"]'),nav=q('#nav'),workspace=q('.workspace');if(!nav||!workspace)return;
    const btn=document.createElement('button');btn.dataset.view='taskTimeline';btn.className=archive?.className||'';btn.innerHTML='<b>▦</b><span>تقویم و گانت</span>';
    archive?.parentNode?archive.insertAdjacentElement('afterend',btn):nav.appendChild(btn);
    workspace.insertAdjacentHTML('beforeend',`<section id="taskTimelineView" class="view hidden"><div class="task-timeline-shell"><div class="tt-head"><div><h3>تقویم و گانت وظایف</h3><small>نمایش زمان‌بندی وظایف جاری بر اساس تقویم شمسی و اولویت</small></div><div class="tt-switch"><button type="button" id="ttUnscheduled" class="ghost">بدون زمان‌بندی: <b>۰</b></button><button type="button" class="tt-mode active" data-mode="calendar">▦ نمای تقویمی</button><button type="button" class="tt-mode" data-mode="gantt">▥ نمای گانت</button></div></div><aside id="ttUnscheduledPanel" class="tt-unscheduled-panel hidden"><div class="panel-head"><h3>کارهای بدون زمان‌بندی</h3><button type="button" id="ttCloseUnscheduled" class="ghost">بستن</button></div><div id="ttUnscheduledList"></div></aside><div class="tt-toolbar"><div class="tt-month"><button type="button" id="ttPrev" class="ghost">‹</button><strong id="ttMonthLabel"></strong><button type="button" id="ttNext" class="ghost">›</button></div><div class="tt-filters"><select id="ttColorMode" aria-label="رنگ‌بندی"><option value="priority">رنگ بر اساس اولویت</option><option value="status">رنگ بر اساس وضعیت</option></select><select id="ttOwner"><option value="">همه متولیان</option></select><select id="ttStatus"><option value="">همه وضعیت‌ها</option></select><select id="ttPriority"><option value="">همه اولویت‌ها</option></select><input id="ttSearch" class="search" placeholder="جست‌وجو در وظایف…"></div></div><div id="ttBody"></div><div class="tt-legend"><span><i style="--c:#ef5350"></i>فوری</span><span><i style="--c:#f2a93b"></i>متوسط</span><span><i style="--c:#39a96b"></i>کم</span><span><i style="--c:#8b949e"></i>منتظر پاسخ</span></div></div></section>`);
    /* Timeline styles are maintained in bamco-unified.css. */
    q('#taskTimelineStyles')?.remove();
    btn.addEventListener('click',openView);
    q('#ttPrev').onclick=()=>shiftMonth(-1);q('#ttNext').onclick=()=>shiftMonth(1);
    q('#ttUnscheduled').onclick=()=>q('#ttUnscheduledPanel').classList.toggle('hidden');q('#ttCloseUnscheduled').onclick=()=>q('#ttUnscheduledPanel').classList.add('hidden');
    qa('.tt-mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;qa('.tt-mode').forEach(x=>x.classList.toggle('active',x===b));renderBody()});
    q('#ttColorMode').onchange=e=>{colorMode=e.target.value;render()};
    q('#ttOwner').onchange=e=>{filters.owner=e.target.value;renderBody()};q('#ttStatus').onchange=e=>{filters.status=e.target.value;renderBody()};q('#ttPriority').onchange=e=>{filters.priority=e.target.value;renderBody()};q('#ttSearch').oninput=e=>{filters.search=e.target.value;renderBody()};
  }
  function shiftMonth(delta){month={...month};month.m+=delta;if(month.m<1){month.m=12;month.y--}if(month.m>12){month.m=1;month.y++}render()}
  function fillFilters(){
    for(const type of ['status','priority'])if(filters[type])filters[type]=window.bamcoOptions.label(type,filters[type]);
    const s=appState(),tasks=activeTasks();
    const owners=(s?.profiles||[]).filter(p=>tasks.some(t=>t.owner_id===p.id));
    const owner=q('#ttOwner'),status=q('#ttStatus'),priority=q('#ttPriority');
    owner.innerHTML='<option value="">همه متولیان</option>'+owners.map(p=>`<option value="${esc(p.id)}">${esc(window.BamcoProfiles?.label?.(p.id)||p.display_name||p.full_name||p.email)}</option>`).join('');owner.value=filters.owner;owner.classList.toggle('hidden',owners.length<2);
    const statuses=window.bamcoOptions.ordered('status',tasks.map(t=>t.status));status.innerHTML='<option value="">همه وضعیت‌ها</option>'+statuses.map(v=>`<option>${esc(v)}</option>`).join('');status.value=filters.status;
    const priorities=window.bamcoOptions.ordered('priority',tasks.map(t=>t.priority));priority.innerHTML='<option value="">همه اولویت‌ها</option>'+priorities.map(v=>`<option>${esc(v)}</option>`).join('');priority.value=filters.priority;
  }
  function activateView(){
    ensure();const view=q('#taskTimelineView');if(!view)return;
    const title=q('#viewTitle'),sub=q('#viewSubtitle'),add=q('#addTaskBtn');if(title)title.textContent='تقویم و گانت';if(sub)sub.textContent='نمای زمان‌بندی وظایف جاری';if(add)add.classList.add('hidden');
    if(!month)month=currentMonth();fillFilters();render();
  }
  function openView(){
    ensure();
    if(window.BamcoNavigation?.navigate?.('taskTimeline'))return;
    qa('.view').forEach(v=>v.classList.add('hidden'));q('#taskTimelineView')?.classList.remove('hidden');
    qa('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='taskTimeline'));
    const s=appState();if(s)s.view='taskTimeline';activateView();
  }
  function render(){const legend=q('.tt-legend');if(legend){const type=colorMode==='status'?'status':'priority',options=window.bamcoOptions.rows(type).filter(x=>x.active||activeTasks().some(t=>t[type]===x.label));legend.innerHTML=options.map(x=>`<span><i style="--c:${x.color}"></i>${esc(x.label)}</span>`).join('');if(type==='priority'&&activeTasks().some(isWaiting)){const waiting=window.bamcoOptions.rows('status').filter(x=>x.kind==='waiting');legend.innerHTML+=waiting.map(x=>`<span><i style="--c:${x.color}"></i>${esc(x.label)}</span>`).join('')}}if(!month)month=currentMonth();q('#ttMonthLabel').textContent=`${monthNames[month.m-1]} ${faNum(month.y)}`;renderUnscheduled();renderBody()}
  function renderUnscheduled(){const rows=filtered().filter(t=>!t.start_date||(!t.due_date&&!isWaiting(t))),button=q('#ttUnscheduled b'),list=q('#ttUnscheduledList');if(button)button.textContent=faNum(rows.length);if(list)list.innerHTML=rows.map(t=>`<button type="button" data-task="${t.id}"><b>${faNum(taskId(t))}</b><span>${esc(t.title)}</span><small>${isWaiting(t)?'منتظر پاسخ بدون تاریخ شروع':window.bamcoOptions.kind(t)==='registered'?'ثبت‌شده':'بدون تاریخ شروع یا پایان'}</small></button>`).join('')||'<div class="tt-empty">وظیفه بدون زمان‌بندی وجود ندارد.</div>';qa('[data-task]',list||document).forEach(b=>b.onclick=()=>{const t=activeTasks().find(x=>String(x.id)===b.dataset.task);if(t)openKanban(t)})}
  function renderBody(){mode==='gantt'?renderGantt():renderCalendar()}
  function renderCalendar(){
    const body=q('#ttBody'),tasks=filtered(),days=daysInMonth(month.y,month.m),firstIso=isoFor(month.y,month.m,1),firstDay=firstIso?new Date(firstIso+'T12:00:00').getDay():6,offset=(firstDay+1)%7,today=currentMonth();
    const byDay={};tasks.forEach(t=>{const iso=t.due_date||t.start_date;if(!iso)return;const d=dateIndex(iso,month.y,month.m);if(d)(byDay[d]||(byDay[d]=[])).push(t)});
    let html='<div class="tt-calendar">'+weekNames.map(x=>`<div class="tt-week">${x}</div>`).join('');
    for(let i=0;i<offset;i++)html+='<div class="tt-day other"></div>';
    for(let d=1;d<=days;d++){
      const arr=byDay[d]||[],todayClass=today.y===month.y&&today.m===month.m&&today.d===d?' today':'';
      html+=`<div class="tt-day${todayClass}"><div class="tt-day-num">${faNum(d)}</div><div class="tt-dots">${arr.map(t=>`<button class="tt-dot" style="--c:${colorFor(t)}" data-task="${t.id}" title="#${esc(taskId(t))} — ${esc(t.title)}\nمتولی: ${esc(ownerNameLocal(t))}\nاولویت: ${esc(t.priority)}">${faNum(taskId(t))}</button>`).join('')}</div></div>`;
    }
    let total=offset+days;while(total%7!==0){html+='<div class="tt-day other"></div>';total++}
    html+='</div>';body.innerHTML=html;qa('.tt-dot',body).forEach(b=>b.onclick=()=>{const t=activeTasks().find(x=>String(x.id)===b.dataset.task);if(t)openKanban(t)});
  }
  function renderGantt(){
    const body=q('#ttBody'),tasks=filtered(),range=monthIsoRange(),max=range.max,startMs=range.start?new Date(range.start+'T12:00:00').getTime():0,endMs=range.end?new Date(range.end+'T12:00:00').getTime():0;
    const rows=tasks.filter(t=>{const a=t.start_date||t.due_date,b=t.due_date||t.start_date;if(!a||!b)return false;const am=new Date(a+'T12:00:00').getTime(),bm=new Date(b+'T12:00:00').getTime();return bm>=startMs&&am<=endMs}).sort((a,b)=>String(a.due_date||a.start_date).localeCompare(String(b.due_date||b.start_date)));
    if(!rows.length){body.innerHTML='<div class="tt-empty">در این ماه وظیفه زمان‌دار مطابق فیلترها وجود ندارد.</div>';return}
    const today=currentMonth(),todayIndex=today.y===month.y&&today.m===month.m?today.d-1:null,days=Array.from({length:max},(_,i)=>i+1);
    let html=`<div class="tt-gantt-wrap"><div class="tt-gantt" style="--day-count:${max}"><div class="tt-gantt-head"><div>شناسه</div><div>عنوان فعالیت</div><div class="tt-timeline-head"><div class="tt-days" style="grid-template-columns:repeat(${max},minmax(36px,1fr))">${days.map(d=>`<div class="tt-dayhead">${faNum(d)}</div>`).join('')}</div></div></div>`;
    for(const t of rows){
      const a=t.start_date||t.due_date,b=t.due_date||t.start_date,as=Math.max(startMs,new Date(a+'T12:00:00').getTime()),bs=Math.min(endMs,new Date(b+'T12:00:00').getTime()),start=Math.max(0,Math.round((as-startMs)/86400000)),span=Math.max(1,Math.round((bs-as)/86400000)+1);
      const wait=isWaiting(t),late=temporalState(t)==='دیرکرد';html+=`<div class="tt-gantt-row"><div>${faNum(taskId(t))}</div><div title="${esc(t.title)}">${esc(t.title)}</div><div class="tt-track" >${todayIndex!==null?`<i class="tt-today-line" style="right:${(todayIndex+0.5)/max*100}%"></i>`:''}<button class="tt-bar ${wait?'waiting-open':''} ${late?'overdue':''}" data-task="${t.id}" style="--c:${colorFor(t)};right:calc(${start/max*100}% + 2px);width:calc(${span/max*100}% - 4px)" title="#${esc(taskId(t))} — ${esc(t.title)}\nمتولی: ${esc(ownerNameLocal(t))}\n${esc(t.priority)}">${faNum(taskId(t))}${wait?' …':''}${late?' !':''}</button></div></div>`;
    }
    html+='</div></div>';body.innerHTML=html;qa('.tt-bar',body).forEach(b=>b.onclick=()=>{const t=activeTasks().find(x=>String(x.id)===b.dataset.task);if(t)openKanban(t)});
  }
  window.bamcoTimelineRefresh=()=>{if(q('#taskTimelineView')&&!q('#taskTimelineView').classList.contains('hidden')){fillFilters();render()}};
  function boot(){ensure();month=currentMonth();window.BamcoNavigation?.registerView?.('taskTimeline',{activate:activateView});document.addEventListener('bamco:profiles-updated',()=>window.bamcoTimelineRefresh())}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

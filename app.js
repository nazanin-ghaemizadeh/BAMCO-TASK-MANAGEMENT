const SB_URL='https://zhhongjhhbvpmoquvkhl.supabase.co';
const SB_KEY='sb_publishable_OtVZC49dnnQarqPv3XLgDw_EUKC7FtD';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fa=n=>String(n??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const en=n=>String(n??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const norm=s=>String(s??'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
const state={token:'',user:null,profile:null,profiles:[],tasks:[],requests:[],view:'dashboard',editing:null,reviewing:null,dateInput:null};

async function api(path,{method='GET',body,auth=true,prefer}={}){
  const headers={apikey:SB_KEY,'Content-Type':'application/json',Accept:'application/json'};
  if(auth&&state.token) headers.Authorization=`Bearer ${state.token}`;
  if(prefer) headers.Prefer=prefer;
  const res=await fetch(SB_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await res.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok) throw new Error(data?.message||data?.error_description||data?.error||'خطا در ارتباط با پایگاه داده.');
  return data;
}
const select=(table,q='select=*')=>api(`/rest/v1/${table}?${q}`);
const insert=(table,body)=>api(`/rest/v1/${table}`,{method:'POST',body,prefer:'return=representation'});
const update=(table,filter,body)=>api(`/rest/v1/${table}?${filter}`,{method:'PATCH',body,prefer:'return=representation'});
const rpc=(name,body)=>api(`/rest/v1/rpc/${name}`,{method:'POST',body});
const isManager=()=>state.profile?.role==='manager';
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.style.background=error?'#9b1c1c':'#123f33';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2800)}
function safe(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function displayId(t){return t.legacy_id||t.id}
function ownerName(t){return state.profiles.find(p=>p.id===t.owner_id)?.full_name||state.profiles.find(p=>p.id===t.owner_id)?.email||t.legacy_owner_name||'—'}

function persianParts(date){
  if(!date)return null;
  const d=typeof date==='string'?new Date(`${date}T12:00:00`):date;
  if(Number.isNaN(d.getTime()))return null;
  const parts=new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d);
  const get=t=>Number(parts.find(p=>p.type===t)?.value);
  return {y:get('year'),m:get('month'),d:get('day')};
}
function jalaliText(iso){const p=persianParts(iso);return p?fa(`${p.y}/${String(p.m).padStart(2,'0')}/${String(p.d).padStart(2,'0')}`):'—'}
function jalaliDateTime(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';const date=jalaliText(d);const time=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'}).format(d);return `${date}، ${time}`}
function jalaliToISO(y,m,d){
  y=Number(en(y));m=Number(en(m));d=Number(en(d));
  if(!y||m<1||m>12||d<1||d>31)return null;
  const approx=new Date(Date.UTC(y+621,2,18,12));
  for(let i=0;i<370;i++){
    const x=new Date(approx.getTime()+i*86400000),p=persianParts(x);
    if(p&&p.y===y&&p.m===m&&p.d===d)return x.toISOString().slice(0,10);
  }
  return null;
}
function daysInJalaliMonth(y,m){for(let d=31;d>=29;d--)if(jalaliToISO(y,m,d))return d;return 29}
function setJalaliField(jName,iso){const f=$('#taskForm');const j=f.elements[jName], hidden=f.elements[j?.dataset?.isoTarget];if(!j||!hidden)return;j.value=iso?jalaliText(iso):'';hidden.value=iso||''}
function currentJalali(){return persianParts(new Date())||{y:1405,m:1,d:1}}
function fillCalendarDays(){const y=Number($('#calYear').value),m=Number($('#calMonth').value),current=Number($('#calDay').value)||1,max=daysInJalaliMonth(y,m);$('#calDay').innerHTML=Array.from({length:max},(_,i)=>`<option value="${i+1}">${fa(i+1)}</option>`).join('');$('#calDay').value=String(Math.min(current,max))}
function openCalendar(inputName){
  state.dateInput=inputName;const f=$('#taskForm'),j=f.elements[inputName],hidden=f.elements[j.dataset.isoTarget],p=hidden.value?persianParts(hidden.value):currentJalali();
  $('#calendarLabel').textContent=j.closest('label')?.childNodes?.[0]?.textContent?.trim()||'تاریخ';
  const now=currentJalali();$('#calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${fa(y)}</option>`).join('');
  $('#calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');
  $('#calYear').value=String(p.y);$('#calMonth').value=String(p.m);fillCalendarDays();$('#calDay').value=String(p.d);$('#calendarDialog').showModal();
}
$$('.calendar-btn,.jalali-input').forEach(el=>el.addEventListener('click',()=>openCalendar(el.dataset.dateInput||el.name)));
$('#calYear').addEventListener('change',fillCalendarDays);$('#calMonth').addEventListener('change',fillCalendarDays);
$('#setDateBtn').addEventListener('click',()=>{const iso=jalaliToISO($('#calYear').value,$('#calMonth').value,$('#calDay').value);if(!iso)return toast('تاریخ انتخاب‌شده معتبر نیست.',true);setJalaliField(state.dateInput,iso);$('#calendarDialog').close()});
$('#clearDateBtn').addEventListener('click',()=>{setJalaliField(state.dateInput,'');$('#calendarDialog').close()});

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';
  try{const data=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:$('#email').value.trim(),password:$('#password').value}});state.token=data.access_token;state.user=data.user;sessionStorage.setItem('bamco_session',JSON.stringify({token:state.token,user:state.user}));await enterApp()}
  catch(err){$('#loginError').textContent=err.message}
});
async function enterApp(){
  const profiles=await select('profiles',`id=eq.${state.user.id}&select=*`);if(!profiles.length)throw new Error('پروفایل کاربر پیدا نشد.');state.profile=profiles[0];
  $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');
  $('#userName').textContent=state.profile.full_name||state.profile.email;$('#userRole').textContent=isManager()?'مدیر سامانه':'متولی';$('#avatar').textContent=(state.profile.full_name||'ب').trim()[0];
  $('#approvalsNav').classList.toggle('hidden',!isManager());$$('.manager-only').forEach(x=>x.classList.toggle('hidden',!isManager()));
  $('#viewSubtitle').textContent=isManager()?'نمای کلی وظایف و عملکرد همه متولیان':'فقط وظایف و عملکرد مربوط به شما';
  $('#kanbanScope').textContent=isManager()?'نمای همه متولیان':'فقط تسک‌های شما';$('#archiveScope').textContent=isManager()?'نمای همه متولیان':'فقط آرشیو شما';
  await refresh();showView('dashboard');
}
async function refresh(){
  try{
    state.profiles=isManager()?await select('profiles','select=id,email,full_name,role,active&active=eq.true&order=full_name'):[state.profile];
    state.tasks=await select('task_status_view','select=*&order=id.desc');
    state.requests=isManager()?await select('change_requests','select=*&request_status=eq.pending&order=created_at.asc'):[];
    renderAll();
  }catch(err){toast(err.message,true)}
}
function renderAll(){renderDashboard();renderTasks(false);renderTasks(true);if(isManager())renderRequests()}
function renderDashboard(){const active=state.tasks.filter(t=>!t.archived),archive=state.tasks.filter(t=>t.archived);
  $('#statActive').textContent=fa(active.length);$('#statArchive').textContent=fa(archive.length);$('#statOverdue').textContent=fa(active.filter(t=>norm(t.due_state)==='دیرکرد').length);$('#statWarning').textContent=fa(active.filter(t=>norm(t.due_state)==='دوره هشدار').length);
  const statuses=['ثبت شده','بررسی مدیر','منتظر پاسخ','در حال انجام'];const max=Math.max(1,...statuses.map(s=>active.filter(t=>norm(t.status)===s).length));
  $('#statusBars').innerHTML=statuses.map(s=>{const n=active.filter(t=>norm(t.status)===s).length;return `<div class="status-item"><span>${s}</span><strong>${fa(n)}</strong><div><i style="width:${n/max*100}%"></i></div></div>`}).join('');
  const due=active.filter(t=>t.due_date).sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,6);
  $('#dueList').innerHTML=due.length?due.map(t=>`<div class="due-row"><b>#${fa(displayId(t))}</b><span>${safe(t.title)}</span><span>${safe(ownerName(t))}</span><i class="pill ${norm(t.due_state)==='دیرکرد'?'overdue':norm(t.due_state)==='دوره هشدار'?'warning':''}">${safe(t.due_state||'عادی')}</i></div>`).join(''):'<div class="empty">تسک دارای تاریخ پایان وجود ندارد.</div>';
}
function renderTasks(archived){
  const query=(archived?$('#archiveSearch'):$('#kanbanSearch')).value.trim().toLowerCase();
  const rows=state.tasks.filter(t=>!!t.archived===archived).filter(t=>!query||[t.title,t.description,ownerName(t),t.status,t.priority,displayId(t)].some(v=>String(v??'').toLowerCase().includes(query)));
  const body=archived?$('#archiveBody'):$('#kanbanBody');if(!rows.length){body.innerHTML=`<tr><td colspan="${archived?7:8}" class="empty">موردی برای نمایش وجود ندارد.</td></tr>`;return}
  body.innerHTML=rows.map(t=>{const due=norm(t.due_state),rowClass=due==='دیرکرد'?'row-overdue':due==='دوره هشدار'?'row-warning':'';
    if(archived){let result='به‌موقع';if(t.done_date&&t.due_date)result=t.done_date>t.due_date?'تاخیر':t.done_date<t.due_date?'تعجیل':'به‌موقع';return `<tr><td>#${fa(displayId(t))}</td><td>${safe(t.title)}</td><td>${safe(ownerName(t))}</td><td><i class="pill ${t.priority==='فوری'?'urgent':''}">${safe(t.priority)}</i></td><td>${jalaliText(t.due_date)}</td><td>${jalaliText(t.done_date)}</td><td>${result}</td></tr>`}
    const editLabel=isManager()?'ویرایش':'درخواست تغییر',archiveLabel=isManager()?'آرشیو':'درخواست آرشیو';
    return `<tr class="${rowClass}"><td>#${fa(displayId(t))}</td><td>${safe(t.title)}</td><td>${safe(ownerName(t))}</td><td><i class="pill">${safe(t.status)}</i></td><td><i class="pill ${t.priority==='فوری'?'urgent':''}">${safe(t.priority)}</i></td><td>${jalaliText(t.due_date)}</td><td><i class="pill ${due==='دیرکرد'?'overdue':due==='دوره هشدار'?'warning':''}">${safe(t.due_state||'عادی')}</i></td><td><div class="row-actions"><button class="icon-btn" onclick="openEdit('${t.id}')">${editLabel}</button><button class="icon-btn" onclick="archiveTask('${t.id}')">${archiveLabel}</button></div></td></tr>`}).join('');
}
function renderRequests(){const names=Object.fromEntries(state.profiles.map(p=>[p.id,p.full_name||p.email]));const types={create:'افزودن',update:'ویرایش / تغییر وضعیت',archive:'آرشیو'};$('#approvalBadge').textContent=fa(state.requests.length);$('#approvalBadge').classList.toggle('hidden',!state.requests.length);
  $('#approvalBody').innerHTML=state.requests.length?state.requests.map(r=>`<tr><td>#${fa(r.id)}</td><td>${safe(names[r.requested_by]||'—')}</td><td><i class="pill">${types[r.request_type]||r.request_type}</i></td><td>${safe(r.proposed_data?.title||state.tasks.find(t=>String(t.id)===String(r.task_id))?.title||'—')}</td><td>${jalaliDateTime(r.created_at)}</td><td><button class="primary" onclick="openReview('${r.id}')">بررسی</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">درخواست منتظر تأییدی وجود ندارد.</td></tr>';
}
const titles={dashboard:'داشبورد',kanban:'کانبان وظایف',archive:'آرشیو وظایف',approvals:'تأیید درخواست‌ها'};
function showView(view){if(view==='approvals'&&!isManager())return;state.view=view;$$('.view').forEach(x=>x.classList.add('hidden'));$(`#${view}View`).classList.remove('hidden');$$('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$('#viewTitle').textContent=titles[view];$('#addTaskBtn').classList.toggle('hidden',view==='archive'||view==='approvals')}
$$('#nav button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
$('#kanbanSearch').addEventListener('input',()=>renderTasks(false));$('#archiveSearch').addEventListener('input',()=>renderTasks(true));$('#collapseBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('collapsed'));
$('#logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('bamco_session');location.reload()});$$('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));

function fillOwners(selected){const sel=$('#taskForm [name=owner_id]');const source=isManager()?state.profiles:[state.profile];sel.innerHTML=source.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${safe(p.full_name||p.email)}</option>`).join('');sel.disabled=!isManager()}
function openTask(task=null){state.editing=task;const f=$('#taskForm');f.reset();fillOwners(task?.owner_id||state.profile.id);$('#taskDialogTitle').textContent=task?(isManager()?'ویرایش تسک':'درخواست تغییر تسک'):(isManager()?'افزودن تسک':'درخواست تسک جدید');$('#taskDialogHint').textContent=isManager()?'تغییرات مدیر بلافاصله اعمال می‌شود.':'هیچ تغییری مستقیم اعمال نمی‌شود؛ درخواست شما باید توسط یکی از مدیران تأیید شود.';$('#saveTaskBtn').textContent=isManager()?(task?'ثبت تغییرات':'ثبت تسک'):'ارسال برای تأیید مدیر';
  if(task){for(const key of ['title','description','status','priority','reminder_days','manager_notes'])if(f.elements[key])f.elements[key].value=task[key]??'';setJalaliField('start_date_j',task.start_date);setJalaliField('due_date_j',task.due_date);setJalaliField('done_date_j',task.done_date)}else{setJalaliField('start_date_j','');setJalaliField('due_date_j','');setJalaliField('done_date_j','')}
  $('#taskDialog').showModal();
}
$('#addTaskBtn').addEventListener('click',()=>openTask());window.openEdit=id=>openTask(state.tasks.find(t=>String(t.id)===String(id)));
$('#taskForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const data=Object.fromEntries(new FormData(f));delete data.start_date_j;delete data.done_date_j;delete data.due_date_j;for(const k of ['start_date','done_date','due_date'])if(!data[k])data[k]=null;data.reminder_days=Number(data.reminder_days||0);if(!isManager())data.owner_id=state.profile.id;
  try{if(isManager()){if(state.editing)await update('tasks',`id=eq.${state.editing.id}`,data);else await insert('tasks',{...data,created_by:state.profile.id})}else{await insert('change_requests',{task_id:state.editing?.id||null,request_type:state.editing?'update':'create',proposed_data:data,requested_by:state.profile.id})}$('#taskDialog').close();toast(isManager()?'تغییرات ثبت شد.':'درخواست برای تأیید مدیر ارسال شد.');await refresh()}catch(err){toast(err.message,true)}});
window.archiveTask=async id=>{const task=state.tasks.find(t=>String(t.id)===String(id));if(!confirm(isManager()?`تسک «${task.title}» به آرشیو منتقل شود؟`:`درخواست آرشیو تسک «${task.title}» برای مدیر ارسال شود؟`))return;try{if(isManager())await update('tasks',`id=eq.${id}`,{archived:true,archived_at:new Date().toISOString(),status:'انجام شده',done_date:task.done_date||new Date().toISOString().slice(0,10)});else await insert('change_requests',{task_id:Number(id),request_type:'archive',proposed_data:{},requested_by:state.profile.id});toast(isManager()?'تسک آرشیو شد.':'درخواست آرشیو برای مدیر ارسال شد.');await refresh()}catch(err){toast(err.message,true)}};
window.openReview=id=>{state.reviewing=state.requests.find(r=>String(r.id)===String(id));const r=state.reviewing,types={create:'افزودن تسک',update:'ویرایش / تغییر وضعیت تسک',archive:'انتقال به آرشیو'};const task=state.tasks.find(t=>String(t.id)===String(r.task_id));$('#reviewDetails').innerHTML=`<p><b>نوع درخواست:</b> ${types[r.request_type]}</p><p><b>عنوان:</b> ${safe(r.proposed_data?.title||task?.title||'—')}</p><p><b>متولی:</b> ${safe(state.profiles.find(p=>p.id===r.proposed_data?.owner_id)?.full_name||ownerName(task||{}))}</p><p><b>وضعیت پیشنهادی:</b> ${safe(r.proposed_data?.status||'—')}</p><p><b>اولویت پیشنهادی:</b> ${safe(r.proposed_data?.priority||'—')}</p><p><b>تاریخ شروع:</b> ${jalaliText(r.proposed_data?.start_date)}</p><p><b>تاریخ پایان:</b> ${jalaliText(r.proposed_data?.due_date)}</p><p><b>تاریخ انجام:</b> ${jalaliText(r.proposed_data?.done_date)}</p>`;$('#managerNote').value='';$('#reviewDialog').showModal()};
async function review(decision){try{await rpc('review_change_request',{p_request_id:state.reviewing.id,p_decision:decision,p_manager_note:$('#managerNote').value.trim()||null});$('#reviewDialog').close();toast(decision==='approved'?'درخواست تأیید و اعمال شد.':'درخواست رد شد.');await refresh()}catch(err){toast(err.message,true)}}
$('#approveBtn').addEventListener('click',()=>review('approved'));$('#rejectBtn').addEventListener('click',()=>review('rejected'));

function xmlCell(v,style=''){return `<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="String">${safe(v??'')}</Data></Cell>`}
function sheetXml(name,rows){const header=['ID','عنوان کار','توضیحات','متولی','وضعیت','اولویت','تاریخ شروع','تاریخ انجام','تاریخ پایان','یادآور','آخرین بروزرسانی','وضعیت دیرکرد','توضیحات مدیر'];return `<Worksheet ss:Name="${name}"><Table><Row>${header.map(x=>xmlCell(x,'Header')).join('')}</Row>${rows.map(t=>`<Row>${[displayId(t),t.title,t.description,ownerName(t),t.status,t.priority,jalaliText(t.start_date),jalaliText(t.done_date),jalaliText(t.due_date),t.reminder_days,jalaliDateTime(t.last_updated_at),t.due_state,t.manager_notes].map(x=>xmlCell(x,norm(t.due_state)==='دیرکرد'?'Overdue':norm(t.due_state)==='دوره هشدار'?'Warning':'')).join('')}</Row>`).join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><DisplayRightToLeft/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`}
$('#exportBtn').addEventListener('click',()=>{const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#176B4D" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right"/></Style><Style ss:ID="Overdue"><Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right"/></Style><Style ss:ID="Warning"><Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/><Alignment ss:Horizontal="Right"/></Style></Styles>${sheetXml('KANBAN',state.tasks.filter(t=>!t.archived))}${sheetXml('Archive',state.tasks.filter(t=>t.archived))}</Workbook>`;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([xml],{type:'application/vnd.ms-excel'}));a.download=`BAMCO_Tasks_${jalaliText(new Date()).replaceAll('/','-')}.xls`;a.click();URL.revokeObjectURL(a.href);toast('خروجی اکسل آماده شد.')});

(async()=>{try{const saved=JSON.parse(sessionStorage.getItem('bamco_session')||'null');if(saved?.token&&saved?.user){state.token=saved.token;state.user=saved.user;await enterApp()}}catch{sessionStorage.removeItem('bamco_session')}})();

/* module:app:8 */
const BAMCO_STAGING=new URLSearchParams(location.search).get('env')==='staging'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
const SB_URL=BAMCO_STAGING?'https://lsfqjjynrajthxnhmjyj.supabase.co':'https://zhhongjhhbvpmoquvkhl.supabase.co';
const SB_KEY=BAMCO_STAGING?'sb_publishable_UasmuRBTVQyAyPMI0TEydg_1FyX8be7':'sb_publishable_OtVZC49dnnQarqPv3XLgDw_EUKC7FtD';
// Clear only this app's transient data; preserve sign-in and sticker caches.
function clearTransientCaches(){
 const marker='bamco.cache-reset.workspace-20260910-2';
 try{if(localStorage.getItem(marker))return;for(const storage of [localStorage,sessionStorage]){
  for(const key of Object.keys(storage))if(/^bamco[._-]/i.test(key)&&!/(sticker|auth|session|login|password|department)/i.test(key))storage.removeItem(key);
 }localStorage.setItem(marker,'1')}catch{}
 if(typeof caches!=='undefined')caches.keys().then(async names=>{for(const name of names){if(!/bamco/i.test(name)||/sticker/i.test(name))continue;const cache=await caches.open(name);for(const request of await cache.keys())if(!/sticker/i.test(request.url))await cache.delete(request)}}).catch(()=>{});
}
clearTransientCaches();

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fa=n=>String(n??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
const en=n=>String(n??'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const norm=s=>String(s??'').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();
const state=globalThis.Bamco.state=Object.assign(globalThis.Bamco.state||{}, {token:'',user:null,profile:null,profiles:[],tasks:[],requests:[],requestHistory:[],definitionRequests:[],requestRoutes:[],organizationScope:{loaded:false,rows:[],positionIds:[],ownPositionIds:[],directReportUserIds:[],descendantUserIds:[],hasSubordinates:false},dashboardMonitoringStart:window.bamcoDashboardMetrics?.DEFAULT_MONITORING_START||'2026-09-06T00:00:00Z',view:'dashboard',editing:null,reviewing:null,reviewEdit:null,resubmitting:null,amendingRequest:null,dateInput:null,selected:{kanban:null,archive:null}});
// Remove the former profile-shaped organization projection on hot reloads too.
delete state.organizationScope?.people;

// Authentication is always addressed by the internal login identity.  A
// corporate profile email is not an Auth credential and must never be sent to
// GoTrue as though it were one.  Legacy email-like logins retain their local
// part during the one-time credential migration.
function loginEmail(value){
  let login=String(value||'').trim().toLowerCase();
  if(login.endsWith('@no-email.invalid'))login=login.slice(0,-'@no-email.invalid'.length);
  else if(login.includes('@'))login=login.slice(0,login.indexOf('@'));
  return login+'@no-email.invalid';
}

function apiErrorMessage(data,status){
  const code=data?.code||data?.error_code;
  const raw=[code,data?.msg,data?.message,data?.error_description,data?.error].filter(Boolean).join(' ').toLowerCase();
  if(code==='invalid_credentials'||raw.includes('invalid login credentials')||raw.includes('invalid credentials'))return 'نام کاربری یا رمز اشتباه است.';
  const messages={
    invalid_credentials:'نام کاربری یا رمز اشتباه است.',
    email_not_confirmed:'ایمیل این حساب هنوز تأیید نشده است.',
    user_banned:'دسترسی این حساب مسدود شده است؛ با مدیر سامانه تماس بگیرید.',
    over_request_rate_limit:'تعداد تلاش‌ها بیش از حد مجاز است؛ چند دقیقه دیگر دوباره امتحان کنید.',
    over_email_send_rate_limit:'تعداد درخواست‌های ایمیل بیش از حد مجاز است؛ کمی بعد دوباره امتحان کنید.'
  };
  if(messages[code])return messages[code];
  return data?.msg||data?.message||data?.error_description||data?.error||
    (status>=500?'سرویس پایگاه داده موقتاً در دسترس نیست.':'درخواست به پایگاه داده انجام نشد.');
}

const safeReadRpcs=new Set(['chat_directory_v3','chat_directory_v2','chat_directory','chat_conversation_list','chat_system_message_payload','resolve_message_sticker']);
window.bamcoNetworkErrors=[];
async function api(path,{method='GET',body,auth=true,prefer,keepalive=false}={}){
 const session=window.bamcoAuth?.snapshot?.(),current=()=>session?window.bamcoAuth.isCurrent(session):token===state.token;
 const token=state.token,headers={apikey:SB_KEY,'Content-Type':'application/json',Accept:'application/json'};
 if(auth&&token)headers.Authorization=`Bearer ${token}`;if(prefer)headers.Prefer=prefer;
 const endpoint=path.split('?')[0],readOnly=method==='GET'||(method==='POST'&&safeReadRpcs.has(endpoint.split('/').pop()));
 const taskMutation=method!=='GET'&&(endpoint==='/rest/v1/tasks'||(endpoint==='/functions/v1/admin-users'&&method==='DELETE')||['delete_tasks_and_resequence','restore_tasks_to_kanban_and_resequence','review_request_stage'].includes(endpoint.split('/').pop()));
 if(taskMutation)state.taskRevision=(state.taskRevision||0)+1;
 for(let attempt=0;attempt<(readOnly?2:1);attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   if(auth&&!current())throw new Error('حساب ورود تغییر کرده است.');
   if(auth&&state.token)headers.Authorization=`Bearer ${state.token}`;
   const res=await fetch(SB_URL+path,{method,headers,keepalive,cache:'no-store',signal:controller.signal,body:body===undefined?undefined:JSON.stringify(body)});
   const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
   if(!res.ok){const error=new Error(apiErrorMessage(data,res.status));error.status=res.status;error.code=data?.code;throw error}
   if(auth&&!current())throw new Error('نشست کاربری تغییر کرده است؛ صفحه موردنظر را دوباره باز کنید.');
   return data;
  }catch(err){
   const network=err.name==='TypeError'||err.name==='AbortError'||controller.signal.aborted,temporary=network||[502,503,504].includes(err.status);
   if(readOnly&&attempt===0&&temporary&&(!auth||current())&&navigator.onLine!==false){await new Promise(resolve=>setTimeout(resolve,350));continue}
   if(network){const detail=navigator.onLine===false?'اتصال اینترنت قطع است.':controller.signal.aborted?'پاسخ سرور در زمان مقرر دریافت نشد.':'ارتباط با سرور برقرار نشد.';const error=new Error(detail+(readOnly?' دوباره تلاش کنید.':' نتیجه عملیات مشخص نیست؛ پیش از تکرار، وضعیت آن را بررسی کنید.'));error.code='NETWORK_ERROR';error.cause=err;err=error}
   window.bamcoNetworkErrors.push({endpoint,method,status:err.status||0,code:err.code||'REQUEST_ERROR',at:new Date().toISOString()});if(window.bamcoNetworkErrors.length>30)window.bamcoNetworkErrors.shift();
   throw err;
  }finally{clearTimeout(timer);if(taskMutation)state.taskRevision=(state.taskRevision||0)+1}
 }
}

const select=(table,q='select=*')=>api(`/rest/v1/${table}?${q}`);
const selectAllPending=new Map();
function selectAll(table,q='select=*',pageSize=1000){
 const identity=window.bamcoAuth?.snapshot?.()||{token:state.token};
 const key=JSON.stringify([identity,table,q,pageSize,state.taskRevision||0]);
 if(selectAllPending.has(key))return selectAllPending.get(key);
 const job=selectAllPages(table,q,pageSize).finally(()=>{if(selectAllPending.get(key)===job)selectAllPending.delete(key)});
 selectAllPending.set(key,job);return job;
}
async function selectAllPages(table,q='select=*',pageSize=1000){
  const rows=[];
  for(let from=0;;from+=pageSize){
    const page=await api(`/rest/v1/${table}?${q}&offset=${from}&limit=${pageSize}`);
    rows.push(...page);
    if(page.length<pageSize)return rows;
  }
}
const insert=(table,body)=>api(`/rest/v1/${table}`,{method:'POST',body,prefer:'return=representation'});
const update=(table,filter,body)=>api(`/rest/v1/${table}?${filter}`,{method:'PATCH',body,prefer:'return=representation'});
const rpc=(name,body)=>api(`/rest/v1/rpc/${name}`,{method:'POST',body});
// Domain modules use this one data boundary rather than reaching into page-local
// helpers.  It keeps persistence, session handling and API errors consistent.
globalThis.BamcoData=Object.freeze({select,selectAll,insert,update,rpc});
// `manager` remains the system-administration role.  It is deliberately not
// used as a shortcut for organizational reporting authority: that relationship
// comes only from the active position tree below.
const isManager=()=>state.profile?.role==='manager';

function profileList(){
  const profiles=window.BamcoProfiles;
  if(typeof profiles?.list==='function')return profiles.list();
  if(typeof profiles?.all==='function')return profiles.all();
  return state.profiles||[];
}
function profileById(id){
  if(!id)return null;
  const profiles=window.BamcoProfiles;
  if(typeof profiles?.get==='function')return profiles.get(id)||null;
  return profileList().find(person=>String(person.id)===String(id))||null;
}
function profileLabel(id,fallback='—'){
  const profiles=window.BamcoProfiles;
  // Preserve the caller's intentional fallback.  Passing no fallback to the
  // canonical store turns a missing owner into its default em dash, which is
  // truthy and used to hide retained historical owner snapshots after account
  // deletion.  Current people still resolve by immutable user id; the
  // snapshot is only used when that id no longer exists.
  if(typeof profiles?.label==='function')return profiles.label(id,fallback)||fallback;
  const person=profileById(id);
  return person?.display_name||person?.full_name||person?.email||fallback;
}
function syncCanonicalProfiles(rows,{replaceAll=false}={}){
  const incoming=(rows||[]).filter(row=>row?.id);
  const profiles=window.BamcoProfiles;
  if(typeof profiles?.upsert==='function')profiles.upsert(incoming,{replaceAll});
  else window.bamcoPeople?.syncProfiles?.(incoming,{replaceAll});
  if(typeof profiles?.list==='function'||typeof profiles?.all==='function')state.profiles=profileList();
  else if(replaceAll)state.profiles=incoming;
  else{
    const byId=new Map((state.profiles||[]).map(person=>[String(person.id),person]));
    incoming.forEach(person=>byId.set(String(person.id),person));state.profiles=[...byId.values()];
  }
  return state.profiles;
}
function featureAllowed(featureKey,action='view'){
  const access=window.BamcoAccess;
  if(typeof access?.can==='function')return access.can(featureKey,action)===true;
  if(typeof window.canAccessFeature==='function')return window.canAccessFeature(featureKey,action)===true;
  // Until the authorization service has completed its initial snapshot, leave
  // the visible control available and let the server fail closed.  This avoids
  // treating a missing client cache as an authorization decision.
  return true;
}
function hasApprovalBypass(){
  const access=window.BamcoAccess;
  if(typeof access?.can==='function'||typeof window.canAccessFeature==='function')return featureAllowed('approvals','bypass_approval');
  return isManager();
}
function emptyOrganizationScope(){return{loaded:false,rows:[],positionIds:[],ownPositionIds:[],ownRoleKeys:[],directReportUserIds:[],descendantUserIds:[],hasSubordinates:false}}
function scopedTaskProfiles(){
  const currentId=state.user?.id;
  if(isManager())return profileList();
  const ids=new Set([currentId,...(state.organizationScope?.descendantUserIds||[]),...(state.organizationScope?.directReportUserIds||[])].filter(Boolean).map(String));
  const people=profileList().filter(person=>ids.has(String(person.id)));
  if(people.length)return people;
  return state.profile?[state.profile]:[];
}
function taskSubjectId(task){return task?.owner_id||task?.created_by||null}
function isOwnTask(task){return !!task&&String(taskSubjectId(task))===String(state.user?.id)}
function isStrictDescendant(userId){return !!userId&&(state.organizationScope?.descendantUserIds||[]).some(id=>String(id)===String(userId))}
function isOrganizationManager(){return (state.organizationScope?.ownRoleKeys||[]).includes('manager')}
function canDirectlyManageTask(task,action='edit'){
  if(!task||!featureAllowed('kanban',action))return false;
  return hasApprovalBypass()||isStrictDescendant(taskSubjectId(task))||(isOrganizationManager()&&isOwnTask(task));
}
function canDirectlyCreateFor(userId){
  if(!featureAllowed('kanban','create'))return false;
  // A system-level, explicit bypass can create an unassigned registered task.
  // Ordinary organizational authority always needs a real, strict-descendant
  // target; a missing owner must not turn into a supervisory bypass.
  return hasApprovalBypass()||!!userId&&isStrictDescendant(userId);
}
function canManageOrganizationTasks(){return hasApprovalBypass()||isOrganizationManager()||(state.organizationScope?.descendantUserIds||[]).length>0}
async function refreshOrganizationScope({silent=false}={}){
  const userId=state.user?.id;
  if(!userId||!state.token){state.organizationScope=emptyOrganizationScope();return state.organizationScope}
  try{
    let rows;
    try{rows=await rpc('organization_scope_directory_with_avatars',{})}
    catch{rows=await rpc('organization_scope_directory',{})}
    if(state.user?.id!==userId||!state.token)return state.organizationScope;
    const directory=Array.isArray(rows)?rows:[];
    const ownPositions=new Set(directory.filter(row=>row.is_current_position).map(row=>String(row.position_id)));
    const ownRoleKeys=[...new Set(directory.filter(row=>row.is_current_position).map(row=>String(row.role_key||'').trim()).filter(Boolean))];
    const peopleById=new Map();
    for(const row of directory){
      if(!row?.occupant_id)continue;
      peopleById.set(String(row.occupant_id),{
        id:row.occupant_id,
        display_name:row.occupant_display_name||row.occupant_full_name||row.occupant_email||'—',
        full_name:row.occupant_full_name||row.occupant_display_name||row.occupant_email||'—',
        email:row.occupant_email||'',
        active:row.occupant_active!==false,
        organization_position_id:row.position_id,
        organization_position_title:row.position_title,
        organization_role_title:row.role_title,
        avatar_path:row.occupant_avatar_path||null,
        updated_at:row.occupant_updated_at||null
      });
    }
    const rawPeople=[...peopleById.values()];
    syncCanonicalProfiles(rawPeople);
    const ownPositionIds=[...ownPositions];
    const childrenByParent=new Map();
    for(const row of directory){
      const parent=row?.parent_position_id==null?null:String(row.parent_position_id),child=row?.position_id==null?null:String(row.position_id);
      if(!child||parent===null)continue;
      const children=childrenByParent.get(parent)||[];children.push(child);childrenByParent.set(parent,children);
    }
    const directPositionIds=new Set(),descendantPositionIds=new Set(),walk=[...ownPositionIds];
    for(const ownId of ownPositionIds)for(const child of childrenByParent.get(String(ownId))||[])directPositionIds.add(child);
    while(walk.length){
      const parent=String(walk.shift());
      for(const child of childrenByParent.get(parent)||[]){
        if(descendantPositionIds.has(child)||ownPositions.has(child))continue;
        descendantPositionIds.add(child);walk.push(child);
      }
    }
    const directReportUserIds=[],descendantUserIds=[];
    for(const row of directory){
      const positionId=String(row?.position_id||'');if(!row?.occupant_id||!positionId)continue;
      if(directPositionIds.has(positionId))directReportUserIds.push(String(row.occupant_id));
      if(descendantPositionIds.has(positionId))descendantUserIds.push(String(row.occupant_id));
    }
    state.organizationScope={
      loaded:true,
      rows:directory,
      positionIds:[...new Set(directory.map(row=>String(row.position_id)).filter(Boolean))],
      ownPositionIds,
      ownRoleKeys,
      directReportUserIds:[...new Set(directReportUserIds)],
      descendantUserIds:[...new Set(descendantUserIds)],
      hasSubordinates:descendantUserIds.length>0
    };
  }catch(error){
    // A pre-migration client can still show the user's own work.  The server is
    // the authority when the organizational-scope RPC is available.
    state.organizationScope=emptyOrganizationScope();
    if(!silent)console.warn('Organization scope could not be loaded.',error);
  }
  document.dispatchEvent(new CustomEvent('bamco:organization-scope-updated',{detail:state.organizationScope}));
  return state.organizationScope;
}
window.bamcoOrganizationAccess=Object.freeze({
  refresh:refreshOrganizationScope,
  directory:()=>state.organizationScope?.rows||[],
  people:scopedTaskProfiles,
  positionIds:()=>state.organizationScope?.positionIds||[],
  ownPositionIds:()=>state.organizationScope?.ownPositionIds||[],
  isOrganizationManager,
  directReportUserIds:()=>state.organizationScope?.directReportUserIds||[],
  descendantUserIds:()=>state.organizationScope?.descendantUserIds||[],
  isOwnTask,
  isStrictDescendant,
  canDirectlyManageTask,
  canDirectlyCreateFor,
  canBypassApproval:hasApprovalBypass,
  requiresApproval:task=>!canDirectlyManageTask(task),
  canManageTasks:canManageOrganizationTasks,
  hasSubordinates:()=>!!state.organizationScope?.hasSubordinates,
  canManagePerson:id=>isManager()||isStrictDescendant(id),
  canViewPerson:id=>String(id)===String(state.user?.id)||isManager()||scopedTaskProfiles().some(person=>String(person.id)===String(id))
});
window.bamcoLoadRequestWorkflow=async function(){
  const newest=rows=>[...(rows||[])].sort((a,b)=>(Date.parse(b.created_at||0)||0)-(Date.parse(a.created_at||0)||0)||Number(b.id||0)-Number(a.id||0));
  const terminal=new Set(['approved','rejected','cancelled']);
  try{
    const snapshot=await rpc('request_workflow_snapshot',{});
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!Array.isArray(snapshot.current_requests)||!Array.isArray(snapshot.history_requests)||!Array.isArray(snapshot.routes))throw new Error('workflow snapshot unavailable');
    return{requests:newest(snapshot.current_requests),history:newest(snapshot.history_requests).filter(r=>terminal.has(r.request_status)),routes:snapshot.routes};
  }catch(error){
    // Do not fall back to REST reads of change_requests.  That old path could
    // not represent the current organizational approver safely and leaked the
    // workbench model into ordinary requester lists.
    const unavailable=new Error('کارتابل تأیید در حال حاضر در دسترس نیست. دوباره تلاش کنید.');
    unavailable.cause=error;throw unavailable;
  }
};
function toast(message,error=false){return window.bamcoToast?window.bamcoToast(message,error):window.bamcoNotice(message,{error})}
function safe(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function displayId(t){return t.legacy_id||t.id}
function ownerName(t){const current=profileLabel(t?.owner_id,'');return current||(t.owner_deleted_at?(t.former_owner_name||'متولی قبلی')+(t.archived||t.status==='انجام شده'?' (حساب حذف شده)':' (متولی حذف شده؛ نیازمند تعیین تکلیف)'):t?.legacy_owner_name)||'—'}
function languageClass(value){return /[\u0600-\u06ff]/.test(String(value??''))?'fa-text':'en-text'}
function cell(value,formatted=value){return `<td class="${languageClass(value)}">${safe(formatted??'')}</td>`}
const tableFilters={kanban:{},archive:{}};

const persianDateFormatter=new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'});
const persianTimeFormatter=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'});
function persianParts(date){
  if(!date)return null;
  const d=typeof date==='string'?new Date(`${date}T12:00:00`):date;
  if(Number.isNaN(d.getTime()))return null;
  const parts=persianDateFormatter.formatToParts(d);
  const get=t=>Number(parts.find(p=>p.type===t)?.value);
  return {y:get('year'),m:get('month'),d:get('day')};
}
function jalaliText(iso){const p=persianParts(iso);return p?fa(`${p.y}/${String(p.m).padStart(2,'0')}/${String(p.d).padStart(2,'0')}`):'—'}
function jalaliDateTime(value){if(!value)return'—';const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';const date=jalaliText(d);const time=persianTimeFormatter.format(d);return `${date}، ${time}`}
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

function showLogin(){
  window.bamcoAuth?.clear();window.bamcoSession?.clear();
  window.BamcoProfiles?.clear?.();
  window.BamcoAccess?.clear?.();
  window.bamcoConversations?.close();window.bamcoChat?.close();
  sessionStorage.removeItem('bamco_session');
  Object.assign(state,{workspaceRefreshPromise:null,token:'',user:null,profile:null,profiles:[],tasks:[],requests:[],requestHistory:[],definitionRequests:[],requestRoutes:[],organizationScope:{loaded:false,rows:[],positionIds:[],ownPositionIds:[],directReportUserIds:[],descendantUserIds:[],hasSubordinates:false},dashboardMonitoringStart:window.bamcoDashboardMetrics?.DEFAULT_MONITORING_START||'2026-09-06T00:00:00Z',view:'dashboard',editing:null,reviewing:null,reviewEdit:null,resubmitting:null,amendingRequest:null,dateInput:null,selected:{kanban:null,archive:null}});
  $('#appView').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;
  try{const data=await api('/auth/v1/token?grant_type=password',{method:'POST',auth:false,body:{email:loginEmail($('#email').value),password:$('#password').value}});window.bamcoAuth.accept(data);await enterApp()}
  catch(err){showLogin();$('#loginError').textContent=err.message}
  finally{submit.disabled=false}
});
async function enterApp(){
  const enteringUser=state.user.id;
  void window.bamcoPrepareWelcomeStickers?.();
  // Authentication and the canonical profile are the admission gate.  Session
  // presence is audit/telemetry: a temporary failure to record it must never
  // turn a valid Supabase login into a false "cannot sign in" result or keep
  // the person on the login screen while that non-authoritative call is slow.
  // The session runtime retries in the background; management views retain
  // their own strict checks when they actually need an audit record.
  const profileLoad=select('profiles',`id=eq.${enteringUser}&select=*`);
  const auditStart=Promise.resolve().then(()=>window.bamcoSession?.start());
  const reportAuditUnavailable=error=>{
    console.warn('BAMCO session audit unavailable at sign-in',error?.message||error);
    document.dispatchEvent(new CustomEvent('bamco:session-audit-unavailable',{detail:{user_id:enteringUser}}));
  };
  // Handle the audit promise independently so it can never surface as an
  // unhandled rejection after the authenticated workspace has opened.
  void auditStart.catch(reportAuditUnavailable);
  const closeAuditAfterFailedAdmission=async()=>{
    try{await auditStart;await window.bamcoSession?.end('logout')}
    catch(error){console.warn('BAMCO session audit cleanup failed',error?.message||error)}
  };
  let profiles;
  try{profiles=await profileLoad}
  catch(error){await closeAuditAfterFailedAdmission();throw error}
  if(state.user?.id!==enteringUser)throw Error('نشست ورود تغییر کرده است.');
  if(!profiles.length||profiles[0].active===false){
    await closeAuditAfterFailedAdmission();
    throw Error(profiles.length?'حساب کاربری غیرفعال است.':'پروفایل کاربر پیدا نشد.');
  }
  state.profile=profiles[0];syncCanonicalProfiles([state.profile]);
  await window.BamcoAccess?.refresh?.();
  await refreshOrganizationScope({silent:true});
  void window.BamcoDomainSync?.start?.();
  $('#userName').textContent=state.profile.display_name||state.profile.full_name||state.profile.email;$('#userRole').textContent=isManager()?'مدیر سامانه':canManageOrganizationTasks()?'سرپرست سازمانی':'متولی';$('#avatar').textContent=(state.profile.display_name||state.profile.full_name||'ب').trim()[0];if(!state.profile.must_change_password)window.refreshProfileAvatar?.();
  // Navigation visibility is owned by BamcoAccess; manager-only CSS classes
  // are presentation remnants and must not override an effective grant.
  window.BamcoAccess?.applyNavigation?.();
  if(!window.BamcoAccess)$('#approvalsNav').classList.remove('hidden');
  $$('.hierarchy-authority-action').forEach(x=>x.classList.remove('hidden'));
  $('#viewSubtitle').textContent=isManager()?'نمای کلی وظایف و عملکرد همه متولیان':canManageOrganizationTasks()?'نمای وظایف خود و زیردستان سازمانی':'فقط وظایف و عملکرد مربوط به شما';
  $('#kanbanScope').textContent=isManager()?'نمای همه متولیان':canManageOrganizationTasks()?'نمای خود و زیردستان سازمانی':'فقط وظایف شما';$('#archiveScope').textContent=isManager()?'نمای همه متولیان':canManageOrganizationTasks()?'آرشیو خود و زیردستان سازمانی':'فقط آرشیو شما';
  void window.bamcoInbox?.load();
  if(window.matchMedia('(max-width:760px)').matches)$('#sidebar').classList.add('collapsed');
  $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');
  window.bamcoShowHome?.();
  if(state.profile.must_change_password){$('#cancelPasswordBtn').classList.add('hidden');$('#passwordDialog').showModal()}else{
    if(window.bamcoOpenHomeWelcome)window.bamcoOpenHomeWelcome();else showView('kanban');
    void refresh().catch(()=>{});
  }
}
async function refresh(){
  try{
    const profiles=isManager()?await select('profiles','select=id,email,login_name,must_change_password,password_changed_at,full_name,display_name,gender,mobile_phone,internal_extension,excel_name,role,active,default_message_channel,messaging_enabled,avatar_path,updated_at&order=full_name'):scopedTaskProfiles();
    syncCanonicalProfiles(profiles,{replaceAll:isManager()});
    state.tasks=await selectAll('task_status_view','select=*&order=id.desc');
    const workflow=await window.bamcoLoadRequestWorkflow();
    state.requests=workflow.requests;state.requestHistory=workflow.history;state.requestRoutes=workflow.routes;state.definitionRequests=[...workflow.requests,...workflow.history];
    renderAll();
  }catch(err){toast(err.message,true);throw err}
}
function renderAll(){window.renderDashboard?.();renderTasks(false);renderTasks(true);renderRequests();renderRequestHistory()}
function renderTasks(archived){
  const query=(archived?$('#archiveSearch'):$('#kanbanSearch')).value.trim().toLowerCase();
  const scope=archived?'archive':'kanban',allRows=state.tasks.filter(t=>!!t.archived===archived&&(archived||!window.bamcoTaskTransfer||window.bamcoTaskTransfer.includes(t))),filters=tableFilters[scope];
  updateColumnFilters(scope,allRows,archived);
  const rows=allRows.filter(t=>!query||[t.title,t.description,ownerName(t),t.status,t.priority,displayId(t)].some(v=>String(v??'').toLowerCase().includes(query))).filter(t=>taskColumnValues(t,archived).every((v,i)=>!filters[i]||String(v??'')===filters[i]));
  const body=archived?$('#archiveBody'):$('#kanbanBody');if(!rows.some(t=>String(t.id)===String(state.selected[scope])))state.selected[scope]=null;if(!rows.length){body.innerHTML=`<tr><td colspan="${archived?15:13}" class="empty">موردی برای نمایش وجود ندارد.</td></tr>`;updateTaskToolbar(scope);return}
  body.innerHTML=rows.map(t=>{const due=norm(t.due_state),status=norm(t.status),rowClass=window.bamcoOptions.kind(t)==='waiting'?'row-waiting':due==='دیرکرد'?'row-overdue':due.includes('هشدار')?'row-warning':'row-normal';
    const dueText=window.bamcoOptions.kind(t)==='waiting'?'فاقد شرایط دیرکرد':due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد';
    const common=`${cell(displayId(t),fa(displayId(t)))}${cell(t.title)}${cell(t.description||'')}${cell(ownerName(t))}${window.bamcoOptions.cell('status',t)}${window.bamcoOptions.cell('priority',t)}${cell(jalaliText(t.start_date))}${cell(jalaliText(t.done_date))}${cell(jalaliText(window.bamcoOptions.kind(t)==='waiting'?null:t.due_date))}${cell(fa(window.bamcoOptions.kind(t)==='waiting'?0:t.reminder_days))}${cell(jalaliDateTime(t.last_updated_at))}${cell(dueText)}${cell(t.manager_notes||'')}`;
    const selected=String(state.selected[scope])===String(t.id);
    if(archived)return `<tr class="${rowClass} ${selected?'task-selected':''}" data-task-id="${t.id}" data-scope="archive">${common}${cell(fa(t.delay_days||0))}${cell(fa(t.advance_days||0))}</tr>`;
    return `<tr class="${rowClass} ${selected?'task-selected':''}" data-task-id="${t.id}" data-scope="kanban">${common}</tr>`}).join('');
  updateTaskToolbar(scope);
}
function taskColumnValues(t,archived){const waiting=window.bamcoOptions.kind(t)==='waiting',due=norm(t.due_state),dueText=waiting?'فاقد شرایط دیرکرد':due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد',base=[displayId(t),t.title,t.description||'',ownerName(t),t.status,t.priority,jalaliText(t.start_date),jalaliText(t.done_date),jalaliText(waiting?null:t.due_date),fa(waiting?0:t.reminder_days),jalaliDateTime(t.last_updated_at),dueText,t.manager_notes||''];return archived?[...base,fa(t.delay_days||0),fa(t.advance_days||0)]:base}
function updateColumnFilters(scope,rows,archived){const tr=$(`#${scope}View .column-filters`);if(!tr)return;const filters=tableFilters[scope],count=archived?15:13;while(tr.children.length>count)tr.lastElementChild.remove();while(tr.children.length<count)tr.insertAdjacentHTML('beforeend','<th><select><option value="">همه</option></select></th>');[...tr.children].forEach((th,i)=>{const selectEl=th.querySelector('select'),current=filters[i]||'',values=[...new Set(rows.map(t=>String(taskColumnValues(t,archived)[i]??'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fa'));selectEl.innerHTML='<option value="">همه</option>'+values.map(v=>`<option value="${safe(v)}" ${v===current?'selected':''}>${safe(v)}</option>`).join('');selectEl.className=languageClass(current)})}
$$('.column-filters').forEach(tr=>tr.addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;const scope=tr.closest('.view').id.startsWith('archive')?'archive':'kanban';tableFilters[scope][e.target.closest('th').cellIndex]=e.target.value;renderTasks(scope==='archive')}));
function selectedTask(scope){return state.tasks.find(t=>String(t.id)===String(state.selected[scope]))}
function updateTaskToolbar(scope){const picked=!!selectedTask(scope);for(const suffix of ['EditBtn','DeleteBtn'])$(`#${scope}${suffix}`)?.toggleAttribute('disabled',!picked);if(scope==='kanban')$('#kanbanArchiveBtn')?.toggleAttribute('disabled',!picked);else $('#archiveRestoreBtn')?.toggleAttribute('disabled',!picked)}
function chooseTask(scope,id){const next=String(state.selected[scope])===String(id)?null:Number(id);state.selected[scope]=next;renderTasks(scope==='archive')}
for(const body of [$('#kanbanBody'),$('#archiveBody')])body.addEventListener('click',e=>{const row=e.target.closest('tr[data-task-id]');if(row)chooseTask(row.dataset.scope,row.dataset.taskId)});
// Default order belongs to the data renderer, not a competing DOM observer.
function newestRequestRows(rows){
  const stamp=r=>{const value=Date.parse(r.created_at);return Number.isFinite(value)?value:0};
  return [...(rows||[])].sort((a,b)=>stamp(b)-stamp(a)||String(b.id).localeCompare(String(a.id),'en',{numeric:true}));
}
const requestTypeLabels={create:'تعریف فعالیت جدید',update:'ویرایش وظیفه',status:'تغییر وضعیت',priority:'تغییر اولویت',description:'تغییر توضیحات',complete:'اعلام انجام',delete:'درخواست حذف',due_date:'تغییر تاریخ پایان'};
const requestFieldLabels={title:'عنوان',description:'توضیحات',owner_id:'متولی',status:'وضعیت',priority:'اولویت',start_date:'تاریخ شروع',due_date:'تاریخ پایان',done_date:'تاریخ انجام',reminder_days:'یادآور',manager_notes:'توضیحات مدیر',archived:'آرشیو'};
function requestChangedFields(row){
  if(!row||row.request_type!=='update')return[];
  const data=row.proposed_data||{},task=state.tasks.find(item=>String(item.id)===String(row.task_id)),before=data.original_data||task||{};
  const normalized=value=>value==null?'':String(value);
  if(Array.isArray(data.changed_fields))return data.changed_fields.map(key=>requestFieldLabels[key]||key).filter(Boolean);
  return Object.keys(requestFieldLabels).filter(key=>Object.prototype.hasOwnProperty.call(data,key)&&normalized(data[key])!==normalized(before[key])).map(key=>requestFieldLabels[key]);
}
function requestTypeLabel(row){
  const type=row?.request_type||row;
  if(row?.proposed_data?.request_context==='project_activity'){
    if(type==='create')return'تعریف فعالیت در پروژه';
    if(type==='delete')return'حذف فعالیت پروژه';
    const fields=requestChangedFields(row);return`ویرایش فعالیت پروژه${fields.length?' - '+fields.join('، '):''}`;
  }
  const label=requestTypeLabels[type]||type||'—',fields=requestChangedFields(row);
  return type==='update'&&fields.length?`${label} - ${fields.join('، ')}`:label;
}
globalThis.bamcoRequestTypeLabel=requestTypeLabel;
function workbenchRequestRows(){return[...(state.requests||[])];}
function renderRequests(){
  const statuses={pending:'در انتظار بررسی',in_review:'در زنجیره تأیید',needs_revision:'در انتظار اصلاح',approved:'تأیید',rejected:'رد',cancelled:'لغوشده'},routeById=new Map((state.requestRoutes||[]).map(x=>[String(x.request_id),x])),rows=newestRequestRows(workbenchRequestRows()),actionable=(state.requests||[]).filter(request=>routeById.get(String(request.id))?.actionable===true||(request.request_status==='needs_revision'&&String(request.requested_by)===String(state.user?.id)));
  $('#approvalBadge').textContent=fa(actionable.length);$('#approvalBadge').classList.toggle('hidden',!actionable.length);
  $('#approvalBody').innerHTML=rows.length?rows.map((r,index)=>{
    const route=routeById.get(String(r.id)),terminal=['approved','rejected','cancelled'].includes(r.request_status),mine=String(r.requested_by)===String(state.user?.id),task=state.tasks.find(t=>String(t.id)===String(r.task_id)),revisionOwner=profileLabel(r.proposed_data?.owner_id||task?.owner_id||r.requested_by,r.requester_name_snapshot||'متولی'),revisionText=`<span class="request-revision-state"><i aria-hidden="true"></i>در انتظار اصلاح ${safe(revisionOwner)}</span>`,routeText=r.request_status==='needs_revision'?revisionText:route?.approver_names?`در انتظار تأیید ${safe(route.approver_names)}`:statuses[r.request_status]||'در انتظار تعیین تأییدکننده';
    let action=r.request_status==='needs_revision'?revisionText:route?.approver_names?`در انتظار تأیید ${safe(route.approver_names)}`:'در انتظار تعیین تأییدکننده';
    if(terminal)action='—';
    else if(r.request_status==='needs_revision'&&mine)action=`<button class="primary" data-revise-request="${r.id}">اصلاح و ارسال مجدد</button>`;
    else if(r.request_status==='needs_revision')action=revisionText;
    else if(route?.actionable===true&&featureAllowed('approvals','edit'))action=`<button class="primary" data-review-request="${r.id}">بررسی</button>`;
    else if(mine)action=`<button class="ghost" data-amend-request="${r.id}">ویرایش</button> <button class="ghost danger" data-cancel-request="${r.id}">لغو درخواست</button>`;
    return`<tr data-request-id="${r.id}"><td>${fa(rows.length-index)}</td><td>${safe(profileLabel(r.requested_by,r.requester_name_snapshot||'—'))}</td><td>${safe(requestTypeLabel(r))}</td><td>${safe(r.proposed_data?.title||state.tasks.find(t=>String(t.id)===String(r.task_id))?.title||'—')}</td><td>${jalaliDateTime(r.created_at)}</td><td>${routeText}</td><td>${action}</td></tr>`;
  }).join(''):'<tr><td colspan="7" class="empty">موردی در این بخش وجود ندارد.</td></tr>';
  window.bamcoApprovalCenter?.sync?.();
}
$('#approvalBody').addEventListener('click',e=>{const revise=e.target.closest('[data-revise-request]'),review=e.target.closest('[data-review-request]'),amend=e.target.closest('[data-amend-request]'),cancel=e.target.closest('[data-cancel-request]');if(revise)reviseRequest(revise.dataset.reviseRequest);if(review)openReview(review.dataset.reviewRequest);if(amend)amendRequest(amend.dataset.amendRequest);if(cancel)cancelRequest(cancel.dataset.cancelRequest)});
function requestManagerNote(row){const note=String(row?.manager_note||'').trim();if(row?.request_status==='cancelled'&&(String(row?.reviewed_by||'')===String(row?.requested_by||'')||/^لغو(?:\s+شده)?\s+توسط\s+ثبت[‌ ]?کننده$/.test(note)))return'';return note}
window.bamcoRequestManagerNote=requestManagerNote;
function renderRequestHistory(){const statuses={approved:'تأیید',rejected:'رد',cancelled:'لغوشده'},terminal=new Set(Object.keys(statuses)),rows=newestRequestRows(state.requestHistory).filter(r=>terminal.has(r.request_status));$('#requestHistoryBody').innerHTML=rows.length?rows.map((r,index)=>`<tr data-request-id="${r.id}"><td>${fa(rows.length-index)}</td><td>${safe(profileLabel(r.requested_by,r.requester_name_snapshot||'—'))}</td><td>${safe(requestTypeLabel(r))}</td><td>${safe(r.proposed_data?.title||state.tasks.find(t=>String(t.id)===String(r.task_id))?.title||'—')}</td><td>${jalaliDateTime(r.reviewed_at||r.created_at)}</td><td>${statuses[r.request_status]}</td><td>${safe(requestManagerNote(r)||'—')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">سابقه‌ای وجود ندارد.</td></tr>'}
const titles={dashboard:'داشبورد',kanban:'کانبان وظایف',archive:'آرشیو وظایف',approvals:'تأیید درخواست‌ها',requestHistory:'سوابق درخواست‌ها',projects:'مدیریت پروژه‌ها',parts:'مدیریت قطعات',invoices:'صورتحساب‌ها و تعهدات مالی',organization:'ساختار سازمانی',accessMatrix:'دسترسی‌ها',vehiclePermanent:'تحویل دائم خودرو',vehicleTemporary:'تحویل موقت خودرو',tools:'مدیریت ابزار',lettersIncoming:'نامه‌های ورودی',lettersOutgoing:'نامه‌های خروجی',userGuide:'راهنمای استفاده سامانه',sentMessages:'پیام‌های ارسال‌شده'};globalThis.BamcoNavigation?.configure?.({state,titles});
function showView(view){if(typeof BamcoNavigation!=='undefined'&&typeof BamcoNavigation.navigate==='function')return BamcoNavigation.navigate(view);const target=typeof view==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(view)?document.getElementById(view+'View'):null;if(!target)return false;globalThis.bamcoLeaveHome?.();state.view=view;$$('.view').forEach(x=>x.classList.add('hidden'));target.classList.remove('hidden');$$('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$('#viewTitle').textContent=titles[view]||'';$('#addTaskBtn').classList.toggle('hidden',view!=='kanban');return true}
$('#nav').addEventListener('click',e=>{const button=e.target.closest('button[data-view]');if(button&&!button.disabled)showView(button.dataset.view)});$$('[data-go]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.go)));
$('#kanbanSearch').addEventListener('input',()=>renderTasks(false));$('#archiveSearch').addEventListener('input',()=>renderTasks(true));$('#collapseBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('collapsed'));
$('#nav').addEventListener('click',e=>{if(window.matchMedia('(max-width:760px)').matches&&e.target.closest('button[data-view]'))$('#sidebar').classList.add('collapsed')});
document.addEventListener('pointerdown',e=>{if(!window.matchMedia('(max-width:760px)').matches)return;const sidebar=$('#sidebar');if(!sidebar.classList.contains('collapsed')&&!sidebar.contains(e.target))sidebar.classList.add('collapsed')});
$('#logoutBtn').addEventListener('click',async()=>{await window.bamcoAuth.signOut();$('#loginForm').reset();$('#email').focus()});$$('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));

function canCreateDirectTask(){return featureAllowed('kanban','create')&&(hasApprovalBypass()||(state.organizationScope?.descendantUserIds||[]).length>0)}
function formOwnerId(){return $('#taskForm [name=owner_id]')?.value||state.profile?.id||null}
function canEditTaskDirectly(task=state.editing){
  if(state.reviewEdit)return featureAllowed('approvals','edit');
  if(state.resubmitting||state.amendingRequest)return false;
  // A supervisor may open the assignment form, but their own new task still
  // follows their direct parent.  The selected target—not merely the fact
  // that the actor has descendants—decides whether this is a direct mutation.
  return task?canDirectlyManageTask(task,'edit'):canDirectlyCreateFor(formOwnerId());
}
function canChooseTaskOwner(task=state.editing){
  if(state.reviewEdit)return featureAllowed('approvals','edit');
  if(state.resubmitting||state.amendingRequest)return false;
  return task?canDirectlyManageTask(task,'edit'):canCreateDirectTask();
}
function syncTaskDialogAuthority(task=state.editing){
  const directAuthority=canEditTaskDirectly(task);
  $('#taskDialogTitle').textContent=state.reviewEdit?'اصلاح درخواست مدیر':state.resubmitting?'اصلاح و ارسال مجدد':state.amendingRequest?'ویرایش درخواست':task?(directAuthority?'ویرایش وظیفه':'درخواست تغییر وظیفه'):(directAuthority?'افزودن وظیفه':'درخواست وظیفه جدید');
  $('#taskDialogHint').textContent=state.reviewEdit?'اصلاحات همراه با تأیید درخواست اعمال می‌شود.':state.resubmitting?'موارد خواسته‌شده را اصلاح و دوباره ارسال کنید.':state.amendingRequest?'ویرایش شما درخواست را دوباره در گردش تأیید قرار می‌دهد.':directAuthority?(isOrganizationManager()&&task&&isOwnTask(task)?'تغییر مستقیم برای وظیفهٔ خودِ مدیر و وظایف رده‌های پایین‌تر مجاز است.':'تغییر مستقیم فقط برای وظایفِ رده‌های پایین‌ترِ همین شاخه سازمانی مجاز است.'):'درخواست شما پس از تأیید بالادستِ مستقیم در ساختار سازمانی اعمال می‌شود.';
  $('#saveTaskBtn').textContent=state.reviewEdit?'ثبت اصلاحات و تأیید':state.resubmitting?'ارسال مجدد':state.amendingRequest?'ثبت و ارسال مجدد':directAuthority?(task?'ثبت تغییرات':'ثبت وظیفه'):'ارسال برای تأیید';
}
function fillOwners(selected,task=state.editing){
  const sel=$('#taskForm [name=owner_id]'),canChoose=canChooseTaskOwner(task),byId=new Map();
  for(const person of profileList())if(person?.id)byId.set(String(person.id),person);
  if(selected&&!byId.has(String(selected))&&profileById(selected))byId.set(String(selected),profileById(selected));
  let source;
  if(state.reviewEdit)source=scopedTaskProfiles();
  else if(canChoose)source=scopedTaskProfiles().filter(person=>canDirectlyCreateFor(person.id)||String(person.id)===String(selected));
  else source=[profileById(state.profile?.id)||state.profile].filter(Boolean);
  if(selected&&!source.some(person=>String(person.id)===String(selected))&&byId.has(String(selected)))source.push(byId.get(String(selected)));
  const unique=[...new Map(source.filter(Boolean).map(person=>[String(person.id),person])).values()];
  sel.innerHTML='<option value="">بدون متولی</option>'+unique.map(person=>`<option value="${person.id}" ${String(person.id)===String(selected)?'selected':''} ${person.active===false&&String(person.id)!==String(selected)?'disabled':''}>${safe(person.display_name||person.full_name||person.email)}${person.active===false?' (غیرفعال)':''}</option>`).join('');
  sel.value=selected||'';sel.disabled=!canChoose;
}
function syncTaskState(){
  const f=$('#taskForm'),rule=window.bamcoOptions.status(f.elements.status.value);if(!rule)return;
  const canChoose=canChooseTaskOwner(state.editing);
  if(rule.owner_mode==='none')f.elements.owner_id.value='';else if(!canChoose&&!state.resubmitting&&!state.amendingRequest)f.elements.owner_id.value=state.profile.id;
  f.elements.owner_id.disabled=rule.owner_mode==='none'||!canChoose||!!(state.editing?.archived&&state.editing?.owner_deleted_at);f.elements.owner_id.required=rule.owner_mode==='required';
  for(const [name,mode]of [['start_date',rule.start_mode],['due_date',rule.due_mode],['done_date',rule.kind==='completed'?'optional':'none']]){
    const disabled=mode==='none';if(disabled)setJalaliField(name+'_j','');f.elements[name+'_j'].disabled=disabled;f.elements[name+'_j'].required=mode==='required';f.querySelector(`[data-date-input="${name}_j"]`).disabled=disabled;
  }
  f.elements.reminder_days.disabled=!rule.tracks_deadline;if(!rule.tracks_deadline)f.elements.reminder_days.value=0;
}
function openTask(task=null){
  state.editing=task;
  const f=$('#taskForm');
  f.reset();window.bamcoOptions.fillForm(task);
  // A supervisor may directly create only for strict descendants, but must
  // still be able to select themself to submit their own creation request to
  // the direct parent.  Selecting self never grants a bypass: submit logic
  // below still routes it through the workflow.
  fillOwners(task?.owner_id||(task?null:state.profile.id),task);
  if(task){
    for(const key of ['title','description','status','priority','reminder_days','manager_notes'])if(f.elements[key])f.elements[key].value=task[key]??'';
    setJalaliField('start_date_j',task.start_date);setJalaliField('due_date_j',task.due_date);setJalaliField('done_date_j',task.done_date);
  }else{
    setJalaliField('start_date_j','');setJalaliField('due_date_j','');setJalaliField('done_date_j','');
  }
  const status=f.elements.status;
  status.dataset.previousStatus=status.value;
  status.dataset.archiveConfirmed=task?.archived?'1':'';
  syncTaskState();
  syncTaskDialogAuthority(task);
  $('#taskDialog').showModal();
}
$('#addTaskBtn').addEventListener('click',()=>openTask());window.openEdit=id=>openTask(state.tasks.find(t=>String(t.id)===String(id)));
$('#taskDialog').addEventListener('close',()=>{
  if(state.taskDialogSubmitting)return;
  state.reviewEdit=null;state.resubmitting=null;state.amendingRequest=null;
});
$('#taskForm [name="owner_id"]').addEventListener('change',()=>{
  syncTaskState();
  syncTaskDialogAuthority(state.editing);
});
$('#taskForm [name="status"]').addEventListener('change',async e=>{
  const selectEl=e.target,value=norm(selectEl.value);
  if(window.bamcoOptions.status(value)?.due_mode==='none')setJalaliField('due_date_j','');
  if(window.bamcoOptions.completed(value)&&!state.editing?.archived){
    const ok=await window.bamcoConfirm('از انتقال این وظیفه به آرشیو مطمئن هستید؟');
    if(!ok){selectEl.value=selectEl.dataset.previousStatus||state.editing?.status||'در حال انجام';selectEl.dataset.archiveConfirmed='';return}
    selectEl.dataset.archiveConfirmed='1';
    const f=$('#taskForm');
    if(!f.elements.done_date.value)setJalaliField('done_date_j',new Date().toISOString().slice(0,10));
  }else if(!window.bamcoOptions.completed(value))selectEl.dataset.archiveConfirmed='';
  selectEl.dataset.previousStatus=selectEl.value;
  syncTaskState();
});
$('#taskForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const f=e.currentTarget;
  const data=Object.fromEntries(new FormData(f));
  // Disabled controls are omitted by FormData. During revision/amendment the
  // owner is intentionally locked, but it must still be resubmitted.
  if(!Object.hasOwn(data,'owner_id')&&f.elements.owner_id)data.owner_id=f.elements.owner_id.value;
  delete data.start_date_j;delete data.done_date_j;delete data.due_date_j;
  for(const k of ['start_date','done_date','due_date'])if(!data[k])data[k]=null;
  data.reminder_days=Number(data.reminder_days||0);
  const currentTask=state.editing;
  const directMutation=state.reviewEdit?featureAllowed('approvals','edit'):(state.resubmitting||state.amendingRequest)?false:currentTask?canDirectlyManageTask(currentTask,'edit'):canDirectlyCreateFor(data.owner_id);
  if(!directMutation&&!state.reviewEdit&&!state.resubmitting&&!state.amendingRequest)data.owner_id=currentTask?.owner_id||state.profile.id;
  if(!data.owner_id)data.owner_id=null;
  if(state.editing?.archived&&state.editing?.owner_deleted_at)data.owner_id=state.editing.owner_id;
  try{window.bamcoOptions.normalizeTask(data,state.editing)}catch(error){toast(error.message,true);return}
  const completing=window.bamcoOptions.completed(data);
  if(completing&&!state.editing?.archived&&f.elements.status.dataset.archiveConfirmed!=='1'){
    if(!await window.bamcoConfirm('از انتقال این وظیفه به آرشیو مطمئن هستید؟'))return;
    f.elements.status.dataset.archiveConfirmed='1';
  }
  if(completing&&!data.done_date)data.done_date=new Date().toISOString().slice(0,10);
  const activeRequest=state.reviewEdit||state.resubmitting||state.amendingRequest;
  // Project activity requests carry immutable WBS linkage alongside the task
  // fields shown in this dialog. Preserve that server-validated context when
  // the requester or reviewer edits/resubmits the visible task fields.
  const requestPayload=activeRequest?.proposed_data?.request_context==='project_activity'
    ?{...activeRequest.proposed_data,...data,request_context:'project_activity'}
    :data;

  try{
    if($('#saveTaskBtn').disabled)return;
    $('#saveTaskBtn').disabled=true;
    if(state.reviewEdit){
      await rpc('review_request_stage',{p_request_id:state.reviewEdit.id,p_decision:'approved',p_note:state.reviewEdit.managerNote||null,p_final_data:requestPayload});
    }else if(state.resubmitting){
      await rpc('resubmit_change_request',{p_request_id:state.resubmitting.id,p_proposed_data:requestPayload});
    }else if(state.amendingRequest){
      await rpc('amend_change_request',{p_request_id:state.amendingRequest.id,p_proposed_data:requestPayload});
    }else if(directMutation){
      if(completing){data.archived=true;data.archived_at=new Date().toISOString()}
      if(state.editing?._restoring){await update('tasks',`id=eq.${state.editing.id}`,{...data,archived:true,archived_at:state.editing.archived_at||new Date().toISOString()});await rpc('restore_tasks_to_kanban_and_resequence',{p_task_ids:[Number(state.editing.id)]})}
      else if(state.editing)await update('tasks',`id=eq.${state.editing.id}`,data);
      else await insert('tasks',{...data,created_by:state.profile.id});
    }else{
      if(completing&&state.editing){
        await rpc('submit_change_request',{p_request_type:'complete',p_task_id:state.editing.id,p_proposed_data:{done_date:data.done_date,due_date:data.due_date},p_note:null});
      }else{
        await rpc('submit_change_request',{p_request_type:state.editing?'update':'create',p_task_id:state.editing?.id||null,p_proposed_data:state.editing?{...data,...(state.editing._restoring?{archived:false,archived_at:null}:{} )}:data,p_note:null});
      }
    }
    state.taskDialogSubmitting=true;
    $('#taskDialog').close();
    toast(state.reviewEdit?'درخواست با اصلاحات مدیر تأیید شد.':state.resubmitting?'درخواست اصلاح‌شده دوباره ارسال شد.':state.amendingRequest?'درخواست ویرایش و دوباره برای تأیید ارسال شد.':directMutation?(completing?'وظیفه انجام شد و به آرشیو منتقل شد.':'تغییرات ثبت شد.'):(completing?'درخواست تکمیل برای تأیید ارسال شد.':'درخواست برای تأیید بالادست ارسال شد.'));
    state.reviewEdit=null;state.resubmitting=null;state.amendingRequest=null;state.taskDialogSubmitting=false;
    await refresh();
  }catch(err){toast(err.message,true)}finally{$('#saveTaskBtn').disabled=false}
});
window.archiveTask=async id=>{const task=state.tasks.find(t=>String(t.id)===String(id));if(!task)return;const rule=window.bamcoOptions.status(task),preserve=!!rule?.archivable&&!window.bamcoOptions.completed(task),message=preserve?`وظیفه «${task.title}» با وضعیت «${task.status}» به آرشیو منتقل شود؟`:`وظیفه «${task.title}» تکمیل و آرشیو شود؟`;if(!await window.bamcoConfirm(message))return;try{const data={archived:true,archived_at:new Date().toISOString(),...(preserve?{}:{status:window.bamcoOptions.label('status','done'),done_date:task.done_date||new Date().toISOString().slice(0,10)})},direct=canDirectlyManageTask(task,'edit');if(direct)await update('tasks',`id=eq.${id}`,data);else await rpc('submit_change_request',{p_request_type:preserve?'update':'complete',p_task_id:Number(id),p_proposed_data:preserve?{...data,status:task.status}:{done_date:data.done_date},p_note:null});toast(direct?'وظیفه به آرشیو منتقل شد.':'درخواست برای تأیید بالادست ارسال شد.');await refresh()}catch(error){toast(error.message,true)}};

window.deleteTask=async id=>{const task=state.tasks.find(t=>String(t.id)===String(id));if(!task)return;const direct=canDirectlyManageTask(task,'delete'),prompt=direct?`وظیفه «${task.title}» برای همیشه حذف شود؟`:`درخواست حذف وظیفه «${task.title}» برای بالادست ارسال شود؟`;if(!await window.bamcoConfirm(prompt))return;try{if(direct){await rpc('delete_tasks_and_resequence',{p_task_ids:[Number(id)]});toast('وظیفه حذف و شناسه‌های نمایشی بازشماری شد.')}else{await rpc('submit_change_request',{p_request_type:'delete',p_task_id:Number(id),p_proposed_data:{},p_note:null});toast('درخواست حذف برای تأیید بالادست ارسال شد.')}await refresh()}catch(err){toast(err.message,true)}};
async function restoreTask(id){const task=state.tasks.find(t=>String(t.id)===String(id));if(!task||!await window.bamcoConfirm(`وظیفه «${task.title}» به کانبان بازگردانده شود؟`))return;const direct=canDirectlyManageTask(task,'edit');if(!task.owner_id||!task.start_date||!task.due_date){openTask({...task,status:window.bamcoOptions.label('status','doing'),done_date:null,_restoring:true});$('#taskDialogHint').textContent=direct?'برای بازگشت به کانبان، متولی و تاریخ شروع و پایان را کامل کنید.':'اصلاحات برای تأیید بالادستِ مستقیم ارسال می‌شود؛ اطلاعات لازم را کامل کنید.';return}try{if(direct){await rpc('restore_tasks_to_kanban_and_resequence',{p_task_ids:[Number(id)]});state.selected.archive=null;toast('وظیفه به کانبان بازگردانده و شماره‌ها بازشماری شد.')}else{await rpc('submit_change_request',{p_request_type:'update',p_task_id:Number(id),p_proposed_data:{archived:false,archived_at:null,status:window.bamcoOptions.label('status','doing'),done_date:null},p_note:null});toast('درخواست بازگردانی برای تأیید بالادست ارسال شد.')}await refresh()}catch(err){toast(err.message,true)}}
window.restoreTask=restoreTask;
$('#kanbanEditBtn').addEventListener('click',()=>{const t=selectedTask('kanban');if(t)openTask(t)});$('#archiveEditBtn').addEventListener('click',()=>{const t=selectedTask('archive');if(t)openTask(t)});
$('#kanbanArchiveBtn').addEventListener('click',()=>{const t=selectedTask('kanban');if(t)archiveTask(t.id)});$('#archiveRestoreBtn').addEventListener('click',()=>{const t=selectedTask('archive');if(t)restoreTask(t.id)});
$('#kanbanDeleteBtn').addEventListener('click',()=>{const t=selectedTask('kanban');if(t)deleteTask(t.id)});$('#archiveDeleteBtn').addEventListener('click',()=>{const t=selectedTask('archive');if(t)deleteTask(t.id)});
function requestRoute(id){return(state.requestRoutes||[]).find(route=>String(route.request_id)===String(id))||null}
function canReviewRequest(request){return !!request&&requestRoute(request.id)?.actionable===true&&featureAllowed('approvals','edit')}
window.openReview=id=>{
  const request=state.requests.find(row=>String(row.id)===String(id));
  if(!canReviewRequest(request)){toast('این درخواست اکنون در کارتابل اقدام شما نیست.',true);return}
  state.reviewing=request;
  const r=state.reviewing,task=state.tasks.find(t=>String(t.id)===String(r.task_id));
  const proposed=r.proposed_data||{},before=r.before_data||{},value=(key)=>proposed[key]??task?.[key]??before[key],shown=v=>v===null||v===undefined||v===''?'—':v;
  $('#reviewDetails').innerHTML=`<p><b>نوع درخواست:</b> ${safe(requestTypeLabel(r))}</p><p><b>مرحله:</b> ${fa(r.current_stage||1)}</p><p><b>شناسه وظیفه:</b> ${fa(task?.legacy_id||before.legacy_id||r.task_id||'—')}</p><p><b>عنوان:</b> ${safe(shown(value('title')))}</p><p><b>متولی:</b> ${safe(profileLabel(value('owner_id'),ownerName(task||before)))}</p><p><b>وضعیت:</b> ${safe(shown(value('status')))}</p><p><b>توضیحات:</b> ${safe(shown(value('description')))}</p><p><b>یادآور (روز):</b> ${fa(value('reminder_days')??0)}</p><p><b>اولویت:</b> ${safe(shown(value('priority')))}</p><p><b>تاریخ شروع:</b> ${jalaliText(value('start_date'))}</p><p><b>تاریخ پایان:</b> ${jalaliText(value('due_date'))}</p><p><b>تاریخ انجام:</b> ${jalaliText(value('done_date'))}</p>`;
  $('#managerNote').value='';$('#reviewDialog').showModal();
};
async function review(decision){
  const request=state.reviewing;
  if(!canReviewRequest(request)){toast('این درخواست دیگر در مرحله اقدام شما نیست.',true);$('#reviewDialog').close();return}
  try{const result=await rpc('review_request_stage',{p_request_id:request.id,p_decision:decision,p_note:$('#managerNote').value.trim()||null,p_final_data:null});$('#reviewDialog').close();toast(decision==='approved'?(result==='next_stage'?'مرحله اول تأیید شد و درخواست به مرحله بعد رفت.':'درخواست تأیید و اعمال شد.'):decision==='needs_revision'?'درخواست جهت اصلاح به متولی برگشت.':'درخواست رد شد.');await refresh()}catch(err){toast(err.message,true)}
}
window.reviseRequest=id=>{const r=state.requests.find(row=>String(row.id)===String(id));if(!r||r.request_status!=='needs_revision'||String(r.requested_by)!==String(state.user?.id)){toast('این درخواست برای اصلاح شما در دسترس نیست.',true);return}state.resubmitting=r;const task=state.tasks.find(t=>String(t.id)===String(r.task_id))||{},ownerId=r.proposed_data?.owner_id||task.owner_id||r.requested_by||state.profile.id;openTask({...task,...r.proposed_data,owner_id:ownerId})};
window.amendRequest=id=>{const r=state.requests.find(row=>String(row.id)===String(id));if(!r||!['pending','in_review'].includes(r.request_status)||String(r.requested_by)!==String(state.user?.id)){toast('این درخواست برای ویرایش شما در دسترس نیست.',true);return}state.amendingRequest=r;const task=state.tasks.find(t=>String(t.id)===String(r.task_id))||{};openTask({...task,...r.proposed_data,owner_id:r.proposed_data?.owner_id||state.profile.id})};
window.cancelRequest=async id=>{const r=state.requests.find(row=>String(row.id)===String(id));if(!r||String(r.requested_by)!==String(state.user?.id)){toast('این درخواست برای لغو شما در دسترس نیست.',true);return}if(!await window.bamcoConfirm('این درخواست لغو و به سوابق منتقل شود؟'))return;try{await rpc('cancel_change_request',{p_request_id:r.id,p_note:null});toast('درخواست لغو و به سوابق منتقل شد.');await refresh()}catch(error){toast(error.message,true)}};
$('#approveBtn').addEventListener('click',()=>review('approved'));$('#rejectBtn').addEventListener('click',()=>review('rejected'));$('#revisionBtn').addEventListener('click',()=>review('needs_revision'));$('#editRequestBtn').addEventListener('click',()=>{const r=state.reviewing;if(!canReviewRequest(r)){toast('این درخواست دیگر در مرحله اقدام شما نیست.',true);return}const task=state.tasks.find(t=>String(t.id)===String(r.task_id))||{};state.reviewEdit={...r,managerNote:$('#managerNote').value.trim()};$('#reviewDialog').close();openTask({...task,...r.proposed_data,owner_id:r.proposed_data?.owner_id||task.owner_id||r.requested_by})});

$('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const p=$('#newPassword').value,c=$('#confirmPassword').value,wasRequired=!!state.profile.must_change_password;$('#passwordError').textContent='';if(p!==c){$('#passwordError').textContent='تکرار رمز عبور یکسان نیست.';return}try{await window.bamcoAuth.changePassword(p);form.reset();$('#passwordDialog').close();toast('رمز عبور با موفقیت تغییر کرد.');if(wasRequired)showView('kanban')}catch(err){if(wasRequired)try{await update('profiles',`id=eq.${state.profile.id}`,{must_change_password:true,updated_at:new Date().toISOString()})}catch{}const message=err.message==='New password should be different from the old password.'?'رمز جدید باید با رمز قبلی متفاوت باشد.':err.message;$('#passwordError').textContent=message}});

// ورود همیشه باید با تأیید رمز انجام شود؛ نشست قبلی عمداً بازیابی نمی‌شود.
showLogin();

// Realtime emits narrow domain invalidations.  Refresh only the affected
// workspace state; focus remains a lightweight fallback, not a polling loop.
let bamcoDomainRefreshTimer=0;
// Local profile saves and cross-tab profile broadcasts both update the same
// canonical store.  Re-render current labels from user_id immediately; task,
// request and dashboard rows never own a copied person name.
document.addEventListener('bamco:profiles-updated',()=>{
  if(state.profile&&state.token)renderAll();
});
document.addEventListener('bamco:domain-invalidated',event=>{
  const detail=event.detail||{},domain=String(detail.domain||detail.table||'').toLowerCase();
  if(!state.profile||!state.token)return;
  if(domain==='profiles'){
    renderAll();return;
  }
  if(domain==='access'){
    void window.BamcoAccess?.refresh?.();return;
  }
  if(domain==='notifications'){
    void window.bamcoInbox?.load?.();return;
  }
  if(!['organization','tasks','workflow','change_requests','organization_workflows','organization_workflow_steps'].includes(domain))return;
  clearTimeout(bamcoDomainRefreshTimer);
  bamcoDomainRefreshTimer=setTimeout(async()=>{
    try{
      if(domain==='organization')await refreshOrganizationScope({silent:true});
      await refresh();
    }catch(error){console.warn('Domain refresh failed.',error)}
  },80);
});



/* module:app:9 */
(()=>{
  'use strict';
  if(window.__bamcoSecureStorageBridge)return;
  window.__bamcoSecureStorageBridge='edge-with-direct-fallback-v3';
  const network=window.BamcoNetwork;if(!network)return;
  const storagePattern=/\/storage\/v1\/object\/(avatars|vehicle-forms)\/(.+?)(?:\?.*)?$/;

  const mimeFor=(bucket,path,body)=>{
    if(body?.type)return body.type;
    const lower=decodeURIComponent(path).toLowerCase();
    if(lower.endsWith('.pdf'))return 'application/pdf';
    if(lower.endsWith('.png'))return 'image/png';
    if(lower.endsWith('.jpg')||lower.endsWith('.jpeg'))return 'image/jpeg';
    if(lower.endsWith('.webp'))return 'image/webp';
    return bucket==='avatars'?'image/png':'application/octet-stream';
  };

  async function edgeRequest(bucket,path,operation,body){
    const fd=new FormData();
    fd.append('bucket',bucket);
    fd.append('path',decodeURIComponent(path));
    fd.append('operation',operation);
    if(body instanceof Blob){
      const type=mimeFor(bucket,path,body);
      const ext=type==='application/pdf'?'pdf':type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
      const file=body instanceof File&&body.type?body:new File([body],body?.name||`upload.${ext}`,{type,lastModified:Date.now()});
      fd.append('file',file,file.name);
    }
    try{
      const res=await network.raw(`${SB_URL}/functions/v1/secure-storage-upload`,{
        method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${state.token}`},body:fd,cache:'no-store'
      });
      const text=await res.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{}
      const normalized=JSON.stringify(res.ok?payload:{...payload,message:payload.message||payload.error||'مسیر امن آپلود پاسخ موفق نداد.'});
      return new Response(normalized,{status:res.status,statusText:res.statusText,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }catch(err){
      return new Response(JSON.stringify({message:err?.message||'مسیر امن آپلود در دسترس نبود.'}),{status:599,headers:{'Content-Type':'application/json'}});
    }
  }

  async function directFallback(input,init,edgeRes,next){
    try{
      const direct=await next(input,init);
      if(direct.ok)return direct;
      return direct.status!==0?direct:edgeRes;
    }catch{return edgeRes}
  }

  network.use('secure-storage',async(input,init={},next)=>{
    const url=typeof input==='string'?input:(input instanceof Request?input.url:String(input));
    const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    const match=url.match(storagePattern);
    if(match&&(method==='POST'||method==='PUT')&&init.body instanceof Blob){
      const edgeRes=await edgeRequest(match[1],match[2],'upload',init.body);
      if(edgeRes.ok)return edgeRes;
      return directFallback(input,init,edgeRes,next);
    }
    if(match&&method==='DELETE'){
      const edgeRes=await edgeRequest(match[1],match[2],'delete');
      if(edgeRes.ok)return edgeRes;
      return directFallback(input,init,edgeRes,next);
    }
    return next(input,init);
  });
})();



/* module:app:10 */
(function(){
  'use strict';
  const STATUS_ORDER=()=>window.bamcoOptions.ordered('status',(state.tasks||[]).map(t=>t.status));
  const PRIORITY_ORDER=()=>window.bamcoOptions.ordered('priority',(state.tasks||[]).map(t=>t.priority));
  const BUCKET_ORDER=['دیرکرد','دوره هشدار','فاقد شرایط دیرکرد'];
  const $id=id=>document.getElementById(id);
  const shortName=name=>{let value=String(name||'').trim();for(const prefix of ['جناب آقای ','سرکار خانم ','مهندس ','آقای ','خانم '])if(value.startsWith(prefix))value=value.slice(prefix.length);return value||'—'};
  const chartNameCompare=(a,b)=>String(a?.[0]||'').localeCompare(String(b?.[0]||''),'fa',{numeric:true,sensitivity:'base'});
  const workloadTotal=row=>Object.values(row?.[1]||{}).reduce((sum,value)=>sum+Number(value||0),0);
  const sortWorkloadRows=rows=>[...rows].sort((a,b)=>workloadTotal(b)-workloadTotal(a)||chartNameCompare(a,b));
  const sortPerformanceRows=rows=>[...rows].sort((a,b)=>(Number(b?.[1]||0)+Number(b?.[2]||0))-(Number(a?.[1]||0)+Number(a?.[2]||0))||chartNameCompare(a,b));
  const bucketOf=task=>{if(!window.bamcoOptions.status(task)?.tracks_deadline)return'فاقد شرایط دیرکرد';const due=norm(task.due_state);return due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد'};
  const setOptions=(id,values)=>{const el=$id(id);if(!el)return;const old=el.value||'همه';el.innerHTML=values.map(v=>`<option>${safe(v)}</option>`).join('');el.value=values.includes(old)?old:'همه'};
  const taskOwnerId=task=>String(task?.owner_id||task?.created_by||'');
  const currentPersonLabel=(userId,fallback='—')=>window.BamcoProfiles?.label?.(userId,'')||profileLabel?.(userId,'')||fallback;
  const ownerLabelFor=task=>currentPersonLabel(taskOwnerId(task),ownerName(task));
  function setOwnerOptions(rows){const el=$id('dashOwner');if(!el)return;const previous=el.value||'همه',ids=new Set([...(state.profiles||[]).filter(p=>p?.active!==false).map(p=>String(p.id)),...(rows||[]).map(taskOwnerId)].filter(Boolean));const choices=[['همه','همه'],...[...ids].map(id=>[id,currentPersonLabel(id,'کاربر')]).sort((a,b)=>a[1].localeCompare(b[1],'fa'))];el.innerHTML=choices.map(([id,label])=>`<option value="${safe(id)}">${safe(label)}</option>`).join('');el.value=choices.some(([id])=>id===previous)?previous:'همه'}
  function refreshFilters(){const rows=state.tasks||[],active=rows.filter(t=>!t.archived);setOwnerOptions(rows);setOptions('dashPriority',['همه',...PRIORITY_ORDER().filter(v=>rows.some(t=>norm(t.priority)===v))]);setOptions('dashStatus',['همه',...STATUS_ORDER().filter(v=>active.some(t=>norm(t.status)===v))]);setOptions('dashBucket',['همه',...BUCKET_ORDER.filter(v=>active.some(t=>bucketOf(t)===v))])}
  function filtered(){let kanban=state.tasks.filter(t=>!t.archived),archive=state.tasks.filter(t=>t.archived);const owner=$id('dashOwner')?.value||'همه',priority=$id('dashPriority')?.value||'همه',status=$id('dashStatus')?.value||'همه',bucket=$id('dashBucket')?.value||'همه';if(owner!=='همه'){kanban=kanban.filter(t=>taskOwnerId(t)===String(owner));archive=archive.filter(t=>taskOwnerId(t)===String(owner))}if(priority!=='همه'){kanban=kanban.filter(t=>norm(t.priority)===norm(priority));archive=archive.filter(t=>norm(t.priority)===norm(priority))}if(status!=='همه'){kanban=kanban.filter(t=>norm(t.status)===norm(status));archive=[]}if(bucket!=='همه'){kanban=kanban.filter(t=>bucketOf(t)===norm(bucket));archive=[]}return[kanban,archive]}
  function selectedDashboardOwnerId(){const selected=$id('dashOwner')?.value||'همه';return selected==='همه'?null:selected}
  function renderCards(kanban,archive){
    const active=kanban.filter(t=>!window.bamcoOptions.terminal(t)),ownerId=selectedDashboardOwnerId(),allRequests=window.bamcoDashboardMetrics?.uniqueRequests?.([...(state.definitionRequests||[]),...(state.requests||[]),...(state.requestHistory||[])])||[...(state.definitionRequests||[]),...(state.requests||[]),...(state.requestHistory||[])],metrics=window.bamcoDashboardMetrics;
    const definitionCount=metrics?.definitionCountForSelection?metrics.definitionCountForSelection({ownerId,profiles:state.profiles,tasks:state.tasks,requests:allRequests,baseline:state.dashboardMonitoringStart}):allRequests.filter(r=>r.request_type==='create').length;
    const pendingCount=metrics?.pendingReviewCount?metrics.pendingReviewCount({ownerId,requests:allRequests}):(state.requests||[]).filter(r=>['pending','in_review'].includes(r.request_status)).length;
    const unscheduledCount=metrics?.unscheduledCount?metrics.unscheduledCount({ownerId,tasks:active,isTerminal:t=>window.bamcoOptions.terminal(t)}):active.filter(t=>!t.start_date&&!t.due_date).length;
    const spec=[['total','کل کارهای فعال',active.length],['in_progress','در حال انجام',active.filter(t=>window.bamcoOptions.kind(t)==='active').length],['waiting','منتظر پاسخ',active.filter(t=>window.bamcoOptions.kind(t)==='waiting').length],['overdue','دارای دیرکرد',active.filter(t=>bucketOf(t)==='دیرکرد').length],['warning','در دوره هشدار',active.filter(t=>bucketOf(t)==='دوره هشدار').length],['archive_total','کل کارهای آرشیو شده',archive.length],['pending_requests','درخواست‌های منتظر بررسی',pendingCount],['create_requests','درخواست تعریف وظیفه',definitionCount],['unscheduled','کارهای بدون زمان‌بندی',unscheduledCount]];
    $id('dashboardCards').innerHTML=spec.map(([key,label,value])=>`<article data-key="${key}"><small>${label}</small><strong>${fa(value)}</strong></article>`).join('')
  }
  function sizeCanvas(canvas){const dpr=window.devicePixelRatio||1,parent=canvas.parentElement,mobile=!!window.matchMedia?.("(max-width:760px)").matches,items=Math.max(0,Number(canvas.dataset.chartItems)||0),wide=['workloadChart','performanceChart'].includes(canvas.id),parentWidth=Math.max(280,parent?.clientWidth||canvas.clientWidth||320),w=mobile&&wide?Math.max(parentWidth,260+items*105):parentWidth;if(!canvas.dataset.logicalHeight)canvas.dataset.logicalHeight=canvas.getAttribute('height')||'300';const h=Number(canvas.dataset.logicalHeight);canvas.style.setProperty("--chart-width",`${w}px`);parent.tabIndex=0;parent.setAttribute("aria-label",mobile&&wide&&w>parentWidth?"نمودار؛ برای مشاهده کامل افقی پیمایش کنید":"نمودار");parent.classList.toggle('dashboard-chart-scroll',mobile&&wide&&w>parentWidth);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;const scrollKey=`${w}:${items}`;if(parent.dataset.chartScrollKey!==scrollKey){parent.dataset.chartScrollKey=scrollKey;requestAnimationFrame(()=>{parent.scrollLeft=0})}if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return{ctx,w,h,mobile}}
  function frame(canvas,title,subtitle=''){const {ctx,w,h,mobile}=sizeCanvas(canvas);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.direction='rtl';ctx.textAlign='right';ctx.fillStyle='#173f35';ctx.font='bold 21px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(title,w-18,31);if(subtitle){ctx.fillStyle='#6a8077';ctx.font='15px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(subtitle,w-18,55)}return{ctx,w,h,mobile}}
  function empty(canvas,title,message='اطلاعاتی برای نمایش وجود ندارد',subtitle=''){const {ctx,w,h}=frame(canvas,title,subtitle);ctx.textAlign='center';ctx.fillStyle='#7a8e85';ctx.font='18px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(message,w/2,h/2)}
  function legend(ctx,w,items,top=78){ctx.textAlign='right';ctx.font='15px BamcoScript,"B Nazanin","Times New Roman",serif';items.forEach(([label,color],i)=>{const y=top+i*30;ctx.fillStyle=color;ctx.fillRect(w-46,y-10,18,18);ctx.fillStyle='#435b51';ctx.fillText(label,w-54,y+3)})}
  function bar(canvas,title,labels,values,colors){if(!values.length||Math.max(...values)<=0)return empty(canvas,title);const {ctx,w,h}=frame(canvas,title),left=62,right=w-190,top=58,bottom=h-84,max=Math.max(...values);ctx.strokeStyle='#edf2f0';ctx.fillStyle='#879a91';ctx.font='13px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.textAlign='right';for(let step=0;step<=5;step++){const y=bottom-(bottom-top)*step/5;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText(fa(Math.round(max*step/5)),left-8,y+4)}const gap=22,bw=Math.max(52,Math.min(120,((right-left)-gap*(values.length+1))/values.length));let x=left+Math.max(0,(right-left-(values.length*bw+(values.length+1)*gap))/2)+gap;labels.forEach((label,i)=>{const bh=(bottom-top-10)*values[i]/max;ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,bottom-bh,bw,bh);ctx.fillStyle='#435b51';ctx.textAlign='center';ctx.font='bold 15px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(fa(values[i]),x+bw/2,bottom-bh-9);ctx.font='13px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(label,x+bw/2,bottom+20);x+=bw+gap});legend(ctx,w,labels.map((l,i)=>[l,colors[i%colors.length]]))}
  function pie(canvas,title,data,colors){data=data.filter(([,v])=>v>0);const total=data.reduce((s,[,v])=>s+v,0);if(!total)return empty(canvas,title);const {ctx,w,h}=frame(canvas,title),legendSpace=180,areaRight=Math.max(240,w-legendSpace),size=Math.max(130,Math.min(220,h-92,areaRight-80)),cx=Math.max(48,(areaRight-size)/2)+size/2,cy=64+size/2,r=size/2;let angle=-Math.PI/2;data.forEach(([label,value],i)=>{const extent=2*Math.PI*value/total,mid=angle+extent/2,color=colors[i%colors.length];ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+extent);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();const x1=cx+Math.cos(mid)*r*.9,y1=cy+Math.sin(mid)*r*.9,x2=cx+Math.cos(mid)*r*1.08,y2=cy+Math.sin(mid)*r*1.08,x3=x2+(Math.cos(mid)>=0?22:-22);ctx.strokeStyle='#789089';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y2);ctx.stroke();ctx.fillStyle='#23342d';ctx.textAlign=Math.cos(mid)>=0?'left':'right';ctx.font='bold 13px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(`${fa((value/total*100).toFixed(1))}٪ - ${fa(value)}`,x3+(Math.cos(mid)>=0?6:-6),y2+4);angle+=extent});legend(ctx,w,data.map(([l],i)=>[l,colors[i%colors.length]]),86)}
  function workload(canvas,rows){if(typeof window.bamcoDrawWorkload==='function')return window.bamcoDrawWorkload();const title='حجم کار فعال به تفکیک متولی';rows=sortWorkloadRows(rows).slice(0,10);canvas.dataset.chartItems=String(rows.length);canvas.dataset.chartOrder=rows.map(([owner])=>owner).join('|');if(!rows.length)return empty(canvas,title);const {ctx,w,h,mobile}=frame(canvas,title),left=62,right=w-190,top=58,bottom=h-92,max=Math.max(...rows.map(([,p])=>Object.values(p).reduce((a,b)=>a+b,0)),1),segments=PRIORITY_ORDER().map(p=>[p,window.bamcoOptions.color('priority',p)]),gap=18,bw=Math.max(50,Math.min(90,((right-left)-gap*(rows.length+1))/rows.length)),scale=(bottom-top)/max;for(let step=0;step<=5;step++){const y=bottom-(bottom-top)*step/5;ctx.strokeStyle='#edf2f0';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#879a91';ctx.textAlign='right';ctx.font='12px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(fa(Math.round(max*step/5)),left-8,y+4)}let x=left+Math.max(0,(right-left-(rows.length*bw+(rows.length+1)*gap))/2)+gap;for(const [owner,parts] of (mobile?[...rows].reverse():rows)){let y=bottom;for(const [label,color] of segments){const value=parts[label]||0,height=value*scale;if(height){ctx.fillStyle=color;ctx.fillRect(x,y-height,bw,height);ctx.fillStyle='#222';ctx.textAlign='center';ctx.font='bold 12px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(fa(value),x+bw/2,y-height/2+4);y-=height}}ctx.fillStyle='#435b51';ctx.textAlign='center';ctx.font='12px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(shortName(owner),x+bw/2,bottom+19);x+=bw+gap}legend(ctx,w,segments,82)}
  function performance(canvas,rows,note){const title='عملکرد متولیان';rows=sortPerformanceRows(rows).slice(0,10);canvas.dataset.chartItems=String(rows.length);canvas.dataset.chartOrder=rows.map(([owner])=>owner).join('|');if(!rows.length)return empty(canvas,title,'در بازه انتخاب‌شده رکورد آرشیو پیدا نشد',note);const {ctx,w,h,mobile}=frame(canvas,title,note),left=62,right=w-190,top=note?76:58,bottom=h-88,max=Math.max(...rows.flatMap(r=>[r[1],r[2]]),1),gap=20,gw=Math.max(60,Math.min(104,((right-left)-gap*(rows.length+1))/rows.length)),bw=Math.max(22,Math.min(34,(gw-10)/2)),scale=(bottom-top-10)/max;for(let step=0;step<=5;step++){const y=bottom-(bottom-top)*step/5;ctx.strokeStyle='#edf2f0';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillStyle='#879a91';ctx.textAlign='right';ctx.font='12px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(fa(Math.round(max*step/5)),left-8,y+4)}let x=left+Math.max(0,(right-left-(rows.length*gw+(rows.length+1)*gap))/2)+gap;for(const [owner,delay,advance] of (mobile?[...rows].reverse():rows)){const dh=delay*scale,ah=advance*scale;ctx.fillStyle='#c94f5d';ctx.fillRect(x+4,bottom-dh,bw,dh);ctx.fillStyle='#f0b429';ctx.fillRect(x+12+bw,bottom-ah,bw,ah);ctx.fillStyle='#435b51';ctx.textAlign='center';ctx.font='bold 12px BamcoScript,"B Nazanin","Times New Roman",serif';if(delay)ctx.fillText(fa(delay),x+4+bw/2,bottom-dh-7);if(advance)ctx.fillText(fa(advance),x+12+bw+bw/2,bottom-ah-7);ctx.font='12px BamcoScript,"B Nazanin","Times New Roman",serif';ctx.fillText(shortName(owner),x+gw/2,bottom+19);x+=gw+gap}legend(ctx,w,[['تاخیر','#c94f5d'],['تعجیل','#f0b429']],82)}
  function parseJalali(value){const bits=en(value||'').match(/\d+/g)?.map(Number);return bits?.length===3?bits:null}
  function renderPerformance(archive){const owner=$id('dashOwner')?.value||'همه',priority=$id('dashPriority')?.value||'همه',from=parseJalali($id('perfFrom')?.value),to=parseJalali($id('perfTo')?.value),toNumber=p=>p?p[0]*10000+p[1]*100+p[2]:null;let rows=archive.filter(t=>{if(owner!=='همه'&&taskOwnerId(t)!==String(owner))return false;if(priority!=='همه'&&norm(t.priority)!==norm(priority))return false;if(!from&&!to)return true;const p=persianParts(t.due_date);if(!p)return false;const n=toNumber([p.y,p.m,p.d]);return(!from||n>=toNumber(from))&&(!to||n<=toNumber(to))});const grouped=new Map();for(const t of rows){const id=taskOwnerId(t)||'unknown',value=grouped.get(id)||{delay:0,advance:0};value.delay+=Number(t.delay_days||0);value.advance+=Number(t.advance_days||0);grouped.set(id,value)}const values=[...grouped.entries()].filter(([,v])=>v.delay||v.advance).map(([id,v])=>[currentPersonLabel(id,ownerLabelFor(rows.find(t=>taskOwnerId(t)===id))),v.delay,v.advance]).sort((a,b)=>(b[1]+b[2])-(a[1]+a[2]));performance($id('performanceChart'),values,`رکورد بر اساس تاریخ پایان: ${fa(rows.length)}`)}
  function render(){if(!$id('dashboardView')||$id('dashboardView').classList.contains('hidden'))return;refreshFilters();const [kanban,archive]=filtered(),active=kanban.filter(t=>!window.bamcoOptions.terminal(t));renderCards(kanban,archive);let statuses=STATUS_ORDER().filter(s=>kanban.some(t=>norm(t.status)===s));bar($id('statusChart'),'وضعیت وظایف جاری',statuses,statuses.map(s=>kanban.filter(t=>norm(t.status)===s).length),statuses.map(s=>window.bamcoOptions.color('status',s)));const priorities=PRIORITY_ORDER().filter(p=>active.some(t=>norm(t.priority)===p));pie($id('priorityChart'),'توزیع کارها بر اساس اولویت',priorities.map(p=>[p,active.filter(t=>norm(t.priority)===p).length]),priorities.map(p=>window.bamcoOptions.color('priority',p)));const buckets=BUCKET_ORDER.filter(b=>active.some(t=>bucketOf(t)===b));pie($id('bucketChart'),'وضعیت دیرکرد و هشدار',buckets.map(b=>[b,active.filter(t=>bucketOf(t)===b).length]),['#c94f5d','#ee9b00','#7aa6d1','#8b95a1']);const grouped=new Map();for(const task of active){const id=taskOwnerId(task)||'unknown',parts=grouped.get(id)||Object.fromEntries(PRIORITY_ORDER().map(priority=>[priority,0]));const key=task.priority;parts[key]=(parts[key]||0)+1;grouped.set(id,parts)}const ownerRows=[...grouped.entries()].map(([id,parts])=>[currentPersonLabel(id,ownerLabelFor(active.find(task=>taskOwnerId(task)===id))),parts]).sort((a,b)=>Object.values(b[1]).reduce((x,y)=>x+y,0)-Object.values(a[1]).reduce((x,y)=>x+y,0));workload($id('workloadChart'),ownerRows);renderPerformance(state.tasks.filter(t=>t.archived))}
  function openDashboardCalendar(id){state.dashboardDateTarget=id;state.dateInput='__dashboard_date__';const current=parseJalali($id(id).value),now=currentJalali(),p=current?{y:current[0],m:current[1],d:current[2]}:now;$id('calendarLabel').textContent=id==='perfFrom'?'از تاریخ':'تا تاریخ';$id('calYear').innerHTML=Array.from({length:16},(_,i)=>now.y-5+i).map(y=>`<option value="${y}">${fa(y)}</option>`).join('');$id('calMonth').innerHTML=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'].map((n,i)=>`<option value="${i+1}">${n}</option>`).join('');$id('calYear').value=p.y;$id('calMonth').value=p.m;fillCalendarDays();$id('calDay').value=p.d;$id('calendarDialog').showModal()}
  ['dashOwner','dashPriority','dashStatus','dashBucket'].forEach(id=>$id(id)?.addEventListener('change',render));$id('resetDashFilters')?.addEventListener('click',()=>{['dashOwner','dashPriority','dashStatus','dashBucket'].forEach(id=>$id(id).value='همه');render()});$id('clearPerf')?.addEventListener('click',()=>{$id('perfFrom').value='';$id('perfTo').value='';render()});document.querySelectorAll('.dashboard-calendar-btn,.dashboard-performance-range .jalali-input').forEach(el=>el.addEventListener('click',()=>openDashboardCalendar(el.dataset.dashboardDate||el.id)));$id('setDateBtn')?.addEventListener('click',()=>{if(!state.dashboardDateTarget)return;const target=$id(state.dashboardDateTarget);target.value=fa(`${$id('calYear').value}/${String($id('calMonth').value).padStart(2,'0')}/${String($id('calDay').value).padStart(2,'0')}`);state.dashboardDateTarget=null;render()});$id('clearDateBtn')?.addEventListener('click',()=>{if(!state.dashboardDateTarget)return;$id(state.dashboardDateTarget).value='';state.dashboardDateTarget=null;render()});document.querySelector('#nav [data-view="dashboard"]')?.addEventListener('click',()=>requestAnimationFrame(render));let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120)});window.renderDashboard=render;
})();



/* module:app:11 */
(function(){
  'use strict';

  window.BAMCO_FAST_TASK_TABLES=true;

  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];

  /* Keep the approved unified visual language, while this module alone owns task-table geometry. */
  setTimeout(()=>{
    if(!document.getElementById('bamcoTaskTableCoreStyle')){
      const style=document.createElement('style');
      style.id='bamcoTaskTableCoreStyle';
      style.textContent=`
        #appView #kanbanView,
        #appView #archiveView{
          height:calc(100dvh - 58px - var(--footer-h,34px))!important;
          max-height:calc(100dvh - 58px - var(--footer-h,34px))!important;
          overflow:hidden!important;
          box-sizing:border-box!important;
        }
        #appView #kanbanView>.table-panel,
        #appView #archiveView>.table-panel{
          height:calc(100% - 32px)!important;
          max-height:calc(100% - 32px)!important;
          min-height:0!important;
          display:flex!important;
          flex-direction:column!important;
          box-sizing:border-box!important;
        }
        #appView #kanbanView .table-wrap,
        #appView #archiveView .table-wrap{
          flex:1 1 auto!important;
          min-height:0!important;
          height:auto!important;
          max-height:none!important;
          overflow:auto!important;
          box-sizing:border-box!important;
          border:1px solid #b8c8c1!important;
          border-radius:10px!important;
          background:#fff!important;
        }
        #appView #kanbanView table.resizable-task-table,
        #appView #archiveView table.resizable-task-table{
          width:max-content!important;
          min-width:0!important;
          max-width:none!important;
          table-layout:fixed!important;
          border-collapse:collapse!important;
          border-spacing:0!important;
          direction:rtl!important;
          background:#fff!important;
        }
        #appView #kanbanView table.resizable-task-table thead,
        #appView #archiveView table.resizable-task-table thead{display:table-header-group!important}
        #appView #kanbanView table.resizable-task-table thead>tr,
        #appView #archiveView table.resizable-task-table thead>tr{display:table-row!important;height:auto!important;transform:none!important}
        #appView #kanbanView table.resizable-task-table thead>tr:not(:first-child):not(.column-filters),
        #appView #archiveView table.resizable-task-table thead>tr:not(:first-child):not(.column-filters){display:none!important}
        #appView #kanbanView table.resizable-task-table th,
        #appView #archiveView table.resizable-task-table th{
          position:relative!important;
          top:auto!important;
          min-width:0!important;
          max-width:none!important;
          white-space:nowrap!important;
          overflow:visible!important;
          text-overflow:clip!important;
          vertical-align:middle!important;
          box-sizing:border-box!important;
          font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
          font-size:15px!important;
          line-height:1.5!important;
          text-align:center!important;
          direction:rtl!important;
        }
        #appView #kanbanView table.resizable-task-table td,
        #appView #archiveView table.resizable-task-table td{
          min-width:0!important;
          max-width:none!important;
          white-space:normal!important;
          overflow:visible!important;
          text-overflow:clip!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
          line-height:1.75!important;
          vertical-align:top!important;
          box-sizing:border-box!important;
          font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
          font-size:15px!important;
          direction:rtl!important;
          text-align:right!important;
        }
        #appView #kanbanView table.resizable-task-table th:first-child,
        #appView #archiveView table.resizable-task-table th:first-child{
          width:auto!important;min-width:0!important;max-width:none!important;
          padding-right:6px!important;padding-left:6px!important;
          font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
          font-size:15px!important;font-weight:700!important;text-align:center!important;direction:rtl!important
        }
        #appView #kanbanView table.resizable-task-table td:first-child,
        #appView #archiveView table.resizable-task-table td:first-child{
          width:auto!important;min-width:0!important;max-width:none!important;
          padding-right:8px!important;padding-left:5px!important;
          font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
          font-size:15px!important;text-align:right!important;direction:rtl!important;white-space:nowrap!important
        }
        #appView #kanbanView .column-filters>th,
        #appView #archiveView .column-filters>th{
          position:static!important;
          height:46px!important;
          padding:5px 6px!important;
          vertical-align:middle!important;
          background:#eef4f1!important;
          box-sizing:border-box!important
        }
        #appView #kanbanView .column-filters select,
        #appView #archiveView .column-filters select{
          display:block!important;width:100%!important;min-width:0!important;max-width:100%!important;
          height:34px!important;min-height:34px!important;margin:0!important;
          padding:3px 22px 3px 6px!important;box-sizing:border-box!important;
          border:1px solid #b8c8c1!important;border-radius:7px!important;background-color:#fff!important;
          background-position:4px center!important;background-size:12px!important;
          font-family:"B Nazanin",BNazanin,"B Nazanin Regular",Tahoma,sans-serif!important;
          font-size:14px!important;direction:rtl!important;text-align:right!important
        }
        #appView #kanbanView .column-filters>th:first-child select,
        #appView #archiveView .column-filters>th:first-child select{padding-right:5px!important;padding-left:18px!important;text-align:center!important}
        #appView #kanbanView .task-select-column,
        #appView #archiveView .task-select-column,
        #appView #kanbanView .task-pick,
        #appView #archiveView .task-pick{display:none!important}
        #appView table.resizable-task-table .column-resize-handle{
          position:absolute!important;top:0!important;bottom:0!important;left:-5px!important;width:10px!important;
          cursor:col-resize!important;z-index:40!important;touch-action:none!important;user-select:none!important;background:transparent!important
        }
        #appView table.resizable-task-table .column-resize-handle::after{
          content:"";position:absolute;top:7px;bottom:7px;left:4px;width:1px;background:transparent
        }
        #appView table.resizable-task-table .column-resize-handle:hover::after,
        #appView table.resizable-task-table .column-resize-handle.dragging::after{background:#4f8d77!important}
        #appView #kanbanView tbody tr[data-task-id],
        #appView #archiveView tbody tr[data-task-id]{cursor:pointer!important}
      `;
      document.head.appendChild(style);
    }
  },0);

  document.addEventListener('change',event=>{
    if(event.target?.id!=='dteFont')return;
    const body=qs('#dteBody');
    if(body)body.style.setProperty('font-family',`"${event.target.value}",sans-serif`,'important');
  });

  const WIDTHS={
    'شناسه':82,
    'عنوان فعالیت':220,
    'توضیحات':340,
    'متولی':175,
    'وضعیت':135,
    'اولویت':90,
    'تاریخ شروع':118,
    'تاریخ انجام':118,
    'تاریخ پایان':118,
    'یادآور':82,
    'آخرین به‌روزرسانی':165,
    'وضعیت دیرکرد':138,
    'توضیحات مدیر':285,
    'تأخیر':82,
    'تعجیل':82
  };
  const MIN_WIDTHS={
    'شناسه':56,'عنوان فعالیت':150,'توضیحات':190,'متولی':120,'وضعیت':100,'اولویت':72,
    'تاریخ شروع':96,'تاریخ انجام':96,'تاریخ پایان':96,'یادآور':68,'آخرین به‌روزرسانی':125,
    'وضعیت دیرکرد':105,'توضیحات مدیر':170,'تأخیر':64,'تعجیل':64
  };

  function removeSelectionHeader(scope){
    const table=qs(`#${scope}View table`);if(!table)return;
    const top=qsa('thead>tr:first-child>th',table);
    const idx=top.findIndex(th=>(th.childNodes[0]?.textContent||th.textContent||'').trim()==='انتخاب');
    if(idx<0)return;
    top[idx].remove();
    const filter=qs('thead .column-filters',table);
    if(filter?.children[idx])filter.children[idx].remove();
    qsa('tbody tr',table).forEach(row=>{if(row.children[idx])row.children[idx].remove()});
  }

  function normalizeHeaderRows(table){
    const thead=table.tHead||qs('thead',table);if(!thead)return;
    const header=[...thead.rows].find(row=>[...row.cells].some(c=>(c.childNodes[0]?.textContent||c.textContent||'').trim()==='شناسه'))||thead.rows[0];
    let filters=qs('tr.column-filters',thead);
    if(!header)return;
    if(!filters){filters=document.createElement('tr');filters.className='column-filters'}
    [...thead.rows].forEach(row=>{if(row!==header&&row!==filters)row.remove()});
    if(thead.rows[0]!==header)thead.insertBefore(header,thead.firstChild);
    if(filters.parentNode!==thead||thead.rows[1]!==filters)thead.appendChild(filters);
  }

  function installResizableTable(scope){
    const table=qs(`#${scope}View table`);if(!table)return;
    normalizeHeaderRows(table);
    removeSelectionHeader(scope);
    const heads=qsa('thead>tr:first-child>th',table);
    if(!heads.length)return;

    table.classList.add('resizable-task-table');
    table.style.direction='rtl';
    table.dataset.bamcoResized='core1';

    const key=`bamco-${scope}-column-widths-v6`;
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{saved={}}
    const widths=heads.map(head=>{
      const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
      const stored=Number(saved[name]);
      return Number.isFinite(stored)&&stored>0?stored:(WIDTHS[name]||140);
    });

    table.querySelector(':scope > colgroup')?.remove();
    const colgroup=document.createElement('colgroup');
    const cols=heads.map(()=>{const col=document.createElement('col');colgroup.appendChild(col);return col});
    table.insertBefore(colgroup,table.firstChild);

    const save=()=>{
      const next={};
      heads.forEach((h,i)=>next[(h.childNodes[0]?.textContent||h.textContent||'').trim()]=widths[i]);
      try{localStorage.setItem(key,JSON.stringify(next))}catch{}
    };

    const apply=()=>{
      let total=0;
      heads.forEach((head,index)=>{
        const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
        const min=MIN_WIDTHS[name]||70;
        widths[index]=Math.max(min,Math.min(700,Number(widths[index])||WIDTHS[name]||140));
        cols[index].style.setProperty('width',`${widths[index]}px`,'important');
        total+=widths[index];
      });
      table.style.setProperty('width',`${total}px`,'important');
      table.style.setProperty('min-width',`${total}px`,'important');
      table.style.setProperty('max-width','none','important');
    };
    apply();

    heads.forEach((head,index)=>{
      head.style.setProperty('position','relative','important');
      head.querySelectorAll('.column-resize-handle').forEach(x=>x.remove());
      const handle=document.createElement('span');
      handle.className='column-resize-handle';
      handle.title='برای تغییر عرض بکشید؛ برای بازنشانی دوبار کلیک کنید';
      head.appendChild(handle);
      handle.addEventListener('dblclick',event=>{
        event.preventDefault();event.stopPropagation();
        const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
        widths[index]=WIDTHS[name]||140;apply();save();
      });
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0&&event.pointerType!=='touch')return;
        event.preventDefault();event.stopPropagation();
        const name=(head.childNodes[0]?.textContent||head.textContent||'').trim();
        const min=MIN_WIDTHS[name]||70,startX=event.clientX,startWidth=widths[index];
        handle.classList.add('dragging');document.body.classList.add('column-resizing');
        const move=moveEvent=>{widths[index]=Math.max(min,Math.min(700,startWidth+startX-moveEvent.clientX));apply()};
        const up=()=>{
          handle.classList.remove('dragging');document.body.classList.remove('column-resizing');save();
          window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);
        };
        window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
      });
    });
  }

  removeSelectionHeader('kanban');
  removeSelectionHeader('archive');
  installResizableTable('kanban');
  installResizableTable('archive');

  if(typeof state==='undefined'||typeof tableFilters==='undefined'||typeof renderTasks!=='function')return;

  let dataVersion=0;
  const rendered={kanban:false,archive:false,dashboard:false};
  const latestRows={kanban:[],archive:[]};
  const latestArchived={kanban:false,archive:true};
  const optionCache={kanban:new Map(),archive:new Map()};
  let valueCache=new WeakMap();
  let archivePage=1;
  let archivePageSize=50;
  let archiveQuerySignature='';

  function resetRenderCaches(){
    rendered.kanban=false;rendered.archive=false;rendered.dashboard=false;
    optionCache.kanban.clear();optionCache.archive.clear();
    valueCache=new WeakMap();
  }

  if(typeof jalaliText==='function'&&!jalaliText.__bamcoCached){
    const originalJalaliText=jalaliText,cache=new Map();
    jalaliText=function(value){const key=String(value??'');if(cache.has(key))return cache.get(key);const out=originalJalaliText(value);if(cache.size>2048)cache.clear();cache.set(key,out);return out};
    jalaliText.__bamcoCached=true;
  }
  if(typeof jalaliDateTime==='function'&&!jalaliDateTime.__bamcoCached){
    const originalJalaliDateTime=jalaliDateTime,cache=new Map();
    jalaliDateTime=function(value){const key=String(value??'');if(cache.has(key))return cache.get(key);const out=originalJalaliDateTime(value);if(cache.size>2048)cache.clear();cache.set(key,out);return out};
    jalaliDateTime.__bamcoCached=true;
  }

  taskColumnValues=function(t,archived){
    let entry=valueCache.get(t);
    if(!entry||entry.version!==dataVersion){entry={version:dataVersion};valueCache.set(t,entry)}
    const key=archived?'archive':'kanban';
    if(entry[key])return entry[key];
    const waiting=window.bamcoOptions.kind(t)==='waiting',due=norm(t.due_state);
    const dueText=waiting?'فاقد شرایط دیرکرد':due==='دیرکرد'?'دیرکرد':due.includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد';
    const base=[fa(displayId(t)),t.title||'',t.description||'',ownerName(t),t.status||'',t.priority||'',jalaliText(t.start_date),jalaliText(t.done_date),jalaliText(waiting?null:t.due_date),fa(waiting?0:t.reminder_days),jalaliDateTime(t.last_updated_at),dueText,t.manager_notes||''];
    entry[key]=archived?[...base,fa(t.delay_days||0),fa(t.advance_days||0)]:base;
    return entry[key];
  };

  function taskFilterValue(t,index){
    switch(index){
      case 0:return fa(displayId(t));case 1:return t.title||'';case 2:return t.description||'';
      case 3:return ownerName(t);case 4:return t.status||'';case 5:return t.priority||'';
      case 6:return jalaliText(t.start_date);case 7:return jalaliText(t.done_date);
      case 8:return jalaliText(window.bamcoOptions.kind(t)==='waiting'?null:t.due_date);
      case 9:return fa(window.bamcoOptions.kind(t)==='waiting'?0:t.reminder_days);
      case 10:return jalaliDateTime(t.last_updated_at);
      case 11:return window.bamcoOptions.kind(t)==='waiting'?'فاقد شرایط دیرکرد':norm(t.due_state)==='دیرکرد'?'دیرکرد':norm(t.due_state).includes('هشدار')?'دوره هشدار':'فاقد شرایط دیرکرد';
      case 12:return t.manager_notes||'';case 13:return fa(t.delay_days||0);case 14:return fa(t.advance_days||0);
      default:return '';
    }
  }

  function filterValues(scope,index){
    const cache=optionCache[scope],cached=cache.get(index);
    if(cached?.version===dataVersion)return cached.values;
    const archived=latestArchived[scope];
    let values=[...new Set(latestRows[scope].map(t=>String(taskFilterValue(t,index)??'')).filter(v=>v&&v!=='—'))].sort((a,b)=>a.localeCompare(b,'fa',{numeric:true,sensitivity:'base'}));
    if(index===4||index===5)values=window.bamcoOptions.ordered(index===4?'status':'priority',values);
    cache.set(index,{version:dataVersion,values});
    return values;
  }

  function populateFilter(selectEl,scope,index){
    if(!selectEl||selectEl.dataset.bamcoPopulated===String(dataVersion))return;
    const current=tableFilters[scope][index]||selectEl.value||'';
    const values=filterValues(scope,index);
    selectEl.innerHTML='<option value="">همه</option>'+values.map(v=>`<option value="${safe(v)}">${safe(v)}</option>`).join('');
    selectEl.value=current;
    selectEl.dataset.bamcoPopulated=String(dataVersion);
  }

  updateColumnFilters=function(scope,rows,archived){
    latestRows[scope]=rows;latestArchived[scope]=archived;
    const table=qs(`#${scope}View table`);if(table)normalizeHeaderRows(table);
    const tr=qs(`#${scope}View .column-filters`);if(!tr)return;
    const filters=tableFilters[scope],count=archived?15:13;
    while(tr.children.length>count)tr.lastElementChild.remove();
    while(tr.children.length<count)tr.insertAdjacentHTML('beforeend','<th><select><option value="">همه</option></select></th>');
    [...tr.children].forEach((th,index)=>{
      const selectEl=th.querySelector('select');if(!selectEl)return;
      const current=filters[index]||'';
      if(selectEl.dataset.bamcoVersion!==String(dataVersion)){
        selectEl.innerHTML='<option value="">همه</option>'+(current?`<option value="${safe(current)}">${safe(current)}</option>`:'');
        selectEl.dataset.bamcoVersion=String(dataVersion);
        selectEl.dataset.bamcoPopulated='';
      }
      selectEl.value=current;
      selectEl.className=languageClass(current);
      selectEl.disabled=false;
      populateFilter(selectEl,scope,index);
    });
  };

  renderTasks=function(archived){
    const scope=archived?'archive':'kanban';
    const searchEl=archived?qs('#archiveSearch'):qs('#kanbanSearch');
    const normalizeDigits=value=>String(value??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const query=normalizeDigits(searchEl?.value||'').trim().toLowerCase(),focusId=!archived?String(searchEl?.dataset.taskFocusId||''):'';
    const allRows=state.tasks.filter(t=>!!t.archived===archived&&(archived||!window.bamcoTaskTransfer||window.bamcoTaskTransfer.includes(t))).sort((a,b)=>Number(displayId(a))-Number(displayId(b)));
    if(!archived)window.bamcoTaskTransfer?.sync();
    const filters=tableFilters[scope];
    updateColumnFilters(scope,allRows,archived);
    const rows=allRows.filter(t=>!focusId||String(t.id)===focusId)
      .filter(t=>!query||[t.title,t.description,ownerName(t),t.status,t.priority,displayId(t)].some(v=>normalizeDigits(v).toLowerCase().includes(query)))
      .filter(t=>!Object.values(filters).some(Boolean)||taskColumnValues(t,archived).every((v,index)=>!filters[index]||String(v??'')===filters[index]));
    const sort=window.BAMCO_TASK_SORT?.[scope];
    if(sort&&window.BAMCO_COMPARE_VALUES)rows.sort((a,b)=>sort.direction*window.BAMCO_COMPARE_VALUES(taskColumnValues(a,archived)[sort.index],taskColumnValues(b,archived)[sort.index]));
    let visibleRows=rows;
    if(archived){
      const signature=JSON.stringify([query,filters]);
      if(signature!==archiveQuerySignature){archiveQuerySignature=signature;archivePage=1}
      const pageCount=Math.max(1,Math.ceil(rows.length/archivePageSize));
      archivePage=Math.min(archivePage,pageCount);
      const start=(archivePage-1)*archivePageSize;
      visibleRows=rows.slice(start,start+archivePageSize);
      renderArchivePager(rows.length,start,visibleRows.length,pageCount);
    }
    const body=archived?qs('#archiveBody'):qs('#kanbanBody');if(!body)return;
    if(!rows.some(t=>String(t.id)===String(state.selected[scope])))state.selected[scope]=null;
    if(!rows.length){
      body.innerHTML=`<tr><td colspan="${archived?15:13}" class="empty">موردی برای نمایش وجود ندارد.</td></tr>`;
      updateTaskToolbar(scope);rendered[scope]=true;return;
    }
    body.innerHTML=visibleRows.map(t=>{
      const due=norm(t.due_state),status=norm(t.status),rowClass=window.bamcoOptions.kind(t)==='waiting'?'row-waiting':due==='دیرکرد'?'row-overdue':due.includes('هشدار')?'row-warning':'row-normal';
      const values=taskColumnValues(t,archived);
      const selected=String(state.selected[scope])===String(t.id);
      return `<tr class="${rowClass}${selected?' task-selected':''}" data-task-id="${t.id}" data-scope="${scope}" style="--task-status-color:${/^#[0-9a-f]{6}$/i.test(t.status_color||'')?t.status_color:'#8b949e'}" aria-selected="${selected?'true':'false'}">${values.map((v,i)=>i===4?window.bamcoOptions.cell('status',v):i===5?window.bamcoOptions.cell('priority',v):cell(v)).join('')}</tr>`;
    }).join('');
    updateTaskToolbar(scope);rendered[scope]=true;
  };
  renderTasks.__ascendingWrapped=true;

  const kanbanSearch=qs('#kanbanSearch');
  kanbanSearch?.addEventListener('input',()=>{delete kanbanSearch.dataset.taskFocusId},{capture:true});
  let crossViewTaskFocusCleared=false;
  const clearCrossViewTaskFocus=()=>{
    if(!kanbanSearch?.dataset.taskFocusId)return;
    kanbanSearch.value='';delete kanbanSearch.dataset.taskFocusId;
    state.selected.kanban=null;
    crossViewTaskFocusCleared=true;
  };
  window.Bamco?.lifecycle?.on?.('navigation-before',({from,to})=>{
    if(from==='kanban'&&to!=='kanban')clearCrossViewTaskFocus();
  });
  window.Bamco?.lifecycle?.on?.('navigation-after',({to})=>{
    if(to==='kanban'&&crossViewTaskFocusCleared){crossViewTaskFocusCleared=false;renderTasks(false)}
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('.home-return,.content-back')&&!event.target.closest('#kanbanView [data-task-id]'))clearCrossViewTaskFocus();
  },true);

  // Every cross-view task link opens a one-row Kanban filtered by its exact ID.
  window.bamcoFocusMessageTask=function(id){
    const target=state.tasks.find(t=>!t.archived&&String(t.id)===String(id));if(!target)return false;
    const all=qs('#showAllKanbanTasks');if(all&&!all.closest('[hidden]'))all.click();
    const search=qs('#kanbanSearch');if(search){search.value=fa(displayId(target));search.dataset.taskFocusId=String(target.id)}
    Object.keys(tableFilters.kanban).forEach(key=>delete tableFilters.kanban[key]);
    state.selected.kanban=Number(id);renderTasks(false);if(window.bamcoTaskSelection){window.bamcoTaskSelection.clear('kanban');window.bamcoTaskSelection.toggle('kanban',id)}window.bamcoRevealTask?.(id);return true;
  };
  window.bamcoOpenTaskInKanban=function(id){
    const target=state.tasks.find(t=>!t.archived&&String(t.id)===String(id));if(!target)return false;
    qs('#nav [data-view="kanban"]')?.click();let tries=0;const apply=()=>{if(window.bamcoFocusMessageTask(id)){requestAnimationFrame(()=>{const row=qs(`#kanbanBody tr[data-task-id="${CSS.escape(String(id))}"]`);row?.scrollIntoView?.({block:'center',inline:'nearest',behavior:'auto'});row?.focus?.({preventScroll:true})});return true}return false};if(apply())return true;const timer=setInterval(()=>{if(apply()||++tries>30)clearInterval(timer)},100);return true;
  };

  function renderArchivePager(total,start,shown,pageCount){
    const pager=qs('#archivePager');if(!pager)return;
    pager.innerHTML=`<span>نمایش ${fa(total?start+1:0)} تا ${fa(start+shown)} از ${fa(total)} رکورد</span><div><label>تعداد در صفحه <select id="archivePageSize"><option value="50">۵۰</option><option value="100">۱۰۰</option><option value="200">۲۰۰</option></select></label><button type="button" class="ghost" data-archive-page="prev" ${archivePage<=1?'disabled':''}>صفحه قبل</button><strong>صفحه ${fa(archivePage)} از ${fa(pageCount)}</strong><button type="button" class="ghost" data-archive-page="next" ${archivePage>=pageCount?'disabled':''}>صفحه بعد</button></div>`;
    qs('#archivePageSize',pager).value=String(archivePageSize);
  }

  qs('#archivePager')?.addEventListener('click',event=>{
    const action=event.target.closest('[data-archive-page]')?.dataset.archivePage;if(!action)return;
    archivePage+=action==='next'?1:-1;renderTasks(true);
    qs('#archiveView .table-wrap')?.scrollTo({top:0,behavior:'smooth'});
  });
  qs('#archivePager')?.addEventListener('change',event=>{
    if(event.target.id!=='archivePageSize')return;
    archivePageSize=Number(event.target.value)||50;archivePage=1;renderTasks(true);
  });

  chooseTask=function(scope,id){
    const next=String(state.selected[scope])===String(id)?null:Number(id);
    state.selected[scope]=next;
    const body=scope==='archive'?qs('#archiveBody'):qs('#kanbanBody');
    if(body){
      qsa('tr.task-selected',body).forEach(row=>{row.classList.remove('task-selected');row.setAttribute('aria-selected','false')});
      if(next!==null){const row=qsa('tr[data-task-id]',body).find(r=>String(r.dataset.taskId)===String(id));if(row){row.classList.add('task-selected');row.setAttribute('aria-selected','true')}}
    }
    updateTaskToolbar(scope);
  };

  renderAll=function(){
    const initial=qs('#appView')?.classList.contains('hidden');
    const target=initial?'kanban':state.view;
    if(target==='archive')renderTasks(true);
    else if(target==='dashboard'){window.renderDashboard?.();rendered.dashboard=true}
    else renderTasks(false);
    renderRequests();renderRequestHistory();
  };

  const refreshWorkspace=async function(){
    if(!state.profile||state.profile.must_change_password)return;
    const loadingUser=state.user?.id,loadingSession=window.bamcoAuth?.snapshot?.(),taskRevision=state.taskRevision||0;
    try{
      const optionsPromise=window.bamcoOptions.load();
      const scopePromise=refreshOrganizationScope({silent:true});
      const profilesPromise=scopePromise.then(()=>isManager()?select('profiles','select=id,email,login_name,must_change_password,password_changed_at,full_name,display_name,gender,mobile_phone,internal_extension,excel_name,role,active,default_message_channel,messaging_enabled,avatar_path,updated_at&order=full_name'):scopedTaskProfiles());
      const tasksPromise=selectAll('task_status_view','select=*&order=id.desc');
      const workflowPromise=window.bamcoLoadRequestWorkflow();
      const monitoringStartPromise=selectAll('app_settings','select=key,value&key=eq.performance_monitoring_started_at&limit=1').then(rows=>{const raw=rows?.[0]?.value,value=String(raw?.value||raw||'').trim();if(value)state.dashboardMonitoringStart=value;return value}).catch(()=>state.dashboardMonitoringStart);
      // The workbench is a single server-authoritative snapshot.  It must not
      // be rebuilt from permissive REST reads while a workflow RPC is failing.
      const results=await Promise.allSettled([
        Promise.all([profilesPromise,tasksPromise,optionsPromise]).then(([profiles,tasks])=>{
          if(state.user?.id!==loadingUser||(loadingSession&&!window.bamcoAuth.isCurrent(loadingSession)))return;
          syncCanonicalProfiles(profiles,{replaceAll:isManager()});if(taskRevision===(state.taskRevision||0))state.tasks=tasks;
          dataVersion++;resetRenderCaches();renderAll();
          requestAnimationFrame(()=>{installResizableTable('kanban');installResizableTable('archive')});
        }),
        Promise.all([workflowPromise,monitoringStartPromise]).then(([workflow])=>{
          if(state.user?.id!==loadingUser||(loadingSession&&!window.bamcoAuth.isCurrent(loadingSession)))return;
          state.requests=workflow.requests;state.requestHistory=workflow.history;state.definitionRequests=[...workflow.requests,...workflow.history];state.requestRoutes=workflow.routes;
          renderRequests();renderRequestHistory();
          if(state.view==='dashboard')window.renderDashboard?.();
        })
      ]);
      const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    }catch(err){toast(err.message,true);throw err}
  };

  refresh=function(){
    if(state.workspaceRefreshPromise)return state.workspaceRefreshPromise;
    const job=refreshWorkspace().finally(()=>{if(state.workspaceRefreshPromise===job)state.workspaceRefreshPromise=null});
    state.workspaceRefreshPromise=job;return job;
  };

  document.addEventListener('bamco:task-options',()=>{dataVersion++;resetRenderCaches();for(const scope of ['kanban','archive'])for(const [index,type]of [[4,'status'],[5,'priority']])if(tableFilters[scope][index])tableFilters[scope][index]=window.bamcoOptions.label(type,tableFilters[scope][index]);});
  const originalShowView=showView;
  showView=function(view){
    const out=originalShowView(view);
    if(view==='kanban'&&!rendered.kanban)requestAnimationFrame(()=>renderTasks(false));
    else if(view==='archive'&&!rendered.archive)requestAnimationFrame(()=>renderTasks(true));
    else if(view==='dashboard'&&!rendered.dashboard)requestAnimationFrame(()=>{window.renderDashboard?.();rendered.dashboard=true});
    if(view==='kanban'||view==='archive')requestAnimationFrame(()=>installResizableTable(view));
    return out;
  };

  removeSelectionHeader('kanban');removeSelectionHeader('archive');
  requestAnimationFrame(()=>{installResizableTable('kanban');installResizableTable('archive')});
})();

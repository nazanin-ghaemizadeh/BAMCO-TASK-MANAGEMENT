/* Performance-only overrides. No business logic or permissions are changed. */
(()=>{
  const partsCache=new Map();
  const dateTextCache=new Map();
  const dateTimeCache=new Map();
  const dateFormatter=new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn',{year:'numeric',month:'numeric',day:'numeric'});
  const timeFormatter=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'});
  let ownerProfilesRef=null;
  let ownerMap=new Map();

  window.persianParts=function(date){
    if(!date)return null;
    const key=date instanceof Date?`d:${date.getTime()}`:`s:${date}`;
    if(partsCache.has(key))return partsCache.get(key);
    const d=typeof date==='string'?new Date(`${date}T12:00:00`):date;
    if(Number.isNaN(d.getTime())){partsCache.set(key,null);return null}
    const parts=dateFormatter.formatToParts(d);
    const get=t=>Number(parts.find(p=>p.type===t)?.value);
    const value={y:get('year'),m:get('month'),d:get('day')};
    partsCache.set(key,value);
    return value;
  };

  window.jalaliText=function(iso){
    if(!iso)return '—';
    const key=iso instanceof Date?`d:${iso.getTime()}`:String(iso);
    if(dateTextCache.has(key))return dateTextCache.get(key);
    const p=persianParts(iso);
    const value=p?fa(`${p.y}/${String(p.m).padStart(2,'0')}/${String(p.d).padStart(2,'0')}`):'—';
    dateTextCache.set(key,value);
    return value;
  };

  window.jalaliDateTime=function(value){
    if(!value)return '—';
    const key=String(value);
    if(dateTimeCache.has(key))return dateTimeCache.get(key);
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return '—';
    const result=`${jalaliText(d)}، ${timeFormatter.format(d)}`;
    dateTimeCache.set(key,result);
    return result;
  };

  window.ownerName=function(t){
    if(ownerProfilesRef!==state.profiles){
      ownerProfilesRef=state.profiles;
      ownerMap=new Map((state.profiles||[]).map(p=>[p.id,p]));
    }
    const p=ownerMap.get(t?.owner_id);
    return p?.full_name||p?.excel_name||t?.legacy_owner_name||'—';
  };

  window.refresh=async function(){
    try{
      const profilesPromise=isManager()?select('profiles','select=id,email,full_name,excel_name,role,active&active=eq.true&order=full_name'):Promise.resolve([state.profile]);
      const tasksPromise=select('task_status_view','select=*&order=id.desc');
      const requestsPromise=isManager()?select('change_requests','select=*&request_status=eq.pending&order=created_at.asc'):Promise.resolve([]);
      const [profiles,tasks,requests]=await Promise.all([profilesPromise,tasksPromise,requestsPromise]);
      state.profiles=profiles;
      state.tasks=tasks;
      state.requests=requests;
      renderAll();
    }catch(err){toast(err.message,true);throw err}
  };

  window.chooseTask=function(scope,id){
    state.selected[scope]=Number(id);
    const body=scope==='archive'?document.querySelector('#archiveBody'):document.querySelector('#kanbanBody');
    if(body){
      body.querySelectorAll('tr.task-selected').forEach(row=>row.classList.remove('task-selected'));
      body.querySelectorAll('input.task-pick:checked').forEach(input=>{input.checked=false});
      const row=[...body.querySelectorAll('tr[data-task-id]')].find(x=>String(x.dataset.taskId)===String(id));
      if(row){row.classList.add('task-selected');const input=row.querySelector('input.task-pick');if(input)input.checked=true}
    }
    updateTaskToolbar(scope);
  };
})();

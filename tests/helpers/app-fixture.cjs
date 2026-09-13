const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole,requestInterceptor}=require('jsdom');
const root=path.join(__dirname,'../..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(30)}assert.fail('Timed out waiting for the actual UI handler');}

// Run the shipped script order against an isolated, in-memory API. No request
// (including authentication, user deletion or session revocation) reaches a server.
async function fixture(options={}){
 const profiles=[{id:'test-manager',full_name:'مدیر آزمایشی',display_name:'مدیر آزمایشی',email:'manager@example.test',role:'manager',active:true},{id:'test-owner',full_name:'متولی آزمایشی',email:'owner@example.test',role:'owner',active:true}];
 const sessions=[{id:'test-session',auth_session_id:'test-auth-session',user_id:'test-owner',login_at:new Date().toISOString(),last_activity_at:new Date().toISOString()}];
 const actor=options.role==='owner'?profiles[1]:profiles[0],tables={task_statuses:[['registered','ثبت شده','registered','none','none','none',false],['doing','در حال انجام','active','required','required','required',true],['waiting','منتظر پاسخ','waiting','required','required','none',false],['done','انجام شده','completed','required','optional','optional',false]].map(([key,label,kind,owner_mode,start_mode,due_mode,tracks_deadline],i)=>({key,label,kind,owner_mode,start_mode,due_mode,tracks_deadline,active:true,color:'#8b949e',sort_order:i+1})),priorities:[{key:'medium',label:'متوسط',color:'#f2a93b',active:true,sort_order:1}],...options.tables};
 const threads=[{id:'test-room',thread_type:'public',title:'گفت‌وگوی عمومی',is_active:true}],members=[],messages=[],uploads=[];
 const calls=[],errors=[],downloads=[],observers=[],blobs=new Map();let failSave=false;const failures=new Set();

 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...args)=>errors.push(args.map(String).join(' ')));
 const local=requestInterceptor(request=>{
  const url=new URL(request.url);if(url.hostname!=='bamco.test')return new Response('',{status:404});
  if(url.pathname.endsWith('.css')&&!options.styles)return new Response('');
  try{return new Response(fs.readFileSync(path.join(root,url.pathname)),{headers:{'Content-Type':url.pathname.endsWith('.css')?'text/css':'application/javascript'}})}catch{return new Response('',{status:404})}
 });
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*src="assets\/js\/(?:auth-ui|department-entry)\.js[^>]*><\/script>/g,tag=>options.authUi&&tag.includes('/auth-ui.')?tag:'');
 const dom=new JSDOM(html,{url:'https://bamco.test/',runScripts:'dangerously',resources:{interceptors:[local]},pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.Response=Response;w.Request=Request;w.Headers=Headers;w.AbortController=AbortController;w.Blob=Blob;w.TextEncoder=TextEncoder;w.CSS={escape:s=>String(s)};w.print=()=>{};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.scrollIntoView=function(){};for(const [key,value] of Object.entries(options.storage||{}))w.localStorage.setItem(key,value);
  w.fetch=async(input,init={})=>{
   const url=new URL(typeof input==='string'?input:input.url,w.location.href),endpoint=url.pathname.split('/').pop(),method=init.method||'GET',body=typeof init.body==='string'?JSON.parse(init.body):init.body||null;
   calls.push({endpoint,method,body,url:url.href,cache:init.cache});let data=[],status=200;
   if(failures.has(endpoint))return new Response(JSON.stringify({message:'خطای آزمایشی '+endpoint}),{status:500});
   const filter=rows=>rows.filter(row=>[...url.searchParams].every(([k,v])=>{
    if(v==='is.null')return row[k]==null;
    if(v.startsWith('eq.'))return String(row[k])===v.slice(3);
    if(v.startsWith('gte.'))return String(row[k]??'')>=v.slice(4);
    if(v.startsWith('lte.'))return String(row[k]??'')<=v.slice(4);
    return true;
   }));
   if(tables[endpoint]){
    if(method==='GET')data=filter(tables[endpoint]);
    else if(method==='POST'){data=(Array.isArray(body)?body:[body]).map((row,i)=>({id:1000+tables[endpoint].length+i,...row}));tables[endpoint].push(...data)}
    else if(method==='PATCH'){data=filter(tables[endpoint]);data.forEach(row=>Object.assign(row,body))}
   }
   if(endpoint==='save_approval_chain'){
    const id=1000+(tables.approval_chains||[]).length,old=(tables.approval_chains||[]).find(c=>c.id===body.p_chain_id);if(old){old.active=false;old.superseded_by=id}
    tables.approval_chains.push({id,name:body.p_name,is_default:body.p_is_default,active:true,superseded_by:null});body.p_member_ids.forEach(user_id=>tables.approval_chain_members.push({chain_id:id,user_id}));
    body.p_stages.forEach((s,i)=>{const sid=1000+tables.approval_chain_stages.length;tables.approval_chain_stages.push({id:sid,chain_id:id,stage_no:i+1,title:s.title,approval_rule:s.rule});s.approvers.forEach(approver_id=>tables.approval_stage_approvers.push({stage_id:sid,approver_id}))});data=id;
   }
   if(endpoint==='task_status_view')data=actor.role==='manager'?(tables.tasks||[]):(tables.tasks||[]).filter(t=>t.owner_id===actor.id);
   if(endpoint==='profiles'){data=url.searchParams.has('id')?filter(profiles):profiles;if(method==='PATCH')data.forEach(p=>Object.assign(p,body))}
   if(endpoint==='user_sessions')data=sessions;
   if(endpoint==='admin-users'){
    if(failSave){status=400;data={error:'خطای آزمایشی ذخیره'}}
    else if(method==='DELETE'){profiles.splice(profiles.findIndex(p=>p.id===body.user_id),1);data={ok:true}}
    else{const existing=profiles.find(p=>p.id===body.user_id);if(existing)Object.assign(existing,body);else profiles.push({id:'test-new',...body});data={ok:true}}
   }
   if(endpoint==='revoke_user_session'){sessions.find(s=>s.id===body.p_session_id).revoked_at=new Date().toISOString();data=true}
   if(endpoint==='chat_ensure_public')data='test-room';
   if(endpoint==='chat_directory'||endpoint==='chat_directory_v2')data=profiles;
   if(endpoint==='chat_threads')data=filter(threads).filter(t=>t.is_active);
   if(endpoint==='chat_conversation_list')data=threads.filter(t=>(t.is_active||t.participant_deleted_at)&&(t.thread_type==='public'||members.some(m=>m.thread_id===t.id&&m.user_id===actor.id))).map(t=>{const peer=members.find(m=>m.thread_id===t.id&&m.user_id!==actor.id),p=profiles.find(p=>p.id===peer?.user_id);return{...t,title:t.thread_type==='direct'&&!t.system_recipient_id?p?.full_name||t.title:t.title,person_id:t.thread_type==='direct'?p?.id:null,last_message:messages.filter(m=>m.thread_id===t.id&&!m.deleted_at).at(-1)?.body,unread_count:0}});

   if(endpoint==='chat_members')data=filter(members);
   if(endpoint==='chat_messages')data=filter(messages).filter(m=>!m.deleted_at);
   if(endpoint==='chat_create_group'){const id='group-'+threads.length;threads.push({id,title:body.p_title,thread_type:'group',is_active:true});body.p_member_ids.forEach(user_id=>members.push({thread_id:id,user_id,member_role:user_id===actor.id?'owner':'member'}));data=id}
   if(endpoint==='chat_group_members')data=members.filter(m=>m.thread_id===body.p_thread_id);
   if(endpoint==='chat_manage_group'){threads.find(t=>t.id===body.p_thread_id).title=body.p_title;for(let i=members.length-1;i>=0;i--)if(members[i].thread_id===body.p_thread_id)members.splice(i,1);body.p_member_ids.forEach(user_id=>members.push({thread_id:body.p_thread_id,user_id,member_role:user_id===actor.id?'owner':'member'}))}
   if(endpoint==='chat_set_group_avatar'){threads.find(t=>t.id===body.p_thread_id).avatar_path=body.p_avatar_path;data=null}
   if(endpoint==='chat_leave_group'){for(let i=members.length-1;i>=0;i--)if(members[i].thread_id===body.p_thread_id&&members[i].user_id===actor.id)members.splice(i,1)}
   if(endpoint==='chat_delete_thread')threads.find(t=>t.id===body.p_thread_id).is_active=false;
   if(endpoint==='chat_ensure_direct'||endpoint==='chat_ensure_task_direct'){data='direct-'+(body.p_task_id||'general')+'-'+body.p_other_user;if(!threads.some(t=>t.id===data)){threads.push({id:data,title:'خصوصی',thread_type:'direct',task_id:body.p_task_id||null,is_active:true});members.push({thread_id:data,user_id:actor.id},{thread_id:data,user_id:body.p_other_user})}}
   if(endpoint==='chat_send_message'){data=messages.length+1;messages.push({id:data,thread_id:body.p_thread_id,sender_id:actor.id,body:body.p_body,reply_to:body.p_reply_to,created_at:new Date().toISOString()})}
   if(endpoint==='chat_edit_message'){const m=messages.find(m=>m.id===body.p_message_id);m.body=body.p_body;m.edited_at=new Date().toISOString()}
   if(endpoint==='chat_delete_message')messages.find(m=>m.id===body.p_message_id).deleted_at=new Date().toISOString();
   if(url.pathname.includes('/storage/v1/object/')){if(method==='POST'){uploads.push({url:url.href,file:body});data={Key:url.pathname}}else if(method==='GET')return new Response('fixture attachment content',{headers:{'Content-Type':'application/octet-stream'}})}
   if(endpoint==='session-audit')data=body.action==='start'?{ok:true,session:{id:'test-current-session'}}:{ok:true,ended:body.action==='end'};
   if(options.fetchResult){const result=await options.fetchResult({endpoint,method,body,url,data,tables});if(result!==undefined)data=result}
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
  const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(cb){super(cb);observers.push(this)}};
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
  w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({measureText:()=>({width:20}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
  w.HTMLElement.prototype.scrollTo=function(){};w.confirm=()=>true;
  w.URL.createObjectURL=blob=>{const id='blob:test-'+blobs.size;blobs.set(id,blob);return id};w.URL.revokeObjectURL=()=>{};
  w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)})};
 }});
 const w=dom.window,d=w.document;await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
 if(!options.realNotices){w.bamcoConfirm=async message=>{calls.push({endpoint:'ui-confirm',body:message});return true};w.bamcoNotice=async(message,options)=>{calls.push({endpoint:'ui-notice',body:message,options});return true}}
 w.__fixtureProfile=actor;await w.eval("state.token='test-token';state.user={id:window.__fixtureProfile.id};state.profile=window.__fixtureProfile;enterApp()");
 d.body.classList.remove('department-pending');d.querySelector('#departmentEntry')?.setAttribute('hidden','');w.bamcoShowHome();await pause(250);d.querySelector('.home-welcome-dialog')?.close();
 return{w,d,profiles,calls,errors,downloads,tables,threads,members,messages,uploads,failures,setFailSave:v=>failSave=v,
  async open(id){d.querySelector('#nav [data-view="'+id+'"]').click();await until(()=>!d.querySelector('#'+id+'View').classList.contains('hidden'));await pause(120)},
  async dispose(){w.bamcoConversations?.close();w.bamcoChat?.close();observers.forEach(o=>o.disconnect());await pause(50);observers.forEach(o=>o.disconnect());w.close()}
 };
}

module.exports={fixture,until,pause};

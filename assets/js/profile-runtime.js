/* Canonical profile identity and avatar runtime.
 *
 * A profile is never re-created per screen. This store keeps one object for
 * each immutable user id, while state.profiles remains the current screen's
 * authorised directory slice (and contains references to those same objects).
 */
(()=>{'use strict';
 const root=globalThis,q=s=>document.querySelector(s),byId=new Map();
 let revision=0,headerFrame=0,refreshing=null,lastRefreshAt=0,channel=null,deactivating=false;
 const tabId=root.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
 const asRows=value=>Array.isArray(value)?value.filter(Boolean):(value?[value]:[]);
 const stamp=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?time:0};
 const idOf=person=>person?.id==null?'':String(person.id);

 function same(left,right){
  const leftKeys=Object.keys(left||{}),rightKeys=Object.keys(right||{});
  return leftKeys.length===rightKeys.length&&leftKeys.every(key=>left[key]===right[key]);
 }
 function merge(previous,incoming){
  if(!previous)return {...incoming};
  // A full server row with a newer revision wins. A partial optimistic update
  // without updated_at can fill the row until the server confirms it.
  const incomingIsNewer=!incoming?.updated_at||stamp(incoming.updated_at)>=stamp(previous.updated_at);
  return incomingIsNewer?{...previous,...incoming}:{...incoming,...previous};
 }
 function ingest(person){
  const id=idOf(person);if(!id)return {changed:false,profile:null};
  const previous=byId.get(id),next=merge(previous,person);
  if(previous&&same(previous,next))return {changed:false,profile:previous};
  byId.set(id,next);return {changed:true,profile:next};
 }
 function hydrate(){
  const incoming=[state?.profile,...(Array.isArray(state?.profiles)?state.profiles:[])];
  for(const profile of incoming)ingest(profile);
  const currentId=idOf(state?.profile),current=currentId&&byId.get(currentId);
  if(current)state.profile=current;
  const visible=[];
  for(const profile of Array.isArray(state?.profiles)?state.profiles:[]){
   const resolved=byId.get(idOf(profile));if(resolved&&!visible.some(item=>idOf(item)===idOf(resolved)))visible.push(resolved);
  }
  if(current&&!visible.some(item=>idOf(item)===currentId))visible.unshift(current);
  if(Array.isArray(state?.profiles))state.profiles=visible;
 }
 function visibleRows(){hydrate();return Array.isArray(state?.profiles)?state.profiles:[]}
 function publish(ids,{source='local',broadcast=false}={}){
  if(!ids.length)return;
  revision++;
  const profiles=ids.map(id=>byId.get(String(id))).filter(Boolean);
  const detail={ids:[...new Set(ids.map(String))],profiles,source,revision};
  document.dispatchEvent(new CustomEvent('bamco:profiles-updated',{detail}));
  document.dispatchEvent(new CustomEvent('bamco:profile-updated',{detail}));
  void refreshHeaderAvatar();
  void root.bamcoMedia?.avatars?.(document,visibleRows());
  if(broadcast&&channel)try{channel.postMessage({type:'profiles-updated',origin:tabId,profiles})}catch{}
  const own=current();
  if(own?.active===false&&state?.token&&!deactivating){
   deactivating=true;
   Promise.resolve(root.bamcoAuth?.signOut?.()).catch(()=>{
    root.bamcoAuth?.clear?.();if(typeof showLogin==='function')showLogin();
   }).finally(()=>{clear();deactivating=false});
  }
 }
 function upsert(rows,{replaceAll=false,source='local',broadcast=false}={}){
  hydrate();
  const received=asRows(rows),changed=[];
  for(const profile of received){const result=ingest(profile);if(result.changed)changed.push(idOf(result.profile))}
  const receivedIds=received.map(idOf).filter(Boolean);
  if(replaceAll){
   const currentId=idOf(state?.profile),ids=[...new Set([...receivedIds,...(currentId?[currentId]:[])])];
   state.profiles=ids.map(id=>byId.get(id)).filter(Boolean);
  }else if(receivedIds.length){
   const existing=visibleRows().map(idOf),ids=[...new Set([...existing,...receivedIds])];
   state.profiles=ids.map(id=>byId.get(id)).filter(Boolean);
  }
  const currentId=idOf(state?.profile);if(currentId&&byId.has(currentId))state.profile=byId.get(currentId);
  if(changed.length)publish(changed,{source,broadcast});
  return received.map(profile=>byId.get(idOf(profile))).filter(Boolean);
 }
 function remove(ids,{source='local',broadcast=false}={}){
  hydrate();const removed=[];
  for(const value of asRows(ids)){const id=typeof value==='string'?value:idOf(value);if(id&&byId.delete(id))removed.push(id)}
  if(!removed.length)return false;
  state.profiles=(Array.isArray(state?.profiles)?state.profiles:[]).filter(profile=>!removed.includes(idOf(profile))).map(profile=>byId.get(idOf(profile))).filter(Boolean);
  if(removed.includes(idOf(state?.profile)))state.profile=null;
  revision++;
  const detail={ids:removed,profiles:[],source,deleted:true,revision};
  document.dispatchEvent(new CustomEvent('bamco:profiles-updated',{detail}));
  document.dispatchEvent(new CustomEvent('bamco:profile-updated',{detail}));
  if(broadcast&&channel)try{channel.postMessage({type:'profiles-deleted',origin:tabId,ids:removed})}catch{}
  return true;
 }
 function get(id){hydrate();return byId.get(String(id))||null}
 function list({all=false}={}){hydrate();return all?[...byId.values()]:visibleRows()}
 function current(){hydrate();return state?.profile?byId.get(idOf(state.profile))||state.profile:null}
 function label(id,fallback='—'){
  const profile=typeof id==='object'?id:get(id);
  return profile?.display_name||profile?.full_name||profile?.email||fallback;
 }
 function findByAvatarPath(path){hydrate();return [...byId.values()].find(profile=>profile?.avatar_path===path)||null}
 async function refreshCurrent({force=false,reason='focus'}={}){
  const userId=state?.user?.id,token=state?.token;
  if(!userId||!token)return null;
  if(refreshing)return refreshing;
  if(!force&&Date.now()-lastRefreshAt<6000)return current();
  lastRefreshAt=Date.now();const session=root.bamcoAuth?.snapshot?.();
  const job=(async()=>{
   try{
    const rows=await root.BamcoData?.select?.('profiles',`id=eq.${encodeURIComponent(userId)}&select=*`);
    if(state?.user?.id!==userId||!state?.token||(session&&!root.bamcoAuth?.isCurrent?.(session)))return null;
    if(rows?.length)upsert(rows,{source:`refresh:${reason}`});
    return current();
   }catch{return current()}
  })();refreshing=job;
  try{return await job}finally{if(refreshing===job)refreshing=null}
 }
 function clear(){
  byId.clear();revision=0;lastRefreshAt=0;deactivating=false;
  if(state){state.profile=null;state.profiles=[]}
  stopDomainSync({permanent:true});
 }

 async function refreshHeaderAvatar(){
  const profile=current();
  if(!profile||!state?.token)return false;
  return Promise.all([q('#avatar'),q('#profileAvatarPreview')].filter(Boolean).map(el=>root.bamcoMedia?.bindAvatar?.(el,profile)));
 }
 function ensureHeaderAccount(){
  const app=q('#appView'),top=q('#appView>.card-topbar'),tools=q('.header-tools'),account=q('.account');
  if(!app||app.classList.contains('hidden')||!top)return false;
  if(tools&&tools.parentElement!==top)top.appendChild(tools);
  if(tools&&account&&account.parentElement!==tools)tools.prepend(account);
  return !!(tools&&account&&account.parentElement===tools);
 }
 function scheduleHeader(){
  if(headerFrame)return;headerFrame=requestAnimationFrame(()=>{headerFrame=0;if(!q('#appView')?.classList.contains('hidden')){ensureHeaderAccount();void refreshHeaderAvatar()}});
 }

 const domainTables=['profiles','organization_positions','organization_position_assignments','feature_access_grants','tasks','change_requests','change_request_events','organization_workflows','organization_workflow_steps','notifications','chat_threads','chat_members','chat_messages'];
 const tableDomain={
  profiles:'profiles',organization_positions:'organization',organization_position_assignments:'organization',
  feature_access_grants:'access',tasks:'tasks',change_requests:'workflow',organization_workflows:'workflow',
  organization_workflow_steps:'workflow',notifications:'notifications',
  chat_threads:'chat',chat_members:'chat',chat_messages:'chat'
 };
 let socket=null,heartbeat=null,reconnectTimer=null,reconnectAttempt=0,socketToken='',stopped=false,joined=false,ref=0;
 const socketOpen=()=>socket?.readyState===root.WebSocket?.OPEN;
 function emitDomain(domain,{table,record,oldRecord,event,source='realtime',broadcast=false}={}){
  if(!domain)return;
  if(domain==='profiles'){
   const profile=record||oldRecord;
   if(profile?.id){if(event==='DELETE')remove([profile.id],{source});else upsert([profile],{source})}
  }
  const detail={domain,table,record,oldRecord,event,source};
  document.dispatchEvent(new CustomEvent('bamco:domain-invalidated',{detail}));
  document.dispatchEvent(new CustomEvent(`bamco:${domain}-updated`,{detail}));
  if(domain==='notifications'||domain==='chat')document.dispatchEvent(new CustomEvent('bamco-messages-changed',{detail}));
  if(broadcast&&channel)try{channel.postMessage({type:'domain-invalidated',origin:tabId,detail})}catch{}
 }
 function stopDomainSync({permanent=false}={}){
  if(permanent)stopped=true;
  joined=false;if(heartbeat){clearInterval(heartbeat);heartbeat=null}if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null}
  if(socket){const active=socket;socket=null;try{active.close(1000,'session ended')}catch{}}
 }
 function scheduleReconnect(){
  if(stopped||reconnectTimer||!state?.token||root.navigator?.onLine===false)return;
  const wait=Math.min(30000,1000*2**Math.min(reconnectAttempt++,5));
  reconnectTimer=setTimeout(()=>{reconnectTimer=null;startDomainSync()},wait);
 }
 function send(event,payload={}){
  if(!socketOpen())return false;try{socket.send(JSON.stringify({topic:'realtime:bamco-domain-sync',event,payload,ref:String(++ref)}));return true}catch{return false}
 }
 function handleRealtime(message){
  const event=message?.event,payload=message?.payload||{};
  if(event==='phx_reply'&&payload?.status==='ok'){joined=true;reconnectAttempt=0;return}
  if(event!=='postgres_changes')return;
  const data=payload?.data||payload,table=data?.table||data?.table_name,record=data?.record||data?.new||data?.new_record||null,oldRecord=data?.old_record||data?.old||null;
  emitDomain(tableDomain[table],{table,record,oldRecord,event:data?.type||data?.eventType||data?.event||'UPDATE',source:'realtime'});
 }
 function startDomainSync(){
  const token=state?.token;
  if(!token||!state?.user?.id||typeof root.WebSocket!=='function')return false;
  stopped=false;
  if(socketOpen()&&socketToken===token)return true;
  stopDomainSync();socketToken=token;
  const wsBase=String(SB_URL||'').replace(/^http/i,match=>match.toLowerCase()==='https'?'wss':'ws');
  if(!wsBase)return false;
  try{socket=new root.WebSocket(`${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(SB_KEY)}&vsn=1.0.0`)}catch{scheduleReconnect();return false}
  socket.onopen=()=>{
   const changes=domainTables.map(table=>({event:'*',schema:'public',table}));
   send('phx_join',{config:{broadcast:{ack:false,self:false},presence:{key:''},postgres_changes:changes},access_token:state.token});
   heartbeat=setInterval(()=>send('heartbeat',{}),25000);
  };
  socket.onmessage=event=>{try{handleRealtime(JSON.parse(event.data))}catch{}};
  socket.onerror=()=>{};
  const activeSocket=socket;
  socket.onclose=()=>{if(heartbeat){clearInterval(heartbeat);heartbeat=null}joined=false;if(socket===activeSocket)socket=null;scheduleReconnect()};
  return true;
 }
 function invalidate(domain,detail={}){emitDomain(domain,{...detail,source:detail.source||'local',broadcast:true})}

 const api=Object.freeze({upsert,remove,get,list,all:()=>list({all:true}),current,label,findByAvatarPath,refreshCurrent,clear,revision:()=>revision});
 root.BamcoProfiles=api;root.Bamco=Object.assign(root.Bamco||{},{profiles:api});
 root.refreshProfileAvatar=refreshHeaderAvatar;
 root.bamcoTopbarAvatar={refresh:refreshHeaderAvatar,repair:ensureHeaderAccount,reset:()=>{}};
 root.BamcoDomainSync=Object.freeze({start:startDomainSync,stop:stopDomainSync,invalidate,connected:()=>joined});

 function boot(){
  hydrate();
  const app=q('#appView');if(app)new MutationObserver(scheduleHeader).observe(app,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',event=>{if(event.target.closest('[data-view="settings"],.welcome-dismiss,.home-return'))scheduleHeader();if(event.target.closest('#logoutBtn'))clear()});
  const focused=()=>{scheduleHeader();void refreshCurrent({reason:'focus'});startDomainSync()};
  addEventListener('focus',focused);addEventListener('pageshow',focused);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)focused()});
  document.addEventListener('bamco:navigation-after',()=>{scheduleHeader();startDomainSync()});
  root.Bamco?.lifecycle?.on?.('navigation-after',()=>{scheduleHeader();startDomainSync()});
  try{
   if(root.BroadcastChannel){
    channel=new BroadcastChannel('bamco-domain-sync');
    channel.onmessage=event=>{
     const data=event.data;if(!data||data.origin===tabId)return;
     if(data.type==='profiles-updated')upsert(data.profiles||[],{source:'broadcast'});
     else if(data.type==='profiles-deleted')remove(data.ids||[],{source:'broadcast'});
     else if(data.type==='domain-invalidated'){const detail=data.detail||{};emitDomain(detail.domain,{...detail,source:'broadcast'})}
    };
   }
  }catch{}
  scheduleHeader();startDomainSync();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

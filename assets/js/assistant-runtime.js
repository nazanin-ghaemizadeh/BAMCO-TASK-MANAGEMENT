/* One session-scoped conversation, voice and avatar controller for the personal assistant. */
(()=>{
'use strict';
const $=(selector,root)=>root.querySelector(selector);
const STATES=new Set(['idle','listening','thinking','speaking','success','warning','error']);
const ROUTES=new Set(['kanban','archive','projects','approvals','notes']);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const persianText=value=>String(value??'').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[ةۀہھ]/g,'ه').replace(/هٔ/g,'ه');
function emotionFor(text){
 const phrase=persianText(text).toLowerCase();
 if(/(متأسف|متاسف|مشکل|خطا|دیرکرد|نگران|sorry|problem|error|overdue)/i.test(phrase))return'concerned';
 if(/(تبریک|آفرین|عالی|موفق|congratulations|wonderful|great job)/i.test(phrase))return'excited';
 if(/(انجام شد|تمام شد|تکمیل شد|completed|all done)/i.test(phrase))return'proud';
 if(/(چطور|چگونه|چرا|کدام|؟|how|why|which|\?)/i.test(phrase))return'curious';
 if(/(مرحله|گام|برنامه|اولویت|نخست|step|plan|priority)/i.test(phrase))return'focused';
 if(/(کمک|با هم|نگران نباش|آرام|together|help|you can)/i.test(phrase))return'reassuring';
 if(/(سلام|درود|hello|welcome)/i.test(phrase))return'upbeat';
 return'warm';
}
function waitForIce(peer,signal){
 if(!peer.iceGatheringState||peer.iceGatheringState==='complete')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',check);signal.removeEventListener('abort',abort)};
  const check=()=>{if(peer.iceGatheringState==='complete'){cleanup();resolve()}};
  const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'))};
  const timeout=setTimeout(()=>{cleanup();peer.localDescription?.sdp?.includes('a=candidate:')?resolve():reject(Error('مسیر ارتباط صوتی پیدا نشد؛ اتصال شبکه را بررسی کنید.'))},10000);
  peer.addEventListener('icegatheringstatechange',check);signal.addEventListener('abort',abort,{once:true});check();
 });
}

function create(view,{session,loadSticker}){
 const messages=$('.assistant-messages',view),input=$('.assistant-composer textarea',view),mic=$('.assistant-mic',view);
 const status=$('.assistant-status',view),voiceLevel=$('.assistant-voice-activity',view),historyButton=$('[data-assistant-history]',view),liveButton=$('[data-assistant-live]',view),playButton=$('[data-assistant-play]',view);
 const puppet=window.BamcoAssistantPuppet?.create(view);
 const conversationId=()=>crypto.randomUUID?.()||String(Date.now());
 let conversation=conversationId(),history=[],generation=0,active=false,busy=false,live=null,liveAttempt=0;
 let audio=null,audioUrl='',audioContext=null,audioFrame=0,answerAbort=null,speechAbort=null;
 const speechMotion={};
 let blinkTimer=0,blinkClose=0,gestureTimer=0,currentSpoken='',lastSpoken='',lastSpokenAt=0;
 const visible=()=>!view.classList.contains('hidden');
 const valid=()=>visible()&&!!session().token&&session().userId;
 const avatar={
  state:'idle',
  set(next,label){
   if(!STATES.has(next))throw Error('Invalid assistant state');
   this.state=next;view.dataset.avatarState=next;view.dataset.assistantState=label||next;
   if(next!=='speaking')view.dataset.avatarViseme='rest';
   view.classList.remove(...[...STATES].map(value=>'is-'+value));view.classList.add('is-'+next);
   if(status)status.textContent=label||({idle:'آماده گفت‌وگو',listening:'در حال شنیدن…',thinking:'در حال بررسی…',speaking:'در حال پاسخ‌گویی',error:'خطا در گفت‌وگو'}[next]||'آماده');
   if(voiceLevel)voiceLevel.setAttribute('aria-label',next==='listening'?'میکروفون فعال است':next==='speaking'?'صدای دستیار در حال پخش است':'صدا غیرفعال است');
  }
 };
 const normalized=value=>String(value||'').replace(/[\u064B-\u065F\u200C\s.,،؟!]/g,'').replace(/ي/g,'ی').replace(/ك/g,'ک').toLowerCase();
 const savedHistoryKey=()=>`bamco.assistant.conversations.v1.${session().userId||'anonymous'}`;
 const readSavedConversations=()=>{try{const rows=JSON.parse(localStorage.getItem(savedHistoryKey())||'[]');return Array.isArray(rows)?rows.filter(row=>row&&typeof row.id==='string'&&Array.isArray(row.messages)):[]}catch{return[]}};
 const writeSavedConversations=rows=>{try{localStorage.setItem(savedHistoryKey(),JSON.stringify(rows.slice(0,20)))}catch{}};
 const saveConversation=()=>{
  const transcript=history.filter(row=>row&&['user','assistant'].includes(row.role)&&String(row.text||'').trim()).slice(-24);
  if(!transcript.length||!session().userId)return;
  const summary=String(transcript.find(row=>row.role==='user')?.text||'گفت‌وگوی جدید').replace(/\s+/g,' ').slice(0,72);
  const row={id:conversation,updated_at:new Date().toISOString(),summary,messages:transcript};
  writeSavedConversations([row,...readSavedConversations().filter(item=>item.id!==conversation)]);
 };
 function restoreConversation(row){
  if(!row||!Array.isArray(row.messages))return;
  dispose();conversation=String(row.id||conversationId());history=row.messages.filter(item=>item&&['user','assistant'].includes(item.role)&&String(item.text||'').trim()).slice(-24);messages.replaceChildren();
  history.forEach(item=>append(item.role,item.text));avatar.set('idle','آماده گفت‌وگو');void puppet?.start();blinkLoop();
 }
 function openConversationHistory(){
  let dialog=document.querySelector('#assistantConversationHistory');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='assistantConversationHistory';dialog.className='modal small assistant-history-dialog';document.body.append(dialog)}
  const rows=readSavedConversations();dialog.replaceChildren();
  const head=document.createElement('div');head.className='modal-head';const title=document.createElement('h3');title.textContent='تاریخچه گفت‌وگو';const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','بستن');close.onclick=()=>dialog.close();head.append(title,close);dialog.append(head);
  const list=document.createElement('div');list.className='assistant-history-list';
  if(!rows.length){const empty=document.createElement('p');empty.className='assistant-history-empty';empty.textContent='هنوز گفت‌وگویی ذخیره نشده است.';list.append(empty)}
  for(const row of rows){const button=document.createElement('button');button.type='button';button.className='assistant-history-entry';const strong=document.createElement('strong');strong.textContent=row.summary||'گفت‌وگوی بدون عنوان';const small=document.createElement('small');small.textContent=new Date(row.updated_at||Date.now()).toLocaleString('fa-IR');button.append(strong,small);button.onclick=()=>{dialog.close();restoreConversation(row)};list.append(button)}
  dialog.append(list);if(!dialog.open)dialog.showModal();
 }
 const isEcho=phrase=>{
  const reference=currentSpoken||(Date.now()-lastSpokenAt<3000?lastSpoken:'');
  return !!reference&&normalized(phrase).length>3&&normalized(reference).includes(normalized(phrase));
 };
 function blinkLoop(){
  clearTimeout(blinkTimer);if(!visible()||document.hidden)return;
  blinkTimer=setTimeout(()=>{view.dataset.avatarBlink='true';blinkClose=setTimeout(()=>{view.dataset.avatarBlink='false';blinkLoop()},155)},2600+Math.random()*2600);
 }
 function gesture(kind){
  clearTimeout(gestureTimer);view.dataset.avatarGesture=kind;
  gestureTimer=setTimeout(()=>{view.dataset.avatarGesture='neutral'},1200);
 }
 function visemeAt(text,index,amplitude,acoustic=''){
  if(amplitude<.05)return'rest';
  const phrase=persianText(text).toLowerCase(),letter=phrase[index]||'',pair=phrase.slice(index,index+2);
  if(/[بمپbpm]/.test(letter))return'mbp';
  if(/[فڤfv]/.test(letter))return'fv';
  if(/^(sh|ch|th)/.test(pair)||/[سزشصضثذsz]/.test(letter))return'sz';
  if(/[آاa]/.test(letter))return'aa';
  if(/[یيie]/.test(letter))return'i';
  if(/[وu]/.test(letter)||/^(oo|ou)/.test(pair))return'u';
  if(/[o]/.test(letter))return'o';
  if(letter==='ل'||letter==='l')return'l';
  return acoustic|| (amplitude>.38?'aa':amplitude>.16?'e':'i');
 }
 function visemeFor(text,seconds,duration,amplitude){
  const phrase=String(text||'');
  const progress=Number.isFinite(duration)&&duration>0?seconds/duration:seconds*10/Math.max(phrase.length,1);
  const position=Math.max(0,Math.min(phrase.length-1,Math.floor(progress*phrase.length)));
  return visemeAt(phrase,position,amplitude);
 }
 function gestureForToken(token){
  const word=persianText(token).toLowerCase();
  if(/^(سلام|درود|hello|hi)$/.test(word))return'greet';
  if(/^(اول|نخست|دوم|سوم|بعد|گام|مرحله|first|second|third|next|step)$/.test(word))return'count';
  if(/^(مهم|نکته|ضروری|اولویت|فوری|دقت|important|priority|critical)$/.test(word))return'emphasis';
  if(/^(بله|حتما|حتماً|درست|آفرین|yes|sure|exactly|right)$/.test(word))return'acknowledge';
  if(/^(چون|زیرا|مثلا|مثلاً|because|example|therefore)$/.test(word))return'explain';
  if(/^[؟?]$/.test(word))return'question';
  return'';
 }
 function speechMarkers(text){
  return [...String(text||'').matchAll(/[\p{L}\p{N}]+|[؟?]/gu)].map(match=>({index:match.index,kind:gestureForToken(match[0])})).filter(item=>item.kind);
 }
 function speechBeat(owner,amount){
  const rise=amount-(owner.lastAmount||0);
  owner.beat=Math.max((owner.beat||0)*.83,amount>.12&&rise>.055?Math.min(1,amount*1.15):0);
  owner.lastAmount=amount;
  view.style.setProperty('--assistant-speech-beat',String(owner.beat));
 }
 function timedGesture(owner,text,index){
  if(!owner.markers)owner.markers=speechMarkers(text);
  const now=performance.now();
  for(const marker of owner.markers){
   if(marker.index<=(owner.lastMarker??-1)||marker.index>index)continue;
   owner.lastMarker=marker.index;
   if(now-(owner.lastGestureAt??-Infinity)>850){gesture(marker.kind);owner.lastGestureAt=now}
  }
 }
 function append(role,text,options={}){
  if(role==='assistant')text=persianText(text);
  const article=document.createElement('article');article.className='assistant-message '+role+(options.pending?' pending':'');
  article.innerHTML=`<span>${role==='assistant'?'✦':'شما'}</span><p>${escapeHtml(text).replace(/\n/g,'<br>')}</p>`;
  messages.append(article);messages.scrollTop=messages.scrollHeight;
  requestAnimationFrame?.(()=>{if(article.isConnected)messages.scrollTop=messages.scrollHeight});
  return article;
 }
 function showActions(article,actions){
  if(!Array.isArray(actions))return;
  const permitted=actions.filter(action=>ROUTES.has(action.route)&&window.BamcoAccess?.can?.(action.route,'view')===true);
  if(!permitted.length)return;
  const holder=document.createElement('div');holder.className='assistant-actions';
  for(const action of permitted){const button=document.createElement('button');button.type='button';button.className='ghost';button.textContent=action.label;button.onclick=()=>window.BamcoNavigation?.navigate?.(action.route);holder.append(button)}
  article.append(holder);
 }
 function level(amount){view.style.setProperty('--assistant-audio-level',String(Math.max(0,Math.min(1,amount))))}
 function stopSpeech(){
  speechAbort?.abort();speechAbort=null;
  if(audio){audio.onended=null;audio.onerror=null;audio.ontimeupdate=null;audio.pause();audio.removeAttribute('src');try{audio.load()}catch{}audio=null}
  if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=''}
  if(audioFrame)cancelAnimationFrame(audioFrame);audioFrame=0;level(0);view.style.setProperty('--assistant-mouth-open','0');view.style.setProperty('--assistant-speech-beat','0');Object.keys(speechMotion).forEach(key=>delete speechMotion[key]);if(currentSpoken){lastSpoken=currentSpoken;lastSpokenAt=Date.now()}currentSpoken='';view.dataset.avatarViseme='rest';clearTimeout(gestureTimer);view.dataset.avatarGesture='neutral';
  if(audioContext){void audioContext.close().catch(()=>{});audioContext=null}
  try{speechSynthesis.cancel()}catch{}
  if(avatar.state==='speaking')avatar.set(active?'listening':'idle');
 }
 function analyze(analyser,spoken){
  const samples=new Uint8Array(analyser.fftSize);
  speechMotion.markers=speechMarkers(spoken);
  const tick=()=>{if(!audio||audio.paused)return;analyser.getByteTimeDomainData(samples);let power=0;for(const sample of samples){const diff=(sample-128)/128;power+=diff*diff}const amplitude=Math.min(1,Math.sqrt(power/samples.length)*6);level(amplitude);speechBeat(speechMotion,amplitude);view.style.setProperty('--assistant-mouth-open',String(amplitude));const duration=audio.duration,index=Number.isFinite(duration)&&duration>0?Math.floor(audio.currentTime/duration*spoken.length):Math.floor(audio.currentTime*10);view.dataset.avatarViseme=visemeFor(spoken,audio.currentTime,duration,amplitude);if(amplitude>.1)timedGesture(speechMotion,spoken,index);audioFrame=requestAnimationFrame(tick)};
  tick();
 }
 function afterSpeech(){
  stopSpeech();if(valid())avatar.set(active?'listening':'idle');
 }
 function browserSpeech(text,gestureKind='neutral'){
  if(!('speechSynthesis'in window)||!window.SpeechSynthesisUtterance){avatar.set(active?'listening':'idle');return}
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=/[\u0600-\u06ff]/.test(text)?'fa-IR':'en-US';utterance.rate=.96;currentSpoken=text;view.dataset.avatarEmotion=emotionFor(text);
  const voice=speechSynthesis.getVoices().find(item=>item.lang?.toLowerCase().startsWith(utterance.lang.slice(0,2).toLowerCase()));if(voice)utterance.voice=voice;
  speechMotion.markers=speechMarkers(text);utterance.onstart=()=>{avatar.set('speaking');gesture(gestureKind)};utterance.onboundary=event=>{if(avatar.state==='speaking'){view.dataset.avatarViseme=visemeFor(text,event.charIndex,Math.max(text.length,1),.2);view.style.setProperty('--assistant-mouth-open','.3');speechBeat(speechMotion,.3);level(.3);timedGesture(speechMotion,text,event.charIndex)}};utterance.onend=afterSpeech;utterance.onerror=afterSpeech;
  try{speechSynthesis.speak(utterance)}catch{afterSpeech()}
 }
 async function playSpeech(text,issued,token,turn,gestureKind){
  if(!valid())return;
  speechAbort=new AbortController();
  try{
   const result=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${session().token}`,'Content-Type':'application/json','x-conversation-id':conversation},body:JSON.stringify({action:'speech',text,issued,speech_token:token}),signal:speechAbort.signal,cache:'no-store'});
   if(!result.ok)throw Error('صدای دستیار در دسترس نیست.');
   const blob=await result.blob();if(turn!==generation||!valid())return;
   audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);audio.onended=afterSpeech;audio.onerror=afterSpeech;currentSpoken=text;view.dataset.avatarEmotion=emotionFor(text);
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   let analyser=null;
   if(AudioContext){audioContext=new AudioContext();const source=audioContext.createMediaElementSource(audio);analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser);analyser.connect(audioContext.destination);void audioContext.resume().catch(()=>{})}
   await audio.play();if(turn===generation){avatar.set('speaking');gesture(gestureKind);if(analyser)analyze(analyser,text);else{speechMotion.markers=speechMarkers(text);audio.ontimeupdate=()=>{const progress=Number.isFinite(audio.duration)&&audio.duration>0?audio.currentTime/audio.duration:0;const index=Math.floor(progress*text.length);view.dataset.avatarViseme=visemeFor(text,audio.currentTime,audio.duration,.18);view.style.setProperty('--assistant-mouth-open','.18');timedGesture(speechMotion,text,index)}}}
  }catch(error){
   if(error.name==='AbortError')return;
   stopSpeech();if(turn===generation&&valid())browserSpeech(text,gestureKind);
  }
 }
 async function send(text){
  text=String(text||'').trim();if(!text||!valid())return;
  if(active){
   if(live?.channel?.readyState!=='open'){avatar.set('warning','اتصال صوتی هنوز آماده نیست.');return}
   append('user',text);history.push({role:'user',text});saveConversation();
   live.channel.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}}));
   live.channel.send(JSON.stringify({type:'response.create'}));avatar.set('thinking');return
  }
  const turn=++generation,identity=session(),previous=[...history];answerAbort?.abort();messages.querySelectorAll('.pending').forEach(row=>row.remove());stopSpeech();
  busy=true;append('user',text);history.push({role:'user',text});saveConversation();const waiting=append('assistant','در حال بررسی اطلاعات…',{pending:true});avatar.set('thinking');
  answerAbort=new AbortController();
  try{
   const result=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${identity.token}`,'Content-Type':'application/json','x-conversation-id':conversation},cache:'no-store',signal:answerAbort.signal,body:JSON.stringify({message:text,history:previous})});
   const data=await result.json().catch(()=>({}));if(!result.ok)throw Error(data.error||'پاسخ دستیار دریافت نشد.');
   if(turn!==generation||!valid()||session().userId!==identity.userId)return;
   waiting.remove();const answer=persianText(data.text||'پاسخی دریافت نشد.');const article=append('assistant',answer);showActions(article,data.actions);
   history.push({role:'assistant',text:answer});history=history.slice(-24);saveConversation();busy=false;
   const gestureKind=/\d|[۰-۹]|فوری|اولویت/.test(answer)?'emphasis':/تأیید|تایید|انجام شد/.test(answer)?'acknowledge':'neutral';
   avatar.set('success','پاسخ آماده است');
   if(data.speech_token)void playSpeech(answer,data.issued,data.speech_token,turn,gestureKind);
   else{gesture(gestureKind);setTimeout(()=>{if(turn===generation&&avatar.state==='success'&&valid())avatar.set(active?'listening':'idle')},700)}
  }catch(error){
   if(turn!==generation||error.name==='AbortError')return;
   waiting.classList.remove('pending','assistant');waiting.classList.add('error','assistant');$('p',waiting).textContent=error.message||'اطلاعات در دسترس نیست.';
   avatar.set('error','پاسخ دریافت نشد؛ گفت‌وگوی متنی همچنان فعال است.');busy=false;
  }
 }
 function stopRealtime(){
 const current=live;live=null;active=false;liveAttempt++;
 current?.abort.abort();
 if(current?.connectTimer)clearTimeout(current.connectTimer);
  if(current?.frame)cancelAnimationFrame(current.frame);
  try{current?.channel?.close()}catch{}
  try{current?.peer?.close()}catch{}
  current?.stream?.getTracks().forEach(track=>track.stop());
  if(current?.output){current.output.pause();current.output.srcObject=null;current.output.remove()}
  if(current?.context)void current.context.close().catch(()=>{});
  mic.setAttribute('aria-pressed','false');mic.setAttribute('aria-label','شروع مکالمه زنده');mic.title='شروع مکالمه زنده';
  liveButton.setAttribute('aria-pressed','false');liveButton.textContent='شروع مکالمه';playButton.hidden=true;level(0);
  view.classList.remove('assistant-mouth-fallback');view.style.setProperty('--assistant-mouth-open','0');view.style.setProperty('--assistant-speech-beat','0');view.dataset.avatarViseme='rest';clearTimeout(gestureTimer);view.dataset.avatarGesture='neutral';
 }
 function liveEvent(current,event){
  if(live!==current||!valid()||session().userId!==current.userId)return;
  switch(event.type){
   case 'input_audio_buffer.speech_started':current.responseAudio=false;current.mouth=0;current.beat=0;current.lastAmount=0;view.style.setProperty('--assistant-mouth-open','0');view.style.setProperty('--assistant-speech-beat','0');avatar.set('listening','دارم می‌شنوم…');break;
   case 'input_audio_buffer.speech_stopped':avatar.set('thinking','دارم فکر می‌کنم…');break;
   case 'conversation.item.input_audio_transcription.completed':{
    const text=String(event.transcript||'').trim();if(text){append('user',text);history.push({role:'user',text});saveConversation()}break
   }
   case 'response.created':current.responding=true;current.spokenText='';current.speechCursor=0;current.lastCue='';current.lastCueAt=0;current.markers=[];current.lastMarker=-1;avatar.set('thinking','در حال پاسخ…');break;
   case 'response.output_audio_transcript.delta':
   case 'response.output_audio_transcript.done':{
    const key=String(event.item_id||event.response_id||'current');let row=current.outputRows.get(key);
    if(!row){row=append('assistant','');current.outputRows.set(key,row)}
    const paragraph=$('p',row),previous=paragraph.textContent||'';
    paragraph.textContent=event.type.endsWith('.done')?persianText(event.transcript||previous):previous+persianText(event.delta||'');
    current.spokenText=paragraph.textContent;current.markers=speechMarkers(current.spokenText);view.dataset.avatarEmotion=emotionFor(current.spokenText);
    if(event.type.endsWith('.done')&&!row.dataset.saved){row.dataset.saved='true';const text=paragraph.textContent.trim();if(text){history.push({role:'assistant',text});history=history.slice(-24);saveConversation()}}
    messages.scrollTop=messages.scrollHeight;current.responseAudio=true;avatar.set('speaking');
    if(event.type.endsWith('.done')&&/[؟?!]|\d|[۰-۹]|important|مهم|اولویت/i.test(paragraph.textContent))gesture('emphasis');
    break
   }
   case 'response.output_text.done':{
    const text=persianText(event.text).trim();if(text){append('assistant',text);history.push({role:'assistant',text});saveConversation()}break
   }
   case 'response.done':{
    current.responding=false;
    if(event.response?.status==='failed'){avatar.set('warning','پاسخ صوتی ساخته نشد؛ مکالمه را دوباره آغاز کنید.');break}
    const calls=(event.response?.output||[]).filter(item=>item.type==='function_call'&&item.name==='lookup_workspace');
    if(calls.length)void Promise.all(calls.map(item=>workspaceCall(current,item))).then(()=>{
     if(live===current&&current.channel.readyState==='open')current.channel.send(JSON.stringify({type:'response.create'}))
    });
    else setTimeout(()=>{if(live===current&&!current.responding&&!current.responseAudio)avatar.set('listening')},400);
    break
   }
   case 'output_audio_buffer.started':current.responseAudio=true;avatar.set('speaking');break;
   case 'output_audio_buffer.stopped':current.responseAudio=false;current.mouth=0;current.beat=0;current.lastAmount=0;view.style.setProperty('--assistant-mouth-open','0');view.style.setProperty('--assistant-speech-beat','0');view.dataset.avatarViseme='rest';if(!current.responding)avatar.set('listening','منتظر صحبت شما هستم');break;
   case 'error':avatar.set('warning',event.error?.message||'خطا در مکالمه زنده.');break;
  }
 }
 async function workspaceCall(current,item){
  let payload;
  try{
   const args=JSON.parse(item.arguments||'{}');
   if(!['tasks','projects','approvals','archive','notes','organization','notifications','workspace'].includes(args.topic)||typeof args.query!=='string'||!args.query.trim())throw Error('درخواست جست‌وجو معتبر نیست.');
   const identity=session();if(identity.userId!==current.userId)throw Error('نشست کاربر تغییر کرده است.');
   const response=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${identity.token}`,'Content-Type':'application/json','x-conversation-id':conversation},body:JSON.stringify({action:'context',topic:args.topic,query:args.query}),signal:current.abort.signal,cache:'no-store'});
   payload=await response.json();if(!response.ok)payload={error:payload.error||'دادهٔ مجاز در دسترس نیست.'};
  }catch(error){payload={error:error.message||'دادهٔ مجاز در دسترس نیست.'}}
  if(live===current&&current.channel.readyState==='open')current.channel.send(JSON.stringify({type:'conversation.item.create',item:{type:'function_call_output',call_id:item.call_id,output:JSON.stringify(payload)}}));
 }
 function animateLive(current){
  const tick=()=>{
   if(live!==current)return;
   let amount=0;
   if(current.analyser){
    const samples=current.samples;current.analyser.getByteTimeDomainData(samples);
    let power=0;for(const sample of samples){const diff=(sample-128)/128;power+=diff*diff}
    amount=Math.min(1,Math.max(0,(Math.sqrt(power/samples.length)-.008)*13));
   }
   current.mouth=current.mouth*.62+amount*.38;
   level(current.mouth);
   speechBeat(current,current.mouth);
   view.style.setProperty('--assistant-mouth-open',String(current.mouth));
   if(current.mouth>.08){
    let acoustic='e';
    if(typeof current.analyser.getByteFrequencyData==='function'){
     current.analyser.getByteFrequencyData(current.spectrum);
     const energy=(start,end)=>{let total=0;for(let i=start;i<end;i++)total+=current.spectrum[i];return total/(end-start)};
     const low=energy(2,12),mid=energy(12,42),high=energy(42,110);
     acoustic=low>mid*1.3?'o':high>mid*.8?'i':current.mouth>.48?'aa':'e';
    }else acoustic=current.mouth>.48?'aa':'e';
    const now=performance.now();
    if(current.mouth>.12&&now-(current.lastCueAt??-Infinity)>105){
     const text=current.spokenText||'';let cursor=current.speechCursor||0;
     while(cursor<text.length&&!/[\p{L}\p{N}]/u.test(text[cursor]))cursor++;
     if(cursor>(current.speechCursor||0))timedGesture(current,text,cursor);
     if(cursor<text.length){current.lastCue=visemeAt(text,cursor,current.mouth,acoustic);current.speechCursor=cursor+1;current.lastCueAt=now;timedGesture(current,text,cursor)}
     else current.lastCue='';
    }
    view.dataset.avatarViseme=current.lastCue&&now-(current.lastCueAt||0)<230?current.lastCue:acoustic;
   }else view.dataset.avatarViseme='rest';
   if(current.mouth>.08){current.responseAudio=true;if(avatar.state!=='speaking')avatar.set('speaking')}
   else if(current.responseAudio&&!current.responding){current.responseAudio=false;avatar.set('listening','منتظر صحبت شما هستم')}
   current.frame=requestAnimationFrame(tick);
  };current.frame=requestAnimationFrame(tick);
 }
 async function startRealtime(){
  if(!valid()||active)return;
  if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia){avatar.set('warning','مکالمه زنده در این مرورگر یا اتصال امن پشتیبانی نمی‌شود.');return}
  generation++;answerAbort?.abort();answerAbort=null;busy=false;messages.querySelectorAll('.pending').forEach(row=>row.remove());
  const identity=session(),run=++liveAttempt,current={userId:identity.userId,abort:new AbortController(),outputRows:new Map(),mouth:0,responding:false,responseAudio:false,spokenText:'',speechCursor:0,markers:[],lastMarker:-1};
  live=current;active=true;mic.setAttribute('aria-pressed','true');mic.setAttribute('aria-label','پایان مکالمه زنده');mic.title='پایان مکالمه زنده';
  liveButton.setAttribute('aria-pressed','true');liveButton.textContent='پایان مکالمه';avatar.set('thinking','در حال اتصال به مکالمه زنده…');
  const same=()=>live===current&&run===liveAttempt&&valid()&&session().userId===identity.userId;
  const playOutput=()=>{
   if(!same()||!current.output)return;
   void current.context?.resume().catch(()=>{});
   void current.output.play().then(()=>{if(same())playButton.hidden=true}).catch(()=>{
    if(same()){playButton.hidden=false;avatar.set('warning','صدا آماده است؛ «پخش صدا» را بزنید.')}
   });
  };
  try{
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   if(AudioContext){current.context=new AudioContext();void current.context.resume().catch(()=>{})}
   current.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!same()){current.stream.getTracks().forEach(track=>track.stop());return}
   const tokenResponse=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${identity.token}`,'Content-Type':'application/json','x-conversation-id':conversation},body:JSON.stringify({action:'realtime_session'}),signal:current.abort.signal,cache:'no-store'});
   const token=await tokenResponse.json().catch(()=>({}));if(!tokenResponse.ok||!token.value)throw Error(token.error||'اتصال صوتی برقرار نشد.');
   if(!same())return;
   current.peer=new RTCPeerConnection();current.output=document.createElement('audio');current.output.autoplay=true;current.output.playsInline=true;current.output.volume=1;view.append(current.output);
   current.peer.ontrack=event=>{
    if(!same())return;
    const stream=event.streams[0]||new MediaStream([event.track]);current.output.srcObject=stream;
    playOutput();
    if(current.context){try{const source=current.context.createMediaStreamSource(stream);current.analyser=current.context.createAnalyser();current.analyser.fftSize=512;current.samples=new Uint8Array(current.analyser.fftSize);current.spectrum=new Uint8Array(current.analyser.frequencyBinCount||256);const silent=current.context.createGain();silent.gain.value=0;source.connect(current.analyser);current.analyser.connect(silent);silent.connect(current.context.destination);animateLive(current)}catch{view.classList.add('assistant-mouth-fallback')}}
    else view.classList.add('assistant-mouth-fallback');
   };
   current.peer.onconnectionstatechange=()=>{if(same()&&['failed','disconnected'].includes(current.peer.connectionState)){stopRealtime();avatar.set('warning','ارتباط صوتی قطع شد؛ دوباره مکالمه را شروع کنید.')}};
   for(const track of current.stream.getAudioTracks())current.peer.addTrack(track,current.stream);
   current.channel=current.peer.createDataChannel('oai-events');
   current.channel.onopen=()=>{if(same()){
    clearTimeout(current.connectTimer);
    avatar.set('listening','ارتباط برقرار شد؛ منتظر صدای دستیار باشید.');
    for(const row of history.slice(-12)){
     current.channel.send(JSON.stringify({type:'conversation.item.create',item:{type:'message',role:row.role,content:[{type:row.role==='user'?'input_text':'output_text',text:row.text}]}}));
    }
    current.channel.send(JSON.stringify({type:'response.create',response:{output_modalities:['audio'],instructions:'Begin this voice conversation with one warm, natural sentence in Persian. Say hello and invite the user to talk. Use standard Persian spelling. If earlier messages exist, briefly acknowledge that we can continue that conversation without repeating an earlier answer. Never treat historical workspace details as current; look them up again. Then listen.'}}));
   }};
   current.channel.onmessage=event=>{try{liveEvent(current,JSON.parse(event.data))}catch(error){console.warn('Realtime event',error)}};
   current.channel.onclose=()=>{if(same()){stopRealtime();avatar.set('warning','مکالمه زنده پایان یافت.')}};
   const offer=await current.peer.createOffer();await current.peer.setLocalDescription(offer);await waitForIce(current.peer,current.abort.signal);if(!same())return;
   const response=await fetch('https://api.openai.com/v1/realtime/calls',{method:'POST',headers:{Authorization:`Bearer ${token.value}`,'Content-Type':'application/sdp'},body:current.peer.localDescription?.sdp||offer.sdp,signal:current.abort.signal});
   if(!response.ok)throw Error(response.status===429?'ظرفیت مکالمه صوتی پر شده است؛ کمی بعد دوباره امتحان کنید.':'اتصال سرویس صوتی برقرار نشد ('+response.status+').');
   const sdp=await response.text();if(!same())return;
   await current.peer.setRemoteDescription({type:'answer',sdp});
   if(current.channel.readyState!=='open')current.connectTimer=setTimeout(()=>{
    if(same()&&current.channel.readyState!=='open'){stopRealtime();avatar.set('warning','اتصال صوتی کامل نشد؛ اینترنت یا دسترسی مرورگر را بررسی کنید.')}
   },15000);
  }catch(error){
   if(!same()||error.name==='AbortError')return;
   stopRealtime();avatar.set('warning',error.name==='NotAllowedError'?'اجازه میکروفون داده نشد.':error.name==='NotFoundError'||error.name==='DevicesNotFoundError'?'میکروفون پیدا نشد؛ ورودی صدای دستگاه را بررسی کنید.':error.name==='NotReadableError'?'میکروفون در برنامه دیگری در حال استفاده است.':error instanceof TypeError?'اتصال به سرویس صوتی ممکن نشد؛ اینترنت یا دسترسی مرورگر را بررسی کنید.':error.message||'اتصال صوتی برقرار نشد.');
  }
 }
 function toggleMic(){if(active){stopRealtime();avatar.set('idle')}else{stopSpeech();void startRealtime()}}
 function dispose(){saveConversation();generation++;answerAbort?.abort();answerAbort=null;busy=false;stopRealtime();stopSpeech();puppet?.stop();clearTimeout(blinkTimer);clearTimeout(blinkClose);clearTimeout(gestureTimer);view.dataset.avatarBlink='false';view.dataset.avatarGesture='neutral';view.style.setProperty('--avatar-gaze','0px');avatar.set('idle')}
 function activate(){
  dispose();conversation=conversationId();history=[];messages.replaceChildren();append('assistant','سلام! روی «شروع مکالمه» بزنید تا با هم صحبت کنیم. می‌توانیم فارسی یا انگلیسی درباره هر موضوعی حرف بزنیم و برای انجام وظایف و پروژه‌ها هم راه‌حل پیدا کنیم.');
  input.value='';view.dataset.avatarMotion='';view.dataset.avatarEmotion='warm';avatar.set('idle');gesture('greet');void loadSticker();void puppet?.start();blinkLoop();
 }
 mic.onclick=toggleMic;liveButton.onclick=toggleMic;playButton.onclick=()=>{if(live?.output){void live.context?.resume().catch(()=>{});void live.output.play().then(()=>{playButton.hidden=true;avatar.set('listening','صدای دستیار فعال شد.')}).catch(()=>avatar.set('warning','مرورگر پخش صدا را مسدود کرده است.'))}};
 historyButton.onclick=openConversationHistory;
 $('[data-assistant-new]',view).onclick=activate;$('[data-personal-home]',view).onclick=()=>window.bamcoShowHome?.();
 $('.assistant-composer',view).onsubmit=event=>{event.preventDefault();const text=input.value;input.value='';void send(text)};
 input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form.requestSubmit()}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRealtime();stopSpeech();puppet?.stop();clearTimeout(blinkTimer);clearTimeout(blinkClose);view.dataset.avatarBlink='false'}else if(visible()){void puppet?.start();blinkLoop()}});
 window.addEventListener('beforeunload',dispose);
 return{activate,dispose,getState:()=>avatar.state,get voiceEnabled(){return active},get busy(){return busy}}
}
window.BamcoAssistantRuntime=Object.freeze({create});
})();

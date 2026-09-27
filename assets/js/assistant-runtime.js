/* One session-scoped conversation, voice and avatar controller for the personal assistant. */
(()=>{
'use strict';
const $=(selector,root)=>root.querySelector(selector);
const STATES=new Set(['idle','listening','thinking','speaking','success','warning','error']);
const ROUTES=new Set(['kanban','archive','projects','approvals','notes']);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function create(view,{session,loadSticker}){
 const messages=$('.assistant-messages',view),input=$('.assistant-composer textarea',view),mic=$('.assistant-mic',view);
 const status=$('.assistant-status',view),voiceLevel=$('.assistant-voice-activity',view),mute=$('[data-assistant-mute]',view),stop=$('[data-assistant-stop]',view);
 const conversationId=()=>crypto.randomUUID?.()||String(Date.now());
 let conversation=conversationId(),history=[],generation=0,active=false,muted=false,busy=false,recognition=null,recorder=null,recordingStream=null,recordingContext=null,recordingTimer=0;
 let audio=null,audioUrl='',audioContext=null,audioFrame=0,answerAbort=null,speechAbort=null,recognitionRestart=0;
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
 const isEcho=phrase=>{
  const reference=currentSpoken||(Date.now()-lastSpokenAt<3000?lastSpoken:'');
  return !!reference&&normalized(phrase).length>3&&normalized(reference).includes(normalized(phrase));
 };
 function blinkLoop(){
  // The state images animate locally; this only keeps the visible view alive.
  clearTimeout(blinkTimer);if(!visible()||document.hidden)return;
  blinkTimer=setTimeout(blinkLoop,3000);
 }
 function gesture(kind){
  clearTimeout(gestureTimer);view.dataset.avatarGesture=kind;
  gestureTimer=setTimeout(()=>{view.dataset.avatarGesture='neutral'},1200);
 }
 function visemeFor(text,seconds,duration,amplitude){
  if(amplitude<.05)return'rest';
  const phrase=String(text||'').replace(/\s+/g,'');
  const position=Math.max(0,Math.min(phrase.length-1,Math.floor((seconds/Math.max(duration,.1))*phrase.length)));
  const letter=phrase[position]||'';
  if(/[آا]/.test(letter))return'aa';if(/[یي]/.test(letter))return amplitude>.22?'i':'e';
  if(/[او]/.test(letter))return letter==='و'?'u':'o';if(/[بمپ]/.test(letter))return'mbp';
  if(/[فڤ]/.test(letter))return'fv';if(letter==='ل')return'l';if(/[سزشصضثذ]/.test(letter))return'sz';
  return amplitude>.23?'aa':amplitude>.12?'e':'i';
 }
 function append(role,text,options={}){
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
  if(audioFrame)cancelAnimationFrame(audioFrame);audioFrame=0;level(0);if(currentSpoken){lastSpoken=currentSpoken;lastSpokenAt=Date.now()}currentSpoken='';view.dataset.avatarViseme='rest';clearTimeout(gestureTimer);view.dataset.avatarGesture='neutral';
  if(audioContext){void audioContext.close().catch(()=>{});audioContext=null}
  try{speechSynthesis.cancel()}catch{}
  if(avatar.state==='speaking')avatar.set(active?'listening':'idle');
 }
 function analyze(analyser,spoken){
  const samples=new Uint8Array(analyser.fftSize);
  const tick=()=>{if(!audio||audio.paused)return;analyser.getByteTimeDomainData(samples);let power=0;for(const sample of samples){const diff=(sample-128)/128;power+=diff*diff}const amplitude=Math.min(1,Math.sqrt(power/samples.length)*6);level(amplitude);view.dataset.avatarViseme=visemeFor(spoken,audio.currentTime,audio.duration,amplitude);audioFrame=requestAnimationFrame(tick)};
  tick();
 }
 function afterSpeech(){
  stopSpeech();if(valid())avatar.set(active?'listening':'idle');
  if(active&&!recognition&&!recorder)void beginListening();
 }
 function browserSpeech(text,gestureKind='neutral'){
  if(!('speechSynthesis'in window)||!window.SpeechSynthesisUtterance){avatar.set(active?'listening':'idle');return}
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='fa-IR';utterance.rate=.96;currentSpoken=text;
  const voice=speechSynthesis.getVoices().find(item=>item.lang?.toLowerCase().startsWith('fa'));if(voice)utterance.voice=voice;
  utterance.onstart=()=>{avatar.set('speaking');gesture(gestureKind)};utterance.onboundary=event=>{if(avatar.state==='speaking'){view.dataset.avatarViseme=visemeFor(text,event.charIndex,Math.max(text.length,1),.2);level(.3)}};utterance.onend=afterSpeech;utterance.onerror=afterSpeech;
  try{speechSynthesis.speak(utterance)}catch{afterSpeech()}
 }
 async function playSpeech(text,issued,token,turn,gestureKind){
  if(muted||!valid())return;
  speechAbort=new AbortController();
  try{
   const result=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${session().token}`,'Content-Type':'application/json','x-conversation-id':conversation},body:JSON.stringify({action:'speech',text,issued,speech_token:token}),signal:speechAbort.signal,cache:'no-store'});
   if(!result.ok)throw Error('صدای دستیار در دسترس نیست.');
   const blob=await result.blob();if(turn!==generation||!valid()||muted)return;
   audioUrl=URL.createObjectURL(blob);audio=new Audio(audioUrl);audio.onended=afterSpeech;audio.onerror=afterSpeech;currentSpoken=text;
   const AudioContext=window.AudioContext||window.webkitAudioContext;
   let analyser=null;
   if(AudioContext){audioContext=new AudioContext();const source=audioContext.createMediaElementSource(audio);analyser=audioContext.createAnalyser();analyser.fftSize=512;source.connect(analyser);analyser.connect(audioContext.destination);void audioContext.resume().catch(()=>{})}
   await audio.play();if(turn===generation){avatar.set('speaking');gesture(gestureKind);if(analyser)analyze(analyser,text);else audio.ontimeupdate=()=>{view.dataset.avatarViseme=visemeFor(text,audio.currentTime,audio.duration,.18)}}
  }catch(error){
   if(error.name==='AbortError')return;
   stopSpeech();if(turn===generation&&!muted&&valid())browserSpeech(text,gestureKind);
  }
 }
 async function send(text){
  text=String(text||'').trim();if(!text||!valid())return;
  const turn=++generation,identity=session(),previous=[...history];answerAbort?.abort();stopSpeech();
  busy=true;append('user',text);history.push({role:'user',text});const waiting=append('assistant','در حال بررسی اطلاعات…',{pending:true});avatar.set('thinking');
  answerAbort=new AbortController();
  try{
   const result=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${identity.token}`,'Content-Type':'application/json','x-conversation-id':conversation},cache:'no-store',signal:answerAbort.signal,body:JSON.stringify({message:text,history:previous})});
   const data=await result.json().catch(()=>({}));if(!result.ok)throw Error(data.error||'پاسخ دستیار دریافت نشد.');
   if(turn!==generation||!valid()||session().userId!==identity.userId)return;
   waiting.remove();const answer=String(data.text||'پاسخی دریافت نشد.');const article=append('assistant',answer);showActions(article,data.actions);
   history.push({role:'assistant',text:answer});history=history.slice(-8);busy=false;
   const gestureKind=/\d|[۰-۹]|فوری|اولویت/.test(answer)?'emphasis':/تأیید|تایید|انجام شد/.test(answer)?'acknowledge':'neutral';
   avatar.set('success','پاسخ آماده است');
   if(!muted&&data.speech_token)void playSpeech(answer,data.issued,data.speech_token,turn,gestureKind);
   else{gesture(gestureKind);setTimeout(()=>{if(turn===generation&&avatar.state==='success'&&valid())avatar.set(active?'listening':'idle')},700)}
  }catch(error){
   if(turn!==generation||error.name==='AbortError')return;
   waiting.classList.remove('pending','assistant');waiting.classList.add('error','assistant');$('p',waiting).textContent=error.message||'اطلاعات در دسترس نیست.';
   avatar.set('error','پاسخ دریافت نشد؛ گفت‌وگوی متنی همچنان فعال است.');busy=false;
  }
 }
 function stopRecording(){
  if(recordingTimer)clearTimeout(recordingTimer);recordingTimer=0;
  if(recorder){recorder.onstop=null;try{if(recorder.state==='recording')recorder.stop()}catch{}recorder=null}
  recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;
  if(recordingContext){void recordingContext.close().catch(()=>{});recordingContext=null}
 }
 function stopListening({finishRecording=false}={}){
  if(recognitionRestart)clearTimeout(recognitionRestart);recognitionRestart=0;
  if(recognition){recognition.onend=null;recognition.onresult=null;try{recognition.abort()}catch{}recognition=null}
  if(finishRecording&&recorder?.state==='recording'){
   if(recordingTimer)clearTimeout(recordingTimer);recordingTimer=0;
   recorder.bamcoManualFinish=true;try{recorder.stop()}catch{stopRecording()}
  }else stopRecording();
  level(0);mic.setAttribute('aria-pressed','false');
 }
 async function transcribe(blob,mime){
  const data=new FormData(),ext=mime.includes('mp4')?'mp4':mime.includes('ogg')?'ogg':'webm';data.append('audio',blob,'voice.'+ext);
  const result=await fetch(`${SB_URL}/functions/v1/smart-assistant`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${session().token}`,'x-conversation-id':conversation},body:data,cache:'no-store'});
  const payload=await result.json().catch(()=>({}));if(!result.ok)throw Error(payload.error||'تبدیل صدا به متن انجام نشد.');return String(payload.transcript||'').trim();
 }
 async function recordFallback(){
  if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia)throw Error('میکروفون در این مرورگر پشتیبانی نمی‌شود.');
  const current=session(),stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  if(!active||!valid()||session().userId!==current.userId){stream.getTracks().forEach(track=>track.stop());return}
  recordingStream=stream;const mime=['audio/webm','audio/mp4','audio/ogg'].find(type=>typeof MediaRecorder.isTypeSupported!=='function'||MediaRecorder.isTypeSupported(type))||'',chunks=[];
  recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const instance=recorder;let heard=false,lastVoice=0,start=Date.now();
  instance.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data)};
  instance.onstop=async()=>{
   if(recorder!==instance)return;
   const manualFinish=instance.bamcoManualFinish===true,hasVoice=heard||(manualFinish&&chunks.length>0);
   recorder=null;stopRecording();if((!active&&!manualFinish)||!valid()||!hasVoice)return;
   avatar.set('thinking','در حال تبدیل صدا به متن…');
   try{const type=(instance.mimeType||mime||'audio/webm').split(';')[0],text=await transcribe(new Blob(chunks,{type}),type);if(text&&valid()&&!isEcho(text))void send(text)}
   catch(error){avatar.set('warning',error.message||'صدا تشخیص داده نشد.')}
   finally{if(active&&valid()&&!recorder&&!recognition)recognitionRestart=setTimeout(()=>void beginListening(),500)}
  };
  instance.start(250);avatar.set('listening');mic.setAttribute('aria-pressed','true');mic.title='در حال شنیدن؛ پس از پایان صحبت دوباره دکمه را بزنید.';
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(AudioContext){recordingContext=new AudioContext();await recordingContext.resume().catch(()=>{});const source=recordingContext.createMediaStreamSource(stream),analyser=recordingContext.createAnalyser();analyser.fftSize=1024;source.connect(analyser);const samples=new Uint8Array(analyser.fftSize);
   const listen=()=>{if(instance.state!=='recording')return;analyser.getByteTimeDomainData(samples);let power=0;for(const sample of samples){const diff=(sample-128)/128;power+=diff*diff}const amplitude=Math.sqrt(power/samples.length);level(Math.min(1,amplitude*8));
    if(amplitude>.045){heard=true;lastVoice=Date.now();if(avatar.state==='speaking')stopSpeech()}
    if((heard&&Date.now()-lastVoice>1100)||(Date.now()-start>20000)){instance.stop();return}
    recordingTimer=setTimeout(listen,100)
   };listen()
  }else recordingTimer=setTimeout(()=>instance.stop(),12000);
 }
 async function beginListening(){
  if(!active||!valid()||recognition||recorder)return;
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){try{await recordFallback()}catch(error){active=false;mic.setAttribute('aria-pressed','false');mic.title='میکروفون فعال نشد؛ اجازهٔ مرورگر را بررسی کنید.';avatar.set('warning',error.name==='NotAllowedError'?'اجازهٔ میکروفون داده نشد؛ دسترسی میکروفون سایت را در مرورگر فعال کنید.':error.message)}return}
  const recognizer=new Recognition();recognition=recognizer;recognizer.lang='fa-IR';recognizer.continuous=true;recognizer.interimResults=true;
  recognizer.onstart=()=>{if(active){mic.setAttribute('aria-pressed','true');if(!audio)avatar.set('listening')}};
  recognizer.onresult=event=>{
   for(let index=event.resultIndex;index<event.results.length;index++){
    const phrase=event.results[index]?.[0]?.transcript?.trim();if(!phrase)continue;
    if(avatar.state==='speaking'&&isEcho(phrase))continue;
    if(avatar.state==='speaking'&&phrase.length>3){stopSpeech();avatar.set('listening')}
    if(event.results[index].isFinal){void send(phrase);return}
    level(.45);
   }
  };
  recognizer.onerror=event=>{if(event.error==='not-allowed'||event.error==='service-not-allowed'){active=false;avatar.set('warning','اجازهٔ میکروفون داده نشد؛ دسترسی میکروفون سایت را در مرورگر فعال کنید.');mic.setAttribute('aria-pressed','false');mic.title='میکروفون در مرورگر مجاز نیست.'}else if(active)avatar.set('warning','صدا دریافت نشد؛ دوباره تلاش کنید.')};
  recognizer.onend=()=>{if(recognition===recognizer)recognition=null;if(active&&valid())recognitionRestart=setTimeout(()=>void beginListening(),350)};
  try{recognizer.start()}catch(error){recognition=null;active=false;avatar.set('warning',error.message||'میکروفون فعال نشد.')}
 }
 function toggleMic(){active=!active;if(active){stopSpeech();mic.title='در حال فعال‌سازی میکروفون…';void beginListening()}else{stopListening({finishRecording:true});mic.title='گفت‌وگوی صوتی';if(avatar.state!=='thinking')avatar.set('idle')}}
 function dispose(){generation++;answerAbort?.abort();answerAbort=null;active=false;busy=false;stopListening();stopSpeech();clearTimeout(blinkTimer);clearTimeout(blinkClose);clearTimeout(gestureTimer);view.dataset.avatarBlink='false';view.dataset.avatarGesture='neutral';view.style.setProperty('--avatar-gaze','0px');avatar.set('idle')}
 function activate(){
  dispose();conversation=conversationId();history=[];messages.replaceChildren();append('assistant','سلام! من برای مرور وظایف، پروژه‌ها و درخواست‌های شما آماده‌ام. از کجا شروع کنیم؟');
  input.value='';muted=false;mute.setAttribute('aria-pressed','false');view.dataset.avatarMotion='active';avatar.set('idle');gesture('greet');void loadSticker();blinkLoop();
 }
 mic.onclick=toggleMic;mute.onclick=()=>{muted=!muted;mute.setAttribute('aria-pressed',String(muted));mute.textContent=muted?'باصدا':'بی‌صدا';mute.setAttribute('aria-label',muted?'فعال کردن صدای دستیار':'بی‌صدا کردن دستیار');if(muted)stopSpeech()};
 stop.onclick=()=>{stopSpeech();avatar.set(active?'listening':'idle')};
 $('[data-assistant-new]',view).onclick=activate;$('[data-personal-home]',view).onclick=()=>window.bamcoShowHome?.();
 $('.assistant-composer',view).onsubmit=event=>{event.preventDefault();const text=input.value;input.value='';void send(text)};
 input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form.requestSubmit()}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopListening();stopSpeech();clearTimeout(blinkTimer);clearTimeout(blinkClose);view.dataset.avatarBlink='false'}else if(visible()){blinkLoop();if(active&&valid())void beginListening()}});
 window.addEventListener('beforeunload',dispose);
 return{activate,dispose,getState:()=>avatar.state,get voiceEnabled(){return active},get busy(){return busy}}
}
window.BamcoAssistantRuntime=Object.freeze({create});
})();

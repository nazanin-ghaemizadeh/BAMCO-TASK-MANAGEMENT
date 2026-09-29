const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {fixture,until}=require('./helpers/app-fixture.cjs');

const read=path=>fs.readFileSync(path,'utf8');

test('login offers two separate normal-looking secondary buttons and an inert one-time password',()=>{
 const source=read('assets/js/auth-ui.js');
 assert.match(source,/class="login-secondary-actions"/);
 assert.match(source,/class="department-back"[^>]*>بازگشت به انتخاب مدیریت/);
 assert.match(source,/class="login-otp"[^>]*aria-disabled="true"[^>]*>ورود با رمز یکبارمصرف/);
  assert.doesNotMatch(source,/class="login-otp"[^>]*\sdisabled(?:\s|>)/);
 assert.match(source,/login-otp[^\n]+preventDefault\(\)/);
 const css=read('assets/css/department-entry.css');
 assert.match(css,/\.login-secondary-actions\{display:grid;grid-template-columns:1fr 1fr;gap:10px/);
 assert.match(css,/login-secondary-actions button\{min-width:0!important;height:48px!important/);
});

test('personal tabs are grantable only through the administrator access matrix',()=>{
 const source=read('assets/js/navigation-registry.js');
 const accessRows=source.slice(source.indexOf('const accessMatrixRoutes'),source.indexOf('const routeDefinitions'));
 assert.match(accessRows,/'notes', 'voiceAssistant'/);
 assert.doesNotMatch(source,/PERSONAL_FEATURES/);
});

test('notes are pinned, editable and can move between active and inactive lists',async t=>{
 const f=await fixture({tables:{personal_notes:[]}});t.after(()=>f.dispose());
 await f.open('notes');
 const view=f.d.querySelector('#notesView');
 assert.deepEqual([...view.querySelectorAll('.personal-command-row>button')].map(button=>button.textContent.trim()),['بازگشت به خانه','یادداشت جدید','ویرایش','حذف']);
 assert.deepEqual([...view.querySelectorAll('[data-note-tab]')].map(button=>button.textContent.trim()),['یادداشت‌های فعال','یادداشت‌های غیرفعال']);
 view.querySelector('[data-note-new]').click();
 const form=view.querySelector('.personal-note-dialog form');
 form.elements.title.value='کارهای امروز';form.elements.body.value='پیگیری پروپوزال';form.requestSubmit();
 await until(()=>view.querySelector('.sticky-note'));
 const note=view.querySelector('.sticky-note');assert(note);assert.match(note.textContent,/📌/);assert.match(note.textContent,/کارهای امروز/);assert.match(note.textContent,/پیگیری پروپوزال/);
 note.querySelector('[data-note-toggle]').click();await until(()=>!view.querySelector('.sticky-note'));
 view.querySelector('[data-note-tab="inactive"]').click();assert.match(view.querySelector('.sticky-note').textContent,/کارهای امروز/);
 assert.deepEqual(f.errors,[]);
});

test('smart assistant keeps one animated character, simple voice controls and a fresh conversation',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 await f.open('voiceAssistant');
 const view=f.d.querySelector('#voiceAssistantView');
 assert(view.querySelector('.assistant-avatar-rig[role="img"] .assistant-avatar-frame.speaking[src="assets/images/assistant-female-speaking.png"]'));
 assert.equal(view.querySelectorAll('.assistant-avatar-frame').length,1,'the pose must not jump between still images');
 assert.equal(view.querySelector('[data-assistant-mute]'),null);
 assert.equal(view.querySelector('[data-assistant-stop]'),null);
 assert.doesNotMatch(view.querySelector('.assistant-messages').textContent,/هٔ/);
 assert.equal(view.querySelector('.assistant-state-sticker'),null,'the original fixed sticker is no longer the rendered avatar');
 const css=read('assets/css/personal-workspace.css');
 assert.match(css,/assistant-fallback-presence/);assert.match(read('assets/js/assistant-runtime.js'),/assistant-speech-beat/);assert.match(css,/assistant-avatar-puppet-ready \.assistant-avatar-canvas\{opacity:1\}/);
 assert.equal(view.querySelector('.assistant-prompts'),null);
 assert.equal(createHash('sha256').update(fs.readFileSync('assets/images/assistant-status1-female.png')).digest('hex'),'bb9d3ac1b2096138ac1e0cd8ec69e409c741ca6f28c3fee9f1a6d53fb7ffccc0');
 assert.match(view.querySelector('.assistant-messages').textContent,/سلام/);
 assert.equal(view.querySelectorAll('.assistant-message').length,1);
 const history=view.querySelector('.assistant-messages');
 Object.defineProperty(history,'scrollHeight',{configurable:true,get:()=>history.children.length*120});
 view.querySelector('.assistant-composer textarea').value='وظایف من چیست؟';
 view.querySelector('.assistant-composer').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>history.children.length>=3);
 assert.equal(history.scrollTop,history.scrollHeight,'new messages keep the history at its bottom');
 view.querySelector('.assistant-messages').insertAdjacentHTML('beforeend','<article class="assistant-message user">موقت</article>');
 await f.open('kanban');await f.open('voiceAssistant');
 assert.equal(view.querySelectorAll('.assistant-message').length,1);
 assert.doesNotMatch(view.querySelector('.assistant-messages').textContent,/موقت/);
 const edge=read('supabase/functions/smart-assistant/index.ts');
 assert.match(edge,/client\.from\('task_status_view'\)/);assert.match(edge,/OPENAI_API_KEY/);assert.match(edge,/effective_feature_access/);assert.match(edge,/store:false/);
 assert.deepEqual(f.errors,[]);
});

test('live voice streams over WebRTC, resolves a scoped task tool and releases microphone on exit',async t=>{
 assert.match(read('index.html'),/connect-src[^"<]*https:\/\/api\.openai\.com/,'the production CSP permits the Realtime call');
 assert.match(read('index.html'),/media-src[^"<]*blob:/,'generated speech can play from its object URL');
 const f=await fixture({fetchResult:({endpoint,body})=>endpoint==='smart-assistant'&&body?.action==='realtime_session'?{value:'ek_test'}:endpoint==='smart-assistant'&&body?.action==='context'?{context:{tasks:[{title:'گزارش کوره',description:'تحلیل داده‌ها'}]},actions:[]}:undefined});t.after(()=>f.dispose());
 const sent=[],track={stopped:false,stop(){this.stopped=true}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 Object.defineProperty(f.w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
 f.w.HTMLMediaElement.prototype.play=function(){return Promise.resolve()};f.w.HTMLMediaElement.prototype.pause=function(){};
 let audibleAnalysis=false,sampleLevel=151;
 f.w.AudioContext=class{constructor(){this.destination={}}createMediaStreamSource(){return{connect(){}}}createAnalyser(){return{fftSize:512,frequencyBinCount:256,getByteTimeDomainData(samples){samples.fill(sampleLevel)},getByteFrequencyData(samples){samples.fill(20)},connect(node){assert.equal(node.gain.value,0)}}}createGain(){return{gain:{value:1},connect:destination=>{assert.equal(destination,this.destination);audibleAnalysis=true}}}resume(){return Promise.resolve()}close(){return Promise.resolve()}};
 let peer,channel;
 f.w.RTCPeerConnection=class{
  constructor(){peer=this;this.connectionState='connected';this.iceGatheringState='gathering'}
  addTrack(){}
  createDataChannel(){channel={readyState:'open',send:value=>sent.push(JSON.parse(value)),close(){this.readyState='closed'}};return channel}
  async createOffer(){return{sdp:'v=0'}}
  async setLocalDescription(offer){this.localDescription=offer;setTimeout(()=>{this.localDescription={sdp:'v=0\na=candidate:1'};this.iceGatheringState='complete';this.onIce?.()},0)}
  addEventListener(name,handler){if(name==='icegatheringstatechange')this.onIce=handler}
  removeEventListener(name,handler){if(name==='icegatheringstatechange'&&this.onIce===handler)this.onIce=null}
  async setRemoteDescription(){channel.onopen?.();this.ontrack?.({streams:[{}]})}
  close(){this.connectionState='closed'}
 };
 await f.open('voiceAssistant');const view=f.d.querySelector('#voiceAssistantView'),button=view.querySelector('[data-assistant-live]');
 assert.equal(view.dataset.avatarState,'idle');button.click();
 await until(()=>view.dataset.avatarState==='speaking');
 assert.equal(button.getAttribute('aria-pressed'),'true');assert(f.calls.some(call=>call.endpoint==='smart-assistant'&&call.body?.action==='realtime_session'));
 assert(f.calls.some(call=>call.endpoint==='calls'&&call.body==='v=0\na=candidate:1'));
 assert(sent.some(event=>event.type==='response.create'&&event.response?.output_modalities?.[0]==='audio'),'the assistant speaks first when the call connects');
 assert.equal(audibleAnalysis,true,'the audio analyzer is connected without duplicating sound');
 assert(Number(view.style.getPropertyValue('--assistant-mouth-open'))>.3);
 channel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.completed',transcript:'چطور گزارش کوره را انجام بدهم؟'})});
 channel.onmessage({data:JSON.stringify({type:'response.output_audio_transcript.done',item_id:'reply-1',transcript:'اول داده‌ها را مرتب كنيد؛ مرحلة بعدی را بگوييد. دربارهٔ برنامه هم بپرسید.'})});
 assert.match(view.querySelector('.assistant-messages').textContent,/اول داده‌ها را مرتب کنید؛ مرحله بعدی را بگویید. درباره برنامه هم بپرسید/);
 await until(()=>view.dataset.avatarGesture==='count');
 channel.onmessage({data:JSON.stringify({type:'response.done',response:{output:[{type:'function_call',name:'lookup_workspace',call_id:'call-1',arguments:JSON.stringify({topic:'tasks',query:'گزارش کوره'})}]}})});
 await until(()=>sent.some(event=>event.item?.type==='function_call_output'));
 assert.match(sent.find(event=>event.item?.type==='function_call_output').item.output,/تحلیل داده‌ها/);
 assert(sent.some(event=>event.type==='response.create'));
 sampleLevel=128;channel.onmessage({data:JSON.stringify({type:'output_audio_buffer.stopped'})});await until(()=>Number(view.style.getPropertyValue('--assistant-mouth-open'))<.08);
 assert.equal(view.dataset.avatarViseme,'rest','silence closes the mouth');
 await f.open('kanban');assert.equal(view.dataset.avatarState,'idle');assert.equal(track.stopped,true);assert.equal(peer.connectionState,'closed');
 assert.equal(f.calls.some(call=>call.body instanceof FormData),false);assert.deepEqual(f.errors,[]);
});

test('blocked automatic audio playback offers a visible play action',async t=>{
 const f=await fixture({fetchResult:({endpoint,body})=>endpoint==='smart-assistant'&&body?.action==='realtime_session'?{value:'ek_test'}:undefined});t.after(()=>f.dispose());
 const track={stop(){}},stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 Object.defineProperty(f.w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
 let plays=0;
 f.w.HTMLMediaElement.prototype.play=function(){return ++plays===1?Promise.reject(new Error('autoplay blocked')):Promise.resolve()};
 f.w.HTMLMediaElement.prototype.pause=function(){};
 f.w.RTCPeerConnection=class{
  addTrack(){}
  createDataChannel(){return{readyState:'open',send(){},close(){this.readyState='closed'},onopen:null}}
  async createOffer(){return{sdp:'v=0'}}
  async setLocalDescription(offer){this.localDescription=offer}
  async setRemoteDescription(){this.ontrack?.({streams:[stream]})}
  close(){}
 };
 await f.open('voiceAssistant');const view=f.d.querySelector('#voiceAssistantView');
 view.querySelector('[data-assistant-live]').click();
 await until(()=>view.querySelector('[data-assistant-play]').hidden===false);
 assert.match(view.querySelector('.assistant-status').textContent,/پخش صدا/);
 view.querySelector('[data-assistant-play]').click();await until(()=>view.querySelector('[data-assistant-play]').hidden===true);
 assert.equal(plays,2);assert.deepEqual(f.errors,[]);
});

test('update request labels include the fields that actually changed',()=>{
 const source=read('assets/js/app.js'),start=source.indexOf('const requestTypeLabels='),end=source.indexOf('globalThis.bamcoRequestTypeLabel=requestTypeLabel;',start);
 const context={state:{tasks:[{id:7,title:'وظیفه',due_date:'2026-09-25',priority:'متوسط'}]},result:''};vm.createContext(context);
 vm.runInContext(source.slice(start,end)+`\nresult=requestTypeLabel({request_type:'update',task_id:7,proposed_data:{title:'وظیفه',due_date:'2026-10-01',priority:'متوسط'}});`,context);
 assert.equal(context.result,'ویرایش وظیفه - تاریخ پایان');
});

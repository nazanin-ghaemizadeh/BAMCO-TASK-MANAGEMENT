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

test('smart assistant rigs the exact status sticker and starts a fresh conversation on each entry',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 await f.open('voiceAssistant');
 const view=f.d.querySelector('#voiceAssistantView');
 assert(view.querySelector('.assistant-avatar-rig[role="img"] .assistant-state-sticker[src="assets/images/assistant-status1-female.png"]'));
 for(const part of ['head','eye-left','eye-right','pupil-left','pupil-right','brow-left','brow-right','lids','jaw','shoulder-left','shoulder-right','arm-left','arm-right','hand-left','hand-right'])assert(view.querySelector('.assistant-avatar-overlays .avatar-'+part),part+' layer');
 assert.equal(view.querySelector('.assistant-prompts'),null);
 view.querySelector('.assistant-state-sticker').dispatchEvent(new f.w.Event('error'));
 assert.equal(view.querySelector('.assistant-avatar-error').hidden,false,'avatar loading failure leaves chat available');
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

test('assistant voice state starts on demand and stops when the page closes',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 let recognizer;
 f.w.SpeechRecognition=class{
  constructor(){recognizer=this}
  start(){this.onstart?.()}
  abort(){this.onend?.()}
 };
 await f.open('voiceAssistant');const view=f.d.querySelector('#voiceAssistantView');
 assert.equal(view.dataset.avatarState,'idle');assert.equal(recognizer,undefined);
 const mic=view.querySelector('.assistant-mic');mic.click();
 assert.equal(view.dataset.avatarState,'listening');assert.equal(mic.getAttribute('aria-pressed'),'true');
 recognizer.onresult({resultIndex:0,results:[Object.assign([{transcript:'وظایف من چیست؟'}],{isFinal:true})]});
 assert.equal(view.dataset.avatarState,'thinking');
 await until(()=>view.querySelectorAll('.assistant-message').length>=3);
 mic.click();assert.equal(mic.getAttribute('aria-pressed'),'false');
 await f.open('kanban');assert.equal(view.dataset.avatarState,'idle');assert.deepEqual(f.errors,[]);
});

test('update request labels include the fields that actually changed',()=>{
 const source=read('assets/js/app.js'),start=source.indexOf('const requestTypeLabels='),end=source.indexOf('globalThis.bamcoRequestTypeLabel=requestTypeLabel;',start);
 const context={state:{tasks:[{id:7,title:'وظیفه',due_date:'2026-09-25',priority:'متوسط'}]},result:''};vm.createContext(context);
 vm.runInContext(source.slice(start,end)+`\nresult=requestTypeLabel({request_type:'update',task_id:7,proposed_data:{title:'وظیفه',due_date:'2026-10-01',priority:'متوسط'}});`,context);
 assert.equal(context.result,'ویرایش وظیفه - تاریخ پایان');
});

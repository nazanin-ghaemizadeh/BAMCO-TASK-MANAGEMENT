const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const metrics=require('../assets/js/dashboard-metrics.js');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('15 Shahrivar request card counts submitted requests, not every imported or direct task',()=>{
 const before='2026-09-05T20:29:59Z',start='2026-09-05T20:30:00Z';
 const requests=[{id:181,request_type:'create',requested_by:'owner',created_at:start,proposed_data:{owner_id:'owner'}},{id:180,request_type:'create',requested_by:'owner',created_at:before,proposed_data:{owner_id:'owner'}}];
 assert.equal(metrics.DEFAULT_MONITORING_START,start);
 assert.equal(metrics.requestDefinitionCountForSelection({requests:[...requests,requests[0]],tasks:[{id:999,created_by:'owner',created_at:start}]}),1);
 assert.equal(metrics.requestDefinitionCountForSelection({ownerId:'elsewhere',requests}),0);
});

test('task discussion exposes source, owner and Persian calendar, and permits another active colleague',async t=>{
 const f=await fixture({tables:{tasks:[{id:71,title:'کنترل کیفیت',owner_id:'test-manager',start_date:'2026-09-07',created_at:'2026-09-07T09:00:00Z',archived:false},{id:72,title:'آرشیوی',owner_id:'test-owner',start_date:'2026-09-08',created_at:'2026-09-08T09:00:00Z',archived:true}]}});t.after(()=>f.dispose());
 f.profiles.push({id:'test-colleague',full_name:'همکار دیگر',active:true,role:'owner'});
 await f.open('taskChats');await until(()=>f.d.querySelector('[data-task-choice="71"]'));
 const view=f.d.querySelector('#taskChatsView');
 assert(!view.textContent.includes('وظیفه را انتخاب کنید؛ سپس مخاطب گفت‌وگو را مشخص کنید.'));
 assert(view.querySelector('[data-task-owner]'));assert.equal(view.querySelector('[data-task-from]').type,'text');
 view.querySelector('[data-task-from]').click();assert(f.d.querySelector('#conversationJalaliDialog').open);
 const calendar=f.d.querySelector('#conversationJalaliDialog');assert(calendar.querySelector('select[name="year"]'));calendar.querySelector('[data-jalali-close]').click();
 view.querySelector('[data-task-choice="71"]').click();await until(()=>view.querySelector('[data-person="test-colleague"]'));
 view.querySelector('[data-person="test-colleague"]').click();await until(()=>view.querySelector('.messenger-compose'));
 assert.equal(f.calls.findLast(call=>call.endpoint==='chat_ensure_task_direct').body.p_other_user,'test-colleague');
 view.querySelector('.messenger-compose textarea').value='گفت‌وگو با همکار';view.querySelector('.messenger-compose').requestSubmit();await until(()=>f.messages.some(message=>message.body==='گفت‌وگو با همکار'));
 assert.deepEqual(f.errors,[]);
});

test('assistant uses a valid task view column list and a single female status sticker slot',async t=>{
 const source=fs.readFileSync('supabase/functions/smart-assistant/index.ts','utf8');
 assert(!source.includes('archived,owner_name'));assert(source.includes(".select('legacy_id,title,status,priority,start_date,due_date,done_date,archived')"));
 const f=await fixture();t.after(()=>f.dispose());await f.open('voiceAssistant');
 const view=f.d.querySelector('#voiceAssistantView');assert(view.querySelector('img.assistant-state-sticker[alt="استیکر خانم، وضعیت مطلوب"]'));
 assert.equal(view.querySelector('.assistant-prompts'),null);assert.equal(view.querySelector('.assistant-task-glance'),null);
 assert(view.querySelector('.assistant-mic'));assert.deepEqual(f.errors,[]);
});

test('microphone records, transcribes and sends speech through the authenticated assistant',async t=>{
 const f=await fixture({fetchResult:({endpoint,body})=>endpoint==='smart-assistant'?(body instanceof FormData?{transcript:'برنامهٔ امروز چیست؟'}:{text:'برنامهٔ امروز را مرور کنید.',response_id:'resp_fixture'}):undefined});t.after(()=>f.dispose());
 const w=f.w;w.FormData=FormData;
 Object.defineProperty(w.navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
 w.MediaRecorder=class{static isTypeSupported(type){return type==='audio/webm'}constructor(){this.mimeType='audio/webm;codecs=opus';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:'audio/webm'})});void this.onstop?.()}};
 await f.open('voiceAssistant');const button=f.d.querySelector('.assistant-mic');button.click();await until(()=>button.getAttribute('aria-pressed')==='true');button.click();
 await until(()=>f.calls.some(call=>call.endpoint==='smart-assistant'&&call.body instanceof FormData));
 await until(()=>f.calls.some(call=>call.endpoint==='smart-assistant'&&call.body?.message==='برنامهٔ امروز چیست؟'));
 assert.equal(button.getAttribute('aria-pressed'),'false');assert.deepEqual(f.errors,[]);
});

test('email login accepts both current and legacy internal Auth identities',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 assert.equal(f.w.loginEmail('Ahmadi@armanmotora rg.com'.replace(' ','')),'ahmadi@armanmotorarg.com');
 assert.equal(f.w.loginEmail('ahmadi'),'ahmadi@no-email.invalid');
 assert.deepEqual(Array.from(f.w.loginIdentityCandidates('ahmadi@armanmotorarg.com')),['ahmadi@armanmotorarg.com','ahmadi@no-email.invalid']);
 assert.deepEqual(Array.from(f.w.loginIdentityCandidates('ahmadi')),['ahmadi@no-email.invalid']);
});

test('legacy email identity is retried only after an invalid-credential response',async()=>{
 const source=fs.readFileSync('assets/js/app.js','utf8'),start=source.indexOf('function loginEmail('),end=source.indexOf('function apiErrorMessage(',start),calls=[];
 const context={api:async(_path,{body})=>{calls.push(body.email);if(calls.length===1){const error=new Error('invalid');error.code='invalid_credentials';throw error}return {access_token:'ok'}}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const result=await context.signInWithLogin('ahmadi@armanmotorarg.com','secret');
 assert.equal(result.access_token,'ok');assert.deepEqual(calls,['ahmadi@armanmotorarg.com','ahmadi@no-email.invalid']);
});

test('legacy email identity is also retried when Auth returns only its translated message',async()=>{
 const source=fs.readFileSync('assets/js/app.js','utf8'),start=source.indexOf('function loginEmail('),end=source.indexOf('function apiErrorMessage(',start),calls=[];
 const context={api:async(_path,{body})=>{calls.push(body.email);if(calls.length===1)throw new Error('نام کاربری یا رمز اشتباه است.');return {access_token:'ok'}}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 await context.signInWithLogin('ghaemizadeh@bamco.ir','secret');
 assert.deepEqual(calls,['ghaemizadeh@bamco.ir','ghaemizadeh@no-email.invalid']);
});

test('product engineering entry opens the sign-in form in one click',async t=>{
 const dom=new JSDOM('<body class="department-pending"><section id="departmentEntry"><header></header><button data-department="product">مهندسی محصول</button></section><section id="loginView" class="hidden"><form id="loginForm"><input id="email"></form></section><section id="appView" class="hidden"></section></body>',{runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());dom.window.eval(fs.readFileSync('assets/js/department-entry.js','utf8'));
 dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
 const d=dom.window.document;d.querySelector('[data-department="product"]').click();
 assert.equal(d.querySelector('#departmentEntry').hidden,true);
 assert.equal(d.querySelector('#loginView').classList.contains('hidden'),false);
 assert.equal(d.querySelector('#departmentChoiceDialog'),null);
});

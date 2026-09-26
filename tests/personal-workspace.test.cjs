const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {fixture}=require('./helpers/app-fixture.cjs');

const read=path=>fs.readFileSync(path,'utf8');

test('login offers one split secondary box with disabled one-time password',()=>{
 const source=read('assets/js/auth-ui.js');
 assert.match(source,/class="login-secondary-actions"/);
 assert.match(source,/class="department-back"[^>]*>بازگشت به انتخاب مدیریت/);
 assert.match(source,/class="login-otp"[^>]*disabled[^>]*>ورود با رمز یکبارمصرف/);
 const css=read('assets/css/department-entry.css');
 assert.match(css,/\.login-secondary-actions\{display:grid;grid-template-columns:1fr 1fr/);
});

test('notes are pinned, editable and can move between active and inactive lists',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 await f.open('notes');
 const view=f.d.querySelector('#notesView');
 assert.deepEqual([...view.querySelectorAll('.personal-command-row>button')].map(button=>button.textContent.trim()),['بازگشت به خانه','یادداشت جدید','ویرایش','حذف','یادداشت‌های غیرفعال']);
 view.querySelector('[data-note-new]').click();
 const form=view.querySelector('.personal-note-dialog form');
 form.elements.title.value='کارهای امروز';form.elements.body.value='پیگیری پروپوزال';form.requestSubmit();
 const note=view.querySelector('.sticky-note');assert(note);assert.match(note.textContent,/📌/);assert.match(note.textContent,/کارهای امروز/);assert.match(note.textContent,/پیگیری پروپوزال/);
 note.querySelector('[data-note-toggle]').click();assert.equal(view.querySelector('.sticky-note'),null);
 view.querySelector('[data-note-inactive]').click();assert.match(view.querySelector('.sticky-note').textContent,/کارهای امروز/);
 assert.deepEqual(f.errors,[]);
});

test('smart assistant starts a fresh animated task-aware conversation on each entry',async t=>{
 const f=await fixture();t.after(()=>f.dispose());
 await f.open('voiceAssistant');
 const view=f.d.querySelector('#voiceAssistantView');
 assert(view.querySelector('.assistant-character'));
 assert.match(view.querySelector('.assistant-messages').textContent,/سلام/);
 assert.equal(view.querySelectorAll('.assistant-message').length,1);
 view.querySelector('.assistant-messages').insertAdjacentHTML('beforeend','<article class="assistant-message user">موقت</article>');
 await f.open('kanban');await f.open('voiceAssistant');
 assert.equal(view.querySelectorAll('.assistant-message').length,1);
 assert.doesNotMatch(view.querySelector('.assistant-messages').textContent,/موقت/);
 const edge=read('supabase/functions/smart-assistant/index.ts');
 assert.match(edge,/client\.from\('task_status_view'\)/);assert.match(edge,/OPENAI_API_KEY/);assert.match(edge,/previous_response_id/);assert.match(edge,/safety_identifier/);
 assert.deepEqual(f.errors,[]);
});

test('update request labels include the fields that actually changed',()=>{
 const source=read('assets/js/app.js'),start=source.indexOf('const requestTypeLabels='),end=source.indexOf('globalThis.bamcoRequestTypeLabel=requestTypeLabel;',start);
 const context={state:{tasks:[{id:7,title:'وظیفه',due_date:'2026-09-25',priority:'متوسط'}]},result:''};vm.createContext(context);
 vm.runInContext(source.slice(start,end)+`\nresult=requestTypeLabel({request_type:'update',task_id:7,proposed_data:{title:'وظیفه',due_date:'2026-10-01',priority:'متوسط'}});`,context);
 assert.equal(context.result,'ویرایش وظیفه - تاریخ پایان');
});

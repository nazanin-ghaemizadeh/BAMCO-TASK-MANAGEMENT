const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('people directory exposes mobile and extension fields end to end',()=>{
 const shell=read('assets/js/shell.js');
 const app=read('assets/js/app.js');
 const edge=read('supabase/functions/admin-users/index.ts');
 const migration=read('supabase/migrations/20260926052000_add_profile_contact_fields.sql');
 for(const source of [shell,app,edge,migration]){
  assert.match(source,/mobile_phone/);
  assert.match(source,/internal_extension/);
 }
 assert.match(shell,/شماره همراه/);
 assert.match(shell,/شماره داخلی/);
 assert.match(migration,/alter table public\.profiles/);
 assert.match(edge,/شماره همراه معتبر نیست/);
});

test('person contact numbers display Persian digits with blank placeholders and save normalized values',async t=>{
 const f=await fixture(),{d,w}=f;t.after(()=>f.dispose());
 const person=f.profiles.find(p=>p.id==='test-owner');person.mobile_phone='09193460031';person.internal_extension='7488';
 await f.open('people');await until(()=>d.querySelector('#peopleBody [data-id="test-owner"]'));
 w.bamcoSelection.set('#peopleBody',['test-owner']);d.querySelector('#editPersonBtn').click();
 const form=d.querySelector('#personForm'),mobile=form.elements.mobile_phone,extension=form.elements.internal_extension;
 assert.equal(mobile.getAttribute('placeholder'),null);assert.equal(extension.getAttribute('placeholder'),null);
 assert.equal(mobile.value,'۰۹۱۹۳۴۶۰۰۳۱');assert.equal(extension.value,'۷۴۸۸');
 mobile.value='091٢';mobile.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(mobile.value,'۰۹۱۲');
 extension.value='۵۴۳۲';form.requestSubmit();await until(()=>!d.querySelector('#personDialog').open);
 const saved=f.calls.findLast(call=>call.endpoint==='admin-users'&&call.method==='POST').body;
 assert.equal(saved.mobile_phone,'0912');assert.equal(saved.internal_extension,'5432');assert.deepEqual(f.errors,[]);
});

test('personal workspace keeps one command row and defaults to active notes',()=>{
 const source=read('assets/js/personal-workspace.js');
 const css=read('assets/css/personal-workspace.css');
 assert.match(source,/data-note-tab="active"/);
 assert.match(source,/data-note-tab="inactive"/);
 assert.match(source,/inactiveMode=false;selectedNote='';void loadNotes\(\)/);
 assert.doesNotMatch(source,/data-note-inactive/);
 assert.match(css,/flex-wrap:wrap/);
 assert.match(css,/assistant-wave-right/);
 assert.match(css,/assistant-blink/);
});

test('task discussion recipients and registered-task edits use the same server authorization boundary',()=>{
 const migration=read('supabase/migrations/20260926113231_task_edit_and_chat_recipient_scope.sql');
 const conversation=read('assets/js/conversations.js');
 assert.match(migration,/status='ثبت شده'/);
 assert.match(migration,/organization_actor_can_access_task_chat\(profile\.id,p_task_id,'view'\)/);
 assert.match(conversation,/chat_task_recipient_ids/);
});

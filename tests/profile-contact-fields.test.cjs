const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

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

test('personal workspace keeps one command row and defaults to active notes',()=>{
 const source=read('assets/js/personal-workspace.js');
 const css=read('assets/css/personal-workspace.css');
 assert.match(source,/data-note-tab="active"/);
 assert.match(source,/data-note-tab="inactive"/);
 assert.match(source,/inactiveMode=false;selectedNote='';loadNotes\(\);renderNotes\(\)/);
 assert.doesNotMatch(source,/data-note-inactive/);
 assert.match(css,/flex-wrap:wrap/);
 assert.match(css,/assistant-wave-right/);
 assert.match(css,/assistant-blink/);
});

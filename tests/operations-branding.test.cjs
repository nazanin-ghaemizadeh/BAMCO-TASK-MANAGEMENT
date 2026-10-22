const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('approved operations name is consistent across login and home',()=>{
 for(const p of ['index.html','assets/js/card-home.js','assets/js/task-ui.js','assets/js/ux.js','manifest.webmanifest']){
  assert(read(p).includes('سامانه یکپارچه مدیریت عملیات'),p);
  assert(!read(p).includes('سامانه مدیریت، پایش و پیگیری امور'),p);
 }
});
test('verification digits override the login Tahoma rule with Times New Roman',()=>{
 assert.match(read('assets/css/department-entry.css'),/#loginVerifyDisplay[^}]*#loginVerifyCode[^}]*\.login-code-slots span\{font-family:'Times New Roman',Times,serif!important\}/);
});
test('local people directory explains its scope without changing global authorization',()=>{
 const shell=read('assets/js/shell.js');
 assert(shell.includes('افراد واحد جاری'));
 assert(shell.includes('محدوده نمایش: '));
 assert(shell.includes('window.BamcoWorkspace?.title?.()'));
});

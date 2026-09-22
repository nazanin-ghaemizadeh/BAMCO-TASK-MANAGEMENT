const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole,requestInterceptor}=require('jsdom');
const root=path.join(__dirname,'..');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await pause(30)}assert.fail('Timed out waiting for the actual UI handler');}

const {fixture}=require('./helpers/app-fixture.cjs');

test('people credential action edits an emailed user and the Excel export contains only safe account state',async t=>{
 let f;f=await fixture({fetchResult:({endpoint,body})=>{
  // The canonical directory performs a GET before a credential action.
  if(endpoint!=='admin-users'||!body?.action)return;
  const person=f.profiles.find(p=>p.id===body.user_id);
  if(body.action==='save_credentials'){person.login_name=body.login_name;person.must_change_password=!!body.temporary_password}
  return {ok:true,id:person.id,login_name:person.login_name||person.email,credential_editable:true};
 }});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('people');const view=d.querySelector('#peopleView');
 await until(()=>view.querySelector('#peopleBody [data-id="test-owner"]'));
 assert.deepEqual([...view.querySelectorAll('thead tr:first-child th')].map(x=>x.textContent),['فرد','عکس پروفایل','نقش سازمانی','سمت سازمانی','دسترسی سامانه','جنسیت','پست الکترونیک سازمانی','نام کاربری','رمز عبور','عنوان خطاب','فعال']);
 const ownerRow=view.querySelector('#peopleBody [data-id="test-owner"]');assert.equal(ownerRow.cells[0].textContent.trim(),'متولی آزمایشی');assert.equal(ownerRow.cells[1].classList.contains('people-avatar-cell'),true);assert.equal(ownerRow.cells[1].querySelector('[data-profile-photo="test-owner"]')!==null,true);
 view.querySelector('[data-person-credentials="test-owner"]').click();await until(()=>d.querySelector('#initialCredentials')?.open);
 const form=d.querySelector('#initialCredentials form');assert.equal(form.elements.login_name.value,'owner@example.test');assert.equal(form.elements.temporary_password.value,'');
 form.elements.login_name.value='owner.updated';form.elements.temporary_password.value='Fixture-temporary9!';form.requestSubmit();
 await until(()=>view.textContent.includes('owner.updated'));assert(view.textContent.includes('رمز موقت؛ نیازمند تغییر'));assert(!view.textContent.includes('Fixture-temporary9!'));
 form.querySelector('[type=button]').click();assert.equal(d.querySelector('#initialCredentials').childElementCount,0);
 w.bamcoSelection.clear('#peopleBody');view.querySelector('[data-management-export]').click();await until(()=>f.downloads.length);
 const bytes=await f.downloads[0].blob.arrayBuffer(),book=w.XLSX.read(new Uint8Array(bytes),{type:'array'}),rows=w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:''}),headers=Array.from(view.querySelectorAll('thead tr:first-child th'),x=>x.textContent.trim()),exported=rows.find(row=>row[0]==='متولی آزمایشی');
 assert.deepEqual(Array.from(rows[0]),headers,'Excel headers must exactly match the visible table order');
 assert.deepEqual(Array.from(exported),['متولی آزمایشی','بدون تصویر','بدون نقش سازمانی','بدون جایگاه','کاربر سامانه','—','owner@example.test','owner.updated','رمز موقت؛ نیازمند تغییر','—','بله'],'Excel row must use the same central people columns as the UI');
 assert(!rows.flat().includes('Fixture-temporary9!'));
 w.bamcoSelection.set('#peopleBody',['test-owner']);view.querySelector('[data-management-export]').click();await until(()=>f.downloads.length===2);
 const selectedBook=w.XLSX.read(new Uint8Array(await f.downloads[1].blob.arrayBuffer()),{type:'array'}),selectedRows=w.XLSX.utils.sheet_to_json(selectedBook.Sheets[selectedBook.SheetNames[0]],{header:1,defval:''});
 assert.equal(selectedRows.length,2,'selected export must contain only the selected visible person');assert.equal(selectedRows[1][0],'متولی آزمایشی');assert.deepEqual(f.errors,[]);
});

test('management pages: shipped click handlers, toolbars, Excel downloads and return navigation',async t=>{
 const f=await fixture(),{w,d}=f;t.after(()=>f.dispose());
 await t.test('people selection, add, edit, validation feedback, cancel and delete',async()=>{
  await f.open('people');await until(()=>d.querySelectorAll('#peopleBody tr[data-id]').length===2);
  assert(!d.querySelector('#editPersonBtn').disabled);assert(d.querySelector('#deletePersonBtn').disabled);d.querySelector('#editPersonBtn').click();assert(d.querySelector('#personPickerDialog').open);d.querySelector('#personPickerDialog button[type=button]').click();
  const row=d.querySelector('#peopleBody [data-id="test-owner"]');row.click();row.click();
  assert.equal(d.querySelector('#peopleBody [data-id="test-owner"]'),row,'click must preserve the row for double-click editing');
  assert.equal(row.getAttribute('aria-selected'),'false');row.click();assert(!d.querySelector('#editPersonBtn').disabled);
  row.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));assert(d.querySelector('#personDialog').open);
  const form=d.querySelector('#personForm');assert.equal(form.elements.full_name.value,'متولی آزمایشی');
  d.querySelector('[data-person-close]').click();assert(!d.querySelector('#personDialog').open);
  d.querySelector('#editPersonBtn').click();form.elements.full_name.value='متولی ویرایش‌شده';form.querySelector('[type=submit]').click();
  await until(()=>!d.querySelector('#personDialog').open);await until(()=>d.querySelector('#peopleBody').textContent.includes('متولی ویرایش‌شده'));
  // Saving a person is followed by a canonical directory refresh.  Assert the
  // mutation itself rather than treating the later GET refresh as a write.
  assert.equal(f.calls.filter(c=>c.endpoint==='admin-users'&&c.method!=='GET').at(-1).body.user_id,'test-owner');
  d.querySelector('#addPersonBtn').click();form.elements.full_name.value='فرد جدید';f.setFailSave(true);form.requestSubmit();
  await until(()=>d.querySelector('#personError').textContent);assert(d.querySelector('#personDialog').open);assert(!form.querySelector('[type=submit]').disabled);
  f.setFailSave(false);form.requestSubmit();await until(()=>!d.querySelector('#personDialog').open);await until(()=>d.querySelector('#peopleBody [data-id="test-new"]'));
  assert.equal(f.profiles.find(p=>p.id==='test-new').messaging_enabled,true);
  d.querySelector('#peopleBody [data-id="test-new"]').click();d.querySelector('#deletePersonBtn').click();
  await until(()=>!d.querySelector('#peopleBody [data-id="test-new"]'));assert(d.querySelector('#deletePersonBtn').disabled);
  assert.equal(f.calls.filter(c=>c.endpoint==='admin-users'&&c.method==='DELETE').length,1);
 });
 await t.test('one home button and a working full Excel export beside people actions',async()=>{
  const view=d.querySelector('#peopleView'),back=view.querySelector('.content-back'),exportButton=view.querySelector('[data-management-export]');
  assert.equal(view.querySelectorAll('.content-back,[data-empty-home]').length,1);assert.equal(view.querySelector('.bamco-page-heading button'),null);
  assert.equal(back.parentElement,exportButton.parentElement);assert.equal(exportButton.parentElement,d.querySelector('#addPersonBtn').parentElement);
  assert.equal(view.querySelector('.suite-table-options [data-suite-export]'),null);w.bamcoSelection.clear('#peopleBody');
  d.querySelector('#peopleSearch').value='مدیر';d.querySelector('#peopleSearch').dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(d.querySelectorAll('#peopleBody tr[data-id]').length,1);exportButton.click();await until(()=>f.downloads.length===1);
  const bytes=await f.downloads[0].blob.arrayBuffer(),book=w.XLSX.read(new Uint8Array(bytes),{type:'array'}),rows=w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
  assert.equal(rows.length,3,'full export must include users outside the search');assert(rows.flat().includes('متولی ویرایش‌شده'));assert.match(f.downloads[0].name,/\.xlsx$/);
  back.click();assert(!d.querySelector('#homeView').classList.contains('hidden'));assert(view.classList.contains('hidden'));assert.equal(w.eval('state.view'),'home');
 });
 for(const id of ['loginActivity','activeSessions'])await t.test(id+': no metric cards or filtered export; refresh, Excel and home share one toolbar',async()=>{
  await f.open(id);const view=d.querySelector('#'+id+'View');await until(()=>view.querySelector('table.suite-table'));
  assert.equal(view.querySelector('.workspace-metrics'),null);assert.equal(view.querySelector('[data-report-export="filtered"],.suite-table-options [data-suite-export]'),null);
  assert.equal(view.querySelectorAll('.content-back,[data-empty-home]').length,1);assert.equal(view.querySelector('.bamco-page-heading button'),null);
  const back=view.querySelector('.content-back'),exp=view.querySelector('[data-report-export="all"]'),refresh=view.querySelector('[data-tab-refresh]');
  assert.equal(back.parentElement,exp.parentElement);assert.equal(refresh.parentElement,exp.parentElement);
  const count=f.downloads.length;exp.click();await until(()=>f.downloads.length===count+1);assert(f.downloads.at(-1).blob.size>1000);
  const reads=f.calls.filter(c=>c.endpoint==='user_sessions').length;refresh.click();await until(()=>f.calls.filter(c=>c.endpoint==='user_sessions').length>reads);await until(()=>view.querySelector('table.suite-table'));
  if(id==='activeSessions'){view.querySelector('[data-end-session]').click();await until(()=>f.calls.some(c=>c.endpoint==='revoke_user_session'));await until(()=>!view.querySelector('[data-end-session]'))}
  await pause(60);assert.equal(view.querySelectorAll('.content-back,[data-empty-home]').length,1);view.querySelector('.content-back').click();assert(view.classList.contains('hidden'));assert(!d.querySelector('#homeView').classList.contains('hidden'));
 });
 await t.test('account password entry opens the same form used for the mandatory first login',async()=>{
  await f.open('settings');d.querySelector('#changePasswordBtn').click();assert(d.querySelector('#passwordDialog').open);assert(!d.querySelector('#cancelPasswordBtn').classList.contains('hidden'));
  d.querySelector('#cancelPasswordBtn').click();assert(!d.querySelector('#passwordDialog').open);
  f.profiles[0].must_change_password=true;await w.eval('enterApp()');assert(d.querySelector('#passwordDialog').open);assert(d.querySelector('#cancelPasswordBtn').classList.contains('hidden'));
 });
 assert.deepEqual(f.errors,[],'no JavaScript exceptions during the actual click paths');
});

test('hidden people view wins over legacy active-nav CSS; account and password sizes are explicit',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),dialog=html.match(/<dialog id="passwordDialog"[\s\S]*?<\/dialog>/)[0];
 const dom=new JSDOM('<main id="appView"><nav id="nav"><button class="active" data-view="people"></button></nav><section id="peopleView" class="view manager-only bamco-interior hidden"></section><section id="settingsView" class="bamco-interior"><div class="manager-form"></div></section></main>'+dialog);
 const {window:w}=dom;for(const file of ['app.css','unified-ui.css']){const style=w.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'assets/css',file),'utf8');w.document.head.append(style)}
 assert.equal(w.getComputedStyle(w.document.querySelector('#peopleView')).display,'none');
 assert.equal(w.getComputedStyle(w.document.querySelector('#settingsView .manager-form')).maxWidth,'none');
 const image=w.getComputedStyle(w.document.querySelector('.first-login-brand img'));assert.equal(image.width,'100px');assert.equal(image.height,'64px');
 assert.equal(w.getComputedStyle(w.document.querySelector('.first-login-fields')).display,'grid');
 w.document.querySelector('#cancelPasswordBtn').classList.add('hidden');assert.equal(w.getComputedStyle(w.document.querySelector('#cancelPasswordBtn')).display,'none');w.close();
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
function unzipStored(bytes){const result=new Map();let at=0;while(bytes.readUInt32LE(at)===0x04034b50){const size=bytes.readUInt32LE(at+18),nameLength=bytes.readUInt16LE(at+26),extraLength=bytes.readUInt16LE(at+28),start=at+30+nameLength+extraLength;assert.equal(bytes.readUInt16LE(at+8),0);result.set(bytes.subarray(at+30,at+30+nameLength).toString(),bytes.subarray(start,start+size).toString());at=start+size}return result}

test('creation shows whole credential labels above separate fields and clears secrets on close',async t=>{
 const f=await fixture({styles:true,fetchResult:({endpoint,method,body,data})=>endpoint==='admin-users'&&method==='POST'&&!body.user_id?{...data,login_name:'fixture@example.invalid',temporary_password:'Synthetic-password-99!'}:undefined}),{d,w}=f;t.after(()=>f.dispose());await f.open('people');
 d.querySelector('#addPersonBtn').click();const form=d.querySelector('#personForm');form.elements.full_name.value='فرد آزمایشی';form.requestSubmit();await until(()=>d.querySelector('#initialCredentials')?.open);
 const dialog=d.querySelector('#initialCredentials');assert.equal(dialog.querySelector('#initialLoginName').value,'fixture@example.invalid');assert.equal(dialog.querySelector('#initialTemporaryPassword').value,'Synthetic-password-99!');
 for(const [id,label] of [['initialLoginName','نام کاربری'],['initialTemporaryPassword','رمز عبور موقت']]){const input=d.getElementById(id),field=input.parentElement,labelEl=field.querySelector('label');assert.equal(labelEl.textContent,label);assert.equal(labelEl.htmlFor,id);assert.equal(labelEl.nextElementSibling,input);assert.equal(w.getComputedStyle(labelEl).display,'block');assert.equal(w.getComputedStyle(labelEl).whiteSpace,'nowrap');assert.equal(w.getComputedStyle(field).display,'grid')}
 assert.equal(f.calls.filter(c=>c.endpoint==='admin-users'&&c.method==='POST').length,1);dialog.querySelector('button').click();assert.equal(dialog.children.length,0);assert(!d.body.innerHTML.includes('Synthetic-password-99!'));assert.deepEqual(f.errors,[]);
});

test('people Excel writes explicit borders for every cell for selected and complete exports',async t=>{
 const f=await fixture(),{d,w}=f;t.after(()=>f.dispose());await f.open('people');await until(()=>d.querySelector('#peopleBody [data-id=test-owner]'));
 for(const selected of [true,false]){
  w.bamcoSelection.set('#peopleBody',selected?['test-owner']:[]);const before=f.downloads.length;d.querySelector('#peopleView [data-management-export]').click();await until(()=>f.downloads.length>before);
  const bytes=Buffer.from(await f.downloads.at(-1).blob.arrayBuffer()),files=unzipStored(bytes),parser=new w.DOMParser(),style=parser.parseFromString(files.get('xl/styles.xml'),'text/xml'),sheet=parser.parseFromString(files.get('xl/worksheets/sheet1.xml'),'text/xml');
  assert.equal(style.querySelector('parsererror'),null);const border=style.querySelectorAll('borders>border')[1];for(const side of ['left','right','top','bottom']){assert.equal(border.querySelector(side).getAttribute('style'),'thin');assert.equal(border.querySelector(side+' color').getAttribute('rgb'),'FF718477')}
  const formats=style.querySelectorAll('cellXfs>xf');for(const cell of sheet.querySelectorAll('sheetData c')){const format=formats[Number(cell.getAttribute('s'))];assert.equal(format.getAttribute('borderId'),'1');assert.equal(format.getAttribute('applyBorder'),'1')}
  const columnCount=d.querySelectorAll('#peopleView table thead tr:first-child th').length;assert.equal(sheet.querySelectorAll('sheetData c').length,(selected?2:3)*columnCount);const book=w.XLSX.read(new Uint8Array(bytes),{type:'array'}),rows=w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});assert.equal(rows.length,selected?2:3);
 }
 assert.deepEqual(f.errors,[]);
});

test('failed deletion is reported without removing the row or preventing another edit',async t=>{
 const f=await fixture(),{d}=f;t.after(()=>f.dispose());await f.open('people');await until(()=>d.querySelector('#peopleBody [data-id=test-owner]'));d.querySelector('#peopleBody [data-id=test-owner]').click();f.failures.add('admin-users');d.querySelector('#deletePersonBtn').click();await until(()=>f.calls.some(c=>c.endpoint==='ui-notice'&&c.body.includes('۰ حساب حذف شد')));assert(d.querySelector('#peopleBody [data-id=test-owner]'));
 f.failures.delete('admin-users');assert.equal(d.querySelector('#peopleBody [data-id=test-owner]').getAttribute('aria-selected'),'true');d.querySelector('#editPersonBtn').click();assert(d.querySelector('#personDialog').open);assert.deepEqual(f.errors,[]);
});

test('deletion opens a centered reassignment dialog without navigating to Kanban',async t=>{
 const tasks=[{id:901,title:'کار فعال',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-01',due_date:'2026-09-15',row_version:1,archived:false},{id:902,title:'کار آرشیوی',owner_id:'test-owner',status:'انجام شده',archived:true}];
 const f=await fixture({tables:{tasks},fetchResult:({endpoint,method,body})=>{if(endpoint==='admin-users'&&method==='DELETE'){for(const task of tasks)if(task.owner_id===body.user_id)Object.assign(task,{owner_id:null,former_owner_name:'متولی آزمایشی',owner_deleted_at:'2026-09-10T00:00:00Z'});return {ok:true,tasks_retained:2,active_tasks:tasks.filter(t=>!t.archived)}}}}),{d}=f;t.after(()=>f.dispose());
 await f.open('people');d.querySelector('#peopleBody [data-id=test-owner]').click();d.querySelector('#deletePersonBtn').click();await until(()=>d.querySelector('#peopleTransferDialog')?.open);
 assert.equal(d.querySelector('#peopleView').classList.contains('hidden'),false);assert.equal(d.querySelector('#kanbanView').classList.contains('hidden'),true);
 const item=d.querySelector('[data-task="901"]');assert(item);assert.match(item.textContent,/شناسه ۹۰۱/);assert.match(item.textContent,/متولی آزمایشی/);assert(!d.querySelector('[data-task="902"]'));
 item.querySelector('select').value='test-manager';item.querySelector('[data-save-task]').click();await until(()=>tasks[0].owner_id==='test-manager');assert.equal(tasks[0].due_date,'2026-09-15');assert.equal(tasks[1].owner_id,null);
 d.querySelector('[data-close-transfer]').click();assert(!d.querySelector('#peopleTransferDialog').open);assert.deepEqual(f.errors,[]);
});

test('historical chat messages retain the deleted sender name and body without an account profile',async t=>{
 const f=await fixture(),{d}=f;t.after(()=>f.dispose());f.messages.push({id:901,thread_id:'test-room',sender_id:null,sender_name_snapshot:'همکار سابق <script>',body:'متن محفوظ سابقه',created_at:'2026-09-01T09:00:00Z'});
 await f.open('groupChat');await until(()=>d.querySelector('.chat-sender'));assert.equal(d.querySelector('.chat-sender').textContent,'همکار سابق <script>');assert.equal(d.querySelector('.chat-body').textContent,'متن محفوظ سابقه');assert(!d.querySelector('.chat-sender script'));assert.deepEqual(f.errors,[]);
});

test('the surviving user can open a deleted contact conversation from the list, read history and cannot send',async t=>{
 const thread={id:'old-direct',title:'سابقه',thread_type:'direct',is_active:false,deleted_participant_name:'همکار سابق',participant_deleted_at:'2026-09-10T00:00:00Z'};
 const f=await fixture({fetchResult:({endpoint})=>endpoint==='chat_conversation_list'?[thread]:undefined}),{d}=f;t.after(()=>f.dispose());f.members.push({thread_id:thread.id,user_id:'test-manager',member_role:'member'});f.messages.push({id:912,thread_id:thread.id,sender_id:null,sender_name_snapshot:'همکار سابق',body:'گفت‌وگوی محفوظ',created_at:'2026-09-01T09:00:00Z'});
 await f.open('directMessages');await until(()=>d.querySelector('[data-thread="old-direct"]'));d.querySelector('[data-thread="old-direct"]').click();await until(()=>d.querySelector('.chat-body'));assert.equal(d.querySelector('.chat-sender').textContent,'همکار سابق');assert.equal(d.querySelector('.chat-body').textContent,'گفت‌وگوی محفوظ');assert(d.querySelector('.messenger-compose').hidden);assert(!d.querySelector('.message-reply'));d.querySelector('.messenger-compose textarea').value='نباید ارسال شود';d.querySelector('.messenger-compose').requestSubmit();assert(!f.calls.some(c=>c.endpoint==='chat_send_message'));assert.deepEqual(f.errors,[]);
});

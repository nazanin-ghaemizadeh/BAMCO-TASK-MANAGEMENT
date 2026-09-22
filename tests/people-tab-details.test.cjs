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

test('delete immediately opens Kanban and retains active/archive tasks for individual transfer',async t=>{
 const tasks=[{id:901,title:'کار فعال',description:'توضیح محفوظ',owner_id:'test-owner',status:'در حال انجام',priority:'متوسط',start_date:'2026-09-01',due_date:'2026-09-15',archived:false},{id:902,title:'کار آرشیوی',owner_id:'test-owner',status:'انجام شده',priority:'متوسط',start_date:'2026-08-01',due_date:'2026-08-10',done_date:'2026-08-10',archived:true}];
 const f=await fixture({tables:{tasks},fetchResult:({endpoint,method,body,data})=>{if(endpoint==='admin-users'&&method==='DELETE'){for(const task of tasks)if(task.owner_id===body.user_id)Object.assign(task,{owner_id:null,former_owner_name:'متولی آزمایشی',owner_deleted_at:'2026-09-10T00:00:00Z'});return {ok:true,tasks_retained:2,active_tasks:tasks.filter(t=>!t.archived)}}}}),{d}=f;t.after(()=>f.dispose());
 await f.open('people');d.querySelector('#peopleBody [data-id=test-owner]').click();d.querySelector('#deletePersonBtn').click();d.querySelector('#deletePersonBtn').click();await until(()=>d.querySelector('#peopleTransferBanner')&&!d.querySelector('#kanbanView').classList.contains('hidden'));assert(!d.querySelector('#peopleBody [data-id=test-owner]'));assert.equal(f.calls.filter(c=>c.endpoint==='admin-users'&&c.method==='DELETE').length,1);
 assert.match(d.querySelector('#peopleTransferText').textContent,/۲ وظیفه حفظ شد/);const row=d.querySelector('#kanbanBody [data-task-id="901"]');assert.match(row.textContent,/متولی آزمایشی.*نیازمند تعیین تکلیف/);row.click();d.querySelector('#transferOwnerBtn').click();const form=d.querySelector('#transferOwnerDialog form');form.elements.owner_id.value='test-manager';form.requestSubmit();await until(()=>!d.querySelector('#transferOwnerDialog').open);assert.equal(tasks[0].owner_id,'test-manager');assert.equal(tasks[0].due_date,'2026-09-15');assert.equal(tasks[1].owner_id,null);assert.equal(tasks[1].archived,true);
 await f.open('archive');assert.match(d.querySelector('#archiveBody').textContent,/متولی آزمایشی.*حساب حذف شده/);assert.doesNotMatch(d.querySelector('#archiveBody').textContent,/نیازمند تعیین تکلیف/);assert.deepEqual(f.errors,[]);
});

test('deletion clears stale filters, shows only affected active tasks and transfers one task at a time',async t=>{
 let holdReads=false;const pendingReads=[];
 const tasks=[
  {id:931,title:'کار اول',owner_id:'test-owner',status:'در حال انجام',row_version:1,archived:false},
  {id:932,title:'کار دوم',owner_id:'test-owner',status:'منتظر پاسخ',row_version:1,archived:false},
  {id:933,title:'کار تکمیل شده',owner_id:'test-owner',status:'انجام شده',archived:false},
  {id:934,title:'کار کنسل شده',owner_id:'test-owner',status:'متوقف',archived:false},
  {id:935,title:'کار فرد دیگر',owner_id:'test-manager',status:'در حال انجام',archived:false}
 ];
 const f=await fixture({tables:{tasks},fetchResult:({endpoint,method,body,data})=>{
  if(holdReads&&['task_status_view','change_requests'].includes(endpoint))return new Promise(resolve=>pendingReads.push(()=>resolve(data)));
  if(endpoint==='admin-users'&&method==='DELETE'){
   for(const task of tasks)if(task.owner_id===body.user_id)Object.assign(task,{owner_id:null,former_owner_name:'متولی آزمایشی',owner_deleted_at:'2026-09-10T00:00:00Z',row_version:2});
   return {ok:true,tasks_retained:4,active_tasks:tasks.filter(t=>[931,932].includes(t.id))};
  }
 }}),{w,d}=f;t.after(()=>f.dispose());
 w.eval("tableFilters.kanban[4]='انجام شده'");d.querySelector('#kanbanSearch').value='ناموجود';
 await f.open('people');d.querySelector('#peopleBody [data-id=test-owner]').click();const before=f.calls.length;holdReads=true;d.querySelector('#deletePersonBtn').click();
 await until(()=>d.querySelector('#peopleTransferBanner')&&!d.querySelector('#kanbanView').classList.contains('hidden'));
 const visible=()=>[...d.querySelectorAll('#kanbanBody [data-task-id]')].map(r=>r.dataset.taskId);
 assert.deepEqual(visible(),['931','932']);assert.equal(d.querySelector('#kanbanSearch').value,'');
 // Navigation succeeded while unrelated refresh responses were still withheld.
 holdReads=false;pendingReads.forEach(resolve=>resolve());
 w.bamcoSelection.set('#kanbanBody',['931','932']);d.querySelector('#transferOwnerBtn').click();await until(()=>f.calls.some(c=>c.endpoint==='ui-notice'&&c.body.includes('فقط یک وظیفه')));assert(!d.querySelector('#transferOwnerDialog'));
 w.bamcoSelection.set('#kanbanBody',['931']);d.querySelector('#transferOwnerBtn').click();const form=d.querySelector('#transferOwnerDialog form');assert(![...form.elements.owner_id.options].some(o=>o.value==='test-owner'));form.elements.owner_id.value='test-manager';form.requestSubmit();await until(()=>!d.querySelector('#transferOwnerDialog').open);
 await until(()=>!visible().includes('931'));assert.deepEqual(visible(),['932']);assert.equal(tasks[1].owner_id,null);const patch=f.calls.find(c=>c.endpoint==='tasks'&&c.method==='PATCH');assert.deepEqual(patch.body,{owner_id:'test-manager'});assert.match(patch.url,/row_version=eq.2/);
 d.querySelector('#showAllKanbanTasks').click();assert.equal(visible().length,5);assert(d.querySelector('#peopleTransferBanner').hidden);assert.deepEqual(f.errors,[]);
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

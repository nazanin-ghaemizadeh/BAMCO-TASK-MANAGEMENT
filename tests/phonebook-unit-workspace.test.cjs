const assert=require('node:assert/strict');
const test=require('node:test');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('phonebook keeps one command bar, creates unit cards and shows contacts inside a chosen card',async t=>{
 const f=await fixture({tables:{
  phonebook_units:[{id:1,category:'office',title:'منابع انسانی'}],
  contact_directory:[{id:2,category:'office',unit_id:1,full_name:'نمونه تست',role_title:'کارشناس'}]
 }});t.after(()=>f.dispose());
 await f.open('phoneBook');
 const view=f.d.querySelector('#phoneBookView');
 assert.equal(view.querySelectorAll(':scope>.bamco-page-heading').length,0);
 assert.equal(view.querySelectorAll(':scope>.bamco-management-toolbar').length,0);
 assert.deepEqual([...view.querySelectorAll('.phonebook-command>button')].map(button=>button.textContent.trim()),['بازگشت به خانه','ایجاد واحد','ثبت مخاطب','حذف','ویرایش']);
 assert.equal(view.querySelectorAll('.phonebook-unit-card').length,1);
 assert.equal(view.querySelectorAll('.phonebook-table').length,0);
 view.querySelector('[data-phonebook-unit-select="1"]').click();
 assert.equal(view.querySelectorAll('.phonebook-table').length,1);
 assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,1);
 assert.equal(view.querySelector('[data-phonebook-new]').disabled,false);
 view.querySelector('[data-phonebook-contact-select="2"]').click();
 assert.equal(view.querySelector('[data-phonebook-edit]').disabled,false);
 assert.equal(view.querySelector('[data-phonebook-delete]').disabled,false);
 assert.deepEqual(f.errors,[]);
});

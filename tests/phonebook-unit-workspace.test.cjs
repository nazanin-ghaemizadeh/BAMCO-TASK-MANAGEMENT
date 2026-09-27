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
 assert.equal(view.querySelector('.phonebook-section-heading h2').textContent.trim(),'اداری');
 assert.equal(view.querySelector('.phonebook-tabs'),null);
 assert.equal(view.querySelector('.phonebook-section-heading svg'),null);
 assert.deepEqual([...view.querySelectorAll('.phonebook-command>button')].map(button=>button.textContent.trim()),['بازگشت به خانه','ایجاد واحد','حذف واحد','ویرایش واحد']);
 assert.equal(view.querySelectorAll('.phonebook-unit-card').length,1);
 assert.equal(view.querySelectorAll('.phonebook-table').length,0);
 view.querySelector('[data-phonebook-unit-select="1"]').click();
 assert.equal(view.querySelectorAll('.phonebook-table').length,1);
 assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,1);
 assert.equal(view.querySelector('.phonebook-section-heading h2').textContent.trim(),'اداری');
 assert.equal(view.querySelector('.phonebook-section-heading p').textContent.trim(),'منابع انسانی');
 assert.deepEqual([...view.querySelectorAll('.phonebook-table-command>button')].map(button=>button.textContent.trim()),['بازگشت به واحدها','حذف مخاطب','ویرایش مخاطب']);
 assert.equal(view.querySelector('[data-phonebook-new]'),null);
 assert.equal(view.querySelectorAll('.phonebook-table th').length,6);
 assert.equal([...view.querySelectorAll('.phonebook-table th')].some(th=>th.textContent.includes('عملیات')),false);
 assert.equal(view.querySelector('[data-phonebook-edit]').disabled,true);
 assert.equal(view.querySelector('[data-phonebook-delete]').disabled,true);
 view.querySelector('[data-phonebook-contact-select="2"]').click();
 assert.equal(view.querySelector('[data-phonebook-edit]').disabled,false);
 assert.equal(view.querySelector('[data-phonebook-delete]').disabled,false);
 view.querySelector('[data-phonebook-edit]').click();
 assert.equal(view.querySelector('.phonebook-dialog').open,true);
 assert.equal(view.querySelector('.phonebook-dialog h3').textContent.trim(),'ویرایش مخاطب');
 view.querySelector('[data-phonebook-close]').click();
 view.querySelector('[data-phonebook-home]').click();
 assert.equal(view.querySelector('[data-phonebook-edit]').disabled,false);
 view.querySelector('[data-phonebook-edit]').click();
 assert.equal(view.querySelector('.phonebook-unit-dialog').open,true);
 assert.equal(view.querySelector('.phonebook-unit-dialog h3').textContent.trim(),'ویرایش واحد');
 assert.deepEqual(f.errors,[]);
});

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
 assert.deepEqual([...view.querySelectorAll('.phonebook-command>button')].map(button=>button.textContent.trim()),['بازگشت به خانه','ایجاد واحد','ویرایش واحد']);
 assert.equal(view.querySelector('[data-phonebook-search]').type,'search');
 assert.equal(view.querySelectorAll('.phonebook-unit-card').length,1);
 assert.equal(view.querySelector('.phonebook-unit-card small'),null);
 assert.equal(view.querySelectorAll('.phonebook-table').length,0);
 view.querySelector('[data-phonebook-unit-select="1"]').click();
 assert.equal(view.querySelectorAll('.phonebook-table').length,1);
 assert.equal(view.querySelectorAll('[data-phonebook-contact-select]').length,1);
 assert.equal(view.querySelector('.phonebook-unit-heading h2').textContent.trim(),'منابع انسانی');
 assert.equal(view.querySelector('.phonebook-unit-heading h3'),null);
 assert.deepEqual([...view.querySelectorAll('.phonebook-table-command>button')].map(button=>button.textContent.trim()),['بازگشت به واحدها','حذف مخاطب','ویرایش مخاطب']);
 assert(view.querySelector('.phonebook-table-command>[data-phonebook-search]'),'search belongs to the same command row as the table actions');
 assert.deepEqual([...view.querySelector('.phonebook-unit-workspace').children].map(element=>element.className),['phonebook-unit-heading','phonebook-command phonebook-table-command bamco-command-bar','phonebook-table-area']);
 assert.equal(view.querySelector('[data-phonebook-new]'),null);
 assert.equal(view.querySelectorAll('.phonebook-table thead tr:first-child th').length,6);
 assert.equal(view.querySelectorAll('.phonebook-table [data-phonebook-filter]').length,6);
 assert.equal([...view.querySelectorAll('.phonebook-table th')].some(th=>th.textContent.includes('عملیات')),false);
 assert.equal(view.querySelector('.phonebook-table').matches('[data-table-suite="off"][data-no-pagination="true"]'),true);
 assert(view.querySelector('.phonebook-table-pagination'));
 assert.equal(view.querySelector('[data-phonebook-contact-edit]').disabled,true);
 assert.equal(view.querySelector('[data-phonebook-contact-delete]').disabled,true);
 view.querySelector('[data-phonebook-contact-select="2"]').click();
 assert.equal(view.querySelector('[data-phonebook-contact-edit]').disabled,false);
 assert.equal(view.querySelector('[data-phonebook-contact-delete]').disabled,false);
 view.querySelector('[data-phonebook-contact-edit]').click();
 assert.equal(view.querySelector('.phonebook-dialog').open,true);
 assert.equal(view.querySelector('.phonebook-dialog h3').textContent.trim(),'ویرایش مخاطب');
 view.querySelector('[data-phonebook-close]').click();
 view.querySelector('[data-phonebook-home]').click();
 view.querySelector('[data-phonebook-manage-units]').click();
 assert.equal(view.querySelector('.phonebook-manager-intro h3').textContent.trim(),'انتخاب واحد برای ویرایش');
 view.querySelector('[data-phonebook-manage-unit-select="1"]').click();
 assert.equal(view.querySelector('[data-phonebook-managed-unit-form] input[name="title"]').value,'منابع انسانی');
 assert(view.querySelector('[data-phonebook-managed-unit-delete]'));
 assert.deepEqual(f.errors,[]);
});

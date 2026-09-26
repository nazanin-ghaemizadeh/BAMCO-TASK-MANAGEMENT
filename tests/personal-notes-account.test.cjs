const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');

test('legacy notes move to account storage and later edits persist through the API',async t=>{
 const id='00000000-0000-4000-8000-000000000021',old={id,title:'یادداشت قدیمی',body:'۱۲۳ تست',color:'sun',inactive:false,createdAt:'2026-09-26T12:00:00Z',updatedAt:'2026-09-26T12:00:00Z'};
 const f=await fixture({tables:{personal_notes:[]},storage:{'bamco.personal-notes.test-manager':JSON.stringify([old])}});t.after(()=>f.dispose());
 await f.open('notes');
 await until(()=>f.calls.some(call=>call.endpoint==='personal_notes'&&call.method==='POST'));
 await until(()=>f.d.querySelector('.sticky-note strong')?.textContent==='یادداشت قدیمی'&&!f.d.querySelector('[data-note-new]').disabled);
 const create=f.calls.find(call=>call.endpoint==='personal_notes'&&call.method==='POST');
 assert.equal(create.body.owner_id,'test-manager');assert.equal(create.body.id,id);
 assert.equal(f.tables.personal_notes.length,1);
 f.d.querySelector('.sticky-note-toggle').click();
 await until(()=>f.tables.personal_notes[0].inactive===true);
 assert(f.calls.some(call=>call.endpoint==='personal_notes'&&call.method==='PATCH'));
 assert.equal(f.d.querySelector('.sticky-note'),null);
 f.d.querySelector('[data-note-tab="inactive"]').click();
 assert.match(f.d.querySelector('.sticky-note').textContent,/یادداشت قدیمی/);
 assert.deepEqual(f.errors,[]);
});

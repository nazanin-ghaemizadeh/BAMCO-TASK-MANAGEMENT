const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,until}=require('./helpers/app-fixture.cjs');
test('temporary refueling saves Persian decimals and round-trips numeric Excel columns',async t=>{
 const f=await fixture({tables:{vehicle_temporary_records:[{id:7,fuel_status:'نیمه',fuel_liters:null,fuel_amount:null}]}});t.after(()=>f.dispose());const {d,w}=f;
 await f.open('vehicleTemporary');await until(()=>d.querySelector('#vehicleTemporaryView tbody tr[data-id]'));
 const headers=[...d.querySelectorAll('#vehicleTemporaryView thead tr:first-child th')].map(x=>x.textContent),fuel=headers.indexOf('وضعیت بنزین');
 assert.deepEqual(headers.slice(fuel,fuel+3),['وضعیت بنزین','بنزین افزوده‌شده (لیتر)','مبلغ بنزین (ریال)']);
 d.querySelector('#vehicleTemporaryView tbody tr[data-id]').click();d.querySelector('#vehicleTemporaryView .vehicle-edit').click();
 const form=d.querySelector('#vehicleRecordForm');assert.equal(form.elements.fuel_liters.value,'');
 form.elements.fuel_liters.value='۲۵٫۵';form.elements.fuel_amount.value='۱٬۲۷۵٬۰۰۰';form.requestSubmit();
 await until(()=>!d.querySelector('#vehicleRecordDialog').open);
 assert.equal(f.tables.vehicle_temporary_records[0].fuel_liters,25.5);assert.equal(f.tables.vehicle_temporary_records[0].fuel_amount,1275000);
 d.querySelector('#vehicleTemporaryView .vehicle-export').click();await until(()=>f.downloads.length===1);
 const bytes=new Uint8Array(await f.downloads[0].blob.arrayBuffer()),book=w.XLSX.read(bytes,{type:'array'}),matrix=w.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
 assert.deepEqual([...matrix[0].slice(fuel,fuel+3)],headers.slice(fuel,fuel+3));assert.equal(matrix[1][fuel+1],25.5);assert.equal(matrix[1][fuel+2],1275000);
 w.bamcoConfirm=async()=>true;const input=d.querySelector('#vehicleExcelInput');Object.defineProperty(input,'files',{configurable:true,value:[{arrayBuffer:async()=>new w.Uint8Array(bytes).buffer}]});await input.onchange({target:input});
 assert.equal(f.tables.vehicle_temporary_records.length,2,JSON.stringify(f.calls.filter(c=>c.endpoint==='ui-notice')));assert.equal(f.tables.vehicle_temporary_records[1].fuel_liters,25.5);assert.equal(f.tables.vehicle_temporary_records[1].fuel_amount,1275000);
 assert.deepEqual(f.errors,[]);
});

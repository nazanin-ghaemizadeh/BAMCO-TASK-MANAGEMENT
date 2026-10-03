const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('invoice persistence and attachment contract passes actual isolated PostgreSQL/RLS tests', {timeout:90000},()=>{
 const result=spawnSync(process.execPath,['scripts/test-invoice-attachments-sql.mjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:85000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
 assert.match(result.stdout,/Invoice attachment SQL contract: PASS/);
});

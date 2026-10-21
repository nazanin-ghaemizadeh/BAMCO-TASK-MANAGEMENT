const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
test('subordinate approvals can order unrelated archive IDs without widening user permissions', {timeout:120000},()=>{
 const result=spawnSync(process.execPath,['scripts/test-approval-archive-resequence-sql.mjs'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:110000,maxBuffer:4*1024*1024});
 assert.equal(result.status,0,result.stderr||result.stdout);
 for(const checkpoint of ['baseline subordinate','create/complete/update approvals','peer/ungranted reviewer','nested context preserved'])assert.ok(result.stdout.includes('PASS '+checkpoint),result.stdout);
});

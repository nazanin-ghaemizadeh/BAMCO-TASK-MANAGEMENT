const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');

test('checked business sections normalize through the canonical SQL and client contracts',()=>{
  const run=spawnSync(process.execPath,['scripts/test-business-section-capabilities-sql.mjs'],{
    encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024
  });
  assert.equal(run.error,undefined,run.error?.message);
  assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout,/PASS real SQL snapshots through unchanged client/);
});

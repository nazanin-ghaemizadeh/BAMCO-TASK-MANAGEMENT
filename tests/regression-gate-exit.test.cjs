const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const script=fs.readFileSync('scripts/test-regression-budget.mjs','utf8').replace("import { spawnSync } from 'node:child_process';",'');
function exitFor(result){let code;const stopped=Symbol();try{vm.runInNewContext(script,{spawnSync:()=>result,console:{log(){},error(){}},process:{execPath:'node',stdout:{write(){}},exit:value=>{code=value;throw stopped}}})}catch(error){if(error!==stopped)throw error}return code}
for(const [name,result] of Object.entries({nonzero:{status:2,stdout:'Test runner failed before TAP output'},signal:{status:null,signal:'SIGTERM'},missing:{status:null},spawn:{error:Error('spawn failed')}}))test('regression gate fails closed on '+name,()=>assert.equal(exitFor(result),1));
test('regression gate preserves successful run',()=>assert.equal(exitFor({status:0,stdout:'ok 1 - healthy test\n'}),0));
test('regression gate rejects TAP failures even if child claims success',()=>assert.equal(exitFor({status:0,stdout:'not ok 1 - failing test\n'}),1));

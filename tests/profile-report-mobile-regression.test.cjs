const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('profile refresh updates both header and settings avatars',()=>{
 const canonical=fs.readFileSync('assets/js/login-avatar-workload-fix-20260911.js','utf8');
 const final=fs.readFileSync('assets/js/final-production-fixes-20260911.js','utf8');
 assert.match(canonical,/targets\.length&&targets\.every\(/);
 assert.match(final,/function avatarTargets\(\)\{return\[q\('#avatar'\),q\('#profileAvatarPreview'\)\]/);
 assert.match(final,/paintAvatars\(await fetchAvatar\(path\),path\)/);
});

test('manager activity uses created tasks after the saved monitoring baseline',()=>{
 const report=fs.readFileSync('assets/js/report-stability-fixes-20260911.js','utf8');
 assert.match(report,/tasks\.filter\(t=>String\(t\.created_by\)===String\(id\)&&within\(t\.created_at,from,to\)&&afterMonitoringStart\(t\.created_at\)\)\.length/);
 assert.match(report,/\.\.\.tasks\.map\(t=>t\.created_by\)/);
 assert.doesNotMatch(report,/manager\?all\.filter\(t=>String\(t\.created_by\)/);
});

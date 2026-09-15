const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('profile refresh updates both header and settings avatars through one canonical loader',()=>{
 const canonical=fs.readFileSync('assets/js/login-avatar-workload-fix-20260911.js','utf8');
 const final=fs.readFileSync('assets/js/final-production-fixes-20260911.js','utf8');
 assert.match(canonical,/#avatar/);
 assert.match(canonical,/#profileAvatarPreview/);
 assert.match(canonical,/targets\.length&&targets\.every\(/);
 assert.match(final,/window\.refreshProfileAvatar/);
 assert.doesNotMatch(final,/cache:'no-store'/);
 assert.doesNotMatch(final,/setInterval\(/);
 assert.doesNotMatch(final,/select\('profiles'/);
});

test('manager activity uses created tasks after the saved monitoring baseline',()=>{
 const report=fs.readFileSync('assets/js/report-stability-fixes-20260911.js','utf8');
 assert.match(report,/tasks\.filter\(t=>String\(t\.created_by\)===String\(id\)&&within\(t\.created_at,from,to\)&&afterMonitoringStart\(t\.created_at\)\)\.length/);
 assert.match(report,/\.\.\.tasks\.map\(t=>t\.created_by\)/);
 assert.doesNotMatch(report,/manager\?all\.filter\(t=>String\(t\.created_by\)/);
});

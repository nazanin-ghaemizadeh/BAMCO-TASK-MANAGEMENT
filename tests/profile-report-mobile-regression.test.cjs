const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('profile refresh updates both header and settings avatars through one canonical loader',()=>{
 const canonical=fs.readFileSync('assets/js/profile-runtime.js','utf8');
 const final=fs.readFileSync('assets/js/profile-runtime.js','utf8');
 assert.match(canonical,/#avatar/);
 assert.match(canonical,/#profileAvatarPreview/);
 assert.match(canonical,/bamcoMedia\?\.bindAvatar\?\.\(el,profile\)/);
 assert.match(final,/root\.refreshProfileAvatar/);
 assert.doesNotMatch(final,/cache:'no-store'/);
 assert.doesNotMatch(final,/setInterval\([^;]*refreshCurrent/);
 assert.doesNotMatch(final,/selectAll\('profiles'/);
 assert.match(final,/BamcoData\?\.select\?\.\('profiles'/);
});

test('manager activity uses created tasks after the saved monitoring baseline',()=>{
 const report=fs.readFileSync('assets/js/reports.js','utf8');
 assert.match(report,/tasks\.filter\(t=>String\(t\.created_by\)===String\(id\)&&within\(t\.created_at,from,to\)&&afterMonitoringStart\(t\.created_at\)\)\.length/);
 assert.match(report,/\.\.\.tasks\.map\(t=>t\.created_by\)/);
 assert.doesNotMatch(report,/manager\?all\.filter\(t=>String\(t\.created_by\)/);
});

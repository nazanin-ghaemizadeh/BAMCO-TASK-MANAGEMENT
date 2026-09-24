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

test('performance report derives the two definition-request columns from the requester and target owner',()=>{
 const report=fs.readFileSync('assets/js/reports.js','utf8');
 assert.match(report,/definitionRequests=requests\.filter\(r=>String\(r\.requested_by\)===String\(id\)&&r\.request_type==='create'&&within\(r\.created_at,from,to\)\)/);
 assert.match(report,/forSelf=definitionRequests\.filter\(r=>String\(r\.proposed_data\?\.owner_id\|\|r\.requested_by\)===String\(id\)\)\.length/);
 assert.match(report,/forOthers=definitionRequests\.length-forSelf/);
 assert.match(report,/\.\.\.tasks\.map\(t=>t\.created_by\)/);
 assert.doesNotMatch(report,/manager\?metrics\?\.definitionCount/);
});

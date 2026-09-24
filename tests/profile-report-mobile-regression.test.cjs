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

test('performance report derives the two task-definition columns from canonical web tasks and task ownership',()=>{
 const report=fs.readFileSync('assets/js/reports.js','utf8');
 assert.match(report,/definitionTasks=tasks\.filter\(t=>String\(t\?\.source\|\|''\)\.toLowerCase\(\)==='web'/);
 assert.match(report,/forSelf=definitions\.filter\(t=>String\(t\.owner_id\)===String\(id\)\)\.length/);
 assert.match(report,/forOthers=definitions\.filter\(t=>t\.owner_id&&String\(t\.owner_id\)!==String\(id\)\)\.length/);
 assert.match(report,/2026-09-06T00:00:00Z/);
 assert.match(report,/\.\.\.scopedTasks\.map\(t=>t\.created_by\)/);
 assert.match(report,/تعریف وظیفه در بازه انتخاب‌شده \(برای دیگران\)/);
 assert.match(report,/تعریف وظیفه در بازه انتخاب‌شده \(برای خود\)/);
 assert.match(report,/renderPerformance\(false,true\)/);
 assert.doesNotMatch(report,/definitionLabel='از ۱۵ شهریور'/);
 assert.doesNotMatch(report,/manager\?metrics\?\.definitionCount/);
});

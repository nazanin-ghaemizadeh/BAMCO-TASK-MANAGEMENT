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

test('performance report derives task-definition columns from canonical requests and direct web/project tasks',()=>{
 const report=fs.readFileSync('assets/js/reports.js','utf8'),sql=fs.readFileSync('supabase/schema-proposals/isolated-section-report-feeds.sql','utf8');
 assert.match(report,/definitionEvents=feed.definition_events.filter/);
 assert.match(sql,/lower\(t.source\) in \('web','project'\)/);
 assert.match(report,/forSelf=definitions\.filter\(event=>String\(event\.ownerId\|\|event\.actorId\)===String\(event\.actorId\)\)\.reduce/);
 assert.match(report,/forOthers=definitions\.reduce\(.*\)-forSelf/);
 assert.doesNotMatch(report,/requests=workflowRows\(\)/);
 assert.match(report,/BamcoSectionReports.load\('performanceReport'/);
 assert.match(report,/2026-09-05T20:30:00Z/);
 assert.match(report,/\.\.\.scopedTasks\.map\(t=>t\.created_by\)/);
 assert.match(report,/تعریف وظیفه در بازه انتخاب‌شده \(برای دیگران\)/);
 assert.match(report,/تعریف وظیفه در بازه انتخاب‌شده \(برای خود\)/);
 assert.match(report,/renderPerformance\(false,true\)/);
 assert.doesNotMatch(report,/definitionLabel='از ۱۵ شهریور'/);
 assert.doesNotMatch(report,/manager\?metrics\?\.definitionCount/);
});

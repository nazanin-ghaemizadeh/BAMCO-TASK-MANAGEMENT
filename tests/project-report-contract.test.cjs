const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('Stage2 leaves shared project/task policies and protected functions untouched',()=>{
 const project=read('supabase/schema-proposals/project-ordinary-metadata-scope.sql'),reports=read('supabase/schema-proposals/isolated-section-report-feeds.sql');
 assert.doesNotMatch(project+reports,/(?:create|drop|alter)\s+policy/i);
 for(const name of ['platform_can_access_project','save_project_activity','delete_project_activity','request_project_deletion','feature_can_access_for','feature_grant_allows','request_workflow_snapshot'])assert.doesNotMatch(project+reports,new RegExp('create or replace function (?:public|private)\\.'+name+'\\('));
 assert.doesNotMatch(reports,/(?:update|delete from|insert into) public\.(?:tasks|change_requests)/i);
 const source=read('assets/js/section-report-data.js')+read('assets/js/timeline.js')+read('assets/js/reports.js');
 assert.doesNotMatch(source,/state\.(?:tasks|requests|requestHistory|definitionRequests)\s*=/);
 assert.doesNotMatch(read('assets/js/timeline.js'),/bamcoOpenTaskInKanban|bamcoFocusMessageTask/);
});
test('canonical access setter differs only in the reviewed projects preservation branch',()=>{
 const baseline=read('tests/sql/fixtures/project-access-setter-baseline.sql').trim();
 const proposal=read('supabase/schema-proposals/project-ordinary-metadata-scope.sql');
 const setter=proposal.slice(proposal.indexOf('create or replace function public.set_feature_access')).split('\nrevoke all on function public.set_feature_access')[0].trim();
 const withoutMarker=setter.replaceAll(`||case when p_feature_key='projects' then '{"project_section_preserves_authority":true}'::jsonb else '{}'::jsonb end`,'');
 const stripped=withoutMarker.replace(/    -- A section checkbox never assigns[\s\S]*?    end if;\n\n(?=    if v_grant_id is not null then)/,'');
 assert.equal(stripped,baseline);
});

test('ordinary project mutators recheck authorization after lock acquisition',()=>{
 const source=read('supabase/schema-proposals/project-ordinary-metadata-scope.sql');
 for(const name of ['save_project_metadata','mutate_project_node','mutate_project_dependency']){
  const start=source.indexOf('create or replace function private.'+name+'('),end=source.indexOf('\n$$;',start),body=source.slice(start,end);
  assert(start>=0&&end>start,name+' exists');
  const lock=body.indexOf('for update;'),recheck=body.indexOf('if not private.project_ordinary_allowed(',lock);
  assert(lock>=0&&recheck>lock,name+' rechecks active identity and grants after parent wait');
 }
});

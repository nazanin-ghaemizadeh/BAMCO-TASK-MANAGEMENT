const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('manager self-authority and revision-note migration keeps direct scope narrow and task-visible',()=>{
 const sql=read('supabase/migrations/20260923180000_manager_self_authority_and_revision_notes.sql');
 assert.match(sql,/organization_role\.role_key='manager'/);
 assert.match(sql,/p_actor=p_target_user/);
 assert.match(sql,/organization_strict_descendant_user_ids/);
 assert.match(sql,/p_decision='needs_revision'/);
 assert.match(sql,/update public\.tasks[\s\S]*manager_notes=concat_ws/);
 assert.match(sql,/proposed_data=case when v_manager_note is null/);
 assert.match(read('tests/sql/approval-revision-notes.sql'),/Revision note is not visible on the task/);
});

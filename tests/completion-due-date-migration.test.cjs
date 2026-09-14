const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('approved completion requests persist an explicitly selected due date',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260914033658_preserve_completion_due_date.sql','utf8');
 assert.match(sql,/request_type='complete'[\s\S]*due_date=case when p_payload\?'due_date' then nullif\(p_payload->>'due_date',''\)::date else due_date end/);
 assert.match(sql,/revoke all on function private\.apply_change_request\(bigint,uuid,jsonb\) from public,anon,authenticated/);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('bulk inbox dismissal is one authenticated invoker transaction and excludes chat-linked copies',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260914044056_dismiss_my_inbox_atomically.sql','utf8');
 assert.match(sql,/function public\.dismiss_my_inbox\(\)[\s\S]*security invoker[\s\S]*auth\.uid\(\)/);
 assert.match(sql,/update public\.notifications[\s\S]*user_id = v_user_id[\s\S]*update public\.portal_message_recipients/);
 assert.match(sql,/not exists[\s\S]*public\.message_deliveries[\s\S]*chat_thread_id is not null/);
 assert.match(sql,/revoke all on function public\.dismiss_my_inbox\(\) from public, anon[\s\S]*grant execute on function public\.dismiss_my_inbox\(\) to authenticated/);
});

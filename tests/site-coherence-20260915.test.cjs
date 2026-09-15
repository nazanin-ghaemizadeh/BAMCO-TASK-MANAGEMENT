const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');

test('changed browser scripts are syntactically valid',()=>{
 for(const path of ['assets/js/table-selection.js','assets/js/letters.js','assets/js/card-home.js','assets/js/feature-structure.js']){
  assert.doesNotThrow(()=>new Function(read(path)),path);
 }
});

test('task lifecycle events use the public display id and one safe inbox surface',()=>{
 const sql=read('supabase/migrations/20260915121000_global_task_display_id_coherence.sql');
 assert.match(sql,/task_display_id_for_order/);
 assert.match(sql,/v_id:=private\.task_display_id_for_order\(new\.id,new\.legacy_id\)/);
 assert.match(sql,/entity_type='task'/);
 assert.match(sql,/dismissed_at=coalesce\(dismissed_at,now\(\)\)/);
 assert.match(sql,/perform private\.sync_task_display_references\(\)/);
 assert.match(sql,/coalesce\(t->>''legacy_id'',t->>''id''\)/);
 assert.match(sql,/position\('«'\|\|coalesce\(t\.title,''\)\|\|'»' in pm\.body\)>0/);
 assert.match(sql,/update public\.chat_messages cm/);
 assert.match(sql,/create or replace function public\.chat_ensure_task_direct/);
 assert.match(sql,/select owner_id,title,legacy_id into v_owner,v_title,v_display_id/);
 assert.match(sql,/n\.user_id=r\.recipient_id/);
 assert.match(sql,/case when jsonb_typeof\(s\.tasks\)='array' then s\.tasks else '\[\]'::jsonb end/);
 assert.doesNotMatch(sql,/coalesce\(new\.legacy_id,new\.id\)::text/);
});

test('all resequencing paths resync task references and task chat bodies',()=>{
 const sql=read('supabase/migrations/20260915123000_sync_task_display_refs_after_all_resequences.sql');
 const partial=sql.match(/create or replace function private\.resequence_task_display_ids_from[\s\S]*?\$function\$;/)?.[0]||'';
 const archived=sql.match(/create or replace function private\.resequence_archived_task_display_ids[\s\S]*?\$function\$;/)?.[0]||'';
 const portal=sql.match(/create or replace function private\.create_portal_event[\s\S]*?\$function\$;/)?.[0]||'';
 assert.match(partial,/perform private\.sync_task_display_references\(\)/);
 assert.match(archived,/perform private\.sync_task_display_references\(\)/);
 assert.match(portal,/update public\.chat_messages/);
 assert.match(portal,/BAMCO_PORTAL_MESSAGE_V1:%/);
 assert.match(sql,/having count\(\*\)=1/);
 assert.match(sql,/n\.user_id=r\.recipient_id/);
 assert.match(sql,/select private\.sync_task_display_references\(\)/);
});

test('letters use the same shared toggle selection as other workspace tables',()=>{
 const selection=read('assets/js/table-selection.js'),letters=read('assets/js/letters.js');
 const local=selection.match(/function usesLocalSelection\(row\)\{[^}]+\}/)?.[0]||'';
 assert(!local.includes('#lettersView'));
 assert.match(letters,/data-selection-key=/);
 assert.match(letters,/bamco-selection-change/);
 assert.match(letters,/window\.bamcoSelection\.set\(liveTable/);
 assert.doesNotMatch(letters,/letter-row-selected/);
 assert.doesNotMatch(letters,/selectedId/);
});

test('home self-repair does not repeatedly reset scroll or reorder cards',()=>{
 const source=read('assets/js/card-home.js');
 assert.match(source,/function repairHome\(\{reset=false,sync=false\}=\{\}\)/);
 assert.match(source,/function showHome\(\)\{repairHome\(\{reset:true,sync:true\}\)\}/);
 assert.match(source,/homeBroken\(\)\)repairHome\(\)/);
 assert.doesNotMatch(source,/homeBroken\(\)\)showHome\(\)/);
});

test('document/site structure and inbox task IDs settle without post-paint jumps',()=>{
 const source=read('assets/js/feature-structure.js');
 assert.match(source,/requestAnimationFrame/);
 assert.match(source,/frame = requestAnimationFrame\(\(\) =>/);
 assert.match(source,/function normalizeInboxTaskIds\(\)/);
 assert.match(source,/publicByInternal = new Map/);
 assert.match(source,/task\.legacy_id \?\? task\.id/);
 assert.match(source,/bamco-inbox-updated/);
 assert.doesNotMatch(source,/queueMicrotask|microtask\(/);
 assert.doesNotMatch(source,/setTimeout\(\(\) => \{ enhanceSites\(\); enhanceCategories\(\); \}, 20\)/);
});

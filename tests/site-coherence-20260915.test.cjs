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
 assert.match(sql,/cm\.source_portal_message_id=pm\.id/);
 assert.match(sql,/n\.user_id=r\.recipient_id/);
 assert.match(sql,/case when jsonb_typeof\(s\.tasks\)='array' then s\.tasks else '\[\]'::jsonb end/);
 assert.doesNotMatch(sql,/coalesce\(new\.legacy_id,new\.id\)::text/);
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

test('document and site structural enhancement is batched before paint without starving load',()=>{
 const source=read('assets/js/feature-structure.js');
 assert.match(source,/requestAnimationFrame/);
 assert.match(source,/frame = requestAnimationFrame\(\(\) =>/);
 assert.doesNotMatch(source,/queueMicrotask|microtask\(/);
 assert.doesNotMatch(source,/setTimeout\(\(\) => \{ enhanceSites\(\); enhanceCategories\(\); \}, 20\)/);
});

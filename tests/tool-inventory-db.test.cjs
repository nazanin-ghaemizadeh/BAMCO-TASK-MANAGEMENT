const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

test('inventory corrections, concurrent versions, deletion and permissions across workspaces', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const schemas = {public:'private.product_workspace_member',bamco_process:'bamco_process_private.workspace_member',bamco_quality:'bamco_quality_private.workspace_member'};
  await db.exec('create role anon; create role authenticated; create schema private; create schema bamco_process; create schema bamco_quality; create schema bamco_process_private; create schema bamco_quality_private;');
  for (const [ws,member] of Object.entries(schemas)) {
    await db.exec(`create function ${ws}.can_access_feature(text,text) returns boolean language sql as $$select position($2 in current_setting('test.tool_grants')) > 0$$;
      create function ${member}() returns boolean language sql as $$select true$$;
      grant usage on schema ${ws},${member.split('.')[0]} to authenticated;`);
  }
  for (const file of ['20261114184409_tool_inventory_and_custody.sql','20261114192054_edit_tool_inventory_and_custody.sql']) {
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
  }
  await db.exec('set role authenticated');
  for (const ws of Object.keys(schemas)) {
    await db.exec("set test.tool_grants='view create edit delete'");
    const assets = ws+'.tool_assets', moves = ws+'.tool_movements';
    const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
    const [tool] = await rows(`insert into ${assets}(name,asset_code) values ('wrench','T-1') returning *`);
    const checkout = time => rows(`insert into ${moves}(tool_id,kind,exited_at,exit_receiver,exit_deliverer,reason) values ($1,'outside',$2,'tech','store','test') returning *`,[tool.id,'2026-11-14 '+time]);
    const [first] = await checkout('08:00');
    await rows(`update ${moves} set entered_at='2026-11-14 09:00',entry_receiver='store',entry_deliverer='driver' where id=$1`,[first.id]);
    const [next] = await checkout('09:00');
    const [updated] = await rows(`update ${moves} set kind='repair',exit_receiver='workshop' where id=$1 and revision=1 returning *`,[next.id]);
    assert.equal(updated.revision,2);
    assert.equal(updated.exit_receiver,'workshop');
    await assert.rejects(rows(`update ${moves} set entered_at='2026-11-14 10:00' where id=$1`,[first.id]),/هم‌پوشانی/);
    await assert.rejects(rows(`update ${moves} set entered_at=null,entry_receiver=null,entry_deliverer=null where id=$1`,[first.id]),/الزامی/);
    const [corrected] = await rows(`update ${moves} set exited_at='2026-11-14 07:30',entered_at='2026-11-14 08:45',entry_receiver='store2' where id=$1 returning *`,[first.id]);
    assert.equal(corrected.entry_receiver,'store2');
    assert.deepEqual(await rows(`delete from ${moves} where id=$1 and revision=1 returning id`,[next.id]),[]);
    await db.exec("set test.tool_grants='view'");
    assert.deepEqual(await rows(`update ${moves} set reason='denied' where id=$1 returning id`,[next.id]),[]);
    assert.deepEqual(await rows(`delete from ${assets} where id=$1 returning id`,[tool.id]),[]);
    assert.deepEqual(await rows(`delete from ${moves} where id=$1 returning id`,[next.id]),[]);
    await db.exec("set test.tool_grants='view create edit delete'");
    assert.equal((await rows(`delete from ${moves} where id=$1 and revision=2 returning id`,[next.id])).length,1);
    assert.deepEqual(await rows(`select id from ${moves} where tool_id=$1 and entered_at is null`,[tool.id]),[]);
    const [edited] = await rows(`update ${assets} set name='new' where id=$1 returning *`,[tool.id]);
    assert.equal(edited.revision,2);
    assert.deepEqual(await rows(`delete from ${assets} where id=$1 and revision=1 returning id`,[tool.id]),[]);
    assert.equal((await rows(`delete from ${assets} where id=$1 and revision=2 returning id`,[tool.id])).length,1);
    assert.deepEqual(await rows(`select id from ${moves} where tool_id=$1`,[tool.id]),[]);
  }
});

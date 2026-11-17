const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

test('component-level custody is atomic, independent and workspace-scoped in all three schemas',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  const schemas={public:'private.product_workspace_member',bamco_process:'bamco_process_private.workspace_member',bamco_quality:'bamco_quality_private.workspace_member'};
  const actor='00000000-0000-4000-8000-000000000001';
  await db.exec('create role anon; create role authenticated; create schema auth; create schema private; create schema bamco_process; create schema bamco_quality; create schema bamco_process_private; create schema bamco_quality_private;');
  await db.exec("create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;");
  for(const [ws,member] of Object.entries(schemas)){
    await db.exec(\`create function \${ws}.can_access_feature(text,text) returns boolean language sql stable as $$select position($2 in current_setting('test.tool_grants'))>0$$;
      create function \${member}() returns boolean language sql stable as $$select true$$;
      create table \${ws}.profiles(id uuid primary key);
      insert into \${ws}.profiles values ('\${actor}');
      grant usage on schema \${ws},\${member.split('.')[0]} to authenticated;\`);
  }
  for(const file of [
    '20261114184409_tool_inventory_and_custody.sql',
    '20261114192054_edit_tool_inventory_and_custody.sql',
    '20261117061354_tool_component_level_tracking.sql',
    '20261117062351_tool_component_batch_integrity_and_indexes.sql',
    '20261117062814_tool_component_primary_seed_privilege.sql'
  ]) await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));

  await db.exec("set role authenticated; set test.tool_grants='view create edit delete'; set request.jwt.claim.sub='"+actor+"'");
  const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
  for(const ws of Object.keys(schemas)){
    const assets=ws+'.tool_assets',components=ws+'.tool_components',movements=ws+'.tool_movements',batches=ws+'.tool_movement_batches';
    const [asset]=await rows(\`insert into \${assets}(name,asset_code) values ('Socket set','T-1') returning *\`);
    const seeded=await rows(\`select * from \${components} where tool_id=$1 order by component_no\`,[asset.id]);
    assert.equal(seeded.length,1,'every current or new tool receives one primary component');
    assert.equal(seeded[0].component_name,'Socket set');
    assert.equal(seeded[0].component_code,'T-1-C-0001');

    const [container]=seeded;
    await rows(\`update \${components} set is_container=true,component_name='جعبه مجموعه' where id=$1 and revision=1\`,[container.id]);
    const [ten]=await rows(\`insert into \${components}(tool_id,component_name) values ($1,'بکس شماره ۱۰') returning *\`,[asset.id]);
    const [twelve]=await rows(\`insert into \${components}(tool_id,component_name) values ($1,'بکس شماره ۱۲') returning *\`,[asset.id]);
    assert.equal(ten.component_no,2);assert.equal(twelve.component_no,3);
    assert.notEqual(ten.component_code,twelve.component_code);

    const exitAt='2026-11-17 08:30:00';
    const checked=await rows(\`select * from \${ws}.checkout_tool_components($1,$2::uuid[],$3::timestamp,$4,$5,$6,$7)\`,
      [asset.id,[ten.id,twelve.id],exitAt,'کامیاب شاه‌آبادی','انباردار','outside','تحویل جهت استفاده']);
    assert.equal(checked.length,2);
    assert.equal(new Set(checked.map(x=>x.exit_batch_id)).size,1,'one grouped checkout creates one batch');
    assert.deepEqual(new Set(checked.map(x=>x.component_id)),new Set([ten.id,twelve.id]));
    assert.equal((await rows(\`select count(*)::int n from \${batches} where tool_id=$1 and action='exit'\`,[asset.id]))[0].n,1);

    await assert.rejects(
      rows(\`select * from \${ws}.checkout_tool_components($1,$2::uuid[],$3::timestamp,$4,$5,$6,$7)\`,
        [asset.id,[ten.id],'2026-11-17 09:00:00','متولی','انبار','outside','تکراری']),
      /قبلاً خارج شده/
    );
    await assert.rejects(
      rows(\`select * from \${ws}.checkout_tool_components($1,$2::uuid[],$3::timestamp,$4,$5,$6,$7)\`,
        [asset.id,[container.id],'2026-11-17 09:00:00','متولی','انبار','outside','محفظه']),
      /غیرفعال یا متعلق/
    );

    const [returned]=await rows(\`select * from \${ws}.return_tool_components($1,$2::uuid[],$3::timestamp,$4,$5,$6)\`,
      [asset.id,[ten.id],'2026-11-17 11:00:00','انباردار','کامیاب شاه‌آبادی','عودت جزئی']);
    assert.equal(returned.component_id,ten.id);
    assert.ok(returned.entered_at);
    const stillOut=await rows(\`select component_id from \${movements} where tool_id=$1 and entered_at is null\`,[asset.id]);
    assert.deepEqual(stillOut.map(x=>x.component_id),[twelve.id],'returning one component leaves the other outside');
    assert.equal((await rows(\`select count(*)::int n from \${batches} where tool_id=$1 and action='return'\`,[asset.id]))[0].n,1);

    await assert.rejects(
      rows(\`update \${components} set active=false where id=$1\`,[twelve.id]),
      /خارج از انبار/
    );
    await db.exec("set test.tool_grants='view'");
    await assert.rejects(
      rows(\`select * from \${ws}.checkout_tool_components($1,$2::uuid[],$3::timestamp,$4,$5,$6,$7)\`,
        [asset.id,[twelve.id],'2026-11-17 12:00:00','متولی','انبار','outside','بدون مجوز']),
      /اجازه ثبت خروج/
    );
    await db.exec("set test.tool_grants='view create edit delete'");
    assert.equal((await rows(\`select count(*)::int n from \${components} where tool_id=$1\`,[asset.id]))[0].n,3);
  }
});
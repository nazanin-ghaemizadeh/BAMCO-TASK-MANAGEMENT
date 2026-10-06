const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('existing-task revision notes execute atomically with unchanged authorization in PostgreSQL', { timeout: 120000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/test-approval-revision-note-sql.mjs'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.signal, null, result.stderr || result.stdout);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const checkpoint of ['baseline 42703', 'one-token diff', 'existing-task nonempty correction', 'create/null-task isolation', 'reviewer/role/edit/active/anonymous/ownership gates', 'downstream failure']) {
    assert(result.stdout.includes(`PASS ${checkpoint}`), `missing checkpoint: ${checkpoint}\n${result.stdout}`);
  }
});

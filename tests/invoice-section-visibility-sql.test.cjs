const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('invoice section visibility preserves separate mutation boundaries in PostgreSQL', { timeout: 120000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/test-invoice-section-visibility-sql.mjs'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.signal, null, result.stderr || result.stdout);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS baseline failure reproduced/);
  assert.match(result.stdout, /PASS unrelated section editor RPC\/direct edits/);
  assert.match(result.stdout, /PASS no ownership\/identity escalation/);
  assert.match(result.stdout, /PASS original create identity rules/);
  assert.match(result.stdout, /PASS invoker read helper/);
});

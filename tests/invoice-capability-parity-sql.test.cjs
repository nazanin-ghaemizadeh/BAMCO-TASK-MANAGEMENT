const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('invoice capability parity removes relationship scope and preserves action/integrity boundaries in PostgreSQL', { timeout: 120000 }, () => {
  const result = spawnSync(process.execPath, ['scripts/test-invoice-capability-parity-sql.mjs'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 110000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(result.signal, null, result.stderr || result.stdout);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const checkpoint of ['baseline failures reproduced', 'idempotence and exact schema diff', 'equal-grant owner/follow-up/foreign/admin matrix', 'relationship-independent action limits', 'unchecked, revoked, action-only, inactive', 'accounting validation', 'canonical audit trigger', 'blanket UPDATE/DELETE', 'security attributes']) {
    assert(result.stdout.includes(`PASS ${checkpoint}`), `missing checkpoint: ${checkpoint}\n${result.stdout}`);
  }
});

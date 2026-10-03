const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

test('petty cash edits retain every large rial digit and send an exact ungrouped string', async t => {
  const row = { id: 'cash-exact', version: 1, entry_no: 1, event_date: '2026-10-01', entry_type: 'receipt', amount: '999999999999999999', status: 'active', category: 'Office', description: 'Large exact entry', responsible_id: 'test-manager' };
  const f = await fixture({ tables: { petty_cash_entries: [row], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); await until(() => f.d.querySelector('[data-detail="cash-exact"]'));
  assert.match(f.d.querySelector('#pettyCashBody').textContent, /۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹,۹۹۹/);
  assert(f.calls.some(call => call.endpoint === 'petty_cash_entries' && new URL(call.url).searchParams.get('select')?.includes('amount::text')));
  f.d.querySelector('[data-detail="cash-exact"]').click(); f.d.querySelector('#pettyCashDetail [data-edit]').click();
  const form = f.d.querySelector('#pettyCashDialog form');
  assert.equal(form.elements.amount.value, '999,999,999,999,999,999');
  await form.onsubmit({ preventDefault() {} });
  const saved = f.calls.findLast(call => call.endpoint === 'petty_cash_entries' && call.method === 'PATCH');
  assert.equal(saved.body.amount, '999999999999999999'); assert.equal(typeof saved.body.amount, 'string');
  assert.equal(f.d.querySelector('#pettyCashDialog').open, false); assert.deepEqual(f.errors, []);
});

test('petty cash entry validation rejects decimal rial and retains typed text without a write', async t => {
  const f = await fixture({ tables: { petty_cash_entries: [], petty_cash_attachments: [] } }); t.after(() => f.dispose());
  await f.open('pettyCash'); f.d.querySelector('#addCashEntry').click();
  const form = f.d.querySelector('#pettyCashDialog form'); form.elements.category.value = 'Office'; form.elements.description.value = 'Expense';
  for (const value of ['1,200.50', '-1', '0', '1000000000000000000', '12oops']) {
    form.elements.amount.value = value; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
    await form.onsubmit({ preventDefault() {} });
    assert.ok(form.querySelector('.form-error').textContent); assert.equal(f.d.querySelector('#pettyCashDialog').open, true);
  }
  assert.equal(f.calls.filter(call => call.endpoint === 'petty_cash_entries' && call.method === 'POST').length, 0);
  form.elements.amount.value = '۱۲۳۴۵۶۷'; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '1,234,567');
  assert.equal(form.elements.amount.dir, 'ltr', 'shared text-direction inference must not flip a money field');
  form.elements.amount.setSelectionRange(3, 3); form.elements.amount.setRangeText('۹', 3, 3, 'end');
  form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '12,934,567'); assert.equal(form.elements.amount.selectionStart, 4); assert.equal(form.elements.amount.dir, 'ltr');
  form.elements.amount.value = '۱۲۳۴۵۶۷'; form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  await form.onsubmit({ preventDefault() {} });
  assert.equal(f.calls.findLast(call => call.endpoint === 'petty_cash_entries' && call.method === 'POST').body.amount, '1234567');
  assert.deepEqual(f.errors, []);
});

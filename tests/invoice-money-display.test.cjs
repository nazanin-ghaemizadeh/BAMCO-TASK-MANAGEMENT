const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

async function fixture(t, total, amounts, currency = 'IRR') {
  const dom = new JSDOM('<section id="invoicesView"><div id="invoiceFeatureRoot"></div></section>', { url: 'https://example.test', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document, calls = [];
  const rows = {
    invoices: [{ id: '17', invoice_number: 'INV-17', title: 'آزمون', company_name: 'شرکت', total_amount: total, currency, created_by: 'alice', follow_up_owner_id: 'alice', status: 'planned' }],
    payments: amounts.map((amount, index) => ({ id: String(31 + index), invoice_id: '17', sequence_no: index + 1, amount, status: 'paid' })),
    files: []
  };
  w.state = { user: { id: 'alice' }, profile: { id: 'alice' }, token: 'fixture-token' };
  w.BamcoAccess = { can: () => true, isSystemManager: () => false };
  w.BamcoData = { rpc: async (name, args) => {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    if (name === 'list_invoice_workspace') return JSON.parse(JSON.stringify(rows));
    if (name === 'save_invoice' || name === 'save_invoice_payment') {
      const row = name === 'save_invoice' ? rows.invoices[0] : rows.payments.find(row => row.id === args.p_payment_id);
      Object.assign(row, args.p_payload); return { ...row };
    }
    throw Error(name);
  } };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const file of ['money-input', 'file-picker', 'enterprise-core', 'financial-obligations']) w.eval(fs.readFileSync(`assets/js/${file}.js`, 'utf8'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await w.bamcoInvoices.load();
  const click = selector => d.querySelector(selector).click();
  const submit = async form => {
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 50 && form.isConnected; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(form.isConnected, false, 'the actual save handler completes');
  };
  return { w, d, rows, calls, click, submit };
}

test('invoice cards, totals, payments and prefilled editors omit .00 with Persian grouping', async t => {
  const f = await fixture(t, '9007199254740993.00', ['1234.00']);
  const original = JSON.stringify(f.rows);
  const card = f.d.querySelector('[data-invoice-select="17"]');
  assert.equal(card.querySelector('b').textContent, '۱,۲۳۴ ریال');
  assert.match(card.textContent, /مانده: ۹,۰۰۷,۱۹۹,۲۵۴,۷۳۹,۷۵۹ ریال/);
  f.click('[data-invoice-select="17"]');
  assert.deepEqual([...f.d.querySelectorAll('.invoice-total b')].slice(0, 3).map(node => node.textContent), [
    '۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳ ریال', '۱,۲۳۴ ریال', '۹,۰۰۷,۱۹۹,۲۵۴,۷۳۹,۷۵۹ ریال'
  ]);
  assert.equal(f.d.querySelector('.payment-stage-value b').textContent, '۱,۲۳۴ ریال');
  f.click('[data-invoice-action="edit"]');
  let form = f.d.querySelector('#invoiceForm');
  assert.equal(form.elements.total_amount.value, '۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳');
  assert.equal(f.w.BamcoMoney.raw(form.elements.total_amount), '9007199254740993');
  f.click('#invoiceForm [data-invoice-close]');
  f.click('[data-invoice-payment-edit="31"]');
  form = f.d.querySelector('#invoicePaymentForm');
  assert.equal(form.elements.amount.value, '۱,۲۳۴');
  assert.equal(f.w.BamcoMoney.raw(form.elements.amount), '1234');
  assert.equal(JSON.stringify(f.rows), original, 'presentation never mutates persisted amounts');
  assert.equal(f.w.bamcoInvoices.model.invoices[0].total_amount, '9007199254740993.00');
  assert.equal(f.w.bamcoEnterprise.money('1234.00'), '۱,۲۳۴.۰۰ ریال', 'other domains keep their formatting');
});

test('invoice zero totals and zero remaining balances have no empty decimal suffix', async t => {
  const f = await fixture(t, '0.00', []);
  assert.equal(f.d.querySelector('.invoice-list-card b').textContent, '۰ ریال');
  f.click('[data-invoice-select="17"]');
  assert.deepEqual([...f.d.querySelectorAll('.invoice-total b')].slice(0, 3).map(node => node.textContent), ['۰ ریال', '۰ ریال', '۰ ریال']);
  f.rows.invoices[0].total_amount = '1234.00';
  f.rows.payments.push({ id: '31', invoice_id: '17', sequence_no: 1, amount: '1234.00', status: 'paid' });
  await f.w.bamcoInvoices.load();
  assert.equal(f.d.querySelectorAll('.invoice-total b')[2].textContent, '۰ ریال');
});

test('fractional invoice display, editor typing and save payloads retain every cent and large digit', async t => {
  const f = await fixture(t, '9007199254740993.50', ['1234.50', '0.01'], 'USD');
  assert.equal(f.d.querySelector('.invoice-list-card b').textContent, '۱,۲۳۴.۵۱ دلار آمریکا');
  f.click('[data-invoice-select="17"]');
  assert.deepEqual([...f.d.querySelectorAll('.invoice-total b')].slice(0, 3).map(node => node.textContent), [
    '۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳.۵۰ دلار آمریکا', '۱,۲۳۴.۵۱ دلار آمریکا', '۹,۰۰۷,۱۹۹,۲۵۴,۷۳۹,۷۵۸.۹۹ دلار آمریکا'
  ]);
  assert.deepEqual([...f.d.querySelectorAll('.payment-stage-value b')].map(node => node.textContent), ['۱,۲۳۴.۵۰ دلار آمریکا', '۰.۰۱ دلار آمریکا']);
  f.click('[data-invoice-action="edit"]');
  let form = f.d.querySelector('#invoiceForm');
  assert.equal(form.elements.total_amount.value, '۹,۰۰۷,۱۹۹,۲۵۴,۷۴۰,۹۹۳.۵۰');
  await f.submit(form);
  assert.equal(f.calls.find(call => call.name === 'save_invoice').args.p_payload.total_amount, '9007199254740993.50');
  assert.equal(f.rows.invoices[0].currency, 'USD');
  f.click('[data-invoice-payment-edit="31"]');
  form = f.d.querySelector('#invoicePaymentForm');
  assert.equal(form.elements.amount.value, '۱,۲۳۴.۵۰');
  form.elements.amount.value = '1234.00';
  form.elements.amount.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  assert.equal(form.elements.amount.value, '۱,۲۳۴.۰۰', 'typed zero decimals stay editable');
  await f.submit(form);
  assert.equal(f.calls.find(call => call.name === 'save_invoice_payment').args.p_payload.amount, '1234.00');
  assert.equal(f.rows.payments[0].amount, '1234.00');
  assert.equal(f.d.querySelector('.payment-stage-value b').textContent, '۱,۲۳۴ دلار آمریکا');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('assets/js/money-input.js', 'utf8');
function setup(attributes = 'data-money-min="0" data-money-scale="2" data-money-integer-digits="16"') {
  const dom = new JSDOM(`<form><input name="amount" data-money-input ${attributes} required><input name="sequence_no" type="number" value="1234"><input name="quantity" type="number" value="5678"><select name="currency"><option value="IRR">IRR</option><option value="USD" selected>USD</option></select></form>`, { runScripts: 'outside-only' });
  dom.window.eval(source);
  const { window: w } = dom, form = w.document.querySelector('form'), input = form.elements.amount, money = w.BamcoMoney;
  money.bind(form); input.focus();
  const set = (value, cursor = value.length, end = cursor) => { input.value = value; input.setSelectionRange(cursor, end); input.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const edit = (text, inputType = 'insertText') => {
    const event = new w.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: text });
    if (!input.dispatchEvent(event)) return;
    let from = input.selectionStart, to = input.selectionEnd;
    if (from === to && inputType === 'deleteContentBackward') from = Math.max(0, from - 1);
    if (from === to && inputType === 'deleteContentForward') to = Math.min(input.value.length, to + 1);
    input.setRangeText(text || '', from, to, 'end'); input.dispatchEvent(new w.InputEvent('input', { bubbles: true, inputType, data: text }));
  };
  return { dom, w, form, input, money, set, edit };
}

test('money typing groups in real time and preserves cents, trailing decimal and caret', t => {
  const f = setup(); t.after(() => f.dom.window.close());
  for (const char of '1234567') { f.edit(char); assert.equal(f.input.selectionStart, f.input.value.length); }
  assert.equal(f.input.value, '1,234,567');
  f.edit('.'); assert.equal(f.input.value, '1,234,567.'); assert.equal(f.money.raw(f.input), '1234567');
  f.edit('0'); f.edit('5'); assert.equal(f.input.value, '1,234,567.05'); assert.equal(f.money.raw(f.input), '1234567.05');
  f.edit('', 'deleteContentBackward'); assert.equal(f.input.value, '1,234,567.0');
  assert.equal(f.money.raw(f.input), '1234567.0');
  assert.equal(f.input.dir, 'ltr'); assert.equal(f.input.inputMode, 'decimal');
});

test('money paste accepts Persian, Arabic and English digits and unambiguous grouping', t => {
  const f = setup(); t.after(() => f.dom.window.close());
  for (const value of ['۱۲۳۴۵۶۷٫۸۰', '١٬٢٣٤٬٥٦٧٫٨٠', '1,234,567.80', '1\u202f234\u202f567.80']) {
    f.set(''); f.edit(value, 'insertFromPaste');
    assert.equal(f.input.value, '1,234,567.80'); assert.equal(f.money.raw(f.input), '1234567.80'); assert.equal(f.input.validationMessage, '');
  }
  f.set('.۵'); assert.equal(f.input.value, '.5'); assert.equal(f.money.raw(f.input), '0.5');
  f.set('۰۰۱۲۳.۰۰'); assert.equal(f.input.value, '00,123.00'); assert.equal(f.money.raw(f.input), '123.00');
});

test('middle edits, selection replacement and deletion across a group keep the logical caret', t => {
  const f = setup(); t.after(() => f.dom.window.close());
  f.set('12345'); f.input.setSelectionRange(3, 3); f.edit('9');
  assert.equal(f.input.value, '129,345'); assert.equal(f.input.selectionStart, 3);
  f.set('1234'); f.input.setSelectionRange(2, 2); f.edit('', 'deleteContentBackward');
  assert.equal(f.input.value, '234'); assert.equal(f.input.selectionStart, 0);
  f.set('1234'); f.input.setSelectionRange(1, 1); f.edit('', 'deleteContentForward');
  assert.equal(f.input.value, '134'); assert.equal(f.input.selectionStart, 1);
  f.set('1234567.89'); f.input.setSelectionRange(2, 5); f.edit('۹۹');
  assert.equal(f.input.value, '199,567.89'); assert.equal(f.input.selectionStart, 3);
  f.set('1234'); f.input.setSelectionRange(0, f.input.value.length); f.edit('', 'deleteContentBackward');
  assert.equal(f.input.value, ''); assert.throws(() => f.money.raw(f.input));
});

test('negative, malformed, excess precision and numeric overflow remain visible and invalid', t => {
  const f = setup(); t.after(() => f.dom.window.close());
  for (const value of ['-100', '--1', '1e3', '1.2.3', '1.2,3', '1/2', '12 dollars', '1.001', '10000000000000000']) {
    f.set(value); assert.throws(() => f.money.raw(f.input), value); assert.ok(f.input.validationMessage, value);
    assert.equal(f.input.value.replaceAll(',', ''), value.replaceAll(',', ''), 'invalid input is not silently discarded or rounded');
  }
  f.set('9999999999999999.99'); assert.equal(f.money.raw(f.input), '9999999999999999.99'); assert.equal(f.input.validationMessage, '');
  f.set('0'); assert.equal(f.money.raw(f.input), '0');
  f.input.dataset.moneyMin = '0.01'; assert.throws(() => f.money.raw(f.input));
  f.set('0.01'); assert.equal(f.money.raw(f.input), '0.01');
});

test('integer rial fields validate their original range without accepting fractional rial', t => {
  const f = setup('data-money-min="1" data-money-scale="0" data-money-integer-digits="18"'); t.after(() => f.dom.window.close());
  f.set('999999999999999999'); assert.equal(f.input.value, '999,999,999,999,999,999'); assert.equal(f.money.raw(f.input), '999999999999999999');
  for (const value of ['0', '1.01', '1000000000000000000']) { f.set(value); assert.throws(() => f.money.raw(f.input)); }
});

test('exact monetary arithmetic never loses low cents or large integer digits', t => {
  const f = setup(); t.after(() => f.dom.window.close()); const m = f.money;
  assert.equal(m.add('9007199254740993.01', '0.02'), '9007199254740993.03');
  assert.equal(m.subtract('9007199254740993.01', '9007199254740993.00'), '0.01');
  assert.equal(m.sum(['999999999999999999', '2', '-1']), '1000000000000000000');
  assert.equal(m.compare('9007199254740993.01', '9007199254740993.02'), -1);
  assert.equal(m.percent('1', '3'), '33.333'); assert.equal(m.percent('2', '3'), '66.667');
  assert.equal(m.percent('9999999999999999.99', '9999999999999999.99'), '100.000'); assert.equal(m.percent('1', '0'), null);
});

test('form serialization emits plain strings and leaves currency, quantity and sequence alone', t => {
  const f = setup(); t.after(() => f.dom.window.close());
  f.set('۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳٫۰۱');
  const data = new f.w.FormData(f.form), event = new f.w.Event('formdata'); Object.defineProperty(event, 'formData', { value: data }); f.form.dispatchEvent(event);
  assert.equal(data.get('amount'), '9007199254740993.01'); assert.equal(typeof data.get('amount'), 'string');
  assert.equal(data.get('currency'), 'USD'); assert.equal(data.get('sequence_no'), '1234'); assert.equal(data.get('quantity'), '5678');
  assert.equal(f.form.elements.sequence_no.type, 'number'); assert.equal(f.form.elements.quantity.type, 'number');
  f.set('1234'); f.money.bind(f.form); f.input.setSelectionRange(2, 2); f.edit('', 'deleteContentBackward');
  assert.equal(f.input.value, '234', 'rebinding does not duplicate the deletion handler');
});

test('only actual money fields opt in and petty cash keeps exact read/write contracts', () => {
  const petty = fs.readFileSync('assets/js/petty-cash.js', 'utf8');
  assert.match(petty, /amount::text/); assert.match(petty, /data\.amount=window\.BamcoMoney\.raw\(f\.elements\.amount\)/);
  assert.doesNotMatch(petty, /Number\((?:data\.amount|e\.amount)/);
  assert.match(petty, /data-money-scale="0" data-money-integer-digits="18"/);
});

/* Shared monetary fields: decimal strings are the data, grouping is presentation.
   Domain owners opt in with data-money-input and bind their freshly rendered form.
   Add data-money-digits="fa" for Persian display without changing the raw value. */
(() => {
  'use strict';
  if (window.BamcoMoney) return;
  const fields = new WeakSet(), forms = new WeakSet();
  const selector = 'input[data-money-input]';
  const groups = /[,\u066c\s]/g;
  const group = char => !!char && /[,\u066c\s]/.test(char);
  const digit = char => !!char && /[0-9۰-۹٠-٩]/.test(char);
  const digits = value => String(value ?? '').replace(/[۰-۹]/g, char => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
    .replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char))).replace(/\u066b/g, '.');
  const invalid = () => new Error('مبلغ را با رقم و حداکثر یک ممیز وارد کنید.');

  function parts(value) {
    const text = digits(value).trim();
    // A comma/Arabic thousands separator is only grouping in the integer part.
    // Never remove punctuation from a fractional part or silently drop bad input.
    if (!/^-?[\d,\u066c\s]*(?:\.\d*)?$/.test(text)) throw invalid();
    const negative = text.startsWith('-'), unsigned = negative ? text.slice(1) : text;
    const [integer, fraction] = unsigned.split('.');
    return { negative, integer: integer.replace(groups, ''), fraction, text };
  }
  function plain(value, allowNegative = false) {
    const item = parts(value);
    if (!item.integer && !item.fraction) throw invalid();
    if (item.negative && !allowNegative) throw new Error('مبلغ نمی‌تواند منفی باشد.');
    const integer = (item.integer || '0').replace(/^0+(?=\d)/, '');
    const sign = item.negative && /[1-9]/.test(integer + (item.fraction || '')) ? '-' : '';
    return sign + integer + (item.fraction ? '.' + item.fraction : '');
  }
  function decimal(value) {
    const text = plain(value, true), negative = text.startsWith('-');
    const [integer, fraction = ''] = (negative ? text.slice(1) : text).split('.');
    return { units: BigInt(integer + fraction) * (negative ? -1n : 1n), scale: fraction.length };
  }
  const power = scale => 10n ** BigInt(scale);
  function decimalText(units, scale) {
    const negative = units < 0n, text = String(negative ? -units : units).padStart(scale + 1, '0');
    return (negative ? '-' : '') + (scale ? text.slice(0, -scale) + '.' + text.slice(-scale) : text);
  }
  function aligned(a, b) {
    const left = decimal(a), right = decimal(b), scale = Math.max(left.scale, right.scale);
    return { left: left.units * power(scale - left.scale), right: right.units * power(scale - right.scale), scale };
  }
  function compare(a, b) { const { left, right } = aligned(a, b); return left < right ? -1 : left > right ? 1 : 0; }
  function add(a, b) { const { left, right, scale } = aligned(a, b); return decimalText(left + right, scale); }
  function subtract(a, b) { const { left, right, scale } = aligned(a, b); return decimalText(left - right, scale); }
  const sum = values => values.reduce((total, value) => add(total, value ?? '0'), '0');
  function percent(amount, total, { scale = 3 } = {}) {
    if (!Number.isInteger(scale) || scale < 0 || scale > 12) throw new Error('Invalid percentage precision');
    const { left, right } = aligned(amount, total);
    if (right === 0n) return null;
    const numerator = left * 100n * power(scale), negative = (numerator < 0n) !== (right < 0n);
    const top = numerator < 0n ? -numerator : numerator, bottom = right < 0n ? -right : right;
    const rounded = (top + bottom / 2n) / bottom;
    return decimalText(negative ? -rounded : rounded, scale);
  }
  function raw(inputOrString) {
    const input = typeof inputOrString === 'object' && inputOrString && 'value' in inputOrString ? inputOrString : null;
    const value = plain(input ? input.value : inputOrString, input?.dataset.moneyAllowNegative === 'true');
    if (input) {
      const { integer, fraction = '' } = parts(value), { moneyMin, moneyMax, moneyScale, moneyIntegerDigits } = input.dataset;
      if (moneyScale != null && fraction.length > Number(moneyScale)) throw new Error(`مبلغ حداکثر ${moneyScale} رقم اعشار دارد.`);
      if (moneyIntegerDigits != null && integer.length > Number(moneyIntegerDigits)) throw new Error(`مبلغ حداکثر ${moneyIntegerDigits} رقم صحیح دارد.`);
      if (moneyMin != null && compare(value, moneyMin) < 0) throw new Error(`مبلغ نباید کمتر از ${format(moneyMin)} باشد.`);
      if (moneyMax != null && compare(value, moneyMax) > 0) throw new Error(`مبلغ نباید بیشتر از ${format(moneyMax)} باشد.`);
    }
    return value;
  }
  function format(value, { digits: digitSet } = {}) {
    try {
      const item = parts(value);
      const formatted = (item.negative ? '-' : '') + item.integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        + (item.fraction != null ? '.' + item.fraction : '');
      return digitSet === 'fa' ? formatted.replace(/\d/g, char => '۰۱۲۳۴۵۶۷۸۹'[char]) : formatted;
    } catch { return String(value ?? ''); }
  }
  function validate(input) {
    try { if (input.value || input.required) raw(input); input.setCustomValidity(''); return true; }
    catch (error) { input.setCustomValidity(error.message); return false; }
  }
  const logicalOffset = (value, offset) => digits(value.slice(0, offset)).replace(groups, '').length;
  function visualOffset(value, count, afterGroup) {
    let offset = 0, seen = 0;
    while (offset < value.length && seen < count) { if (!group(value[offset])) seen++; offset++; }
    if (afterGroup) while (offset < value.length && group(value[offset])) offset++;
    return offset;
  }
  function refresh(input) {
    const before = input.value, start = input.selectionStart, end = input.selectionEnd, direction = input.selectionDirection;
    // Digit presentation is field-specific; raw() always keeps exact ASCII data.
    const after = format(before, { digits: input.dataset.moneyDigits });
    if (after !== before) {
      input.value = after;
      if (start != null && end != null) input.setSelectionRange(
        visualOffset(after, logicalOffset(before, start), group(before[start - 1])),
        visualOffset(after, logicalOffset(before, end), group(before[end - 1])), direction || 'none');
    }
    validate(input);
  }
  function bind(root = document) {
    const inputs = [...(root.querySelectorAll?.(selector) || [])];
    if (root.matches?.(selector)) inputs.unshift(root);
    inputs.forEach(input => {
      input.type = 'text'; input.inputMode = 'decimal'; input.dir = 'ltr';
      if (!fields.has(input)) {
        fields.add(input);
        input.addEventListener('input', event => { if (!event.isComposing) refresh(input); });
        input.addEventListener('compositionend', () => refresh(input));
        input.addEventListener('blur', () => refresh(input));
        input.addEventListener('beforeinput', event => {
          if (event.isComposing || input.selectionStart !== input.selectionEnd) return;
          const cursor = input.selectionStart, text = input.value;
          // A grouping mark is not an extra character to erase. Deletion across
          // it erases the adjacent digit in the requested direction in one step.
          let from, to;
          if (event.inputType === 'deleteContentBackward' && cursor > 1 && group(text[cursor - 1]) && digit(text[cursor - 2])) { from = cursor - 2; to = cursor; }
          if (event.inputType === 'deleteContentForward' && group(text[cursor]) && digit(text[cursor + 1])) { from = cursor; to = cursor + 2; }
          if (from == null || !event.cancelable) return;
          event.preventDefault(); input.setRangeText('', from, to, 'end');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      refresh(input);
      const form = input.form;
      if (form && !forms.has(form)) {
        forms.add(form);
        form.addEventListener('formdata', event => {
          form.querySelectorAll(selector).forEach(field => {
            if (!field.name || field.disabled) return;
            try { event.formData.set(field.name, raw(field)); } catch { /* Domain submit reports validation. */ }
          });
        });
        form.addEventListener('reset', () => queueMicrotask(() => form.querySelectorAll(selector).forEach(refresh)));
      }
    });
    return root;
  }
  window.BamcoMoney = Object.freeze({ bind, raw, format, compare, add, subtract, sum, percent });
})();

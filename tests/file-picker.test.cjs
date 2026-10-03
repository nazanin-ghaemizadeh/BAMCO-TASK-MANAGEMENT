const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('assets/js/file-picker.js', 'utf8');
function fixture() {
  const dom = new JSDOM('<form id="form"></form>', { runScripts: 'outside-only' });
  dom.window.eval(source);
  return { dom, w: dom.window, form: dom.window.document.querySelector('form'), api: dom.window.BamcoFilePicker };
}
test('shared picker matches document chooser with accessible single-file input', () => {
  const { dom, form, api } = fixture();
  form.innerHTML = api.render({ name: 'proforma_file', label: 'پیش‌فاکتور', accept: '.pdf', maxSizeText: 'حداکثر ۶ مگابایت', required: true, wrapperAttribute: 'data-invoice-file-picker' });
  api.bind(form);
  const input = form.elements.proforma_file;
  assert.equal(input.multiple, false); assert.equal(input.required, true); assert.equal(input.accept, '.pdf');
  assert.equal(input.getAttribute('aria-label'), 'پیش‌فاکتور');
  assert.ok(form.querySelector('.document-file-picker[data-invoice-file-picker]'));
  assert.equal(form.querySelector('[data-file-name]').textContent, 'فایلی انتخاب نشده است');
  assert.equal(form.querySelector('[data-file-detail]').textContent, 'حداکثر ۶ مگابایت');
  dom.window.close();
});
test('selection and reset show the actual filename without rendering markup', async () => {
  const { dom, w, form, api } = fixture(); form.innerHTML = api.render(); api.bind(form); api.bind(form);
  const input = form.elements.file;
  Object.defineProperty(input, 'files', { configurable: true, value: [new w.File(['fixture'], '<script>sample.pdf', { type: 'application/pdf' })] });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(form.querySelector('[data-file-name]').textContent, '<script>sample.pdf'); assert.equal(form.querySelector('script'), null);
  Object.defineProperty(input, 'files', { configurable: true, value: [] }); form.reset();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(form.querySelector('[data-file-name]').textContent, 'فایلی انتخاب نشده است'); dom.window.close();
});
test('picker rendering escapes configuration and rejects arbitrary wrapper markup', () => {
  const { dom, form, api } = fixture();
  form.innerHTML = api.render({ name: 'file" onfocus="bad()', label: '<img src=x>', accept: '"><script>bad()</script>', maxSizeText: '<b>limit</b>', wrapperAttribute: 'onclick="bad()"' });
  assert.equal(form.querySelectorAll('input').length, 1); assert.equal(form.querySelector('img,script'), null);
  assert.equal(form.querySelector('input').getAttribute('onfocus'), null); assert.equal(form.querySelector('label').getAttribute('onclick'), null);
  assert.equal(form.querySelector('[data-file-detail]').textContent, '<b>limit</b>'); dom.window.close();
});
test('chooser can bind a newly reinserted label directly', () => {
  const { dom, form, api } = fixture(); form.innerHTML = api.render(); const picker = form.querySelector('label');
  picker.querySelector('input').multiple = true; api.bind(picker); assert.equal(picker.querySelector('input').multiple, false); dom.window.close();
});
test('shared chooser keeps the document reference dashed design and hides native chooser chrome', () => {
  const css = fs.readFileSync('assets/css/file-picker.css', 'utf8');
  assert.match(css, /border: 1px dashed #9dbeb0/); assert.match(css, /input\[type="file"\].*opacity: 0/s);
  assert.match(css, /:focus-within/); assert.match(css, /overflow-wrap: anywhere/);
});

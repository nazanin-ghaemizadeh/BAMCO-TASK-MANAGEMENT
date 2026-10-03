/* Shared one-file chooser, matching the organizational document upload form. */
(() => {
  'use strict';
  if (window.BamcoFilePicker) return;
  const bound = new WeakSet();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function render({ name = 'file', label = 'فایل', accept = '', maxSizeText = '', required = false, wrapperAttribute = '' } = {}) {
    const attribute = /^data-[a-z0-9-]+$/.test(wrapperAttribute) ? ` ${wrapperAttribute}` : '';
    return `<label class="span-2 document-file-picker" data-bamco-file-picker${attribute}><span>${escape(label)}</span><input name="${escape(name)}" type="file" accept="${escape(accept)}" aria-label="${escape(label)}"${required ? ' required' : ''}><span class="document-file-choice"><span class="ghost" aria-hidden="true">انتخاب فایل</span><b data-file-name aria-live="polite">فایلی انتخاب نشده است</b></span><small data-file-detail>${escape(maxSizeText)}</small></label>`;
  }
  function refresh(input) {
    const picker = input?.closest?.('[data-bamco-file-picker]');
    if (!picker) return;
    const name = picker.querySelector('[data-file-name]');
    if (name) name.textContent = input.files?.[0]?.name || 'فایلی انتخاب نشده است';
  }
  function bind(root = document) {
    const pickers = [...(root.querySelectorAll?.('[data-bamco-file-picker]') || [])];
    if (root.matches?.('[data-bamco-file-picker]')) pickers.unshift(root);
    for (const picker of pickers) {
      const input = picker.querySelector('input[type="file"]');
      if (!input) continue;
      // Every upload reserves one object. Multiple selection is never enabled.
      input.multiple = false;
      if (!bound.has(input)) {
        bound.add(input);
        input.addEventListener('change', () => refresh(input));
        input.form?.addEventListener('reset', () => setTimeout(() => refresh(input), 0));
      }
      refresh(input);
    }
  }
  window.BamcoFilePicker = { render, bind, refresh };
})();

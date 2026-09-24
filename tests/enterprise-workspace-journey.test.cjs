const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const field = (form, name, value) => { form.elements[name].value = value; };

test('enterprise pages keep a stable shared shell and persist the project, part and invoice journeys', async t => {
  const f = await fixture({
    realNotices: true,
    fetchResult: async ({ endpoint, method, tables }) => {
      if (endpoint === 'organization_positions' && method === 'POST') tables.organization_positions.at(-1).active = true;
      if (endpoint === 'organization_positions' && method === 'DELETE') {
        tables.organization_positions.splice(0, tables.organization_positions.length);
        tables.organization_position_assignments.splice(0, tables.organization_position_assignments.length);
        return [];
      }
    },
    tables: {
    projects: [], project_items: [], project_dependencies: [],
    part_handovers: [],
    invoices: [], invoice_payments: [],
    organization_roles: [{ id: 1, title: 'مدیر', level_no: 4, active: true }],
    organization_units: [], organization_positions: [], organization_position_assignments: [], approval_policies: []
  } });
  const { w, d, tables, calls } = f;
  t.after(() => f.dispose());

  for (const route of ['projects', 'parts', 'invoices', 'organization', 'tools']) {
    await f.open(route);
    const view = d.querySelector(`#${route}View`);
    assert(view, `${route} view exists statically`);
    assert.equal(view.classList.contains('bamco-interior'), false, `${route} keeps its own page layout`);
    assert.ok(view.querySelector('.enterprise-feature-root > .enterprise-toolbar'), `${route} uses the shared static enterprise header`);
    assert.equal(view.querySelectorAll('.content-back').length, 0, `${route} does not inherit legacy return-to-home listeners`);
    assert.equal(view.querySelectorAll('[data-home-action]').length, 1, `${route} has one explicit return-to-home control`);
  }

  const assertActiveRoute = route => {
    assert.equal(d.querySelector(`#${route}View`).classList.contains('hidden'), false, `${route} remains active`);
    assert.equal(d.querySelector('#homeView').classList.contains('hidden'), true, 'editing cannot reactivate home');
  };

  await f.open('organization');
  assert.deepEqual([...d.querySelectorAll('#organizationFeatureRoot .enterprise-toolbar button')].map(button => button.textContent.trim()), ['بازگشت به خانه', '＋ جایگاه جدید', 'مدیریت دسترسی']);
  assert.equal(d.querySelector('[data-org-action="unit"]'), null);
  assert.equal(d.querySelector('[data-org-action="refresh"]'), null);
  d.querySelector('[data-org-action="position"]').click();
  const positionForm = d.querySelector('#organizationPositionForm');
  assert.equal(positionForm.elements.code, undefined);
  assert.equal(positionForm.elements.unit_id, undefined);
  assert.equal(positionForm.getAttribute('method'), 'dialog', 'the position form cannot fall back to a page navigation');
  let positionSubmitWasPrevented = false;
  positionForm.addEventListener('submit', event => { positionSubmitWasPrevented = event.defaultPrevented; });
  field(positionForm, 'title', 'مدیر برنامه‌ریزی');
  field(positionForm, 'role_id', '1');
  field(positionForm, 'user_id', 'test-owner');
  positionForm.elements.title.dispatchEvent(new w.Event('input', { bubbles: true }));
  assertActiveRoute('organization');
  submit(w, positionForm);
  assert.equal(positionSubmitWasPrevented, true, 'the form owns its submit event before any delegated handler');
  await until(() => tables.organization_positions.length === 1 && tables.organization_position_assignments.length === 1);
  assert.match(tables.organization_positions[0].code, /^ORG-/);
  assert.equal(tables.organization_position_assignments[0].user_id, 'test-owner');
  assert.equal(calls.filter(call => call.endpoint === 'save_organization_position' && call.method === 'POST').length, 1);
  assert.deepEqual(calls.filter(call => ['organization_positions', 'organization_position_assignments'].includes(call.endpoint) && ['POST', 'PATCH'].includes(call.method)), [], 'position and assignment persistence is one atomic RPC');
  assert.equal(d.querySelector('#appView').classList.contains('hidden'), false, 'saving a position keeps the authenticated app visible');
  await until(() => /مدیر برنامه‌ریزی/.test(d.querySelector('#organizationFeatureRoot').textContent));
  assert.match(d.querySelector('#organizationFeatureRoot').textContent, /مدیر برنامه‌ریزی/);
  d.querySelector('[data-org-edit="1000"]').click();
  const editPositionForm = d.querySelector('#organizationPositionForm');
  assert.equal(d.querySelector('#organizationPositionDialog').open, true);
  assert.equal(editPositionForm.elements.title.value, 'مدیر برنامه‌ریزی');
  assert.equal(editPositionForm.elements.user_id.value, 'test-owner');
  assert.equal(d.querySelector('[data-org-delete]').classList.contains('hidden'), false);
  field(editPositionForm, 'title', 'مدیر برنامه‌ریزی و کنترل');
  submit(w, editPositionForm);
  await until(() => tables.organization_positions[0].title === 'مدیر برنامه‌ریزی و کنترل');
  assertActiveRoute('organization');
  d.querySelector('[data-org-edit="1000"]').click();
  d.querySelector('[data-org-delete]').click();
  await until(() => d.querySelector('#bamcoNoticeDialog')?.open);
  assertActiveRoute('organization');
  d.querySelector('[data-notice-ok]').click();
  await until(() => tables.organization_positions.length === 0);
  assertActiveRoute('organization');
  d.querySelector('[data-home-action]').click();
  assert.equal(d.querySelector('#homeView').classList.contains('hidden'), false, 'organization return control returns to home');

  await f.open('projects');
  d.querySelector('[data-project-action="new"]').click();
  const projectForm = d.querySelector('#projectForm');
  assert.equal(d.querySelector('#projectDialog').open, true);
  assert.equal(projectForm.elements.project_code, undefined, 'project code is generated by the system');
  assert.equal(projectForm.elements.owner_id, undefined, 'project ownership follows the responsible person');
  field(projectForm, 'title', 'پروژه آزمایشی');
  field(projectForm, 'planned_start', '2026-09-21');
  field(projectForm, 'planned_end', '2026-10-21');
  projectForm.elements.title.dispatchEvent(new w.Event('input', { bubbles: true }));
  assertActiveRoute('projects');
  submit(w, projectForm);
  await until(() => tables.projects.length === 1);
  assertActiveRoute('projects');
  assert.equal(tables.projects[0].created_by, 'test-manager');
  assert.equal(tables.projects[0].owner_id, 'test-manager');
  assert.equal(tables.projects[0].manager_id, 'test-manager');
  assert.match(d.querySelector('#projectFeatureRoot').textContent, /پروژه آزمایشی/);

  await f.open('parts');
  d.querySelector('[data-part-action="new"]').click();
  const partForm = d.querySelector('#partForm');
  assert.deepEqual([...d.querySelectorAll('.part-handover-table thead tr:first-child th')].map(cell => cell.textContent.trim()), ['نام قطعه', 'شماره فنی', 'تحویل‌دهنده در زمان دریافت', 'تحویل‌گیرنده در زمان دریافت', 'تحویل‌دهنده در زمان عودت', 'تحویل‌گیرنده در زمان عودت', 'نوع تحویل (دائم یا موقت)', 'اگر موقت: تاریخ عودت', 'علت تحویل', 'تاریخ ثبت', 'توضیحات']);
  field(partForm, 'part_name', 'کالیپر ترمز');
  field(partForm, 'technical_number', 'PN-101');
  field(partForm, 'delivery_type', 'temporary');
  partForm.elements.delivery_type.dispatchEvent(new w.Event('change', { bubbles: true }));
  field(partForm, 'return_due_date', '2026-10-01');
  field(partForm, 'reason', 'آزمون دوام');
  partForm.elements.part_name.dispatchEvent(new w.Event('input', { bubbles: true }));
  assertActiveRoute('parts');
  submit(w, partForm);
  await until(() => tables.part_handovers.length === 1);
  assertActiveRoute('parts');
  assert.equal(tables.part_handovers[0].technical_number, 'PN-101');
  assert.equal(tables.part_handovers[0].delivery_type, 'temporary');

  await f.open('invoices');
  d.querySelector('[data-invoice-action="new"]').click();
  const invoiceForm = d.querySelector('#invoiceForm');
  field(invoiceForm, 'invoice_number', 'INV-500');
  field(invoiceForm, 'title', 'آزمون بیرون از شرکت');
  assert.equal(invoiceForm.elements.account_party, undefined, 'طرف حساب از نام شرکت/پیمانکار ساخته می‌شود');
  field(invoiceForm, 'company_name', 'آزمایشگاه نمونه');
  field(invoiceForm, 'total_amount', '500000000');
  invoiceForm.elements.title.dispatchEvent(new w.Event('input', { bubbles: true }));
  assertActiveRoute('invoices');
  submit(w, invoiceForm);
  await until(() => tables.invoices.length === 1);
  assertActiveRoute('invoices');
  assert.equal(tables.invoices[0].total_amount, 500000000);
  assert.equal(tables.invoices[0].account_party, 'آزمایشگاه نمونه');

  for (const [sequence, amount] of [[1, 100000000], [2, 200000000], [3, 200000000]]) {
    d.querySelector('[data-invoice-action="payment"]').click();
    assert.equal(d.querySelector('#invoicePaymentDialog').open, true, 'ثبت و ویرایش مرحله در پنجرهٔ مرکزی انجام می‌شود');
    const paymentForm = d.querySelector('#invoicePaymentForm');
    field(paymentForm, 'sequence_no', String(sequence));
    field(paymentForm, 'amount', String(amount));
    field(paymentForm, 'status', 'paid');
    if (sequence === 1) { field(paymentForm, 'planned_date', '2026-09-01'); field(paymentForm, 'paid_date', '2026-09-02'); }
    paymentForm.elements.amount.dispatchEvent(new w.Event('input', { bubbles: true }));
    assertActiveRoute('invoices');
    submit(w, paymentForm);
    await until(() => tables.invoice_payments.length === sequence);
    assertActiveRoute('invoices');
  }
  assert.equal(tables.invoice_payments.reduce((sum, item) => sum + item.amount, 0), 500000000);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /۱۰۰٪/);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /پرداخت‌شده/);
  assert.ok(d.querySelector('.payment-late-icon'), 'پرداخت پس از تاریخ برنامه‌ای با علامت دیرکرد مشخص است');
  d.querySelector('[data-invoice-payment-edit="1002"]').click();
  assert.equal(d.querySelector('#invoicePaymentDialog').open, true);
  const editPaymentForm = d.querySelector('#invoicePaymentForm');
  assert.equal(editPaymentForm.elements.payment_id.value, '1002');
  field(editPaymentForm, 'amount', '150000000');
  submit(w, editPaymentForm);
  await until(() => tables.invoice_payments.find(item => item.id === 1002)?.amount === 150000000);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /۹۰٪/);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /۵۰,۰۰۰,۰۰۰ ریال/);

  d.querySelector('[data-invoice-action="edit"]').click();
  const editInvoiceForm = d.querySelector('#invoiceForm');
  assert.equal(editInvoiceForm.elements.invoice_id.value, '1000');
  field(editInvoiceForm, 'total_amount', '600000000');
  submit(w, editInvoiceForm);
  await until(() => tables.invoices[0]?.total_amount === 600000000);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /۷۵٪/);

  await f.open('invoices');
  assert.equal(d.querySelector('.invoice-grid').classList.contains('detail-open'), false, 'هر ورود به صورت‌حساب با کارت‌ها آغاز می‌شود');
  d.querySelector('[data-invoice-select="1000"]').click();
  d.querySelector('[data-invoice-action="delete"]').click();
  await until(() => d.querySelector('#bamcoNoticeDialog')?.open);
  d.querySelector('[data-notice-ok]').click();
  await until(() => tables.invoices.length === 0 && tables.invoice_payments.length === 0);
  assert.equal(d.querySelectorAll('[data-invoice-select]').length, 0);
  assert.deepEqual(f.errors, []);
});

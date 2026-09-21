const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, until } = require('./helpers/app-fixture.cjs');

const submit = (window, form) => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const field = (form, name, value) => { form.elements[name].value = value; };

test('enterprise pages keep their own layout and persist the project, part and invoice journeys', async t => {
  const f = await fixture({
    fetchResult: async ({ endpoint, method, tables }) => {
      if (endpoint === 'organization_positions' && method === 'POST') tables.organization_positions.at(-1).active = true;
    },
    tables: {
    projects: [], project_items: [], project_dependencies: [],
    parts: [], part_bom: [], part_vehicle_links: [], part_project_links: [], part_test_links: [], part_history: [],
    invoices: [], invoice_payments: [],
    organization_roles: [{ id: 1, title: 'مدیر', level_no: 4, active: true }],
    organization_units: [], organization_positions: [], organization_position_assignments: [], approval_policies: []
  } });
  const { w, d, tables } = f;
  t.after(() => f.dispose());

  for (const route of ['projects', 'parts', 'invoices', 'organization', 'tools']) {
    await f.open(route);
    const view = d.querySelector(`#${route}View`);
    assert(view, `${route} view exists statically`);
    assert.equal(view.classList.contains('bamco-interior'), false, `${route} keeps its own page layout`);
    assert.equal(view.querySelector('.bamco-page-heading'), null, `${route} is not rewritten by the generic interior shell`);
  }

  await f.open('organization');
  d.querySelector('[data-org-action="position"]').click();
  const positionForm = d.querySelector('#organizationPositionForm');
  field(positionForm, 'title', 'مدیر برنامه‌ریزی');
  field(positionForm, 'code', 'PLAN-MGR');
  field(positionForm, 'role_id', '1');
  field(positionForm, 'user_id', 'test-owner');
  submit(w, positionForm);
  await until(() => tables.organization_positions.length === 1 && tables.organization_position_assignments.length === 1);
  assert.equal(tables.organization_position_assignments[0].user_id, 'test-owner');
  await until(() => /مدیر برنامه‌ریزی/.test(d.querySelector('#organizationFeatureRoot').textContent));
  assert.match(d.querySelector('#organizationFeatureRoot').textContent, /مدیر برنامه‌ریزی/);

  await f.open('projects');
  d.querySelector('[data-project-action="new"]').click();
  const projectForm = d.querySelector('#projectForm');
  assert.equal(d.querySelector('#projectDialog').open, true);
  field(projectForm, 'project_code', 'PRJ-100');
  field(projectForm, 'title', 'پروژه آزمایشی');
  field(projectForm, 'planned_start', '2026-09-21');
  field(projectForm, 'planned_end', '2026-10-21');
  submit(w, projectForm);
  await until(() => tables.projects.length === 1);
  assert.equal(tables.projects[0].created_by, 'test-manager');
  assert.match(d.querySelector('#projectFeatureRoot').textContent, /پروژه آزمایشی/);

  await f.open('parts');
  d.querySelector('[data-part-action="new"]').click();
  const partForm = d.querySelector('#partForm');
  field(partForm, 'part_number', 'PN-101');
  field(partForm, 'code', 'BRAKE-01');
  field(partForm, 'fa_name', 'کالیپر ترمز');
  field(partForm, 'specifications', '{"وزن":12.5,"جنس":"آلومینیوم"}');
  submit(w, partForm);
  await until(() => tables.parts.length === 1);
  assert.equal(tables.parts[0].part_number, 'PN-101');
  assert.deepEqual(tables.parts[0].specifications, { وزن: 12.5, جنس: 'آلومینیوم' });

  await f.open('invoices');
  d.querySelector('[data-invoice-action="new"]').click();
  const invoiceForm = d.querySelector('#invoiceForm');
  field(invoiceForm, 'invoice_number', 'INV-500');
  field(invoiceForm, 'title', 'آزمون بیرون از شرکت');
  field(invoiceForm, 'account_party', 'آزمایشگاه نمونه');
  field(invoiceForm, 'total_amount', '500000000');
  submit(w, invoiceForm);
  await until(() => tables.invoices.length === 1);
  assert.equal(tables.invoices[0].total_amount, 500000000);

  for (const [sequence, amount] of [[1, 100000000], [2, 200000000], [3, 200000000]]) {
    d.querySelector('[data-invoice-action="payment"]').click();
    const paymentForm = d.querySelector('#invoicePaymentForm');
    field(paymentForm, 'sequence_no', String(sequence));
    field(paymentForm, 'amount', String(amount));
    field(paymentForm, 'status', 'paid');
    submit(w, paymentForm);
    await until(() => tables.invoice_payments.length === sequence);
  }
  assert.equal(tables.invoice_payments.reduce((sum, item) => sum + item.amount, 0), 500000000);
  assert.match(d.querySelector('#invoiceFeatureRoot').textContent, /۱۰۰٪/);
  assert.deepEqual(f.errors, []);
});

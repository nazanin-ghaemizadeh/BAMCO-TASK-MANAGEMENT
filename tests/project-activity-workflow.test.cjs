const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

const pause = () => new Promise(resolve => setTimeout(resolve, 0));

async function setup({ projects, items, rpcResult = { applied_directly: false } }) {
  const dom = new JSDOM('<section id="projectsView"><div id="projectFeatureRoot"></div></section>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window, registered = new Map(), calls = [], notices = [];
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.state = {
    profile: { id: 'expert', role: 'owner', display_name: 'کارشناس' },
    user: { id: 'expert' },
    organizationScope: { descendantUserIds: [], directReportUserIds: [] },
    profiles: [{ id: 'expert', display_name: 'کارشناس', active: true }]
  };
  w.BamcoNavigation = { registerView: (id, options) => registered.set(id, options) };
  const tables = { projects, project_items: items, project_dependencies: [] };
  w.bamcoEnterprise = {
    q: (selector, root = w.document) => root.querySelector(selector), esc: String, fa: String,
    date: value => value || '—', dateTime: value => value || '—', progress: () => '', statusText: String,
    fetchRows: async table => tables[table] || [], insert: async (table, payload) => { tables[table].push({ id: 1000 + tables[table].length, ...payload }); return tables[table].slice(-1); },
    update: async () => [], removeRows: async () => [], rpc: async (name, payload) => { calls.push({ name, payload }); return rpcResult; },
    setBusy: () => {}, notify: (message, error = false) => notices.push({ message, error })
  };
  w.eval(fs.readFileSync('assets/js/project-management.js', 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await registered.get('projects').activate();
  return { dom, w, d: w.document, calls, notices, tables };
}

test('project activity creation uses the approval RPC and its project owner', async t => {
  const f = await setup({
    projects: [{ id: 7, title: 'پروژهٔ من', project_code: 'P-7', owner_id: 'expert', manager_id: 'expert', status: 'ثبت شده' }],
    items: []
  });
  t.after(() => f.dom.window.close());
  f.d.querySelector('[data-project-select="7"]').click();
  f.d.querySelector('[data-project-action="item"]').click();
  const form = f.d.querySelector('#projectItemForm');
  assert.doesNotMatch(form.textContent, /فعالیت‌ها به‌صورت خودکار در کانبان نیز نمایش داده می‌شوند/);
  form.elements.item_type.value = 'activity';
  form.elements.title.value = 'فعالیت نیازمند تأیید';
  form.elements.item_planned_start.value = '2026-09-25';
  form.elements.item_planned_end.value = '2026-09-27';
  form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
  await pause();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'save_project_activity');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].payload)), {
    p_item_id: null,
    p_project_id: 7,
    p_payload: {
      title: 'فعالیت نیازمند تأیید', description: null, owner_id: 'expert', parent_item_id: null,
      planned_start: '2026-09-25', planned_end: '2026-09-27', status: 'ثبت شده', priority: 'medium', progress: 0
    }
  });
  assert.equal(f.tables.project_items.length, 0, 'pending activity is not inserted directly by the client');
  assert.equal(f.notices.at(-1).message, 'درخواست تعریف فعالیت در پروژه برای تأیید بالادست ارسال شد.');
});

test('project owner is locked after the first project item', async t => {
  const f = await setup({
    projects: [{ id: 8, title: 'پروژهٔ فعال', project_code: 'P-8', owner_id: 'expert', manager_id: 'expert', status: 'ثبت شده' }],
    items: [{ id: 80, project_id: 8, item_type: 'phase', title: 'فاز اول', owner_id: 'expert', status: 'ثبت شده', progress: 0 }]
  });
  t.after(() => f.dom.window.close());
  f.d.querySelector('[data-project-select="8"]').click();
  f.d.querySelector('[data-project-action="edit"]').click();
  const owner = f.d.querySelector('#projectForm [name="project_owner_id"]');
  assert.equal(owner.disabled, true);
  assert.equal(owner.value, 'expert');
  assert.match(owner.closest('label').textContent, /پس از ثبت اولین فعالیت قابل تغییر نیست/);
});

test('project activity edits are submitted for approval instead of patched directly', async t => {
  const f = await setup({
    projects: [{ id: 9, title: 'پروژهٔ دارای فعالیت', project_code: 'P-9', owner_id: 'expert', manager_id: 'expert', status: 'ثبت شده' }],
    items: [{ id: 90, project_id: 9, task_id: 900, item_type: 'activity', title: 'فعالیت موجود', description: 'شرح موجود', owner_id: 'expert', status: 'ثبت شده', priority: 'medium', progress: 10 }]
  });
  t.after(() => f.dom.window.close());
  f.d.querySelector('[data-project-select="9"]').click();
  f.d.querySelector('[data-project-view="wbs"]').click();
  f.d.querySelector('[data-project-item-open="90"]').dispatchEvent(new f.w.MouseEvent('dblclick', { bubbles: true }));
  const form = f.d.querySelector('#projectItemForm');
  assert.equal(form.elements.item_type.disabled, true);
  form.elements.title.value = 'فعالیت اصلاح‌شده';
  form.dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true }));
  await pause();
  assert.equal(f.calls[0].name, 'save_project_activity');
  assert.equal(f.calls[0].payload.p_item_id, 90);
  assert.equal(f.calls[0].payload.p_payload.title, 'فعالیت اصلاح‌شده');
  assert.equal(f.notices.at(-1).message, 'درخواست ویرایش فعالیت در پروژه برای تأیید بالادست ارسال شد.');
});

test('project activity deletion uses the canonical approval RPC', () => {
  const source = fs.readFileSync('assets/js/project-management.js', 'utf8');
  assert.match(source, /rpc\('delete_project_activity', \{ p_item_id: Number\(id\) \}\)/);
  assert.match(source, /درخواست حذف فعالیت از پروژه برای تأیید بالادست ارسال شد/);
});

test('project deletion submits one approval request and leaves its activities visible', async t => {
  const f = await setup({
    projects: [{ id: 15, title: 'پروژه گروهی', project_code: 'P-15', owner_id: 'expert', status: 'ثبت شده' }],
    items: [{ id: 151, project_id: 15, item_type: 'activity', title: 'فعالیت اول', task_id: 500 }]
  });
  t.after(() => f.dom.window.close());
  f.w.bamcoConfirm = async () => true;
  f.d.querySelector('[data-project-select="15"]').click();
  f.d.querySelector('[data-project-action="delete"]').click();
  await pause();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [{ name: 'request_project_deletion', payload: { p_project_id: 15 } }]);
  assert.equal(f.tables.projects.length, 1);
  assert.equal(f.tables.project_items.length, 1);
  assert.match(f.notices.at(-1).message, /برای تأیید بالادست ارسال شد/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('enterprise modules use the canonical navigation and shared UI bundle', () => {
  const html = read('index.html');
  const manifest = read('scripts/build-static-bundles.mjs');
  for (const [view, label] of [['projects', 'مدیریت پروژه‌ها'], ['parts', 'مدیریت قطعات'], ['invoices', 'صورتحساب‌ها و تعهدات مالی'], ['organization', 'ساختار سازمانی']]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(html, new RegExp(label));
    assert.match(manifest, new RegExp(`assets/js/${view === 'projects' ? 'project-management' : view === 'parts' ? 'part-catalog' : view === 'invoices' ? 'financial-obligations' : 'organization-structure'}\\.js`));
  }
  assert.match(manifest, /assets\/js\/enterprise-core\.js/);
  assert.match(read('assets/css/enterprise-features.css'), /enterprise-progress/);
});

test('manual approval-chain write UI is retired and organization workflow is the active source', () => {
  const bundle = read('assets/js/bamco.bundle.js');
  const migration = read('supabase/migrations/20260920120000_organizational_platform.sql');
  assert.doesNotMatch(bundle, /save_approval_chain/);
  assert.match(bundle, /bamcoApprovalCenter/);
  assert.match(migration, /create table if not exists public\.organization_workflows/);
  assert.match(migration, /create or replace function public\.request_workflow_snapshot/);
  assert.match(migration, /create or replace function private\.route_change_request/);
});

test('project dependency and financial invariants are represented server-side', () => {
  const migration = read('supabase/migrations/20260920120000_organizational_platform.sql');
  assert.match(migration, /dependency_type text not null default 'FS'/);
  assert.match(migration, /وابستگی حلقوی مجاز نیست/);
  assert.match(migration, /create or replace function public\.project_calculated_progress/);
  assert.match(migration, /create or replace function public\.invoice_paid_amount/);
  assert.match(migration, /create or replace function public\.invoice_remaining_amount/);
  assert.match(migration, /create table if not exists public\.audit_trail/);
});

test('enterprise navigation places new modules in the approved groups', () => {
  const sidebar = read('assets/js/sidebar.js');
  const catalog = read('assets/js/navigation-registry.js');
  const runtime = read('assets/js/production-runtime.js');
  const documents = read('assets/js/documents-sites.js');
  assert.match(catalog, /key: 'people'[\s\S]*routes: \['people', 'organization', 'activeSessions', 'loginActivity'\]/);
  assert.match(catalog, /key: 'vehicle'[\s\S]*'parts'/);
  assert.match(catalog, /key: 'reports'[\s\S]*'invoices'/);
  assert.match(catalog, /key: 'resources'[\s\S]*'userGuide'/);
  assert.match(sidebar, /BamcoNavigationCatalog/);
  assert.match(runtime, /const ORDER=Object\.fromEntries\(catalog\.groups/);
  assert.doesNotMatch(catalog, /key: 'organization'/);
  assert.match(documents, /#nav \.nav-group\[data-group="resources"\]/);
  assert.doesNotMatch(sidebar, /makeGroup\('مرکز راهنما'/);
});

test('organization view is a visual position tree and preserves one primary assignment source', () => {
  const organization = read('assets/js/organization-structure.js');
  const people = read('assets/js/shell.js');
  const migration = read('supabase/migrations/20260921103000_organization_people_root_refactor.sql');
  assert.match(organization, /org-chart-circle/);
  assert.match(organization, /فرد شاغل در این جایگاه/);
  assert.match(organization, /userOrganization/);
  assert.match(people, /نقش سازمانی/);
  assert.doesNotMatch(people, /name="role"><option value="owner">متولی/);
  assert.match(migration, /organization_one_active_primary_position_per_user_idx/);
  assert.match(migration, /organization_position_parent_is_acyclic/);
  assert.match(migration, /sync_profile_primary_position/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('legacy comprehensive organization workspace is removed from navigation and builds', () => {
  const catalog = read('assets/js/navigation-registry.js');
  const build = read('scripts/build-static-bundles.mjs');
  const patch = read('assets/js/organization-consolidation.js');
  const index = read('index.html');

  assert.doesNotMatch(catalog, /organizationAdmin|مدیریت جامع سازمان/);
  assert.doesNotMatch(build, /organization-admin\.(?:js|css)/);
  assert.match(build, /organization-consolidation\.js/);
  assert.match(index, /organization-consolidation\.js/);
  assert.match(patch, /\[data-view="\$\{LEGACY_ROUTE\}"\]/);
  assert.match(patch, /organizationAdmin/);
  assert.match(patch, /bamcoShowHome/);
});

test('people access matrix remains the module visibility and usability authority', () => {
  const catalog = read('assets/js/navigation-registry.js');
  const editor = read('assets/js/access-editor.js');

  assert.match(catalog, /routes: \['people', 'accessMatrix', 'organization'/);
  assert.match(editor, /effect: enabled \? 'allow' : 'deny'/);
  assert.match(editor, /can_view: enabled, can_create: enabled, can_edit: enabled, can_delete: enabled, can_export: enabled/);
  assert.match(editor, /set_feature_access/);
  assert.match(editor, /BamcoAccess\?\.refresh\?\.\(\{ force: true \}\)/);
});

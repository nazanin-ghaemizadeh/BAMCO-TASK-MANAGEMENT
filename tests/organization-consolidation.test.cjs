const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('legacy comprehensive organization workspace is retired from the live interface', () => {
  const patch = read('assets/js/organization-consolidation.js');
  const index = read('index.html');

  assert.match(index, /organization-consolidation\.js/);
  assert.match(patch, /\[data-view="\$\{LEGACY_ROUTE\}"\]/);
  assert.match(patch, /\$\{LEGACY_ROUTE\}View/);
  assert.match(patch, /orgAdminDialog/);
  assert.match(patch, /MutationObserver/);
  assert.match(patch, /bamcoShowHome/);
});

test('people access matrix remains the module visibility and usability authority', () => {
  const catalog = read('assets/js/navigation-registry.js');
  const editor = read('assets/js/access-editor.js');

  assert.match(catalog, /routes: \['organizationAdmin', 'people', 'accessMatrix', 'organization'/);
  assert.match(editor, /effect: enabled \? 'allow' : 'deny'/);
  assert.match(editor, /can_view: enabled, can_create: enabled, can_edit: enabled, can_delete: enabled, can_export: enabled/);
  assert.match(editor, /set_feature_access/);
  assert.match(editor, /BamcoAccess\?\.refresh\?\.\(\{ force: true \}\)/);
});

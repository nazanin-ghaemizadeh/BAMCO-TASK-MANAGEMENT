const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('retired organization administration is not loaded or navigable',()=>{
 const registry=read('assets/js/navigation-registry.js');
 const bundle=read('assets/js/bamco.bundle.js');
 const manifest=read('scripts/build-static-bundles.mjs');
 assert.doesNotMatch(registry,/organizationAdmin/);
 assert.doesNotMatch(bundle,/source: assets\/js\/organization-admin\.js/);
 assert.doesNotMatch(manifest,/'assets\/js\/organization-admin\.js'/);
 assert.match(registry,/routes: \['people', 'accessMatrix', 'organization'/);
});

test('checking a person card enables the unit ceiling before direct grants',()=>{
 const editor=read('assets/js/access-editor.js');
 assert.match(editor,/enableUnitFeaturesForCheckedGrants\(changes\)/);
 assert.match(editor,/p_action: 'features'/);
 assert.match(editor,/features: \[\.\.\.active\]/);
 assert.match(editor,/await org\.changed\(\)/);
 assert.match(editor,/await pool\(\[\.\.\.grouped\.entries\(\)\]/);
 assert.doesNotMatch(editor,/matrix\.central&&effective\.get\(id\)\?\.unit_enabled===false/);
});

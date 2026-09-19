from pathlib import Path
ROOT = Path.cwd()
def replace(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        assert new in text, f'Unexpected source: {path}'
        return
    p.write_text(text.replace(old, new), encoding='utf-8')

replace('assets/js/media-cache.js',
    " if(bindings.get(el)?.signature===signature)return bindings.get(el).promise;\n const binding={signature,promise:null};bindings.set(el,binding);",
    " const previous=bindings.get(el);\n if(previous?.signature===signature&&(previous.loading||(!path&&!el.children.length)||(path&&el.querySelector(':scope>img')?.src===previous.src)))return previous.promise;\n const binding={signature,promise:null,loading:!!path,src:''};bindings.set(el,binding);")
replace('assets/js/media-cache.js',
    "   if(img.src!==src)img.src=src;\n   el.style.removeProperty('background-image');",
    "   if(img.src!==src)img.src=src;binding.src=src;\n   el.style.removeProperty('background-image');")
replace('assets/js/media-cache.js',
    "   if(current()){paintInitial(el,p);bindings.delete(el)}return false;\n  }\n })();return binding.promise;",
    "   if(current()){paintInitial(el,p);bindings.delete(el)}return false;\n  }finally{binding.loading=false}\n })();return binding.promise;")
replace('tests/profile-report-mobile-regression.test.cjs',
    r" assert.match(canonical,/targets\.length&&targets\.every\(/);",
    r" assert.match(canonical,/bamcoMedia\.bindAvatar\(el,state\.profile\)/);")
replace('tests/startup-stability-20260915.test.cjs',
    " assert.match(topbar,/#applyAvatarCrop/);\n assert.match(topbar,/bamcoMedia\\?\\.invalidate\\?\\.\\('avatars',path\\)/);",
    " assert.match(topbar,/bamcoMedia\\.bindAvatar\\(el,state\\.profile\\)/);\n assert.doesNotMatch(topbar,/lastSource|loadingPath/);")
replace('tests/startup-stability-20260915.test.cjs',
    'authenticated avatars persist in the shared image cache across reloads and invalidate after edits',
    'authenticated avatars revalidate across reloads and invalidate after edits without persistent stale bytes')
replace('tests/startup-stability-20260915.test.cjs',
    " let b=make();await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,1);",
    " let b=make();await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,2);assert.equal(disk.size,0);")
replace('tests/startup-stability-20260915.test.cjs',
    " await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,2);b.dom.window.close();",
    " await b.w.bamcoMedia.get('avatars','people/me.jpg');assert.equal(calls,3);b.dom.window.close();")
replace('tests/startup-stability-20260915.test.cjs',
    "select=id,avatar_path&order=id", "select=id,avatar_path,updated_at&order=id")
replace('tests/startup-stability-20260915.test.cjs',
    r"bamcoMedia\.get\('avatars',path\)", r"bamcoMedia\.get\('avatars',p\.avatar_path,p\.updated_at\)")
# Extend behavioral coverage rather than merely accepting implementation changes.
test_path=ROOT/'tests/profile-approval-entry-root.test.cjs'
source=test_path.read_text(encoding='utf-8')
if 'a rerendered avatar host' not in source:
    source += '''
// Login rewrites the host initials before the canonical refresh runs.
test('a rerendered avatar host restores its confirmed image without a second network read',async t=>{
 const h=mediaHarness();t.after(h.close);const el=h.d.querySelector('#a'),profile={id:'one',avatar_path:'one/new.png',updated_at:'2026-09-19T05:00:00Z'};
 await h.w.bamcoMedia.bindAvatar(el,profile);const src=el.querySelector('img').src;el.textContent='ب';
 await h.w.bamcoMedia.bindAvatar(el,profile);assert.equal(el.querySelector('img').src,src);assert.equal(h.calls.length,1);
});
'''
    test_path.write_text(source,encoding='utf-8')
print('Validated canonical-loader tests and rerender lifecycle.')

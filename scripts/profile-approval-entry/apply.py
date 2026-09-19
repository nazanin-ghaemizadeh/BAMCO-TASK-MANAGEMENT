"""Apply the reviewed source edits atomically after validating every baseline file.
The payload is compressed JSON (line replacements, never executable code).
Production publication is gated by regression and real-browser checks.
"""
from pathlib import Path
import base64
import hashlib
import json
import re
import shutil
import sys
import zlib
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
STAGE = ROOT / 'scripts/profile-approval-entry'
MARKER = STAGE / '.applied'


def release():
    path = ROOT / 'version.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    today = datetime.now(timezone.utc).strftime('%Y.%m.%d')
    match = re.fullmatch(r'(\d{4}\.\d{2}\.\d{2})\.(\d+)', str(data.get('version', '')))
    patch = int(match.group(2)) + 1 if match and match.group(1) == today else 1
    version = f'{today}.{patch}'
    data.update(version=version, released_at=datetime.now(timezone.utc).isoformat(timespec='seconds'), title='اصلاح تصویر پروفایل، درخواست‌ها و کارت‌های ورود', notes=[
        'تصویر پروفایل در حساب کاربری و افراد و نقش‌ها همگام شد؛ عکس جدید بدون تداخل با عکس دیگران نمایش داده می‌شود.',
        'درخواست‌های تأیید و سوابق: جدیدترین درخواست بالا، شماره ردیف از ۱، بدون تغییر شناسه واقعی درخواست و وظیفه.',
        'چیدمان اولیه و نهایی کارت‌های ورود یکسان شد و جای دکمه‌های صفحه اصلی هنگام دریافت دسترسی‌ها ثابت می‌ماند.'
    ])
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    index = ROOT / 'index.html'
    text = index.read_text(encoding='utf-8')
    text, count = re.subn(r'(<meta name="bamco-app-version" content=")[^"]+("\s*/>)', rf'\g<1>{version}\g<2>', text, count=1)
    assert count == 1
    for asset in ['manifest.webmanifest', 'assets/js/app-update-v2.js', 'assets/css/bamco.bundle.css', 'assets/js/bamco.bundle.js', 'assets/js/root-sync-hotfix-20260917.js', 'assets/js/department-entry.js']:
        text, count = re.subn(rf'({re.escape(asset)}\?v=)[^"&]+', rf'\g<1>{version}', text, count=1)
        assert count == 1, asset
    index.write_text(text, encoding='utf-8')
    print('Prepared release', version)


if '--release' in sys.argv:
    release()
    raise SystemExit(0)
if MARKER.exists():
    print('Source edits already applied')
    raise SystemExit(0)

hashes = {
    'avatar': '0f38c75505749389b16c362f399b753a3748836e5eb53584444882f74201f49b',
    'sources': '820be79fab07ef3b1b4ebc7862f858dcfe2c5534a621ff1b2eb9f0e983c21164',
    'entry': 'cd819d74e61cc8420e9ee348b60cfab1f6ee6ecfa03f6c2f1f12c8315e3e6518',
}
# Normalize three transcription errors; decompression and SHA256 validate the result.
normalizations = {
    'avatar': [('6yfyKZ6t3K0/ZZLDLLXFneJNG4PbCBWCH', '6yfyKZ6t3K0/ZZLDLXFneJNG4PbCBWCH')],
    'sources': [],
    'entry': [('RTH2aMOL1MOnHJPPPPjJMEsjmkc9PyUEBL', 'RTH2aMOL1MOnHJPPjJMEsjmkc9PyUEBL'), ('uEUd+LfZrFEW24DUaNHR2Hkhn23MTG5Q', 'uEUd+LfZrFEW24DUa5AaNHR2Hkhn23MTG5Q')],
}
outputs = {}
for name, expected_hash in hashes.items():
    encoded = (STAGE / f'{name}.b64').read_text().strip()
    for old, new in normalizations[name]:
        encoded = encoded.replace(old, new)
    raw = zlib.decompress(base64.b64decode(encoded, validate=True))
    assert hashlib.sha256(raw).hexdigest() == expected_hash, f'Payload mismatch: {name}'
    edits = json.loads(raw)
    for relative, change in edits.items():
        target = (ROOT / relative).resolve()
        assert target.is_relative_to(ROOT), relative
        before = target.read_bytes() if target.exists() else b''
        assert hashlib.sha256(before).hexdigest() == change['sha256'], f'Baseline changed: {relative}'
        lines = before.decode('utf-8').splitlines(keepends=True)
        for start, end, replacement in reversed(change['edits']):
            lines[start:end] = [replacement]
        outputs[target] = ''.join(lines)
for target, content in outputs.items():
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')
shutil.copyfile(STAGE / 'regression.cjs', ROOT / 'tests/profile-approval-entry-root.test.cjs')
MARKER.write_text('profile-approval-entry-20260919\n')
print('Applied', len(outputs), 'reviewed source files; bundles must now be rebuilt and tested.')

"""Canonical renderer/typography refinements. No production data is modified."""
from pathlib import Path
import json
import re
import sys
from datetime import datetime, timezone

ROOT = Path.cwd()
def replace(path, old, new, count=1):
    p=ROOT/path
    text=p.read_text(encoding='utf-8')
    if old not in text:
        assert new in text, f'Unexpected source: {path}'
        return
    assert text.count(old)==count, f'Ambiguous replacement: {path}'
    p.write_text(text.replace(old,new),encoding='utf-8')

if '--release' in sys.argv:
    p=ROOT/'version.json';data=json.loads(p.read_text(encoding='utf-8'))
    today=datetime.now(timezone.utc).strftime('%Y.%m.%d')
    match=re.fullmatch(r'(\d{4}\.\d{2}\.\d{2})\.(\d+)',data.get('version',''))
    version=f'{today}.{int(match[2])+1 if match and match[1]==today else 1}'
    data.update(version=version,released_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),title='شماره‌گذاری نزولی درخواست‌ها و فونت یکپارچه جدول‌ها',notes=[
      'شماره ردیف درخواست‌های تأیید و سوابق از بالا نزولی است: ۳، ۲، ۱؛ جدیدترین درخواست بالا و شناسه واقعی و ترتیب مراحل تأیید بدون تغییر است.',
      'متن انگلیسی و اعداد لاتین در همه جدول‌ها، سرستون‌ها، فیلترها و پنجره‌های سامانه با Times New Roman تنظیم شد؛ متن فارسی با B Nazanin باقی می‌ماند.',
      'اصلاح همگام‌سازی تصویر پروفایل در افراد و نقش‌ها و ثابت‌ماندن چیدمان کارت‌های ورود نیز در این نسخه حفظ شده است.'
    ])
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    p=ROOT/'index.html';text=p.read_text(encoding='utf-8')
    text,n=re.subn(r'(<meta name="bamco-app-version" content=")[^"]+("\s*/>)',rf'\g<1>{version}\g<2>',text,count=1);assert n==1
    for asset in ['manifest.webmanifest','assets/js/app-update-v2.js','assets/css/bamco.bundle.css','assets/js/bamco.bundle.js','assets/js/root-sync-hotfix-20260917.js','assets/js/department-entry.js']:
        text,n=re.subn(rf'({re.escape(asset)}\?v=)[^"&]+',rf'\g<1>{version}',text,count=1);assert n==1,asset
    p.write_text(text,encoding='utf-8');print('Release:',version);raise SystemExit

# Only display row labels change. Actions and workflow stage order keep real IDs.
p=ROOT/'assets/js/app.js';text=p.read_text(encoding='utf-8')
a=text.index('function renderRequests()');b=text.index('const titles=',a)
section=text[a:b]
assert section.count('${fa(index+1)}')==2
section=section.replace('${fa(index+1)}','${fa(state.requests.length-index)}',1)
section=section.replace('${fa(index+1)}','${fa(rows.length-index)}',1)
p.write_text(text[:a]+section+text[b:],encoding='utf-8')
replace('tests/request-workflow-visibility.test.cjs',"['۱','۲','۳']","['۳','۲','۱']")

# Generic sorting must move whole request rows, never rewrite their labels.
replace('assets/js/table-suite.js',
    "  if(['approvalBody','requestHistoryBody'].includes(table.tBodies[0].id))rows.forEach((row,i)=>{row.cells[0].textContent=String(i+1).replace(/\\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])});\n", '')

# Stop inline Persian-only fonts defeating the shared table font in filters.
replace('assets/js/usability.js',"\"'B Nazanin',BNazanin,serif\"","\"'BamcoTablePersian','Times New Roman',Times,serif\"",count=3)
p=ROOT/'assets/js/usability.js';text=p.read_text(encoding='utf-8');a=text.index('function mixedFontCell(');b=text.index('function polishTaskText()',a)
text=text[:a]+'''function mixedFontCell(cell){
 if(!cell)return;const text=cell.textContent||'';if(cell.dataset.bamcoMixedSource===text)return;
 const hasFa=/[\\u0600-\\u06ff]/.test(text);cell.dataset.bamcoMixedSource=text;
 important(cell,'text-align','justify');important(cell,'text-align-last',hasFa?'right':'left');important(cell,'direction',hasFa?'rtl':'ltr');important(cell,'unicode-bidi','plaintext');
 // Character-scoped CSS handles mixed text without replacing children/listeners.
 important(cell,'font-family',"'BamcoTablePersian','Times New Roman',Times,serif");
}
'''+text[b:];p.write_text(text,encoding='utf-8')

css='''
/* Table typography is character-scoped, including tables added after startup.
   The Persian face deliberately contains NO Latin range. English therefore
   falls through to Times New Roman, also inside mixed Persian/English cells.
   A named important layer outranks the old unlayered page-specific rules;
   inline filter fonts are fixed at their source in usability.js.
   No content rewriting, direction override, global observer or font download. */
@font-face{font-family:BamcoTablePersian;src:local('B Nazanin'),local('BNazanin'),url('../fonts/BNazanin.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+0870-089F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:BamcoTablePersian;src:local('B Nazanin Bold'),local('BNazanin Bold'),url('../fonts/BNaznnBd.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+0870-089F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF}
@layer bamco-table-typography{
 :where(table,[role="table"],[role="grid"]),
 :where(table,[role="table"],[role="grid"]) :where(caption,thead,tbody,tfoot,tr,th,td,a,span,bdi,b,em,i,strong,small,p,div,label,button,input,textarea,select,optgroup,option,summary,code,pre,time,[role="row"],[role="cell"],[role="columnheader"],[role="rowheader"]){
  font-family:BamcoTablePersian,'Times New Roman',Times,serif!important;
 }
}
'''
p=ROOT/'assets/css/unified-ui.css';text=p.read_text(encoding='utf-8');assert '@layer bamco-table-typography' not in text;p.write_text(text+css,encoding='utf-8')
print('Updated canonical request labels, table fonts, and existing request expectation.')

from pathlib import Path
import base64, gzip, io, os, re, runpy, shutil, zipfile

BASE=Path(__file__).resolve().parent
CORE=BASE/"bamco_task_management.py"
if not CORE.is_file():
    parts=sorted((BASE/"core_b64").glob("core_*.b64"))
    if parts:
        encoded="".join(p.read_text(encoding="ascii") for p in parts)
        CORE.write_bytes(gzip.decompress(base64.b64decode(encoded)))

EXPECTED=[
"01_happy_female.png","01_happy_male.png",
"02_reminder_female.png","02_reminder_male.png",
"03_concerned_female.png","03_concerned_male.png",
"04_serious_female.png","04_serious_male.png",
"05_urgent_female.png","05_urgent_male.png",
]

def _targets():
    active=BASE/"assets"/"stickers"
    defaults=BASE/"assets"/"default_stickers"
    active.mkdir(parents=True,exist_ok=True)
    defaults.mkdir(parents=True,exist_ok=True)
    return active,defaults

def _copy_folder(folder):
    active,defaults=_targets()
    if not folder.is_dir(): return 0
    n=0
    for name in EXPECTED:
        src=folder/name
        if not src.is_file(): continue
        try:
            dst=defaults/name
            if not dst.is_file() or dst.stat().st_size<100: shutil.copy2(src,dst)
            cur=active/name
            if not cur.is_file() or cur.stat().st_size<100: shutil.copy2(dst,cur)
            n+=1
        except Exception:
            pass
    return n

def _copy_zip(path):
    active,defaults=_targets()
    if not path.is_file(): return 0
    n=0
    try:
        with zipfile.ZipFile(path) as z:
            names=z.namelist()
            for expected in EXPECTED:
                matches=[x for x in names if x.replace("\\","/").endswith("/assets/default_stickers/"+expected)]
                if not matches:
                    matches=[x for x in names if x.replace("\\","/").endswith("/assets/stickers/"+expected)]
                if not matches: continue
                raw=z.read(matches[0])
                dst=defaults/expected
                if not dst.is_file() or dst.stat().st_size<100: dst.write_bytes(raw)
                cur=active/expected
                if not cur.is_file() or cur.stat().st_size<100: shutil.copy2(dst,cur)
                n+=1
    except Exception:
        pass
    return n

def _embedded_fallback():
    active,defaults=_targets()
    js=BASE/"sticker-default.js"
    if not js.is_file(): return 0
    text=js.read_text(encoding="utf-8",errors="ignore")
    matches=re.findall(r"BAMCO_DESKTOP_ASSETS\[['\"]([^'\"]+)['\"]\]\s*=\s*['\"]data:image/[^;]+;base64,([^'\"]+)['\"]",text)
    if not matches: return 0
    try:
        from PIL import Image
    except Exception:
        return 0
    count=0
    for key,b64 in matches:
        name=key+".png"
        if name not in EXPECTED: continue
        try:
            dst=defaults/name
            if not dst.is_file() or dst.stat().st_size<100:
                Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGBA").save(dst,"PNG",optimize=True)
            cur=active/name
            if not cur.is_file() or cur.stat().st_size<100: shutil.copy2(dst,cur)
            count+=1
        except Exception:
            pass
    return count

def ensure_exact_stickers():
    active,defaults=_targets()
    _copy_folder(defaults); _copy_folder(active)

    home=Path.home()
    roots=[
        BASE,BASE.parent,
        home/"Downloads",home/"Desktop",home/"Documents",
        home/"OneDrive"/"Desktop",home/"OneDrive"/"Documents",home/"OneDrive"/"Downloads",
    ]
    seen=set()
    for root in roots:
        try:
            root=root.resolve()
        except Exception:
            pass
        if root in seen or not root.exists(): continue
        seen.add(root)

        folders=[
            root/"assets"/"default_stickers",root/"assets"/"stickers",
            root/"BAMCO_TASK_MANAGEMENT"/"assets"/"default_stickers",
            root/"BAMCO_TASK_MANAGEMENT"/"assets"/"stickers",
        ]
        try:
            folders += list(root.glob("BAMCO_TASK_MANAGEMENT*/assets/default_stickers"))
            folders += list(root.glob("BAMCO_TASK_MANAGEMENT*/assets/stickers"))
            folders += list(root.glob("*/BAMCO_TASK_MANAGEMENT*/assets/default_stickers"))
        except Exception:
            pass
        for folder in folders: _copy_folder(folder)

        try:
            zips=list(root.glob("BAMCO_TASK_MANAGEMENT*.zip"))+list(root.glob("*BAMCO*TASK*.zip"))
        except Exception:
            zips=[]
        for z in zips: _copy_zip(z)

    _embedded_fallback()

    ready=sum(1 for n in EXPECTED if (defaults/n).is_file() and (active/n).is_file())
    print(f"BAMCO sticker assets ready: {ready}/10")
    return ready

ensure_exact_stickers()

if __name__=="__main__":
    IMPL=BASE/"_bridge_impl.py"
    parts=sorted((BASE/"bridge_parts").glob("bridge_*.part"))
    IMPL.write_text("".join(p.read_text(encoding="utf-8") for p in parts),encoding="utf-8")
    runpy.run_path(str(IMPL),run_name="__main__")

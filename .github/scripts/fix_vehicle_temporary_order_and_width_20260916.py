from pathlib import Path
from datetime import datetime, timezone
import json

root = Path(__file__).resolve().parents[2]
vehicles_path = root / "assets/js/vehicles.js"
index_path = root / "index.html"
version_path = root / "version.json"

src = vehicles_path.read_text(encoding="utf-8")

old_visible = "function visibleRows(scope){const c=CFG[scope],s=data[scope],queryKeys=['__row',...c.fields.map(f=>f[0]),...(c.form?['__form']:[])],filterKeys=queryKeys,query=normalize(s.query).toLowerCase();return s.rows.map((row,i)=>({row,i})).filter(({row,i})=>(!query||queryKeys.some(k=>normalize(value(row,k,i)).toLowerCase().includes(query)))&&filterKeys.every((k,n)=>!s.filters[n]||String(value(row,k,i))===s.filters[n]))}"
new_visible = "function visibleRows(scope){const c=CFG[scope],s=data[scope],queryKeys=['__row',...c.fields.map(f=>f[0]),...(c.form?['__form']:[])],filterKeys=queryKeys,query=normalize(s.query).toLowerCase(),rows=s.rows.map((row,i)=>({row,i})).filter(({row,i})=>(!query||queryKeys.some(k=>normalize(value(scope,row,k,i)).toLowerCase().includes(query)))&&filterKeys.every((k,n)=>!s.filters[n]||String(value(scope,row,k,i))===s.filters[n]));return scope==='vehicleTemporary'?rows.reverse():rows}"

if old_visible not in src:
    raise SystemExit("visibleRows target not found; refusing unsafe patch")
src = src.replace(old_visible, new_visible, 1)

old_resize = "function installResize(scope,labels){const table=q(`table[data-scope=\"${scope}\"]`),heads=qa('thead tr:first-child th',table);table.querySelector('colgroup')?.remove();const group=document.createElement('colgroup'),cols=heads.map(()=>group.appendChild(document.createElement('col')));table.prepend(group);const key=`bamco-vehicle-widths-${scope}-v3`,saved=JSON.parse(localStorage.getItem(key)||'{}'),widths=labels.map(l=>saved[l]||widthFor(l));const apply=()=>cols.forEach((c,i)=>c.style.width=`${widths[i]}px`);apply();heads.forEach((h,i)=>q('.vehicle-col-resize',h).onpointerdown=e=>{e.preventDefault();const start=e.clientX,initial=widths[i],move=x=>{widths[i]=Math.max(65,Math.min(650,initial+start-x.clientX));apply()},up=()=>{localStorage.setItem(key,JSON.stringify(Object.fromEntries(labels.map((l,n)=>[l,widths[n]]))));removeEventListener('pointermove',move);removeEventListener('pointerup',up)};addEventListener('pointermove',move);addEventListener('pointerup',up)})}"
new_resize = "function installResize(scope,labels){const table=q(`table[data-scope=\"${scope}\"]`),heads=qa('thead tr:first-child th',table);table.querySelector('colgroup')?.remove();const group=document.createElement('colgroup'),cols=heads.map(()=>group.appendChild(document.createElement('col')));table.prepend(group);const key=`bamco-vehicle-widths-${scope}-v3`,saved=JSON.parse(localStorage.getItem(key)||'{}'),widths=labels.map(l=>saved[l]||widthFor(l));const apply=()=>{cols.forEach((c,i)=>c.style.width=`${widths[i]}px`);const total=widths.reduce((sum,w)=>sum+Number(w||0),0),viewport=table.parentElement?.clientWidth||0;table.style.setProperty('width',`${Math.max(total,viewport)}px`,'important');table.style.setProperty('min-width','0','important')};apply();heads.forEach((h,i)=>q('.vehicle-col-resize',h).onpointerdown=e=>{e.preventDefault();const start=e.clientX,initial=widths[i],move=x=>{widths[i]=Math.max(65,Math.min(650,initial+start-x.clientX));apply()},up=()=>{localStorage.setItem(key,JSON.stringify(Object.fromEntries(labels.map((l,n)=>[l,widths[n]]))));removeEventListener('pointermove',move);removeEventListener('pointerup',up)};addEventListener('pointermove',move);addEventListener('pointerup',up)})}"

if old_resize not in src:
    raise SystemExit("installResize target not found; refusing unsafe patch")
src = src.replace(old_resize, new_resize, 1)
vehicles_path.write_text(src, encoding="utf-8")

new_version = "2026.09.16.72"
index = index_path.read_text(encoding="utf-8")
old_version = "2026.09.15.71"
if old_version not in index:
    raise SystemExit("index version target not found; refusing unsafe patch")
index_path.write_text(index.replace(old_version, new_version), encoding="utf-8")

version = json.loads(version_path.read_text(encoding="utf-8"))
version["version"] = new_version
version["released_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
version_path.write_text(json.dumps(version, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print("Patched temporary handover display order, exact table width, and app version", new_version)

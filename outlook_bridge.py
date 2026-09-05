from pathlib import Path
import base64
import gzip
import runpy

BASE=Path(__file__).resolve().parent
CORE=BASE/"bamco_task_management.py"
if not CORE.is_file():
    parts=sorted((BASE/"core_b64").glob("core_*.b64"))
    if parts:
        encoded="".join(p.read_text(encoding="ascii") for p in parts)
        CORE.write_bytes(gzip.decompress(base64.b64decode(encoded)))

IMPL=BASE/"_bridge_impl.py"
parts=sorted((BASE/"bridge_parts").glob("bridge_*.part"))
IMPL.write_text("".join(p.read_text(encoding="utf-8") for p in parts),encoding="utf-8")
runpy.run_path(str(IMPL),run_name="__main__")

#!/usr/bin/env python3
"""Bereid fileCreate-batches voor voor alle beschrijvingsmedia (data/files/batch_NN.json) en data/desc_map.json."""
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / "data"
CDN = "https://cdn.shopify.com/s/files/1/1021/3618/5159/files/nv-%s.webp"
ALREADY = {"3f12e8ee604e4e7904d09e26f3d537b3f63c5886", "ffe5163ba94b5c852c3d755dc5d801a2373dbe4a"}
SKIP = {"universal-travel-adapter-2-3", "iron-2-3", "automatic-fly-trap-4"}
URL = re.compile(r'src="(https://www\.novtris\.com/cdn/shop/files/[^"]+\.(png|jpe?g|gif|webp))"', re.I)

urls = {}
for p in json.loads((DATA / "products_clean.json").read_text("utf-8")):
    if p["handle"] in SKIP:
        continue
    for m in URL.finditer(p["description_html"]):
        urls[m.group(1)] = m.group(2).lower()
dm, files = {}, []
for u, ext in urls.items():
    h = re.search(r"/([0-9a-f]+)\.\w+$", u)
    if not h:
        continue
    h = h.group(1)
    dm[u] = CDN % h
    if h not in ALREADY:
        files.append({"originalSource": u, "contentType": "IMAGE", "filename": f"nv-{h}.{ext}"})
(DATA / "files").mkdir(exist_ok=True)
for f in (DATA / "files").glob("batch_*.json"):
    f.unlink()
for i in range(0, len(files), 200):
    (DATA / "files" / f"batch_{i // 200:02d}.json").write_text(
        json.dumps({"files": files[i:i + 200]}, ensure_ascii=False, separators=(",", ":")), "utf-8")
(DATA / "desc_map.json").write_text(json.dumps(dm, ensure_ascii=False), "utf-8")
print(len(dm), "urls,", len(files), "te maken,", (len(files) + 199) // 200, "batches")

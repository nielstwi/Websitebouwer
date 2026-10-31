#!/usr/bin/env python3
"""Voeg data/matches/m*.json samen tot data/variant_images.json en controleer sleutels/indexen."""
import json
from pathlib import Path

DATA = Path(__file__).parent / "data"
P = {p["handle"]: p for p in json.loads((DATA / "products_clean.json").read_text("utf-8"))}
merged, bad, nulls, total = {}, [], 0, 0
for f in sorted((DATA / "matches").glob("m*.json")):
    for handle, m in json.loads(f.read_text("utf-8")).items():
        p = P.get(handle)
        if not p:
            bad.append((f.name, handle, "onbekend product"))
            continue
        keys = {"|".join(v["options"]) for v in p["variants"]}
        out = {}
        for k, idx in m.items():
            if k not in keys:
                bad.append((f.name, handle, f"onbekende sleutel {k!r}"))
            elif idx is not None and not (isinstance(idx, int) and 0 <= idx < len(p["images"])):
                bad.append((f.name, handle, f"ongeldige index {idx!r} voor {k!r}"))
            else:
                out[k] = idx
                total += 1
                nulls += idx is None
        merged[handle] = out
(DATA / "variant_images.json").write_text(json.dumps(merged, ensure_ascii=False), "utf-8")
need = [h for h, p in P.items() if p["needs_image_match"] and h not in merged]
print(f"{len(merged)} producten gematcht, {total} koppelingen ({nulls} null), {len(bad)} problemen, {len(need)} nog te doen")
for b in bad[:15]:
    print("  ", b)

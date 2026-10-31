#!/usr/bin/env python3
"""Bouw data/products_clean.json: alleen titel, prijs, vergelijkprijs, beschrijving, afbeeldingen, varianten.

- Bundel-/aantalopties ("Buy more save more", "Qty", ...) worden volledig verwijderd; per overige
  optiecombinatie blijft alleen de eerste (enkele-stuks) variant over.
- Variantfoto: eerst novtris' eigen koppeling, overschreven door data/variant_images.json
  ({handle: {"<optiewaarde>|<optiewaarde>": galerij-index | null}}) als dat bestaat.
"""
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / "data"
BUNDLE = re.compile(r"bundle|qty|quantity|buy more|save more", re.I)
VISUAL = re.compile(r"colou?r|style|stil|pattern|design|model|type|variant|option|plug", re.I)


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def build(p, overrides):
    gallery = [g for g in p.get("gallery") or [] if g.get("url")]
    idx = {g["ID"]: i for i, g in enumerate(gallery)}
    names = [a["name"] for a in p.get("variant_attrs") or []]
    mixed_opt = lambda n: BUNDLE.search(n) and re.search(r"colou?r|style|size", n, re.I)
    keep = [i for i, n in enumerate(names) if not BUNDLE.search(n) or mixed_opt(n)]
    mixed = any(mixed_opt(n) for n in names)
    seen, variants = set(), []
    for v in p.get("variants") or []:
        vals = [a["value"] for a in v.get("attrs") or []]
        key = tuple(vals[i] for i in keep if i < len(vals))
        if key in seen:
            continue
        seen.add(key)
        price = num(v.get("sale_price"), num(v.get("price")))
        regular = num(v.get("regular_price"), price)
        variants.append({
            "options": list(key),
            "price": price,
            "compare_at_price": regular if regular > price else None,
            "image_index": idx.get(v.get("image_id")),
        })
    opts = [names[i] for i in keep]
    if not variants:  # product zonder varianten
        price = num(p.get("min_price"), num(p.get("price")))
        regular = num(p.get("min_regular_price"), price)
        variants = [{"options": [], "price": price, "compare_at_price": regular if regular > price else None,
                     "image_index": None}]
    ov = overrides.get(p["slug"], {})
    for v in variants:
        k = "|".join(v["options"])
        if k in ov:
            v["image_index"] = ov[k]
    return {
        "handle": p["slug"],
        "title": p["title"],
        "description_html": p.get("post_content") or p.get("short_content") or "",
        "images": [{"src": g["url"], "alt": g.get("alt", "")} for g in gallery],
        "options": opts,
        "variants": variants,
        "needs_image_match": len(variants) > 1 and any(VISUAL.search(n) for n in opts),
        "review": bool(mixed),
    }


def main():
    ov_file = DATA / "variant_images.json"
    overrides = json.loads(ov_file.read_text("utf-8")) if ov_file.exists() else {}
    out = [build(json.loads(f.read_text("utf-8")), overrides) for f in sorted((DATA / "raw").glob("*.json"))]
    (DATA / "products_clean.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
    print(f"{len(out)} producten; {sum(p['needs_image_match'] for p in out)} met visuele opties; "
          f"{sum(p['review'] for p in out)} ter controle; {sum(len(p['variants']) for p in out)} varianten")


if __name__ == "__main__":
    main()

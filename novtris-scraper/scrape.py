#!/usr/bin/env python3
"""Scrape alle producten van novtris.com (lijstpagina's + detailpagina's).

Resumable: ruwe productdata wordt per product in data/raw/<slug>.json bewaard,
al opgehaalde producten worden overgeslagen. Resultaat: data/products.json
(genormaliseerd, klaar voor export naar Shopify).

Gebruik:
    python scrape.py                 # alles
    python scrape.py --limit 5       # test met 5 producten
    python scrape.py --delay 2.0     # tijd tussen verzoeken (seconden)
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

BASE = "https://www.novtris.com"
LIST_URL = BASE + "/collections/all-products"
DATA = Path(__file__).parent / "data"
RAW = DATA / "raw"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml",
}
BLOCK_RE = r'<script type="shop/json" data-type-id="%s">(.*?)</script>'


class Fetcher:
    def __init__(self, delay):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.delay = delay
        self._last = 0.0

    def get(self, url, tries=6):
        for i in range(tries):
            wait = self.delay - (time.time() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.time()
            try:
                r = self.s.get(url, timeout=45)
                if r.status_code == 200:
                    return r.text
                if r.status_code == 404:
                    return None
                print(f"  HTTP {r.status_code} voor {url}", file=sys.stderr)
            except requests.RequestException as e:
                print(f"  fout ({type(e).__name__}) voor {url}", file=sys.stderr)
            time.sleep(min(60, 3 * 2 ** i))
        raise RuntimeError(f"Ophalen mislukt: {url}")


def block(html, type_id):
    m = re.search(BLOCK_RE % type_id, html, re.S)
    if not m:
        raise ValueError(f"blok '{type_id}' niet gevonden")
    return json.loads(m.group(1), strict=False)


def list_slugs(f, limit=None):
    slugs, page, last = [], 1, 1
    while page <= last:
        html = f.get(f"{LIST_URL}?page={page}")
        d = block(html, "collection-page")
        last = d["last_page"]
        slugs += [p["slug"] for p in d["data"]]
        print(f"lijstpagina {page}/{last}: {len(slugs)} producten tot nu toe")
        if limit and len(slugs) >= limit:
            return slugs[:limit]
        page += 1
    return list(dict.fromkeys(slugs))


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def normalize(p):
    """Zet de ruwe Shoplazza-productdata om naar een Shopify-vriendelijk model."""
    gallery = [g for g in p.get("gallery") or [] if g.get("url")]
    images = [{"src": g["url"], "alt": g.get("alt", ""), "id": g.get("ID")} for g in gallery]
    img_by_id = {g["id"]: g["src"] for g in images}

    raw_vars = p.get("variants") or []
    option_names = [a["name"] for a in (p.get("variant_attrs") or [])]
    variants = []
    for v in raw_vars:
        attrs = {a["name"]: a["value"] for a in v.get("attrs") or []}
        if not option_names:
            option_names = list(attrs)
        price = num(v.get("sale_price"), num(v.get("price")))
        regular = num(v.get("regular_price"), price)
        feat = (v.get("feature_image") or {}).get("url") or img_by_id.get(v.get("image_id"))
        variants.append({
            "sku": v.get("sku") or "",
            "title": v.get("title"),
            "options": [attrs.get(n, "") for n in option_names],
            "price": price,
            "compare_at_price": regular if regular > price else None,
            "weight": num(v.get("weight_local")) or num(p.get("weight_local")) or num(p.get("weight")),
            "weight_unit": p.get("weight_unit") or "kg",
            "barcode": v.get("bar_code") or "",
            "track_inventory": v.get("manage_stock") == "yes",
            "inventory_quantity": int(num(v.get("stock"))),
            "continue_selling": v.get("backorders") in ("yes", "notify"),
            "available": bool(v.get("buy_able", True)),
            "image": feat,
        })
    if not variants:  # eenvoudig product zonder varianten
        price = num(p.get("min_price"), num(p.get("price")))
        regular = num(p.get("regular_price"), price)
        variants.append({
            "sku": p.get("sku") if p.get("sku") not in (None, "None") else "",
            "title": p.get("title"), "options": [],
            "price": price,
            "compare_at_price": regular if regular > price else None,
            "weight": num(p.get("weight_local")) or num(p.get("weight")),
            "weight_unit": p.get("weight_unit") or "kg",
            "barcode": p.get("bar_code") or "",
            "track_inventory": p.get("manage_stock") == "yes",
            "inventory_quantity": int(num(p.get("stock"))),
            "continue_selling": p.get("backorders") in ("yes", "notify"),
            "available": bool(p.get("buy_able", True)),
            "image": images[0]["src"] if images else None,
        })
    cats = [c["name"].title() for c in p.get("categories") or [] if c.get("slug") != "all-products"]
    return {
        "source_id": p.get("ID"),
        "source_url": p.get("public_url"),
        "handle": p.get("slug"),
        "title": p.get("title"),
        "subtitle": p.get("subtitle") or "",
        "body_html": p.get("post_content") or p.get("short_content") or "",
        "vendor": p.get("supplier") or "Novtris",
        "product_type": cats[0] if cats else "",
        "tags": cats,
        "seo_title": p.get("seo_title") or "",
        "seo_description": p.get("seo_description") or "",
        "published": p.get("post_status", "publish") == "publish",
        "options": option_names,
        "images": images,
        "variants": variants,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="maximaal aantal producten (test)")
    ap.add_argument("--delay", type=float, default=1.5, help="seconden tussen verzoeken")
    a = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    f = Fetcher(a.delay)

    slugs = list_slugs(f, a.limit)
    print(f"{len(slugs)} producten gevonden")
    for i, slug in enumerate(slugs, 1):
        path = RAW / f"{slug}.json"
        if path.exists():
            continue
        html = f.get(f"{BASE}/products/{slug}")
        if html is None:
            print(f"[{i}/{len(slugs)}] {slug}: 404, overgeslagen")
            continue
        path.write_text(json.dumps(block(html, "product-page"), ensure_ascii=False), encoding="utf-8")
        print(f"[{i}/{len(slugs)}] {slug}")

    products = [normalize(json.loads((RAW / f"{s}.json").read_text("utf-8")))
                for s in slugs if (RAW / f"{s}.json").exists()]
    (DATA / "products.json").write_text(json.dumps(products, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"klaar: {len(products)} producten -> {DATA / 'products.json'}")


if __name__ == "__main__":
    main()

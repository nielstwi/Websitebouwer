#!/usr/bin/env python3
"""Zet data/products.json rechtstreeks in Shopify via de Admin GraphQL API (productSet).

Vereist een custom app met scopes write_products (+ write_inventory voor voorraad):
    export SHOPIFY_STORE=12a1vh-qk.myshopify.com
    export SHOPIFY_ACCESS_TOKEN=shpat_...
    export SHOPIFY_LOCATION_ID=gid://shopify/Location/123   # alleen nodig voor voorraadaantallen

    python push_shopify.py --limit 3            # test
    python push_shopify.py --active             # producten direct live (standaard: DRAFT)
Producten die al in data/pushed.json staan worden overgeslagen (veilig om opnieuw te draaien).
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

DATA = Path(__file__).parent / "data"
API_VERSION = "2025-01"
UNITS = {"kg": "KILOGRAMS", "g": "GRAMS"}
MUTATION = """
mutation($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle }
    userErrors { field message code }
  }
}"""


def build_input(p, status, location):
    if len(p["options"]) > 3:
        raise ValueError("meer dan 3 opties")
    inp = {
        "title": p["title"], "handle": p["handle"], "descriptionHtml": p["body_html"],
        "vendor": p["vendor"], "productType": p["product_type"], "tags": p["tags"], "status": status,
        "files": [{"originalSource": i["src"], "alt": i["alt"], "contentType": "IMAGE"} for i in p["images"]],
    }
    if p["seo_title"] or p["seo_description"]:
        inp["seo"] = {"title": p["seo_title"], "description": p["seo_description"]}
    if p["options"]:
        inp["productOptions"] = [
            {"name": n, "position": k + 1, "values": [{"name": v} for v in dict.fromkeys(x["options"][k] for x in p["variants"])]}
            for k, n in enumerate(p["options"])
        ]
    variants = []
    for v in p["variants"]:
        item = {"tracked": v["track_inventory"], "sku": v["sku"]}
        if v["weight"]:
            item["measurement"] = {"weight": {"value": v["weight"], "unit": UNITS.get(v["weight_unit"], "KILOGRAMS")}}
        var = {
            "price": f"{v['price']:.2f}", "inventoryPolicy": "CONTINUE" if v["continue_selling"] else "DENY",
            "inventoryItem": item,
            "optionValues": [{"optionName": n, "name": val} for n, val in zip(p["options"], v["options"])],
        }
        if v["compare_at_price"]:
            var["compareAtPrice"] = f"{v['compare_at_price']:.2f}"
        if v["barcode"]:
            var["barcode"] = v["barcode"]
        if v["image"]:
            var["file"] = {"originalSource": v["image"], "contentType": "IMAGE"}
        if v["track_inventory"] and location:
            var["inventoryQuantities"] = [{"locationId": location, "name": "available", "quantity": v["inventory_quantity"]}]
        variants.append(var)
    inp["variants"] = variants
    return inp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--active", action="store_true", help="publiceer direct (standaard DRAFT)")
    a = ap.parse_args()
    try:
        store, token = os.environ["SHOPIFY_STORE"], os.environ["SHOPIFY_ACCESS_TOKEN"]
    except KeyError as e:
        sys.exit(f"Zet omgevingsvariabele {e}")
    location = os.environ.get("SHOPIFY_LOCATION_ID")
    url = f"https://{store}/admin/api/{API_VERSION}/graphql.json"
    hdr = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}

    products = json.loads((DATA / "products.json").read_text("utf-8"))
    done_file = DATA / "pushed.json"
    done = json.loads(done_file.read_text()) if done_file.exists() else {}
    todo = [p for p in products if p["handle"] not in done][: a.limit]
    print(f"{len(todo)} te uploaden ({len(done)} al gedaan)")

    for n, p in enumerate(todo, 1):
        try:
            inp = build_input(p, "ACTIVE" if a.active else "DRAFT", location)
        except ValueError as e:
            print(f"[{n}] {p['handle']}: overgeslagen ({e})")
            continue
        for attempt in range(5):
            r = requests.post(url, headers=hdr, json={"query": MUTATION, "variables": {"input": inp}}, timeout=120)
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            throttled = r.status_code == 429 or any(
                e.get("extensions", {}).get("code") == "THROTTLED" for e in body.get("errors", []))
            if throttled:
                time.sleep(2 * 2 ** attempt)
                continue
            break
        res = (body.get("data") or {}).get("productSet") or {}
        if r.status_code != 200 or body.get("errors") or res.get("userErrors"):
            print(f"[{n}] {p['handle']}: FOUT {body.get('errors') or res.get('userErrors') or r.status_code}")
            continue
        done[p["handle"]] = res["product"]["id"]
        done_file.write_text(json.dumps(done, indent=1))
        print(f"[{n}/{len(todo)}] {p['handle']} -> {res['product']['id']}")
        time.sleep(0.6)


if __name__ == "__main__":
    main()

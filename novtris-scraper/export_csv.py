#!/usr/bin/env python3
"""Maak een Shopify-importbestand (data/shopify_products.csv) uit data/products.json.

Importeren: Shopify admin > Products > Import. Shopify haalt de afbeeldingen zelf op via de URL's.
"""
import csv
import json
import sys
from pathlib import Path

DATA = Path(__file__).parent / "data"
UNITS = {"kg": 1000, "g": 1}  # Shopify CSV verwacht gram
HEADER = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
    "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value",
    "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty",
    "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price",
    "Variant Requires Shipping", "Variant Taxable", "Variant Barcode",
    "Image Src", "Image Position", "Image Alt Text", "Variant Image", "Gift Card",
    "SEO Title", "SEO Description", "Status",
]


def main(status="draft"):
    products = json.loads((DATA / "products.json").read_text("utf-8"))
    out = DATA / "shopify_products.csv"
    skipped = 0
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, HEADER)
        w.writeheader()
        for p in products:
            if len(p["options"]) > 3:
                print(f"overgeslagen (>3 opties): {p['handle']}", file=sys.stderr)
                skipped += 1
                continue
            rows = max(len(p["variants"]), len(p["images"]))
            for i in range(rows):
                r = dict.fromkeys(HEADER, "")
                r["Handle"] = p["handle"]
                if i == 0:
                    r.update({"Title": p["title"], "Body (HTML)": p["body_html"], "Vendor": p["vendor"],
                              "Type": p["product_type"], "Tags": ", ".join(p["tags"]),
                              "Published": "true" if p["published"] else "false", "Gift Card": "false",
                              "SEO Title": p["seo_title"], "SEO Description": p["seo_description"],
                              "Status": status})
                    for n, name in enumerate(p["options"], 1):
                        r[f"Option{n} Name"] = name
                if i < len(p["variants"]):
                    v = p["variants"][i]
                    for n, val in enumerate(v["options"], 1):
                        r[f"Option{n} Value"] = val
                    r.update({
                        "Variant SKU": v["sku"],
                        "Variant Grams": round(v["weight"] * UNITS.get(v["weight_unit"], 1000)),
                        "Variant Inventory Tracker": "shopify" if v["track_inventory"] else "",
                        "Variant Inventory Qty": v["inventory_quantity"] if v["track_inventory"] else "",
                        "Variant Inventory Policy": "continue" if v["continue_selling"] else "deny",
                        "Variant Fulfillment Service": "manual",
                        "Variant Price": f"{v['price']:.2f}",
                        "Variant Compare At Price": f"{v['compare_at_price']:.2f}" if v["compare_at_price"] else "",
                        "Variant Requires Shipping": "true", "Variant Taxable": "true",
                        "Variant Barcode": v["barcode"], "Variant Image": v["image"] or "",
                    })
                if i < len(p["images"]):
                    im = p["images"][i]
                    r.update({"Image Src": im["src"], "Image Position": i + 1, "Image Alt Text": im["alt"]})
                w.writerow(r)
    print(f"{len(products) - skipped} producten -> {out}")


if __name__ == "__main__":
    main()

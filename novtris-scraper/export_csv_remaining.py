#!/usr/bin/env python3
"""Maak data/shopify_import_remaining.csv: alle producten die nog NIET in Shopify staan (volgens data/push_log).
Beschrijvingen verwijzen naar de naar Shopify gekopieerde media (desc_map), variantfoto's volgens de matching,
bundels zijn verwijderd, <script> is gestript. Importeren: Shopify admin > Products > Import."""
import csv
import glob
import json
import re
from pathlib import Path

DATA = Path(__file__).parent / "data"
HEAD = ["Handle", "Title", "Body (HTML)", "Vendor", "Published", "Option1 Name", "Option1 Value",
        "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Variant Price",
        "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Inventory Policy",
        "Variant Fulfillment Service", "Image Src", "Image Position", "Variant Image", "Gift Card", "Status"]
SRC = re.compile(r'src="(https://www\.novtris\.com/[^"]+)"')

done = set()
for f in glob.glob(str(DATA / "push_log" / "*.jsonl")):
    if f.endswith("_errors.jsonl"):
        continue
    for line in open(f, encoding="utf-8"):
        if line.strip():
            done.add(json.loads(line)["code"])
hm = json.loads((DATA / "handles.json").read_text("utf-8"))
dm = json.loads((DATA / "desc_map.json").read_text("utf-8"))
P = [p for p in json.loads((DATA / "products_clean.json").read_text("utf-8")) if p["handle"] in hm and p["handle"] not in done]
n = 0
with open(DATA / "shopify_import_remaining.csv", "w", newline="", encoding="utf-8-sig") as fh:
    w = csv.DictWriter(fh, HEAD)
    w.writeheader()
    for p in P:
        html = SRC.sub(lambda m: 'src="%s"' % dm.get(m.group(1), m.group(1)), p["description_html"])
        html = re.sub(r"<script\b.*?</script>", "", html, flags=re.I | re.S)
        html = re.sub(r"\s*[\r\n]+\s*", " ", html).strip()
        for i in range(max(len(p["variants"]), len(p["images"]))):
            r = dict.fromkeys(HEAD, "")
            r["Handle"] = hm[p["handle"]]
            if i == 0:
                r.update({"Title": p["title"], "Body (HTML)": html, "Vendor": "Novtris", "Published": "true",
                          "Gift Card": "false", "Status": "active"})
                for k, name in enumerate(p["options"][:3], 1):
                    r[f"Option{k} Name"] = name
                if not p["options"]:
                    r["Option1 Name"] = "Title"
            if i < len(p["variants"]):
                v = p["variants"][i]
                for k, val in enumerate(v["options"][:3], 1):
                    r[f"Option{k} Value"] = val
                if not p["options"]:
                    r["Option1 Value"] = "Default Title"
                r.update({"Variant Price": f"{v['price']:.2f}",
                          "Variant Compare At Price": f"{v['compare_at_price']:.2f}" if v["compare_at_price"] else "",
                          "Variant Requires Shipping": "true", "Variant Taxable": "true",
                          "Variant Inventory Policy": "continue", "Variant Fulfillment Service": "manual"})
                if v["image_index"] is not None and v["image_index"] < len(p["images"]):
                    r["Variant Image"] = p["images"][v["image_index"]]["src"]
            if i < len(p["images"]):
                r["Image Src"] = p["images"][i]["src"]
                r["Image Position"] = i + 1
            w.writerow(r)
        n += 1
print(f"{n} producten (nog niet in Shopify) -> {DATA / 'shopify_import_remaining.csv'}; al gedaan: {len(done)}")

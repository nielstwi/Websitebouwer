#!/usr/bin/env python3
"""Toon per product de variant-sleutels die gekoppeld moeten worden aan een foto-index.
    python show_variants.py <handle>"""
import json
import sys
from pathlib import Path

P = {p["handle"]: p for p in json.loads((Path(__file__).parent / "data" / "products_clean.json").read_text("utf-8"))}
p = P[sys.argv[1]]
print("titel:", p["title"])
print("opties:", p["options"], "| aantal foto's:", len(p["images"]))
for v in p["variants"]:
    print("  sleutel:", "|".join(v["options"]), "| novtris-koppeling:", v["image_index"])

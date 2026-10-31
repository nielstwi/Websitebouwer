#!/usr/bin/env python3
"""Print de GraphQL-variabelen (compact JSON) voor productSet van één product.
    python agent_payload.py <handle>
De agent plakt de uitvoer 1-op-1 als `variables` in de Shopify graphql_mutation-aanroep."""
import json
import re
import sys
from pathlib import Path

from push_shopify import SRC_RE, build_input

DATA = Path(__file__).parent / "data"
dm = json.loads((DATA / "desc_map.json").read_text("utf-8"))
HM = json.loads((DATA / "handles.json").read_text("utf-8"))
P = {p["handle"]: p for p in json.loads((DATA / "products_clean.json").read_text("utf-8"))}
p = P[sys.argv[1]]
html = SRC_RE.sub(lambda m: 'src="%s"' % dm.get(m.group(1), m.group(1)), p["description_html"])
html = re.sub(r"<script\b.*?</script>", "", html, flags=re.I | re.S)
inp = build_input(p, html, "ACTIVE")
inp["handle"] = HM[p["handle"]]
print(json.dumps({"input": inp}, ensure_ascii=False, separators=(",", ":")))

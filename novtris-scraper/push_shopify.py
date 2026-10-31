#!/usr/bin/env python3
"""Zet data/products_clean.json in Shopify (Admin GraphQL API) en publiceer naar de webshop.

    export SHOPIFY_STORE=12a1vh-qk.myshopify.com
    export SHOPIFY_ACCESS_TOKEN=shpat_...      # custom app: write_products, write_files, write_publications

    python push_shopify.py --limit 3     # test
    python push_shopify.py               # alles (hervatbaar via data/pushed.json)
    python push_shopify.py --draft       # als concept i.p.v. actief

Per product: beschrijvingsafbeeldingen/GIF's gaan naar Shopify Files en de HTML wordt herschreven,
productafbeeldingen mislukt bij het downloaden worden opnieuw geprobeerd.
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

DATA = Path(__file__).parent / "data"
API = "2025-10"
SRC_RE = re.compile(r'src="(https://www\.novtris\.com/[^"]+)"')

Q_SET = """mutation($input: ProductSetInput!, $id: ProductSetIdentifiers) {
  productSet(synchronous: true, input: $input, identifier: $id) {
    product { id handle media(first: 100) { nodes { id status } } }
    userErrors { field message code }
  }
}"""
Q_FILES = """mutation($files: [FileCreateInput!]!) {
  fileCreate(files: $files) { files { id } userErrors { field message } }
}"""
Q_NODES = """query($ids: [ID!]!) { nodes(ids: $ids) { ... on MediaImage { id fileStatus image { url } } } }"""
Q_PUBS = """query { publications(first: 20) { nodes { id catalog { title } } } }"""
Q_PUBLISH = """mutation($id: ID!, $pub: ID!) {
  publishablePublish(id: $id, input: [{publicationId: $pub}]) { userErrors { field message } }
}"""


class Shop:
    def __init__(self):
        try:
            store, token = os.environ["SHOPIFY_STORE"], os.environ["SHOPIFY_ACCESS_TOKEN"]
        except KeyError as e:
            sys.exit(f"Zet omgevingsvariabele {e}")
        self.url = f"https://{store}/admin/api/{API}/graphql.json"
        self.s = requests.Session()
        self.s.headers.update({"X-Shopify-Access-Token": token, "Content-Type": "application/json"})

    def gql(self, query, variables=None):
        for attempt in range(6):
            r = self.s.post(self.url, json={"query": query, "variables": variables or {}}, timeout=120)
            body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            if r.status_code == 429 or any(e.get("extensions", {}).get("code") == "THROTTLED"
                                           for e in body.get("errors", [])):
                time.sleep(2 * 2 ** attempt)
                continue
            if r.status_code != 200 or body.get("errors"):
                raise RuntimeError(body.get("errors") or r.status_code)
            return body["data"]
        raise RuntimeError("throttled")


def slugify(title, fallback):
    t = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")
    return t[:80].strip("-") or fallback


def upload_description_media(shop, html):
    """Kopieer novtris-media uit de beschrijving naar Shopify Files; geef herschreven HTML terug."""
    urls = list(dict.fromkeys(SRC_RE.findall(html)))
    if not urls:
        return html
    res = shop.gql(Q_FILES, {"files": [{"originalSource": u, "contentType": "IMAGE"} for u in urls]})
    errs = res["fileCreate"]["userErrors"]
    if errs:
        raise RuntimeError(errs)
    ids = [f["id"] for f in res["fileCreate"]["files"]]
    new = {}
    for _ in range(40):
        time.sleep(3)
        nodes = shop.gql(Q_NODES, {"ids": ids})["nodes"]
        new = {u: n["image"]["url"].split("?")[0] for u, n in zip(urls, nodes)
               if n and n.get("fileStatus") == "READY" and n.get("image")}
        failed = [u for u, n in zip(urls, nodes) if n and n.get("fileStatus") == "FAILED"]
        if len(new) + len(failed) == len(urls):
            break
    for u, n in new.items():
        html = html.replace(u, n)
    return html


def build_input(p, html, status):
    imgs = p["images"]
    inp = {
        "title": p["title"], "handle": slugify(p["title"], p["handle"]), "descriptionHtml": html,
        "status": status,
        "files": [{"originalSource": i["src"], "alt": i["alt"], "contentType": "IMAGE"} for i in imgs],
    }
    if p["options"]:
        inp["productOptions"] = [
            {"name": n, "position": k + 1,
             "values": [{"name": v} for v in dict.fromkeys(x["options"][k] for x in p["variants"])]}
            for k, n in enumerate(p["options"])]
    variants = []
    for v in p["variants"]:
        d = {"price": f"{v['price']:.2f}",
             "optionValues": [{"optionName": n, "name": val} for n, val in zip(p["options"], v["options"])]}
        if not p["options"]:
            d["optionValues"] = [{"optionName": "Title", "name": "Default Title"}]
            inp["productOptions"] = [{"name": "Title", "values": [{"name": "Default Title"}]}]
        if v["compare_at_price"]:
            d["compareAtPrice"] = f"{v['compare_at_price']:.2f}"
        if v["image_index"] is not None and v["image_index"] < len(imgs):
            d["file"] = {"originalSource": imgs[v["image_index"]]["src"], "contentType": "IMAGE"}
        variants.append(d)
    inp["variants"] = variants
    return inp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--draft", action="store_true")
    a = ap.parse_args()
    shop = Shop()
    pub = next((n["id"] for n in shop.gql(Q_PUBS)["publications"]["nodes"]
                if "online store" in (n["catalog"] or {}).get("title", "").lower()), None)
    if not pub:
        print("Waarschuwing: Online Store-kanaal niet gevonden, producten worden niet gepubliceerd")

    products = json.loads((DATA / "products_clean.json").read_text("utf-8"))
    done_file = DATA / "pushed.json"
    done = json.loads(done_file.read_text()) if done_file.exists() else {}
    todo = [p for p in products if p["handle"] not in done][: a.limit]
    print(f"{len(todo)} te uploaden ({len(done)} al gedaan)")

    for n, p in enumerate(todo, 1):
        try:
            html = upload_description_media(shop, p["description_html"])
            inp = build_input(p, html, "DRAFT" if a.draft else "ACTIVE")
            for attempt in range(3):  # herhaal als afbeeldingen niet gedownload konden worden
                res = shop.gql(Q_SET, {"input": inp, "id": {"handle": inp["handle"]}})["productSet"]
                if res["userErrors"]:
                    raise RuntimeError(res["userErrors"])
                time.sleep(6)
                prod = shop.gql("""query($id:ID!){product(id:$id){media(first:100){nodes{status}}}}""",
                                {"id": res["product"]["id"]})["product"]
                if not any(m["status"] == "FAILED" for m in prod["media"]["nodes"]):
                    break
            else:
                print(f"  let op: {p['handle']} heeft nog mislukte afbeeldingen")
            if pub and not a.draft:
                shop.gql(Q_PUBLISH, {"id": res["product"]["id"], "pub": pub})
            done[p["handle"]] = res["product"]["id"]
            done_file.write_text(json.dumps(done, indent=1))
            print(f"[{n}/{len(todo)}] {p['handle']} -> {res['product']['handle']}")
        except Exception as e:
            print(f"[{n}/{len(todo)}] {p['handle']}: FOUT {e}")


if __name__ == "__main__":
    main()

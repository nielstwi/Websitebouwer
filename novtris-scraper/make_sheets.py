#!/usr/bin/env python3
"""Maak per product met kleur/variant-opties een genummerd fotoblad (data/sheets/<slug>.jpg).

Een model kijkt naar het blad en kiest per variant het nummer van de foto die de variant toont
(zie data/variant_images.json, formaat: {slug: {"<optiewaarde>": <galerij-index>|null}}).
"""
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image, ImageDraw

DATA = Path(__file__).parent / "data"
SHEETS = DATA / "sheets"
H = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
TILE = 200


def fetch(s, url):
    for t in range(4):
        try:
            r = s.get(url, timeout=40)
            r.raise_for_status()
            return Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception:
            time.sleep(2 * (t + 1))
    return None


def main():
    SHEETS.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    s.headers.update(H)
    todo = []
    for p in json.loads((DATA / "products_clean.json").read_text("utf-8")):
        if p["needs_image_match"]:
            todo.append((p["handle"], {"gallery": [{"url": i["src"]} for i in p["images"]]}))
    print(f"{len(todo)} producten met meerdere varianten")
    for n, (slug, p) in enumerate(todo, 1):
        out = SHEETS / f"{slug}.jpg"
        if out.exists():
            continue
        g = p["gallery"]
        tiles = []
        with ThreadPoolExecutor(8) as ex:
            imgs = list(ex.map(lambda x: fetch(s, x["url"]), g))
        for i, im in enumerate(imgs):
            im = im or Image.new("RGB", (TILE, TILE), "red")
            im.thumbnail((TILE, TILE))
            c = Image.new("RGB", (TILE, TILE + 22), "white")
            c.paste(im, ((TILE - im.width) // 2, 22))
            ImageDraw.Draw(c).text((4, 4), f"#{i}", fill="black")
            tiles.append(c)
        cols = 6
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * TILE, rows * (TILE + 22)), "white")
        for k, c in enumerate(tiles):
            sheet.paste(c, ((k % cols) * TILE, (k // cols) * (TILE + 22)))
        sheet.save(out, quality=80)
        print(f"[{n}/{len(todo)}] {slug} ({len(g)} foto's)")


if __name__ == "__main__":
    sys.exit(main())

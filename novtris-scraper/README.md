# Novtris → Shopify scraper

Haalt alle producten (986) van novtris.com en zet ze in Shopify. Volledige data per product:
titel, beschrijving (HTML), alle foto's, varianten (opties, SKU, prijs, vergelijkprijs, gewicht,
voorraadinstellingen, variantfoto), categorieën/tags, SEO-velden en bron-URL.

```bash
pip install -r requirements.txt
python scrape.py --limit 5     # test
python scrape.py               # alles (~25-30 min, hervatbaar)
```

Uitvoer in `data/` (staat in .gitignore): `raw/<slug>.json` (ruwe data), `products.json` (genormaliseerd).

## Naar Shopify

**Optie A – CSV-import (geen API-token nodig)**
```bash
python export_csv.py           # maakt data/shopify_products.csv
```
Shopify admin → Products → Import. Producten komen als *draft* binnen.

**Optie B – Admin API (aanbevolen bij ~1000 producten)**
```bash
export SHOPIFY_STORE=12a1vh-qk.myshopify.com
export SHOPIFY_ACCESS_TOKEN=shpat_...      # custom app met write_products
export SHOPIFY_LOCATION_ID=gid://shopify/Location/...   # optioneel, voor voorraadaantallen
python push_shopify.py --limit 3           # test (DRAFT)
python push_shopify.py                     # alles; --active om direct live te zetten
```
Hervatbaar via `data/pushed.json`.

## Let op
- Producten met meer dan 3 opties worden overgeslagen (Shopify-limiet).
- Afbeeldingen in de beschrijving blijven naar novtris.com verwijzen; zodra die shop offline gaat, breken ze.
- SKU's bevatten soms Chinese leverancierscodes; aanpassen kan in `normalize()` in `scrape.py`.

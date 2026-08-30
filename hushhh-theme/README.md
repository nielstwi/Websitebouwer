# HUSHHH — Shopify theme (Dawn)

Basis: het officiële gratis **Dawn**-thema van Shopify (OS 2.0), zoals
aangeleverd. Opgebouwd naar het Claude Design-mockup "3a — HUSHHH ·
verkoopstructuur" (homepage, collectie, productpagina, cart drawer, mobiel).

## Wat is gebouwd
- **Kleuren, typografie, knoppen, badges** — `config/settings_data.json`:
  exacte kleurtokens uit de mockup (inkt #2d2b2b, oppervlak #eae7e7,
  accent/sale #7c1405, blush #fff2ef, etc.), lettertype **Archivo** (ook
  hard geladen via Google Fonts in `layout/theme.liquid`, zodat het altijd
  het echte merklettertype is), knop-/input-radius 5px, pil-vormige badges,
  paginabreedte 1440px.
- **Homepage** (`templates/index.json`) — hero, USP-balk (4 kolommen),
  Bestsellers, Shop by category, bundelbanner, "Why silk", reviews,
  "#hushhhnights"-galerij, nieuwsbrief — in dezelfde volgorde en met dezelfde
  copy als de mockup.
- **Collectiepagina** (`templates/collection.json`) — categorie-banner,
  filter-/sorteerbalk, 4-koloms productgrid, FAQ-blok.
- **Productpagina** (`templates/product.json`) — duimnagel-galerij links,
  kleurstalen als cirkels, accordions (Size/Wash/Shipping/Materiaal),
  "Why silk"-blok, reviews, "You may also like".
- **Cart drawer** — `cart_type: drawer`, kleuren/knoppen/prijskleuren via
  dezelfde tokens.
- **Header** — gecentreerd HUSHHH-wordmark (breed getrackt, hoofdletters),
  nav links, eigen 3-koloms aankondigingsbalk (sale / verzending / 30
  dagen) — Dawn's eigen balk ondersteunt maar 1 bericht of een carousel,
  dus daarvoor is één klein eigen sectiebestand toegevoegd
  (`sections/announcement-3col.liquid`).
- 3 kleine eigen secties naast Dawn's standaardset (Dawn heeft hier zelf
  geen equivalent voor): `hushhh-why-silk.liquid`, `hushhh-reviews.liquid`,
  `hushhh-ugc.liquid`. Alles verder is standaard Dawn.

## Wat je zelf nog moet doen in Shopify Admin
Dit zijn dingen die **niet in thema-bestanden zitten** (het is winkel-data,
geen code), dus die kan ik niet vanuit dit repo instellen:
- **Navigatiemenu** aanmaken onder Admin → Navigatie → `main-menu` met:
  Sale, Sleep masks, Sleepwear, Bedding, Hair, Bundles.
- **Collecties aanmaken** (Sleep masks, Pillowcases, Sleepwear, Bedding) en
  koppelen aan de "Shop by category"-blokken en de Bestsellers-sectie.
- **Producten toevoegen** — homepage/PLP/PDP tonen dan automatisch je
  echte assortiment, voorraad en prijzen.
- **Logo/favicon** — bewust nog niet gedaan, regel je zelf later via
  Theme Settings → Logo & favicon.
- Optioneel: `cart_drawer_collection` instellen (Theme Settings → Cart) om
  de "Add to your order"-upsell-rij in de cart drawer te tonen, zodra er
  een collectie voor bestaat.

## Nog niet gebouwd / bewuste keuzes
- De "Frequently bought together"-bundelblok en de dynamische
  "Free shipping unlocked"-voortgangsbalk uit de mockup zijn niet
  hardcoded nagebouwd — dat vraagt om app-achtige logica (bundelkorting,
  verzenddrempel) die niet uit een mockup-screenshot valt te herleiden en
  standaard geen Dawn-functie is. Kan later als losse stap.
- Sticky "Add to cart"-balk onderin op mobiel (PDP) is nog niet toegevoegd.
- Ik heb geen `shopify theme check` kunnen draaien in deze omgeving (geen
  netwerktoegang tot de Shopify CLI-registry) — controleer dat zelf even
  met `shopify theme check` voor je live gaat, of upload en check de
  Theme Editor-preview.

## Installeren
1. Zip de map `hushhh-theme` (inhoud van deze map, niet de map zelf, in de
   root van de zip).
2. Shopify Admin → **Online Store → Themes → Add theme → Upload zip file**.
3. Klik **Customize** om te controleren.

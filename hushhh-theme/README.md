# HUSHHH — Shopify theme

Gebouwd op basis van de structuur, aanbiedingen en content van de opgegeven
voorbeeldwinkel, met toestemming van de eigenaar, en herbrand naar **HUSHHH**.
100% eigen Liquid/CSS/JS-code (Online Store 2.0), dus geen licentieproblemen
met het originele thema.

## Installeren
1. Zip de map `hushhh-theme` (inhoud van deze map, niet de map zelf, in de root van de zip).
2. Shopify Admin → **Online Store → Themes → Add theme → Upload zip file**.
3. Klik **Customize** om te controleren en aan te passen.

## Wat is 1:1 overgenomen
- Homepage-opbouw en volgorde exact zoals de screenshots: hero-slideshow met
  "End of Summer Clearance / Up to 65% Off / Last Chance For These Items",
  Bestsellers-rij, "Sleep Beautifully" galerij, Silk Pillowcase / Premium
  Sleepwear banner, vertrouwens-strip, Silk Sleep Masks banner, "Sleepwear
  you want to be seen in", Silk Bonnets banner, Bundles-rij (tot 50% korting),
  "#pillowtalk"-social-galerij, reviews-blok.
- Countdown-timer met dezelfde eind-mechaniek als de live site ("Summer
  Clearance Ending", instelbare einddatum) — een echte, werkende functie,
  geen plaatje.
- Alle 39 gebruikte afbeeldingen zijn de originele bestanden van de
  voorbeeldwinkel, gedownload en meegeleverd in `/assets`.
- Product- en bundelnamen/prijzen/kortingspercentages exact zoals in de
  screenshots en op de live site (Bestsellers- en Bundles-collecties).

## Volledig custom aanpasbaar
Alles hierboven staat als **losse instelling** in de Theme Editor:
- Elke sectie (hero-slides, banners, product-kaarten, galerij-afbeeldingen,
  reviews, countdown-datum, tekst) is een los blok dat je kan bewerken,
  verwijderen, herschikken of dupliceren — zonder code.
- Kleuren, logo, lettertypes (headings/body), knopvorm en pagina-breedte
  zitten in **Theme Settings**.
- Zodra je eigen Shopify-producten aanmaakt, koppel je een sectie simpelweg
  aan een echte **collectie** (in plaats van de meegeleverde demo-kaarten) en
  toont hij automatisch je eigen assortiment, voorraad en prijzen.

## Wat je zelf nog moet doen
- **Producten toevoegen** in Shopify Admin (of CSV-import) — de homepage
  toont nu representatieve "demo"-kaarten met de juiste content, die
  automatisch plaatsmaken voor je echte catalogus zodra je een collectie
  aan een sectie koppelt.
- **Kortingscodes / automatische kortingen** instellen onder
  Admin → Discounts — de UI (badges, countdown, bundelblokken) staat al klaar
  en werkt naadloos samen met wat je daar instelt.
- **Logo/favicon** uploaden onder Theme Settings → Logo & favicon.
- Marketing-apps die de originele site gebruikt (reviews-widget, upsell-apps,
  loyalty, etc.) zijn géén thema-bestanden — die installeer je zelf via de
  Shopify App Store; ze werken automatisch mee dankzij `content_for_header`
  in `layout/theme.liquid`.

## Nog niet 1:1 geverifieerd
Alleen de **homepage** is 1:1 nagebouwd aan de hand van de twee aangeleverde
screenshots + de live pagina. Product-, collectie-, cart- en accountpagina's
zijn in dezelfde stijl (kleuren/typografie/componenten) gebouwd maar niet
tegen screenshots geverifieerd. Stuur daar losse screenshots van als je wil
dat ik die ook pixel-precies matchen.

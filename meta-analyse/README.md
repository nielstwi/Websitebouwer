# Meta Ads analyse (gratis)

Haalt advertentiedata op via de Meta Marketing API (gratis, geen betaalde tools) en maakt
`output/rapport.html` (KPI's, trendgrafiek, advies per campagne/adset/ad) en `output/ads.csv`.
Alleen Python 3.9+, geen dependencies.

```bash
python3 analyse.py --demo            # proberen met voorbeelddata
python3 analyse.py --days 30         # echte data
python3 analyse.py --breakeven 1.8 --target 3.5 --min-spend 50
```

## Token instellen (eenmalig, gratis)
1. Ga naar developers.facebook.com → *My Apps* → app aanmaken (type Business).
2. Voeg *Marketing API* toe → Tools → *Graph API Explorer* → kies permissie `ads_read` → *Generate Access Token*.
   Voor een langdurige token: maak in Business Settings een *System User* met alleen-lezen toegang tot het ad account.
3. Ad account ID vind je in Ads Manager (nummer bij het account, zonder `act_`).
```bash
export META_ACCESS_TOKEN=...
export META_AD_ACCOUNT_ID=1234567890
```
Zet de token nooit in git. Alleen `ads_read` is nodig; het script wijzigt niets in je account.

## Adviesregels
- **Te weinig data**: uitgaven < `--min-spend`
- **Stoppen**: geen aankopen of ROAS < `--breakeven`
- **Schalen**: ROAS ≥ `--target` en ≥ 3 aankopen (waarschuwing bij frequentie > `--max-freq`)
- **Blijven testen**: de rest

Aankopen/omzet komen uit de `purchase`-events van je Meta Pixel/Shopify-koppeling.

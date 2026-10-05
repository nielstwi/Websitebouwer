# Teamtaken

To-do lijst voor de 5 werkdagen (ma–vr) met tijdregistratie en een manager-portal met analyse.
Volledig gratis: geen externe diensten, geen npm-pakketten, geen abonnementen.

## Starten

Vereist alleen [Node.js](https://nodejs.org) 22.13 of nieuwer (gratis).

```
cd teamtaken
node server.js        # opent op http://localhost:3000
```

Bij de eerste start maak je in de browser het **manager-account** aan. Daarna maak je onder
**Beheer** per collega een account aan en stel je zelf het wachtwoord in (opnieuw instellen kan altijd).

## Gebruik

- **Collega**: ziet alleen de eigen week (ma–vr), voegt taken toe (activiteit uit lijst of nieuw, klant/reden,
  opmerkingen, verwachte tijd in minuten/uren) en vult bij afronden de bestede tijd in.
- **Manager**: tab per collega (weekbord + volledige analyse), tab *Overzicht & analyse* voor het hele team,
  tab *Beheer* voor accounts en de activiteitenlijst. Taken van de manager zijn gemarkeerd en kunnen
  door de collega niet worden verwijderd.
- **Analyse**: aantal/afgerond %, achterstallig, verwachte vs. bestede tijd, afwijking, nauwkeurigheid,
  gemiddelde per taak, per activiteit, per klant/reden, per weekdag, per medewerker + CSV-export (Excel).
- Zelf toegevoegde activiteiten worden opgeslagen in de lijst.

## Gratis hosten

Alle data staat in één bestand: `data/teamtaken.db` (maak hiervan regelmatig een kopie als back-up).

1. **Op een pc/laptop op kantoor (aanbevolen, echt gratis)**: draai `node server.js` en laat collega's
   `http://<ip-van-die-pc>:3000` openen op hetzelfde netwerk. Voor toegang van buitenaf: gratis
   Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3000`).
2. **Gratis cloud-tiers** (bv. Oracle Cloud Always Free VM) werken ook, mits de schijf behouden blijft.
   Gratis tiers van veel diensten (Render, Fly, Railway) wissen of beperken bestanden op schijf;
   dan raak je je data kwijt.

Omgevingsvariabelen: `PORT` (standaard 3000), `DATA_DIR` (standaard `./data`).
Zet bij gebruik via internet altijd HTTPS ervoor (Cloudflare Tunnel doet dit automatisch).

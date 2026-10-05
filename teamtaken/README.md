# A-Gas Teamtaken

Dashboard in de browser: to-do lijst voor de 5 werkdagen (ma–vr) met tijdregistratie en een
manager-portal met analyse. Draait **gratis** op Cloudflare (Workers + D1, gratis tier, geen creditcard nodig).

## Online zetten (eenmalig, ±5 minuten)

1. Maak een gratis account op <https://dash.cloudflare.com/sign-up> (geen betaalgegevens nodig).
2. Installeer [Node.js](https://nodejs.org) (LTS) op je computer.
3. Open een terminal in deze map en voer uit:
   ```
   npm install
   npx wrangler login      # opent de browser; klik "Allow"
   npm run deploy
   ```
   De database (D1) wordt automatisch aangemaakt. Aan het eind krijg je een link zoals
   `https://teamtaken.<jouw-naam>.workers.dev` — dat is het dashboard.
4. Open de link: je maakt als eerste het **manager-account** aan. Daarna maak je onder **Beheer**
   per collega een login aan en stel je zelf het wachtwoord in. Stuur collega's de link.

Updates uitrollen: `npm run deploy` opnieuw uitvoeren (data blijft bewaard).
Lokaal testen: `npm run dev` (http://localhost:8787).

## Gebruik

- **Collega**: eigen week (ma–vr); taak = activiteit (kiezen uit lijst of nieuw, wordt opgeslagen),
  klant/reden, opmerkingen, verwachte tijd (min/uur). Bij afronden vullen ze de bestede tijd in.
- **Manager**: tab per collega (weekbord + volledige analyse), *Overzicht & analyse* voor het team,
  *Beheer* voor accounts (wachtwoorden zelf instellen) en de activiteitenlijst.
  Taken van de manager zijn gemarkeerd en kunnen door de collega niet worden verwijderd.
- **Analyse**: aantallen, % afgerond, achterstallig, verwacht vs. besteed, afwijking, nauwkeurigheid,
  gemiddelden, per activiteit / klant / weekdag / medewerker, CSV-export (Excel).

## Gratis limieten (ruim genoeg voor een team)

Workers: 100.000 verzoeken/dag · D1: 5 GB opslag, 5 miljoen reads/dag, 100.000 writes/dag.
Wachtwoorden worden met PBKDF2 gehasht; sessies via HttpOnly-cookie; HTTPS is standaard.

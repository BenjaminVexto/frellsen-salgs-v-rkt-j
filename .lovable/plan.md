# Sælger pr. lokation

## Hvad brugeren får
- Hver leveringsadresse har sin egen sælger fra Aktør. Kundekortets ansvarlige sælger er sælgeren på hovedkontoen (Lev. kund = Fakt. kunde).
- Alle sælgervisninger regnes ud fra lokationens sælger: Målepunkter, Portefølje, Analyse, Bonus, "Mine kunder", top/bund, salgsmuligheder og kundestatus pr. sælger.
- Har en virksomhed lokationer hos flere sælgere, vises den som fx "Compass Group Danmark A/S (1 af 20 lokationer)". Tallene dækker kun sælgerens egne lokationer.
- Kundekortet viser stadig hele virksomheden. Fanen Lokationer får en kolonne med sælger.
- Kreditspærrede kunder importeres med sælger som alle andre. De vises som "Spærret" og tæller med i omsætning og historik. De kommer ikke med i Salgsmuligheder, "Sælg mere" eller lister over sovende kunder.
- Sælgernumre uden bruger vises som "Ukendt sælger (nr.)" og falder aldrig tilbage til virksomhedens sælger.
- Leveringsnumre, der ikke findes i Aktør, vises som "Ikke i Aktør" og får ingen sælger.
- Fakturakunder uden hovedkontorække får den sælger, der har højest omsætning de seneste 12 måneder.

## Data
- Nye felter på lokationer: sælgernummer, sælgerens bruger (fundet via sælgernummeret på profilen), "spærret" og "i Aktør" (ja/nej).
- Nyt felt på virksomheder: "spærret" (ja, når alle lokationer er spærret).
- Engangsudfyldning ud fra Aktør 5/10-2026. Den ændrer kun tildeling og spærring. Ingen salgstal røres.
- companies.assigned_to sættes ud fra hovedkontoreglen. Reglerne for ukendte numre og manglende hovedkonto følger kontrollisten.
- De forudberegnede tabeller (sales_kunde_maaned, company_mp_info) skifter sælger fra virksomhed til lokation. Det sker gennem de eksisterende triggere, som udvides til også at reagere på ændringer på lokationer.

## Aktør-importen
- Indstillingen "Udeluk kreditspærrede kunder" fjernes. Spærring læses fra kolonnen Kreditspærre.
- Hver række opdaterer sælger og spærring på sin lokation.
- Virksomhedens ansvarlige sælger sættes til hovedkontoens sælger. Reglen "første række med sælger" fjernes helt.
- Efter importen genberegnes de berørte sælgere automatisk via triggerne.

## Visninger
- Funktionerne bag portefølje, målepunkter, bonus og analyse filtrerer på lokationens sælger i stedet for virksomhedens.
- "Mine kunder"-filteret og sælgerfilteret i kundelisten matcher en virksomhed, hvis den har mindst én af sælgerens lokationer. Tælleren "x af y lokationer" vises.
- Salgsmuligheder, "Sælg mere" og lister over sovende kunder udelader spærrede kunder.
- Badget "Spærret" vises på kundekortet og i kundelisterne.

## Kontrol
- Før/efter-opgørelsen pr. sælger køres igen for de seneste 12 måneder:
  - Totalen skal være uændret.
  - "Ikke tildelt" må kun indeholde kunder uden sælger i Visma.
  - "Ikke i Aktør" og "Ukendt sælger" vises som separate linjer.
- Stikprøve i preview som Claus og som admin, inkl. Compass Group.

## Teknisk
- Migrationer: nye kolonner, opdaterede triggere og RPC'er (portfolio_*, maalepunkt_*, bonus_*, analyse_pivot, aktive_saelgere).
- Udfyldningen fra Aktør køres som dataopdatering, ikke som migration.
- Filer: admin.import.visma.tsx, portfolio.functions.ts, sales.server.ts (getSellerCompanyIds), company-filter, lokationer-sektion.tsx, virksomheder_.$id.tsx og salgsmuligheder-visningerne.
- Husk at publicere bagefter, så importen kører med den nye logik.

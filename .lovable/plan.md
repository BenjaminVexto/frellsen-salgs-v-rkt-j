# Bonusafregning i CRM: låsning, efterregulering og lønfil

Beregningen (bonus_pr_maaned, bonus_maskin_grundlag, ny kunde-funktionerne) og reglerne i "Sådan beregnes din bonus" røres ikke. Alt nyt bygges ovenpå.

## 1. Låsning af bonusmåned
- bonus_laas (findes, én række pr. sælger/måned) udvides med: ny_kunde_db, ny_kunde_rang, ny_kunde_bonus, regulering, loen_1561, loen_1563, maskiner (jsonb øjebliksbillede inkl. udeladte med årsag), laast_note.
- Ny log-tabel bonus_laas_log (måned, handling 'laas'/'laas_op', begrundelse, bruger, tidspunkt).
- Databasefunktion `bonus_laas_maaned(_maaned, _note)`: kun admin, kun afsluttede måneder. I én transaktion for alle sælgere med gyldig bonus_ordning i måneden:
  1. beregner efterreguleringer (afsnit 2) med udbetalingsmåned = M,
  2. gemmer bonus_pr_maaned-rækken + bonus_maskin_grundlag-rækker som øjebliksbillede,
  3. lægger reguleringer til lønarterne og logger låsningen.
- `bonus_laas_op(_maaned, _begrundelse)`: kun admin, begrundelse påkrævet; sletter månedens låse-rækker og dens automatiske efterreguleringer (manuelle bevares), logger handlingen. Oplåsning kun af seneste låste måned, så efterreguleringer i senere måneder ikke bliver forkerte.
- Advarsel i UI før den 10. i næste måned med den ønskede tekst.

## 2. Automatisk efterregulering
- Ny tabel bonus_regulering (som specificeret; type og lønart begrænset til de tilladte værdier).
- Ved låsning af M: for hver sælger og hver låst måned K de seneste 6 måneder før M:
  - DB-diff = live db_bonus(K) − låst db_bonus(K) − sum tidligere efterreguleringer for K på 1561
  - Rest-diff = live maskinbonus(K) − låst maskinbonus(K) − sum tidligere efterreguleringer for K på 1563. Ny kunde-bonus og rangering er endelige ved låsning og efterreguleres ikke.
  - DB-diff beregnes på db_bonus efter minimum/fradrag, præcis som bonus_pr_maaned returnerer den. Fast provision: diff på samlet bonus (1561).
  - Differencer oprettes både positive og negative (fx kreditnotaer).
  - Afrundet til hele kroner; ≠ 0 → række "Efterregulering [måned]: DB (sene fakturaer)" (1561) eller "Efterregulering [måned]: maskiner" (1563).
- Fordi tidligere reguleringer trækkes fra, dukker samme difference ikke op igen ved næste låsning.
- Fast provision: alt fra flatrate-sælgere går på 1561 = flatrate; deres diff vil normalt være 0.
- Manuelle reguleringer: oprettes/slettes af admin, kun mens udbetalingsmåneden er åben (håndhæves med trigger).

## 3. Bonus-fanen (sælgerens visning)
- bonus_pr_maaned-kaldet suppleres med læsning af bonus_laas for perioden; låste måneder vises med de låste tal og et låse-ikon med "Låst og udbetalt [dato]".
- Maskin-detaljevinduet viser det gemte øjebliksbillede for låste måneder. DB-detaljer og rangliste forbliver live (der gemmes ikke kundeliste); en lille note angiver det.
- Ingen ændring i regeltekster.

## 4. Fanen "Afregning" (kun admin)
- Ny fane i Min salgsstatistik ved siden af Salgskort, skjult for alle andre.
- Månedsvælger; tabel pr. sælger: Sælger, Lønnr., DB-grundlag, DB-provision, Maskinbonus (W/A/R), Ny kunde, Reguleringer, I alt, Lønart 1561, Lønart 1563, Status. Åbne måneder viser live tal + åbne reguleringer; låste viser låste tal. Total-række.
- Lønart-regel: flatrate → 1561 = flatrate, 1563 = 0 + reguleringer; ellers 1561 = DB-provision + 1561-reguleringer, 1563 = maskiner + ny kunde + 1563-reguleringer.
- Klik på sælger → åbner Bonus-fanen for sælgeren.
- Reguleringsliste under tabellen + "Tilføj regulering" (sælger, lønart, beløb ±, tekst) og slet.
- Knapper "Lås [måned]" / "Lås op" (med begrundelse) og "Hent lønfil" (xlsx og csv, kun låste måneder): CVR 25340604 | Name | Employee Number | Date (1. i næste måned, dd-mm-åååå; i xlsx en rigtig dato-celle) | Project ID ("Provision 1"/"Provision 2") | Type ID | Number 1 | Amount (2 decimaler); to rækker pr. sælger "Provision 1"/1561 og "Provision 2"/1563, også ved 0.

## 5. Lønnummer
- Ny kolonne profiles.loennr; sættes for Jes 5707, Mads 5830, Malene 5883, Anders 5863, Claus 5806, Ole 5725 (som dataopdatering). Redigerbart for admin på brugersiden og direkte i Afregning.

## Test og verifikation
- Kontroller live-tal september 2026: Jes 11.325,06, Mads 12.751,25, Malene 9.000, Anders 10.500, Claus 17.000, Ole 9.298,52; lønfil Jes 6.575,06/4.750, Malene 9.000/0.
- Efterregulering testes i en transaktion der rulles tilbage (lås sep., indsæt testfaktura dateret sep., lås okt. → regulering; lås nov. → ingen ny). Ingen testdata efterlades. Spørg før en rigtig låsning af september.
- Små tests for lønart-fordeling og lønfil-rækker (dato, to rækker, afrunding).

## Teknisk
- Nye tabeller får GRANT, RLS (læs: admin + egen række; skriv kun via SECURITY DEFINER-funktioner), tm_spaerret-politik.
- Lønfil genereres i browseren (xlsx via eksisterende/ny pakke `xlsx`), ud fra låste rækker.
- Ny komponent `src/components/bonus/afregning-fane.tsx`; logik for lønarter/lønfil i `src/lib/bonus-afregning.ts` med test.
- AGENTS.md: regel om at udbetalte måneder kun ændres via bonus_regulering.

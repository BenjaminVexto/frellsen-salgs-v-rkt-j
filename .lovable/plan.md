# Pakke 3 – kundestatus, statistik, konkurrenter og katalog

Pakke 2 er færdig (adressesøgning, lokation via P-nr., lokationssøgning, koncern). Pakke 3 bygges i rækkefølgen nedenfor. Før hvert punkt, der ændrer status, gemmes et øjebliksbillede af antallene, så før/efter kan rapporteres. Ingen salgsdata ændres.

## 1) Sovende med hensyn til egen købsrytme
- Ny databaseberegning af rytme pr. lokation og pr. virksomhed: måneder med forbrugskøb (samme forbrugsgrupper som status bruger i dag), gennemsnitligt interval mellem dem, kun når der er mindst 3 købsmåneder.
- Statusregel: aktiv hvis måneder siden sidste forbrugskøb ≤ max(3, 1,5 × interval); ellers gælder den nuværende sovende/tidligere/servicekunde-logik uændret.
- `forventet_interval_mdr` fra forbrugssignalet bruges kun, hvis den viser sig at være beregnet på samme måde; ellers bruges den nye beregning (afgøres ved kontrol, rapporteres).
- Kundekortet: "Køber typisk hver ~X. måned · næste køb forventet ca. [måned år]", og diskret "Forventet køb er overskredet", når kunden er over rytmen men endnu ikke sovende.
- Genberegning for alle afdelinger; rapport: aktive/sovende før og efter pr. afdeling (forventet ca. 1.063 færre sovende i afd. 11).

## 2) Lokationsniveau for alt der er "mit"
- Status beregnes pr. lokation (nyt felt på lokationen); virksomhedens status = den bedste af lokationerne.
- Gennemgang af resterende "min"-visninger, der stadig regner på virksomhed: faldende kunder/forbrugssignal, sovende-lister, kontaktlister, salgsmuligheder. Portefølje, målepunkter og bonus er allerede pr. lokation fra tidligere.
- Visning i lister: "National Oilwell Varco – Kalundborg (2 af 4 lokationer)".
- Kundekortet: fordeling pr. lokation med sælgernavn, omsætning seneste 12 mdr., udvikling og status, så faldet kan ses (kontrol: Brøndby hos Claus Wolsing).
- Undtagelse: maskinbonus følger fortsat virksomhedens sælger, fordi maskiner ikke kan kobles til lokation.

## 3) Søsterkonti med samme CVR og adresse
- Ny databasevisning over par: sovende konto/lokation + aktiv konto med samme CVR og samme normaliserede adresse (eller samme postnr., når adressen mangler), i samme afdeling.
- Disse holdes ude af sovende-/"køber ikke"-lister og får markeringen "Køber på konto [nr.]".
- Kundekortet viser søsterkontoen tydeligt på begge konti.
- Admin-side "Søsterkonti" med parrene og en knap til den eksisterende dubletsammenlægning. Ingen automatisk sammenlægning. Rapport: antal par (forventet ca. 17 i afd. 11).

## 4) Konkurrentaftale pr. lokation med historik
- Nye felter på konkurrentaftalen: lokation, start og afsluttet. Nyt valg på samme lokation afslutter den gamle; der slettes intet.
- De 6 eksisterende aftaler flyttes til virksomhedens primære lokation.
- Kundekortet: aktuel konkurrent og udløb pr. lokation, og samlet historik. Dialogen får lokationsvalg (forvalgt, når der kun er én).

## 5) "Send digitalt katalog"
- Knap ved siden af "Besøgt" (kortets top og pr. lokation). Felter: e-mail, navn (valgfrit), "Send" og hjælpeteksten.
- Admin-indstilling for katalogets link og forsidebillede (billedet hentes automatisk fra katalogsidens og:image, kan overskrives).
- Ved afsendelse: kontakten oprettes/opdateres på lokationen, aktiviteten "Katalog sendt" med lokation og modtager oprettes, og en opfølgning om 7 dage hos sælgeren.
- Mail med emne "Frellsen kaffekatalog", hilsen med sælgerens navn/telefon/mail, forsidebillede og knap. Mailen indeholder et lille afmeldingslink nederst (påkrævet af systemet).
- **Status for mail:** Projektet kan ikke sende mails endnu. Der mangler et afsenderdomæne, som Frellsen ejer (fx frellsen.dk). Det sættes op i én dialog, hvorefter der skal tilføjes nogle DNS-poster hos domæneudbyderen. Indtil det er gjort, bygges alt andet, og knappen gemmer kontakt, aktivitet og opfølgning, men viser "Mail kan ikke sendes endnu".

## Antagelser (ret mig, hvis de er forkerte)
- Rytmen beregnes på de seneste 24 måneders forbrugskøb, så gamle mønstre ikke holder en kunde kunstigt aktiv.
- "Samme adresse" i punkt 3 kræver også samme afdeling.
- Kataloglinket gælder alle afdelinger (én fælles indstilling).

## Teknisk
- Rytme og lokationsstatus i en SQL-funktion, der kaldes fra `recompute_company_statuses_batch` og fakturaimportens statustrin. Ny kolonne `locations.customer_type` og en tabel/visning til rytme (`kunde_rytme`: niveau, id, interval, sidste forbrugskøb, næste forventede).
- `competitor_assignments`: + `location_id`, `start_dato`, `afsluttet_dato`; delvis unik indeks på aktiv aftale pr. lokation; trigger afslutter den forrige aftale.
- `app_settings` (nøgle/værdi, kun admin skriver) til katalog-link/-billede.
- Mail via den indbyggede mailtjeneste (skabelon + kø), først aktiv når domænet er verificeret.

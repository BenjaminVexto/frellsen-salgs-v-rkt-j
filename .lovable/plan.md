# Salgsintelligens: P-enheder med ansatte og dækning

## Hvad brugeren får
- I Salgsintelligens viser en udfoldet virksomhed to grupper: "Dækket (n)" og "Ikke dækket (n)". Rækkerne er sorteret efter antal ansatte, med størst først.
- Kolonnen POTENTIALE viser ansatte i afdelinger, der ikke er dækket (fx "~420 ansatte"), med "63 afd." i grå tekst under. En ny kolonne viser ANSATTE I ALT.
- Flammen vises, når virksomheden har mindst én aktiv P-enhed, der ikke er dækket, med 25 ansatte eller flere. Grænsen står ét sted i koden.
- Hver række har en diskret "Kobl til kunde" eller "Fjern kobling". Automatiske koblinger overskriver aldrig en kobling, der er lavet i hånden.
- CSV-filen får én linje pr. P-enhed med P-nr, adresse, ansatte-interval, ansatte-estimat og om den er dækket (ja/nej).
- Fanen "Lokationer" på kundekortet viser samme opdeling.
- Designet forbliver roligt, uden farver på rækkerne.

## 1. Data: CVR-import
- `cvr_penheder` får fire nye kolonner, som alle må være tomme: `ansatte_interval`, `ansatte_praecis`, `ansatte_estimat` og `beskaeftigelse_periode`.
- Synkroniseringen henter også den nyeste beskæftigelse fra CVR (`aarsbeskaeftigelse`/`kvartalsbeskaeftigelse`) for hver P-enhed:
  - Er der et præcist tal, bruges det som estimat.
  - Ellers bruges midtpunktet af intervallet, så "10-19" giver 15.
  - Åbne intervaller som "1000+" bruger den nedre grænse. Intervallet 0 giver 0.
  - Perioden gemmes som "2026" eller "2026-K2".
- Ophørte P-enheder hentes nu også og markeres `is_active = false`. Alle visninger filtrerer dem fra.
- En ugentlig kørsel (pg_cron, mandag nat) sætter alle kunde-CVR'er i kø. Det svarer til knappen "Synkronisér" på admin-overblikket.

## 2. Data: kobling til kunder
- Ny tabel `location_pnr_link` med disse kolonner:
  - `afdeling_nr` og `visma_delivery_no` (Vismas nøgle for leveringsadressen). Det er koblingens egentlige nøgle.
  - `location_id` som en hjælpe-reference. Den sættes til tom, hvis lokationen slettes, og findes igen via Vismas nøgle.
  - `p_nummer`
  - `kilde` ('auto' eller 'manuel')
  - `oprettet_af`
  - `oprettet_dato`
- Hvert P-nummer kan kun have én kobling. GRANT og RLS følger `can_view_company`: alle i afdelingen kan læse og lave manuelle koblinger.
- Auto-match sker på normaliseret adresse og postnummer. Normaliseringen genbruger de eksisterende `addr_base` og `zip_norm`.
- Auto-match kører efter hver synk og indsætter kun P-enheder, der ikke allerede har en kobling. Det rører aldrig manuelle koblinger.
- Auto-match kobler kun, når adressen passer til præcis én leveringsadresse, og den leveringsadresse kun passer til én P-enhed. Findes der flere mulige koblinger, laves der ingen automatisk kobling.
- "Fjern kobling" sletter ikke rækken. Den sætter kilde = 'afvist', og auto-match springer afviste P-numre over.
- "Fortryd afvisning" sletter afvisningen igen, så P-enheden kan kobles igen, automatisk eller i hånden.
- `kilde` kan være 'auto', 'manuel' eller 'afvist'.
- Viewet `salgsintelligens_penhed_status` og `salgsintelligens_mersalg` bygges om, så de bruger koblingerne:
  - `daekket` betyder, at der findes en kobling med en lokation.
  - Viewene får disse nye felter: `ansatte_ikke_daekket`, `ansatte_total`, `afd_ikke_daekket` og Visma-kundenr.
  - Sortering sker på `ansatte_ikke_daekket`.

## 3–4. UI i Salgsintelligens
- Den udfoldede række henter alle aktive P-enheder for CVR-nummeret og deler dem i Dækket og Ikke dækket.
- Ansatte vises som det præcise tal, ellers som "10–19". Er tallet ukendt, vises "–".
- "Kobl til kunde" åbner en lille liste med virksomhedens lokationer.
- Konstanten `FLAMME_MIN_ANSATTE_PR_ENHED = 25` styrer flammen.

## 5. Kundekortet
- `CvrPenhederSektion` på fanen "Lokationer" læser fra de synkroniserede P-enheder og koblingerne i stedet for et live-opslag.
- Den viser samme opdeling og har samme kobl- og fjern-handling.
- Knappen "Tilføj", der opretter en ny lokation, bliver ved rækker, der ikke er dækket.

## Teknisk
- Migrationer:
  - kolonner på `cvr_penheder`
  - `location_pnr_link` med GRANT, RLS og unikt P-nummer
  - funktionen `auto_link_penheder(_cvrs text[])`
  - de to views, der bygges om
  - cron-job
- Filer, der ændres: `cvr-penhed-sync.server.ts`, `process-penhed-sync.ts`, `salgsintelligens.tsx`, `cvr-penheder-sektion.tsx` og en ny `penhed-link.functions.ts`.
- Første fulde synk sættes i kø efter udrulning, så ansatte-tallene bliver fyldt ud.

## Er location_id stabil? (kontrolleret)
- Visma-importen opdaterer leveringsadresser på (virksomhed, leveringsnr.). En eksisterende lokation beholder derfor sit id, og den bliver ikke oprettet igen.
- Lokationer slettes kun, når en maskindata-import rulles tilbage, og kun hvis de blev oprettet af netop den import.
- Koblingen bindes alligevel til Vismas leveringsnr. og afdeling. Den overlever derfor, selv hvis en lokation slettes, genoprettes eller flyttes til en efterfølger-virksomhed.
- Manuelle og afviste koblinger bliver aldrig slettet eller ændret af en import.

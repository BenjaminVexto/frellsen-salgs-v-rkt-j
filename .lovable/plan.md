
# Re-import af kundefil (Fakt. kunde / visma_id)

Samme chunked async-mønster som faktura-importen, men nu låst til den nye datamodel hvor `visma_id` er den eneste grupperings-nøgle.

## Bekræftelser på dine tre krav

**1) Upsert kun OPDATERER eksisterende canonical-virksomheder og TILFØJER de manglende ~1.956 — uden at røre re-pointede aktiviteter/noter.**

Sandt, fordi:
- Upserten kører på `companies (visma_id)` via det unique partial index migrationen lagde (`companies_visma_id_unique`). Conflict → `UPDATE` på canonical rækken, ingen ny række.
- `UPDATE` på companies rører kun kolonner i payload (name, cvr, address, zip, city, municipality, …). FK-relationer (activities.company_id, contacts.company_id, briefings, quotes, agreements, …) er kolonner på de *andre* tabeller — de røres aldrig af en companies-upsert.
- Vi merger felter med `COALESCE(existing, incoming)`-logik kun for tomme felter (samme `buildMerged` som i dag), så manuelt indtastede data overskrives ikke af et tomt Visma-felt.

**2) Lokationer tilføjes under den rigtige virksomhed via Fakt. kunde — ikke som separate companies.**

Sandt, fordi:
- `companyKey()` returnerer nu kun `visma_id` (Fakt. kunde) → alle rækker med samme Fakt. kunde grupperes til samme company_id i én lookup-tabel før location-byg.
- Lokationer upsertes på `locations (company_id, visma_delivery_no)` (det eksisterende unique index). Eksisterende lokationer opdateres, manglende oprettes — aldrig som nyt company.
- Lokationer hvor `visma_delivery_no = company.visma_id` markeres `is_primary=true` (samme regel som migrationen brugte).

**3) Kommune udledes fra postnr på nye lokationer/virksomheder.**

Sandt på company-niveau (det er der `companies.municipality` lever). `locations`-tabellen har ingen `municipality`-kolonne — kun zip/city — så kommune er pr. design en company-property der bruges af RLS/region-filtre. For nye companies (de ~1.956): hvis Visma-rækken mangler kommune, slår vi op via zip→kommune-tabellen før insert (samme helper som tidligere fix).

## Re-import flow

```text
fil (16.091 rækker)
  │
  ├─ parse + map (Papa stream, in-memory)
  ├─ companyKey = visma_id  →  ~16.091 grupper
  │
  ├─ chunk 500: SELECT companies WHERE visma_id IN (...)
  │     ├─ found → klassificér som UPDATE (canonical id)
  │     └─ ikke fundet → klassificér som INSERT (ny)
  │
  ├─ chunk 500: bulk upsert companies onConflict=visma_id
  │     ├─ kommune-fallback fra zip hvis tom (kun for INSERT-rækker)
  │     └─ retry pr. række ved batch-fejl (samme fallback som i dag)
  │
  ├─ chunk 500: bulk upsert locations onConflict=(company_id, visma_delivery_no)
  │     ├─ is_primary=true hvor delivery_no = company.visma_id
  │     └─ resten = false
  │
  ├─ kontaktpersoner: upsert pr. company (uændret)
  └─ batch-log: import_batches række med company_ids
```

UI: `importRunner` viser "Importerer batch X af Y… (N / 16.091)" + progress bar — præcis som faktura-importen.

## Tekniske detaljer

**Filer der røres:**
- `src/lib/admin-companies.functions.ts` — ny server-fn `importUpsertCompaniesByVismaId` (analog til `importUpsertCompaniesByCvr` men `onConflict: "visma_id"`). Beholder den gamle CVR-variant til legacy "Anden kilde"-import.
- `src/routes/_authenticated/admin.import.visma.tsx` — flow ændres:
  - dedup-lookup på `visma_id` (ikke CVR)
  - upsert-kald skifter til `importUpsertCompaniesByVismaId`
  - kommune-fallback fra zip indsættes før insert-payload bygges

**Server-fn signatur (skitse):**
```ts
importUpsertCompaniesByVismaId({ rows })
  // dedupliker pr. visma_id (sidste række vinder)
  // chunk 500
  // .upsert(slice, { onConflict: "visma_id" }).select("id, visma_id")
  // fallback pr. række ved batch-fejl
  // returnerer { results: [{id, visma_id}], failed, errors }
```

**Idempotens:** Re-kør samme fil → samme visma_id'er → samme rækker UPDATE'es med identisk payload. Ingen duplikater, ingen nye companies, ingen FK-data tabt.

**Chunk-størrelser:** 500 (samme som faktura/eksisterende Visma-import). yieldUI() mellem chunks så browseren forbliver responsiv.

**Retry/fejlhåndtering:** Batch-fejl → fallback til per-række upsert (samme mønster som `importUpsertCompaniesByCvr`). Fejlede rækker tælles og rapporteres i UI; importen fortsætter.

## Verifikation efter kørsel

```sql
SELECT count(*), count(DISTINCT visma_id) FROM companies;
-- forventet: ~16.091 / ~16.091

SELECT count(*) FROM activities;
-- skal stadig være 3 (ingen aktiviteter tabt under upsert)

SELECT count(*) FROM locations;
-- skal være >= 18.268 (nye lokationer tilføjet, ingen slettet)
```

## Hvad der IKKE ændres

`importInsertLocations`, `importUpsertContacts`, salgs-rollup, bindingsstatus, udstyrs-bokse, Frellsen-CVR-blocklist, sælgertildeling, kontaktliste-flow. Kun company-upsert-nøglen skifter fra CVR til visma_id.

## Risiko

Lav. Datamodellen er allerede konsistent (14.135 unikke visma_id, 0 orphans, unique constraint aktiv). Værste fald ved kørsel: enkelte rækker fejler validering → de logges, resten importeres, og du kan re-køre filen idempotent.

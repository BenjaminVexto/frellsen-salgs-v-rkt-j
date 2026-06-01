## Mål
Gøre CVR-berigelsen robust så den kører uafhængigt af om browserfanen er åben. Rydde op i forældreløse import-batches. Håndhæve unique index på (navn, kundenr).

## Arkitektur — server-styret kø via pg_cron

Vi tilføjer en database-baseret jobkø som pg_cron poller hvert minut. Det undgår en ny connector (Inngest), bygger på eksisterende pg_cron-mønster i projektet, og er nemt at debugge.

```text
Visma-import (browser)
       │
       ▼ enqueueCvrEnrichment(company_ids[])
┌─────────────────────────┐
│ cvr_enrichment_jobs     │  status: pending → processing → done/failed
└─────────────────────────┘
       ▲
       │ pg_cron (hvert minut) → POST /api/public/hooks/process-cvr-enrichment
       │
       ▼ kalder eksisterende enrichCompaniesFromCvr-logik
```

## Filer/ændringer

### 1. Database (migration)
- Ny tabel `public.cvr_enrichment_jobs`:
  - `id uuid PK`, `company_ids text[]`, `status text` (default `pending`), `attempts int` (default 0), `last_error text`, `created_at`, `started_at`, `finished_at`
  - GRANT til `authenticated` (select kun, til UI-visning) og `service_role` (alle ops)
  - RLS: admin select; service_role bypass
  - Index på `(status, created_at)` til polling
- Unique index på companies: `CREATE UNIQUE INDEX companies_name_kundenr_unique ON public.companies (lower(name), visma_id) WHERE visma_id IS NOT NULL AND visma_id <> ''`

### 2. Server-funktion til at lægge i kø
`src/lib/admin-companies.functions.ts`: ny `enqueueCvrEnrichment({ company_ids })` — chunker i 500 ad gangen og inserter én job-række pr. chunk. Kaldes fra Visma-importen i stedet for `enrichFn`.

### 3. Worker-endpoint
`src/routes/api/public/hooks/process-cvr-enrichment.ts` — POST handler:
- Verificér header `apikey` mod publishable key (eksisterende `/api/public/*`-mønster)
- Plukker op til 3 pending jobs (FOR UPDATE SKIP LOCKED, sætter status='processing')
- Kører eksisterende enrichCompaniesFromCvr-kerneflow direkte (refaktorer kernen ud til en delt `*.server.ts`-helper så både server-fn og endpoint kan kalde den)
- Markerer `done` eller `failed` med `last_error`; max 3 forsøg

### 4. Visma-import
`src/routes/_authenticated/admin.import.visma.tsx` linje ~1146:
- Erstat `enrichFn`-loopet med ét kald til `enqueueCvrEnrichment({ company_ids })`
- Toast: "Importen er færdig — 11.200 virksomheder beriges fra CVR i baggrunden"
- Lokationer + kontakter beholder fire-and-forget for nu (de kører hurtigere og hænger ikke på CVR-API)

### 5. UI — kø-status
- Lille badge på `/admin/import/visma` og `/admin/importhistorik`: "🟡 423 virksomheder venter på CVR-berigelse" (læser fra `cvr_enrichment_jobs` med status='pending'/'processing')
- Hvis nogen jobs er `failed`: rødt badge med "X fejlede — retry"

### 6. pg_cron-job
Via `insert`-tool (ikke migration — indeholder anon-key og URL):
```sql
SELECT cron.schedule('process-cvr-enrichment', '* * * * *', $$
  SELECT net.http_post(
    url:='https://project--b71c8e7d-6902-4ef2-ab3f-38be7c88bb6d.lovable.app/api/public/hooks/process-cvr-enrichment',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```

### 7. Oprydning af 7 forældreløse batches
Via `insert`-tool:
- Tjek først om de 2 `agreement`-batches stadig refererer til eksisterende aftaler (`agreements`-tabellen) — hvis ja, bevar deres `payload` link
- Slet alle 7 `import_batches`-rækker. (Companies/locations/equipment som batches refererede til er allerede slettet.)

## Rækkefølge når godkendt
1. Migration: ny tabel + unique index på companies (DB er tom, ingen konflikter)
2. Insert: oprydning af 7 batches + pg_cron-job
3. Kode: refaktor af enrichment-kerne, ny server-fn, nyt endpoint, opdater Visma-import, UI-badge
4. Du kører reimport → ser køen tømmes minut for minut

## Hvorfor pg_cron og ikke Inngest
- Inngest kræver connector-opsætning og ny SDK
- pg_cron er allerede dokumenteret stack-mønster
- Polling hvert minut + max 3 chunks pr. tick = ~1.500 virksomheder/minut → 11.200 virksomheder beriget på ~8 minutter
- Hele kø-tilstanden er synlig direkte i DB — let at debugge og retry'e
- Kan altid skifte til Inngest senere hvis behov

## Out of scope
- Lokationer/kontakter-berigelse til kø (kører hurtigt nok som fire-and-forget)
- Retry-UI med knap (kommer hvis behov opstår — automatisk retry op til 3 gange dækker det normale)
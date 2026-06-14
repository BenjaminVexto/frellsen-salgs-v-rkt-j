# Server-side salgsimport — mindste ændring

## Mål
Browseren skal kun uploade filen. Alt parse + aggregér + upsert flyttes til en pg_cron-dreven worker, præcis som CVR-køen. Status-badge viser `X / 233.086 månedsrækker`.

## Hvad eksisterer allerede (genbruges 1:1)
- `invoice_import_jobs` tabel med `status, total_monthly, total_top, saved_monthly, saved_top` → status-badge har allerede de felter den skal bruge.
- `parseAndAggregate()` i `src/lib/invoice-parse.ts` → ren JS (xlsx + papaparse), kører fint i Worker.
- `resolveDeliveryNos` + upsert-logik med `onConflict`-nøgler i `invoice-import.functions.ts` → flyttes til server-helper.
- CVR-worker `process-cvr-enrichment.ts` → kopieres som skelet.
- pg_cron + pg_net ekstensioner og kald-mønsteret.

## Den mindste ændring

### 1. Migration (én)
- Tilføj kolonner til `invoice_import_jobs`: `file_path text`, `phase text` (`uploaded` → `parsed` → `monthly_done` → `done`), `attempts int default 0`, `last_error text`, `aggregated_path text`.
- Tillad `status = 'pending'` (ny start-status, claim sætter `running`).

### 2. Privat storage-bucket
- Ny bucket `invoice-uploads` (private). RLS: kun admin må insert; service-role læser. Genbruger samme admin-check som de andre import-bucket policies.

### 3. UI: `admin.import.faktura.tsx` — radikalt forkortet
- Drop al klient-side aggregering/chunk-upload. Tilbage: vælg fil → upload til `invoice-uploads/{jobId}.xlsx` → kald ny `enqueueInvoiceImport({ jobId, filePath })` (sætter `status='pending'`, `phase='uploaded'`).
- Genbrug eksisterende job-watcher (polling af `invoice_import_jobs`) til at vise `saved_monthly / total_monthly`.

### 4. Worker-rute (kopi af CVR-mønsteret)
`src/routes/api/public/hooks/process-invoice-import.ts` — claim 1 job ad gangen, faseskift pr. tick (holder hver tick under 30s):

```text
phase=uploaded     → download fil, parseAndAggregate, gem JSON til storage,
                      sæt total_monthly/total_top, phase=parsed
phase=parsed       → resolveDeliveryNos, phase=monthly
phase=monthly      → upsert næste 2.000 monthly-rækker, +saved_monthly,
                      når saved>=total → phase=top
phase=top          → upsert næste 2.000 top_products, +saved_top,
                      når færdig → status=completed
```
Samme `apikey === SERVICE_ROLE_KEY` auth som CVR-workeren. Max 3 attempts pr. tick; fejl → `status='failed'`.

### 5. pg_cron schedule (via supabase--insert)
Hvert minut → POST mod `https://project--b71c8e7d-...lovable.app/api/public/hooks/process-invoice-import` (stabil produktions-URL).

### 6. Publicering — kritisk
Worker-ruten skal ind i `lovable.app` (production), ikke kun `id-preview--`. Efter implementation: publish + bekræft med en manuel POST mod production-URL'en før vi opretter cron-jobbet.

## Tekniske detaljer

- **Worker-budget**: Cloudflare worker tick ~30s. Parsing 233k linjer ≈ 8–12s, aggregering hurtig. Upsert i 2.000-rækkers chunks → ~120 ticks (~2 min realtid pr. fil) — acceptabelt.
- **Idempotens**: samme `onConflict`-nøgler bevares (`visma_delivery_no,period,product_group_1` / `visma_delivery_no,varenr`). Re-kørsel overskriver med samme værdier.
- **Genbrugt kode**: `parseAndAggregate` og delte dato-helpers importeres direkte i workeren — de er allerede isomorfe.
- **Firma-10-filter**: ligger allerede i `parseAndAggregate` (ALLOWED_FIRMA).
- **Top-deleted-flag**: bevares — workeren sletter eksisterende top_products for matchede locations før upsert i `phase=top`, præcis som klienten gjorde.

## Estimat
- Migration + bucket: 5 min
- Worker-rute (kopi + 5 fase-grene): 25 min
- UI-forenkling: 15 min
- pg_cron + publish + smoke-test mod production-URL: 10 min
- **I alt: ~1 time** før første live-import kører server-side.

## Filer der ændres / oprettes
- **Ny** migration: `invoice_import_jobs`-kolonner
- **Ny** storage-bucket + RLS-migration: `invoice-uploads`
- **Ny** `src/routes/api/public/hooks/process-invoice-import.ts`
- **Ny** `src/lib/invoice-import.server.ts` (delt logik flyttet fra `invoice-import.functions.ts`)
- **Slank** `src/lib/invoice-import.functions.ts` (kun `enqueueInvoiceImport`)
- **Slank** `src/routes/_authenticated/admin.import.faktura.tsx` (kun upload + watch)
- **pg_cron**: én `cron.schedule` via `supabase--insert`

Skal jeg implementere det?

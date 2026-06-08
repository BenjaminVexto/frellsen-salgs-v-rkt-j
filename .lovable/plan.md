## Mål

Erstat det Storage-baserede baggrundsjob med en klient-drevet chunk-upload. Browseren holder det aggregerede resultat i hukommelsen og sender det i bidder á 2.000 rækker til en server-fn, som upserter i interne batches á 500 direkte mod `sales_monthly` og `sales_top_products`. Ingen rå- eller aggregat-payload gemmes nogen steder.

## Flow

```text
Browser (parseAndAggregate i hukommelse)
   │  startJob()  ── opretter invoice_import_jobs (status=running, totals)
   │
   ├─ resolveLocations(visma_delivery_nos[])  → map: deliveryNo → {location_id, company_id}
   │
   ├─ for each chunk (2.000 rækker, monthly først, derefter top_products):
   │     uploadChunk(jobId, kind, rows)
   │        └─ server: opsplit i 500-batches, upsert med retry+backoff,
   │                   opdater invoice_import_jobs progress
   │     ← progress returneres → UI bar opdateres
   │
   └─ finalizeJob(jobId, summary) → status=completed
```

Browseren styrer rækkefølge og fejlhåndtering på chunk-niveau; serveren styrer batch-upserts inde i hver chunk.

## Database

Ingen schema-ændring. Behold `invoice_import_jobs` til progress-/statusvisning. Felter, der bruges:
- `status`: `running` | `completed` | `failed`
- `total_rows`, `saved_rows`
- `total_locations`, `matched_locations`, `unmatched_delivery_nos jsonb`
- `error_message`, `started_at`, `finished_at`

Felterne `payload`, `payload_path` bruges ikke længere af det nye flow. Vi lader dem stå (kompat med eksisterende rækker), men sætter dem ikke.

Storage-bucket `invoice-imports` ikke længere brugt. Vi rører den ikke i denne ændring.

## Server-fns (alle `requireSupabaseAuth` + admin-tjek)

I `src/lib/invoice-import.functions.ts`:

1. `startInvoiceImportJob({ totalMonthly, totalTopProducts, totalDeliveryNos })`
   - Indsætter ny række i `invoice_import_jobs` med `status='running'`, `total_rows = totalMonthly + totalTopProducts`, `saved_rows = 0`.
   - Returnerer `{ jobId }`.

2. `resolveDeliveryNos({ jobId, deliveryNos: string[] })`
   - Slår op i `locations` på `visma_delivery_no`.
   - Returnerer `{ map: Record<deliveryNo, { location_id, company_id }>, unmatched: string[] }`.
   - Skriver `total_locations`, `matched_locations`, `unmatched_delivery_nos` på jobbet.

3. `uploadSalesMonthlyChunk({ jobId, rows })` — `rows.length ≤ 2.000`
   - Splitter i 500-batches.
   - For hver batch: `supabaseAdmin.from('sales_monthly').upsert(batch, { onConflict: '<unik-nøgle>' })` med op til 3 retries og eksponentiel backoff (200ms, 600ms, 1800ms).
   - Efter hver succesfuld batch: `update invoice_import_jobs set saved_rows = saved_rows + <batchsize>`.
   - Returnerer `{ savedRows, failedRows }`.

4. `uploadSalesTopProductsChunk({ jobId, rows })` — samme mønster mod `sales_top_products`.

5. `finalizeInvoiceImportJob({ jobId, status, errorMessage? })`
   - Sætter `status`, `finished_at = now()`, evt. `error_message`.

Unik-nøgler bekræftes mod den eksisterende tabeldefinition før implementering (typisk noget i retning af `(location_id, year, month)` for monthly og `(location_id, year, month, item_no)` for top_products) og bruges som `onConflict`.

## Klient

I `src/routes/_authenticated/admin.import.faktura.tsx`:

1. Behold `parseAndAggregate()` + preview præcis som nu.
2. "Gem aggregeret data" knappen kører ny `runImport()`:
   - `startInvoiceImportJob` → `jobId`.
   - `resolveDeliveryNos` med alle unikke leveringsnumre.
   - Berig `monthly`- og `topProducts`-rækker i hukommelsen med `location_id` + `company_id` fra map'et; spring rækker over hvis ingen match (tælles i `unmatched`).
   - Loop chunks á 2.000:
     - `uploadSalesMonthlyChunk` → opdater progress-bar med returneret `savedRows`.
   - Loop chunks á 2.000:
     - `uploadSalesTopProductsChunk` → opdater progress-bar.
   - `finalizeInvoiceImportJob('completed')`.
3. UI:
   - Progress-bar (procent + `saved_rows / total_rows`).
   - Fase-tekst: "Matcher lokationer…" → "Gemmer månedsdata (x/y)…" → "Gemmer top-varer (x/y)…".
   - Ved fejl i en chunk: 3 retries på klient-niveau på toppen af server-retries; ved fortsat fejl `finalizeInvoiceImportJob('failed', message)` og vis fejl.
   - Fjern polling-koden (`getInvoiceImportJobStatus`-loop). Progress kommer nu direkte fra server-fn-svaret.
4. Bekræfter til brugeren ved succes: totaler, antal matchede lokationer, antal unmatched leveringsnumre, antal sprungne ugyldige rækker (Visma subtotaler).

## Oprydning

- Slet `src/routes/api/public/hooks/process-invoice-import.ts` (baggrundsjob ikke længere brugt).
- Fjern `getInvoiceImportJobStatus` hvis intet andet kalder den; ellers behold.
- Fjern Storage-upload-kode fra `startInvoiceImportJob`.
- Lad migrationen for `invoice-imports` bucket + `payload_path` kolonne stå (historik); ingen ny migration nødvendig.

## Hvad der ikke ændres

- `parseAndAggregate`, kolonnemapping, preview, filteret for ugyldige Visma-subtotalrækker.
- Skemaet for `sales_monthly` og `sales_top_products`.
- Resten af import-UI'et (filvælger, preview-tabel, totaler).

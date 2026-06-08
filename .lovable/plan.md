# Faktura/salgsdata-import med server-side aggregering

## Mål
Ny importtype der læser rå Visma fakturajournal (xlsx/csv, ~184k+ linjer, ISO-8859-1, ingen header, position-baseret) og aggregerer salgstal i to nye tabeller. Idempotent: kører man samme periode igen overskrives tallene. DB (contribution) er kun synligt for admin.

## Nye tabeller (migration)

**`sales_monthly`** — aggregeret pr. lev.nr. × måned × produktgruppe
- `id uuid pk`, `location_id uuid null fk locations`, `company_id uuid fk companies`
- `visma_delivery_no text not null`
- `period date not null` (1. i måneden)
- `product_group_1 text not null` (rå værdi, fx "2 [Kaffe]"; "0" beholdes)
- `revenue numeric`, `quantity numeric`, `contribution numeric`, `order_count int`
- `updated_at timestamptz default now()`
- UNIQUE `(visma_delivery_no, period, product_group_1)` → upsert
- Index på `(company_id, period)`, `(location_id, period)`

**`sales_top_products`** — top 15 varer pr. lokation (rullende 12 mdr)
- `id uuid pk`, `location_id uuid fk locations`, `visma_delivery_no text`
- `varenr text`, `description text`, `revenue numeric`, `quantity numeric`
- `updated_at timestamptz`
- UNIQUE `(visma_delivery_no, varenr)`

**RLS / GRANTs**
- GRANT SELECT,INSERT,UPDATE,DELETE til `authenticated`; ALL til `service_role`
- Policies: `authenticated` kan læse rækker hvor `can_access_company(auth.uid(), company_id)` returnerer true (genbrug eksisterende SECURITY DEFINER funktion). Top_products: via join på locations.company_id.
- `contribution` skjules ikke i DB — admin-only filtreres i UI/serverFn (server returnerer kun feltet hvis `is_admin`).

## Import-flow

### 1. UI: ny menupost i `admin.import.index.tsx`
- Tilføj kort "💰 Faktura/salgsdata" → ny route `/admin/import/faktura`

### 2. Ny route `src/routes/_authenticated/admin.import.faktura.tsx`
- Upload-felt (xlsx/csv), drag-drop, samme look som maskindata-import
- Sender filen base64-encoded til serverFn `importInvoiceJournal` (chunked upload hvis >5MB? — nej, send som FormData via server route i stedet for at undgå serverFn-størrelsesgrænse)

### 3. Server route `src/routes/api/public/hooks/import-invoice-journal.ts`
(Admin-only route med session-bearer check; eller bedre: brug en autentificeret serverFn route. Vi bruger `/api/...` ikke public — laver en almindelig auth-beskyttet TSS route.)

Faktisk: Brug **ikke** public. Brug en autentificeret TSS route `src/routes/api/admin/import-invoice.ts`:
- Læs `Authorization` header, validér via supabase, tjek `has_role(user, 'admin')`
- Modtag FormData med fil
- Parse, aggregér, upsert i baggrund (await færdig før response — frontend viser progress-runner via `importRunner`)

### 4. Parser (`src/lib/invoice-import.server.ts`)

**Filformat**: csv eller xlsx. For csv:
- Læs som bytes, decode ISO-8859-1 → UTF-8 (`new TextDecoder('iso-8859-1')`)
- Parse med `papaparse`: `delimiter: ' '`, `quoteChar: '"'`, `header: false`, `skipEmptyLines: true`
- For xlsx: brug `xlsx` lib (allerede i projektet via maskindata-import) — læs som array of arrays uden header

**Pr. linje (18 kolonner, 0-indekseret)**:
```
order_no = row[2]
date     = parseDate(row[3])    // DD-MM-YYYY eller ISO
delivery = row[4].trim()
varenr   = row[8]
desc     = row[9]
qty      = parseNum(row[10])
group1   = row[11] || "0"
revenue  = parseNum(row[15])
db       = parseNum(row[16])
```

**`parseNum`**: strip mellemrum, hvis indeholder både `.` og `,` antag dansk (1.234,56 → 1234.56); hvis kun `,` og 2 decimaler → dansk; ellers parseFloat.

**`parseDate`**: regex `^(\d{2})-(\d{2})-(\d{4})$` (DD-MM-YYYY) ellers `new Date(iso)`.

### 5. Aggregering (in-memory)

```ts
type Key = `${delivery}|${YYYY-MM-01}|${group1}`
map: Map<Key, { revenue, qty, db, orderSet: Set<string>, isInternalOnly: boolean }>
```

For hver linje:
- Hvis `revenue === 0 && db !== 0` → marker som intern service-postering: tæl `db` med i contribution, MEN tæl ikke order_no med i orderSet og spring revenue/qty over.
- Ellers: læg revenue/qty til, læg db til, tilføj order_no til Set.

Efter parsing: konvertér til rækker, `order_count = orderSet.size`.

### 6. Lookup location_id

- Hent alle relevante `locations` i én query: `select id, company_id, visma_delivery_no from locations where visma_delivery_no in (<unique set>)`
- Byg `Map<delivery_no, {location_id, company_id}>`
- For rækker uden match: log i preview-counter, spring upsert over.

### 7. Upsert i chunks á 500

```ts
for (chunk of chunks(rows, 500)) {
  await supabaseAdmin.from('sales_monthly').upsert(chunk, {
    onConflict: 'visma_delivery_no,period,product_group_1'
  })
}
```

**`sales_top_products`**: i samme job, beregn top 15 pr. lokation for seneste 12 mdr:
- Gruppér rå linjer på `(delivery, varenr)`, sum revenue/qty, hvor `date >= today - 12 months`
- For hver lokation: sortér efter revenue desc, behold top 15
- Slet eksisterende rækker for de berørte `visma_delivery_no` først (atomicity), så upsert

### 8. Response (preview-tal)

```json
{
  linesRead, locationsMatched, deliveryNosWithoutMatch: string[],
  totalRevenue, periodFrom, periodTo, monthlyRows, topProductRows
}
```

Frontend viser disse tal + liste over unmatched lev.nr. (begrænset til 50).

## Frontend-detaljer

- `importRunner.start("anden")` → progress fra fetch-stream eller fast polling
- Realistisk: vis "Uploader…" → "Aggregerer…" → "Gemmer X rækker…" → "Færdig"
- Vis ingen `contribution`-felter for ikke-admins (hentes ikke fra serverFn for non-admin)

## Performance

- 184k linjer → ~5–15k aggregerede `sales_monthly`-rækker → ~30 upsert-chunks
- Kør hele jobbet i selve request-handleren (Cloudflare Worker timeout: 30s for HTTP, men her bruger vi await indtil færdig). Hvis filen er for stor, kan vi senere splitte i Workers-baggrundsjob — første version: synkron.
- Stream filen aldrig ind via JSON; brug `request.formData()` for at undgå base64-blowup.

## Hvad der IKKE ændres
- Eksisterende importtyper, locations, companies, aktivitetslog, udstyr-bokse, virksomheds-/lokationsvisninger.
- Drill-down UI i virksomhedsvisning er ikke en del af dette plan — kun import + lagring. Brug af `sales_monthly`/`sales_top_products` i UI kommer i senere prompt.

## Filer der oprettes/ændres
1. Migration: `sales_monthly` + `sales_top_products` + indeks + RLS + GRANTs
2. `src/routes/_authenticated/admin.import.faktura.tsx` (ny)
3. `src/routes/_authenticated/admin.import.index.tsx` (tilføj kort)
4. `src/routes/api/admin/import-invoice.ts` (ny auth-beskyttet TSS route)
5. `src/lib/invoice-import.server.ts` (parser + aggregator)
6. (evt.) `src/lib/invoice-import.functions.ts` hvis vi vil have en serverFn-wrapper til status

## Åbne spørgsmål
- Skal jeg også bygge en simpel "se salgsdata pr. virksomhed"-visning nu, eller vente til senere prompt? (Planen ovenfor inkluderer KUN import + lagring.)

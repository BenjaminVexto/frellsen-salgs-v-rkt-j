# Visning af salgsdata

Tre visninger oven på eksisterende UI. Rolle-styret: sælgere ser omsætning/antal, admin ser desuden DB + DG.

## Delt fundament

### Ny serverFn `getSalesForCompany(companyId)` — `src/lib/sales.functions.ts`
- `requireSupabaseAuth` middleware
- Henter `sales_monthly` rows for company (RLS sikrer adgang). Returnerer rå rækker + admin-flag.
- `contribution` returneres KUN hvis brugeren er admin (filtreres serverside via `has_role`).
- Aggregerer ikke — UI laver alle udregninger fra rækkerne.

### Ny serverFn `getSalesForLocation(locationId)` — samme fil
- Henter `sales_monthly` for lokation + `sales_top_products` (top 15)
- Samme admin-filter på contribution

### Ny serverFn `getMyMonthlySales()` — for sælger
- Henter sum af `sales_monthly` for indeværende måned for virksomheder hvor `assigned_to = auth.uid()` ELLER assignet via `contact_list_assignments`
- Returnerer totalRevenue + count companies

### Ny serverFn `getMyChurningCustomers()` — for sælger
- Henter sælgerens tildelte companies med deres `sales_monthly`
- Filtrer: havde mindst 3 måneder med revenue tidligere, men ingen revenue seneste 60+ dage
- Returnerer top 10 efter historisk omsætning

### Delt komponent `SalesKpiStrip` — `src/components/sales/sales-kpi-strip.tsx`
- Inputs: `rows: SalesMonthlyRow[]`, `isAdmin: boolean`, `locationsTotal/active?`
- Beregner: omsætning 12 mdr, vs forrige 12 mdr (%), DB+DG (admin), sidste køb-dato, aktive lokationer
- 4 kort i grid, admin-kort har dashed border + ADMIN-badge

### Delt komponent `CategoryBars` — vandrette bjælker pr. `product_group_1` (top 5-6 + "Øvrigt")

### Delt komponent `RevenueSparkline` — 12-måneders søjler (simpel SVG/divs, ingen lib)

### Helper `parseProductGroup` — "2 [Kaffe]" → label "Kaffe", "0" → "Øvrigt/ukategoriseret"

## 1. Virksomhedskort — ny fane "Salg"

Fil: `src/routes/_authenticated/virksomheder_.$id.tsx`
- Tilføj "Salg" tab mellem eksisterende tabs (find tab-listen)
- Tab indhold:
  - `<SalesKpiStrip>` (4 kort: 12-mdr omsætning + trend-pil, DB+DG admin-only, sidste køb, aktive lokationer X/Y)
  - `<CategoryBars>`
  - `<RevenueSparkline>` 12 mdr
  - Salgssignal-amber-boks når sum seneste 3 mdr < samme 3 mdr året før (skjul hvis ingen 2025-data)
- Henter via `getSalesForCompany` + tæller lokationer fra eksisterende locations-query

## 2. Pr. lokation — udvid Lokationer-fane

Fil: `src/components/lokationer-sektion.tsx` (læs først)
- Tilføj `<LocationSalesStrip locationId>` over/ved udstyr-boksen for hver lokation
- Strip viser: Køb 12 mdr · Sidste køb · Top-kategori · (admin: DB + DG)
- Foldbar "Mest købte varer her" (Collapsible) → `sales_top_products` top 15 (beskrivelse, kr, antal) — default closed
- Tilføj sorterings-dropdown øverst i Lokationer-fane: "Omsætning (høj→lav)" som ekstra option
  - Kræver at vi henter `sales_monthly`-sum pr. lokation i én batch — ny serverFn `getLocationSalesSummary(locationIds[])` returnerer `{location_id, revenue12m, lastPurchase}[]`
  - Sortering ændrer rækkefølgen lokalt før rendering

## 3. Sælgerens overblik (Dashboard)

Fil: `src/routes/_authenticated/dashboard.tsx`

### Top: personlig hilsen
- "Godmorgen/Goddag/Godaften, [fornavn]" baseret på klokken
- Dato (da-DK lang format)
- "X opfølgninger i dag" — count af aktiviteter/opgaver med follow-up dato = i dag (genbrug eksisterende kilde hvis findes)

### ZONE "Din måned" (3 kort)
1. **Budget** — placeholder hvis ingen budget-data for sælger:
   - "Sæt et månedsmål for at se fremdrift"
   - Når data findes: progress bar + "X% af [mål] kr." + forventet-marker (dag i måneden / dage i måneden) + "På sporet"/"Bagud"
   - Budgets-tabel findes ikke endnu — vi viser placeholder + lille note "(kommer)". Ingen migration i denne prompt.
2. **Nye aktiviteter denne måned** — count fra `activities` hvor `created_by = auth.uid()` AND created_at i denne måned
3. **Min omsætning denne måned** — fra `getMyMonthlySales`

### ZONE "Dagens arbejde"
- Behold eksisterende kort uændret
- Tilføj nyt kort **"Kunder på vej væk"** via `getMyChurningCustomers`
  - Liste: virksomhedsnavn (Link til /virksomheder/$id) + "intet køb N dage · før: ~X køb/md"
  - Tomt: "Ingen kunder på vej væk lige nu — godt arbejde 🌱"
  - Skjul/vis placeholder hvis ingen 2025-data findes (count = 0 + ingen historik)

## Rolle-detektion
- Genbrug `useAuth().role === "admin"` i komponenterne
- Server-side: tjek `has_role(userId, 'admin')` før contribution returneres

## Filer der oprettes
- `src/lib/sales.functions.ts` — alle serverFns
- `src/lib/sales-utils.ts` — `parseProductGroup`, KPI-udregninger
- `src/components/sales/sales-kpi-strip.tsx`
- `src/components/sales/category-bars.tsx`
- `src/components/sales/revenue-sparkline.tsx`
- `src/components/sales/sales-signal-box.tsx`
- `src/components/sales/location-sales-strip.tsx`
- `src/components/sales/company-sales-tab.tsx`
- `src/components/sales/churning-customers-card.tsx`
- `src/components/sales/personal-greeting.tsx`
- `src/components/sales/budget-card.tsx`
- `src/components/sales/my-month-zone.tsx`

## Filer der ændres
- `src/routes/_authenticated/virksomheder_.$id.tsx` — ny tab "Salg"
- `src/components/lokationer-sektion.tsx` — strip + collapsible + sortering
- `src/routes/_authenticated/dashboard.tsx` — greeting + Din måned-zone + Kunder på vej væk

## Hvad der IKKE ændres
- Eksisterende faner/sektioner, udstyr-bokse, sidebar, Visma-data-blok, aktivitetslog, AI-briefing, andre dashboardkort.
- Ingen DB-ændringer (budgetter er placeholder; tabel kan tilføjes i senere prompt).

## Performance-noter
- Virksomhedsside: én serverFn-kald → typisk <500 rækker (én virksomhed × 12 mdr × ~10 grupper)
- Dashboard: church-customers-fn kan blive tung; begrænser til sælgerens tildelte companies (typisk <500) og laver én `sales_monthly`-query med `IN`-filter
- Lokations-sortering: én batch-query for alle synlige lokationer (typisk <50)

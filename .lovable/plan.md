# Plan — "Sidste køb" på Salg-fanen

## Diagnose (kørt mod live DB lige nu)

Ejner Hessel A/S (`86e25023…`):

```
period      | revenue
2025-04-01  |  48.552
…
2026-01-01  | 265.012
2026-02-01  |  83.933
2026-03-01  |  62.662
2026-04-01  | 152.741
2026-05-01  |  73.581
2026-06-01  |       0   (4 rows, alle revenue=0 — sandsynligvis kreditnota/service)
```

Konklusioner:

1. **2026-data er IKKE overskrevet.** Alle måneder 2026-01 … 2026-06 har egne rækker.
2. **Period-nøglen indeholder allerede år.** Unique-index er:
   `sales_monthly_unique (visma_delivery_no, period, product_group_1)`
   hvor `period` er en `date` (`2026-04-01` osv.). Ingen rod-årsag der.
3. **`companies.last_purchase_date` = `2026-06-01`** → sidebar "1. jun." er korrekt.
4. **`MAX(period) WHERE revenue>0` = `2026-05-01`** → KPI "Sidste køb" bør vise `maj 2026`. Ikke `mar. 2026`.

Med andre ord: skemaet og data er konsistente. "mar. 2026" matcher ikke nuværende DB-tilstand — det peger på en **stale React Query-cache** i din browser (siden 2026-importen blev færdiggjort efter screenshottet).

## Foreslåede ændringer (små, præsentations-lag)

Selv efter cache-refresh er der to reelle små uoverensstemmelser tilbage:

### A. Salg-fanen og sidebar uenige om "sidste køb"

- Sidebar bruger `companies.last_purchase_date` = `2026-06-01` (rå Visma-felt).
- Salg-fanen bruger `lastPurchasePeriod(rows)` som filtrerer `revenue > 0` væk → returnerer `2026-05-01`.

Fix: lad `lastPurchasePeriod` betragte en måned som "købsmåned" hvis **`revenue > 0` ELLER `quantity > 0` ELLER `order_count > 0`**. Så fanges service-/kreditnota-måneder (juni 2026) også, og fanen lander på `jun 2026` ligesom sidebaren.

Fil: `src/lib/sales-utils.ts` — udvid betingelsen i `lastPurchasePeriod`.

### B. Falsk "Faldende omsætning"-advarsel (forebyggelse)

Med korrekt data udløses den ikke i dag (apr+maj+jun 2026 = 226k > apr+maj+jun 2025 = 148k). Men logikken sammenligner blindt "seneste 3 kalender-mdr." vs. samme periode året før — hvis den nyeste måned er en service-/0-måned (som juni 2026), trækker den gennemsnittet ned.

Fix: kræv at YoY-sammenligningen har **mindst 2 måneder med faktisk omsætning** i recent-vinduet, ellers vis ikke advarslen. Forhindrer falske positiver i månedsovergange.

Fil: `src/components/sales/sales-signal-box.tsx`.

## Hvad der IKKE ændres

- Ingen migration. `sales_monthly`-skemaet er allerede korrekt (period = fuld dato, unique inkl. år).
- Ingen re-import nødvendig.
- Kategori-fordeling, KPI-omsætning, sparkline, sales-allocation: urørt.

## Næste skridt for dig

1. Hard-refresh `/virksomheder/86e25023…` (cmd/ctrl-shift-R). Hvis "Sidste køb" nu viser `maj 2026` og ingen advarsel — så var det udelukkende cache.
2. Sig til hvis du vil have ovenstående A+B fix oveni, så fanen og sidebaren altid matcher.

Bekræft inden jeg implementerer: skal A+B med, eller stopper vi her efter diagnosen?

## Mål
Tøm kundekartoteket helt, kør Visma-import på ny, og kør derefter maskindata-import (begge filer) — så systemet afspejler de nyeste udtræk 1:1.

## Vigtigt at vide før vi starter
Når vi sletter `companies`, ryger følgende afhængige data med (cascade eller via samme rensning):
- `locations` (inkl. `location_equipment_units`)
- `contacts`
- `activities`, `company_briefings`, `company_documents`
- `contact_list_assignments`
- `sales_opportunities`, `quotes`
- `competitor_assignments`

Det betyder: noter, aktiviteter, kontaktlister-tildelinger, salgsmuligheder, tilbud, dokumenter og konkurrentaftaler **forsvinder**. Kontaktlisterne (`contact_lists`), konkurrenterne (`competitors`), aftalerne (`agreements`) og brugerne bevares.

Hvis det er for hårdt, sig til — så kører vi i stedet ren upsert på `visma_id` uden sletning.

## Fremgangsmåde (når du siger go)

### Trin 1 — Backup-snapshot (sikkerhedsnet)
Jeg dumper en CSV med antal pr. tabel før sletning, så vi kan verificere genimporten bagefter:
- companies, locations, contacts, activities, contact_list_assignments, sales_opportunities, competitor_assignments, location_equipment_units

### Trin 2 — Hard reset af kundedata
Én SQL-kørsel der i rækkefølge tømmer:
```text
location_equipment_units → locations → contacts → activities →
contact_list_assignments → sales_opportunities → quotes →
competitor_assignments → company_briefings → company_documents →
companies
```
Trigger'en `ensure_primary_location` sikrer at hver ny company automatisk får én lokation = Visma kundenr/leveringsnr ved næste import (den ændring vi lavede tidligere).

### Trin 3 — Visma-kundeimport
Du går til **Admin → Import → Visma-import**, uploader nyeste Visma-CSV og kører importen. Hver række opretter:
- 1 row i `companies`
- 1 row i `locations` (automatisk via trigger, så alle har minimum én lokation)

### Trin 4 — Maskindata-import (begge filer)
Du går til **Admin → Import → Maskindata**, uploader begge XLSX-filer (leje/udlån + serviceaftaler) og trykker Importér. Importen er idempotent: den matcher på `Lev. kundenr` → company/location, nulstiller `location_equipment_units` på berørte lokationer, og indsætter enhederne på ny. Adresselinje 2 / Placering gemmes som sub-placering pr. enhed.

### Trin 5 — Verifikation
Jeg kører hurtigt op antal pr. tabel + stikprøver:
- Antal companies vs. forventet fra Visma-fil
- Andel companies uden lokation (skal være 0)
- Antal `location_equipment_units` opdelt på filtre/maskiner
- 3-5 stikprøver på lokationer hvor vi tidligere så fejl, for at bekræfte at adresselinje 2 / placering vises korrekt på Lokationer-fanen

## Teknisk (kan springes over)
- Sletning sker via `supabase--insert`-tool (DELETE) i én samlet transaktion — ikke en migration, da det er data-operation.
- Visma- og maskindata-import bruger eksisterende serverfunktioner (`processVismaImport`, `processEquipmentImport`); ingen kodeændringer nødvendige.
- `ensure_primary_location`-trigger er allerede på plads fra tidligere migration (20260601064454_…).
- Ingen kodeændringer i denne plan — kun data-operationer + manuelle uploads.

## Hvad jeg behøver fra dig før Trin 1
1. Bekræft at du har Visma-CSV'en + de to maskindata-XLSX'er klar lokalt.
2. Bekræft at du accepterer tab af aktiviteter, noter, kontaktliste-tildelinger, salgsmuligheder, tilbud, dokumenter og konkurrentaftaler.

Når du svarer "kør", starter jeg med Trin 1 + 2 og guider dig gennem Trin 3 og 4.
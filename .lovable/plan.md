# Skift grupperings-nøgle: CVR → Fakt. kunde (visma_id)

## Mål
Én virksomhed = én Fakt. kunde (visma_id). Lev. kund (visma_delivery_no) = lokation under virksomheden. CVR = berigelse, aldrig nøgle.

## 1) Database

**Migration** (`supabase/migrations/...`):
- Tilføj `UNIQUE (visma_id) WHERE visma_id IS NOT NULL` på `companies`.
- Konsolidér eksisterende duplikater:
  - For hver `visma_id` med >1 companies: vælg "canonical" = den hvor en lokation har `visma_delivery_no = visma_id` (primær), fallback laveste `created_at`.
  - Flyt `locations`, `activities`, `contacts`, `agreements`, `contact_list_assignments`, `sales_opportunities`, `company_documents`, `company_briefings`, `location_equipment_units` (via location), `notifications`, `quotes` til canonical company_id.
  - Berig canonical med CVR/adresse/navn fra primær-record hvis tomt.
  - Slet de tomme dubletter.
- Sørg for at `locations.visma_delivery_no` er unik pr. company_id (allerede tilfældet via upsert-nøgle — verificér constraint).
- Markér lokation som `is_primary=true` hvor `visma_delivery_no = companies.visma_id`.

## 2) Import-flow (`admin.import.visma.tsx` + `admin.import.anden.tsx`)

Skift `companyKey()` fra `(lower(name), visma_id)` → `visma_id` alene:
- Dedup-opslag: `select companies where visma_id IN (...)` — match på visma_id only.
- Navn/CVR/adresse på company tages fra hoved-record (`Lev. kund == Fakt. kunde`), fallback laveste Lev. kund.
- Rækker uden visma_id → falder tilbage til navn-baseret nøgle (som i dag, edge case).
- Lokationer bygges uændret pr. unik `visma_delivery_no` under company_id.

## 3) CVR-håndtering
- CVR fjernes som grupperings-nøgle overalt.
- Frellsen-blocklist (25340604) bevares — CVR sættes bare ikke på company.
- Søsterselskaber: query på `cvr` på tværs af `visma_id` (forslag, ikke auto-merge) — eksisterende UI bevares.

## 4) Salgs-kobling
- Salgsfilens `Kundenr` = `visma_delivery_no` → lokation → company via `location.company_id`. Allerede korrekt, verificeres efter migration.

## 5) Bevares uændret
Bindingsstatus-logik, udstyrs-bokse, salgsvisning, statuslogik, Frellsen-blocklist, CVR-berigelse, søsterselskabs-forslag.

## Tekniske detaljer

**Filer:**
- ny migration: konsolidering + unique constraint
- `src/routes/_authenticated/admin.import.visma.tsx` — `companyKey()` + dedup-opslag
- `src/routes/_authenticated/admin.import.anden.tsx` — samme
- evt. `src/lib/admin-companies.functions.ts` hvis det rører dedup

**Konsoliderings-SQL (skitse):**
```sql
WITH dup AS (
  SELECT visma_id, array_agg(id ORDER BY 
    (EXISTS(SELECT 1 FROM locations l WHERE l.company_id=c.id AND l.visma_delivery_no=c.visma_id)) DESC,
    created_at ASC) ids
  FROM companies c WHERE visma_id IS NOT NULL GROUP BY visma_id HAVING count(*)>1
)
-- canonical = ids[1]; for each other id, UPDATE child tables SET company_id = canonical, DELETE company
```

## Verifikation
- Aalborg Handelsskole: 1 virksomhed, 7 lokationer efter re-import.
- 16.091 unikke virksomheder forventet ved fuld re-import af kundedata.
- Salg ruller stadig korrekt op fra lokation til virksomhed.

## Risiko
Migration er destruktiv (sletter dublet-companies). Foreign keys til companies skal alle re-pointes først — kortlæg alle FK'er i migrationen før delete.

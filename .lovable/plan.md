## Problem
Ejner Hessel viser to "Primær"-badges (Jyllandsvej 4 / lev.nr 1469800 og Københavnsvej 277 / lev.nr 1469817). Reglen er: **primær lokation = den hvor `visma_delivery_no` = virksomhedens Visma kundenr.**

## Årsag
I `src/routes/_authenticated/admin.import.visma.tsx` linje 955 sættes `is_primary` pr. række til:
```ts
is_primary: row.faktKunde !== null && row.faktKunde === row.delivery
```
Det betyder at **enhver** leveringsadresse, hvor leveringsnr tilfældigvis er sin egen fakturakunde (fx Roskilde-afdelingen 1469817 = fakKunde 1469817), markeres som primær. Resultatet: 2+ primære lokationer pr. virksomhed.

Trigger'en `ensure_primary_location` opretter desuden allerede én primær ved company-INSERT (med `visma_delivery_no = company.visma_id`), så den korrekte primær findes typisk allerede.

## Plan

### 1. Ret Visma-import (kode)
I `admin.import.visma.tsx` linje ~955: ændr `is_primary`-logikken til at sammenligne med **virksomhedens** kundenr i stedet for rækkens fakKunde. Konkret: sæt `is_primary: row.delivery === companyVismaId` hvor `companyVismaId` slås op via `cvrToCompanyId`/companies. Hvis tre er falske og trigger'en allerede har lavet én primær, beholdes den; ingen kommer i konflikt.

### 2. Data-fix på eksisterende rækker
Én UPDATE der for hver company:
- Sætter `is_primary = false` på alle dens lokationer
- Sætter `is_primary = true` på den ENE lokation hvor `visma_delivery_no = companies.visma_id` (fallback: `visma_delivery_id`)
- Hvis ingen lokation matcher (kan ske ved ufuldstændig import), sættes primær på ældste lokation som fallback

### 3. Bonus-garanti (valgfri, men anbefales)
Tilføj partial unique index så DB håndhæver max én primær pr. company:
```sql
CREATE UNIQUE INDEX locations_one_primary_per_company
ON public.locations(company_id) WHERE is_primary;
```
Forhindrer fremtidige regressioner.

### 4. Verifikation
- Query: `SELECT company_id, COUNT(*) FROM locations WHERE is_primary GROUP BY 1 HAVING COUNT(*) > 1` → skal returnere 0 rækker
- Spot-check Ejner Hessel: kun Jyllandsvej 4 må vise "Primær"

## Filer der røres
- `src/routes/_authenticated/admin.import.visma.tsx` (1 linje + opslag af companyVismaId)
- Data-UPDATE via supabase--insert
- Evt. migration for unique index

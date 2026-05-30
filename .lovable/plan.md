## Mål

I dag registreres kun virksomheds-imports (Visma, CVR, anden fil, aftale-emner) i `import_batches`-tabellen, og det er kun virksomheder der kan slettes derfra. Maskindata-import og oprettelse af aftaler (`agreements`) registreres slet ikke. Vi gør `import_batches` generisk så alle importtyper logges og kan rulles tilbage fra **Admin → Importhistorik**.

## Database

Migration på `public.import_batches`:

- Ny kolonne `kind text NOT NULL DEFAULT 'companies'` med CHECK i (`companies`, `maskindata`, `agreement`).
- Ny kolonne `item_count int NOT NULL DEFAULT 0` (bruges generelt; `company_count` beholdes for bagudkompatibilitet, men ny kode skriver til `item_count`).
- Ny kolonne `payload jsonb` til at gemme rollback-information:
  - **maskindata**: snapshot af `locations.equipment_*`-felter før importen (pr. lokation), så reset kan ramme præcis de berørte lokationer.
  - **agreement**: `{ agreement_id }` så vi kan slette den oprettede aftale + dens dokument.
  - **companies**: tom (eksisterende `import_batch_id` på `companies` styrer fortsat sletning).
- Gamle rækker får `kind='companies'` via default.

## Backend (`src/lib/admin-companies.functions.ts`)

- `listImportBatches` returnerer nu også `kind` og `item_count`, og filtrerer "tomme" batches pr. type:
  - `companies`: som i dag (kræver mindst én tilknyttet virksomhed).
  - `maskindata` / `agreement`: vis altid, indtil batch slettes.
- Ny `getImportBatchDetails(batch_id)` returnerer typeafhængig payload:
  - `companies` → eksisterende untouched/partial/active breakdown.
  - `maskindata` → liste over berørte lokationer + virksomhedsnavne (fra payload-snapshottet).
  - `agreement` → aftalens navn, gyldighed, dokument-filnavn.
- Ny `deleteImportBatch(batch_id)`:
  - `companies` → kald eksisterende `deleteBatchGroup`-logik for alle grupper når admin bekræfter (alternativt: behold de eksisterende per-gruppe-knapper og lad denne være for non-companies).
  - `maskindata` → genskriv `locations.equipment_*` ud fra payload-snapshot, slet batch-rækken.
  - `agreement` → slet storage-objekt (`agreement-documents/<path>`), slet `agreements`-rækken, slet batch.

## Wire imports til at oprette batches

- **`src/lib/equipment-import.functions.ts` (`processEquipmentImport`)**: før writes hentes nuværende equipment-felter for hver lokation der vil blive rørt; gem som payload, opret `import_batches`-række med `kind='maskindata'`, `filename` = "Maskindata (leje + service)", `item_count` = antal opdaterede/oprettede lokationer.
- **`src/lib/agreements.functions.ts` (create-aftale-funktionen)**: efter aftale + dokument er gemt, opret `import_batches`-række med `kind='agreement'`, `filename` = aftalens navn, `payload = { agreement_id }`.
- **Aftale-emner (`admin.import.aftale-emner.tsx`)**: bruger allerede `createImportBatch` for virksomheder — uændret, men kontaktlisten nævnes i `filename` så den er let at genkende.

## UI (`src/routes/_authenticated/admin.importhistorik.tsx`)

- Tabellen får en **Type**-kolonne (badge: "Virksomheder" / "Maskindata" / "Aftale"). Kolonnen "Virksomheder" omdøbes til "Antal" og viser `item_count`.
- Detaljevisningen forgrener på `kind`:
  - `companies`: uændret (untouched / partial / active + per-gruppe-sletning).
  - `maskindata`: kort med liste over berørte lokationer + én "Rul maskindata-import tilbage"-knap (genskriv snapshot).
  - `agreement`: kort med aftalens metadata + "Slet aftalen og dokumentet"-knap.
- Sletning bag `AlertDialog` med tydelig advarsel pr. type.

## Teknisk

- Ingen ændringer i RLS — alt går via `supabaseAdmin` i server functions bag `ensureAdmin`.
- Storage-sletning for aftaledokumenter sker via `supabaseAdmin.storage.from('agreement-documents').remove([path])`.
- Eksisterende rækker i `import_batches` får automatisk `kind='companies'` så historikken er intakt.

## Filer der ændres

- Migration (ny kolonner på `import_batches`).
- `src/lib/admin-companies.functions.ts` (list/detail/delete + nye typer).
- `src/lib/equipment-import.functions.ts` (opret batch + snapshot).
- `src/lib/agreements.functions.ts` (opret batch ved create-aftale).
- `src/routes/_authenticated/admin.importhistorik.tsx` (type-kolonne + per-type detaljer).

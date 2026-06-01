## Mål

På virksomhedens Lokationer-fane skal hver lokation vise sine maskiner og filtre på enhedsniveau (serienr + sub-placering), grupperet pr. maskintype og talt sammen — i stedet for det nuværende aggregerede "Udstyr (Visma)"-resumé.

## Datamodel

**Ny tabel `location_equipment_units`** — én række pr. importeret enhed:

| Felt | Type | Beskrivelse |
|---|---|---|
| `id` | uuid PK | |
| `location_id` | uuid → locations | |
| `source` | text | `'rental'` (fil A) eller `'service'` (fil B) |
| `is_filter` | bool | true hvis beskrivelse/maskintype matcher filter-nøgleord |
| `machine_type` | text | Beskrivelse (fil A) / Maskin type (fil B) |
| `serial_no` | text | SerienrWit / Serie.nr. (kan være tom) |
| `sub_location` | text | Adresselinje 2 / Placering — vises som undertekst |
| `agreement_type` | text | Udlånstype / Aftaletype, kort form |
| `is_free_loan` | bool | true ved "Leje u/b", "Udlån", "Midlertidigt", "Prøveopsætning" |
| `has_service_contract` | bool | true for rækker fra service-filen |
| `varenr` | text | kun fra fil A |
| `import_batch_id` | uuid | reference til import_batches |
| `created_at` | timestamptz | |

**Filter-klassifikation:** `is_filter = true` hvis machine_type (lowercased) indeholder ét af: `brita`, `purity`, `flowmeter`, `iq meter`, `filterkurv`. Alt andet er en maskine. Erstatter den gamle FILTER_KEYWORDS-liste i import-funktionen.

RLS: samme mønster som `locations` — alle authenticated kan læse; admin sletter; import-koden bruger service role.

## Import-ændringer (`equipment-import.functions.ts` + `admin.import.maskindata.tsx`)

1. **Parser** i `admin.import.maskindata.tsx`: udvid `RentalRow`/`ServiceRow` med `adresselinje2` (fil A) og `placering` (fil B). Felterne læses fra `"Adresselinje 2"` hhv. `"Placering"`.
2. **Server-fn `processEquipmentImport`**:
   - Behold eksisterende lokationsmatching pr. `lev` (kundenr) — *lokationsidentitet ændrer sig ikke*.
   - For hver matchet/oprettet lokation: opbyg listen af enheder fra fil A + fil B med klassifikation ovenfor.
   - **Idempotent erstatning:** Saml `affectedLocationIds`. Inden insert: `DELETE FROM location_equipment_units WHERE location_id IN (…)`. Derefter bulk-insert nye enheder med `import_batch_id`.
   - Aggregerede tal på `locations` (equipment_frellsen_owned, equipment_filters osv.) opdateres fortsat som i dag — øvrige skærme afhænger af dem.
3. **`resetEquipmentData`**: udvides til også at `DELETE FROM location_equipment_units` for alle lokationer.

## UI-ændringer (`lokationer-sektion.tsx`)

`EquipmentBox` skrives om:

1. Hent `location_equipment_units` for åbnet lokation (lazy: kun når rækken foldes ud).
2. Split i `machines` (is_filter=false) og `filters` (is_filter=true).
3. **Hvis `machines.length > 0`:**
   - Gruppér maskiner efter `machine_type` → vis fx `Wittenborg 9100 2xB2C ×6` som overskrift.
   - Undertekst: unikke `sub_location`-værdier komma-separeret.
   - Badges pr. gruppe: `Serviceaftale` (hvis nogen i gruppen har `has_service_contract`), `Gratis udlån` (hvis nogen har `is_free_loan`).
   - Klikbar/foldbar → liste af enkelt-enheder: `Serienr · sub_location · aftaletype`.
   - Diskret grå footer-linje hvis `filters.length > 0`: `inkl. N filtre (gratis udlån)` (gratis-udlån-noten kun hvis nogen filter har `is_free_loan`).
4. **Hvis `machines.length === 0` og `filters.length > 0`:**
   - Vis hvert filter (eller filter-gruppe pr. type) som egen linje med badge `Filteraftale` og tekst `Kundeejet maskine · filter lejet af os`.
5. Behold eksisterende `sales_signal`-banner (bygges fortsat på de aggregerede tal).
6. Fjern den gamle "Udstyr (Visma)"-resumé-tekst (`equipment_summary`) — erstattes af den nye visning.

## Filer der ændres

- `supabase/migrations/<ny>.sql` — opretter `location_equipment_units` + indeks + RLS + GRANTs.
- `src/lib/equipment-import.functions.ts` — udvid input-skema, klassifikation, idempotent erstatning af enheder, ryd ved reset.
- `src/routes/_authenticated/admin.import.maskindata.tsx` — udvid `parseRentalRows`/`parseServiceRows` til at læse Adresselinje 2 / Placering.
- `src/components/lokationer-sektion.tsx` — ny `EquipmentBox` der grupperer pr. maskintype, viser filter-undertekst eller filter-linjer.

## Out of scope

- Ingen ændring af lokations-tabellens identitet (Adresselinje 2 forbliver pr. enhed, ikke pr. lokation).
- Ingen ændring af salgsintelligens, kontaktlister eller andre skærme der bruger `locations.equipment_*`-felterne.
- Ingen ny historik for udskiftede enheder — re-import nulstiller blot enhedslisten på berørte lokationer.

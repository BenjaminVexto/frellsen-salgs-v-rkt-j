## Ændringer på /virksomheder → Filtre

### 1. "Binding" → "Kundetype"
Ren UI-omdøbning. Filterets værdier (Frit salg / Offentlig aftale / Intern-privat / Ukendt) og den underliggende kolonne `binding_status` bevares uændret — det er kun labelen i filterpanelet der ændres.

### 2. Maskinstatus — nyt, korrekt filter
Det nuværende "Maskinstatus" filtrerer på tekstfeltet `companies.customer_segment_2`, som ikke afspejler de maskiner der reelt er uploadet via maskinlister. Det erstattes af et filter der ser på `location_equipment_units` (joinet via `locations.company_id`).

**Nyt filter "Maskiner" (multi-select, OR-logik):**
- Har leje-maskiner — `agreement_type` indeholder "Leje" og `is_free_loan = false`
- Har gratis udlån — `is_free_loan = true`
- Har serviceaftale — `has_service_contract = true`
- Ingen registreret maskine — virksomheden har ingen rækker i `location_equipment_units`

Filteret er additivt: vælger man flere, vises virksomheder der matcher mindst én.

**Maskintype (valgfri sekundær filtrering):**
Et fritekst-søgefelt "Maskintype indeholder…" der matcher på `machine_type` (case-insensitive substring, fx "Bonamat", "Rex-Royal", "Wittenborg"). Grunden er at `machine_type` i dataen er fulde produktnavne (fx "Bonamat B20 HW L/R/2") — der findes ikke en ren kategori-kolonne, så en dropdown med faste typer ville være misvisende. Fritekst er den ærlige løsning indtil maskiner evt. får en kategori.

### Tekniske detaljer

- Filer: kun `src/routes/_authenticated/virksomheder.tsx`.
- `FilterState`: omdøb intern `machineStatus` → `machines: string[]`, tilføj `machineTypeQuery: string`. `binding` beholder sit navn (kun label ændres).
- Data-load: efter `rows` er hentet, lav én batched select på `locations(id, company_id)` + `location_equipment_units(location_id, agreement_type, is_free_loan, has_service_contract, machine_type)` for de viste company-ids og byg et `Map<companyId, EquipmentSummary>` i state. EquipmentSummary er pr. virksomhed: `{ hasLeased, hasFreeLoan, hasService, hasAny, machineTypes: string[] }`.
- Filter-prædikat: erstat `matchesMachineStatus(customer_segment_2,…)` med `matchesMachines(equipmentMap.get(r.id), filters.machines)` + en `machineTypeQuery`-substring-check.
- Fjern `customer_segment_2` fra select-listen og `Row`-typen hvis det ikke bruges andre steder (det bruges kun her).
- `DEFAULT_FILTERS`, `isFilterActive`, filter-template apply/save og reset opdateres til de nye felter.
- Behold bagudkompatibilitet for gemte `filter_templates`: ved load, map evt. gammel `machineStatus` til den nye `machines` (`leased`→"leased", `none`→"none", ellers ignorer).

### Spørgsmål før build
Du nævnte også "selv ejer". Det findes der ikke et tydeligt signal for i `location_equipment_units` — alle rækker er aftaler (leje / udlån / service). Hvis en virksomhed ejer sin egen maskine, er den typisk slet ikke i listen. Derfor er "Ingen registreret maskine" det tætteste vi kommer — som ofte betyder "ejer selv eller har slet ingen". Skal jeg:
- (A) bruge "Ingen registreret maskine" som proxy for "ejer selv", eller
- (B) tilføje et eksplicit "Ejer selv"-felt på virksomheden (kræver migration + manuel pleje)?

Plan ovenfor antager (A). Sig til hvis du vil have (B) i stedet.

# Mål

Genbrug det fulde filtersæt fra `/virksomheder` i "Opret kontaktliste → Tilføj virksomheder", så de to altid har identiske filtermuligheder. Svar på spørgsmålet: **ja, det kan gøres som én delt komponent — og det er den rigtige vej.**

## Tilgang: én delt komponent

Jeg udtrækker tre ting til `src/components/company-filter/`:

1. **`types.ts`** — `FilterState`, `DEFAULT_FILTERS`, `EquipmentSummary`.
2. **`use-company-filter.ts`** — hook der henter `companies`, `locations`-map, `equipment`-map, `assignment`-map, kommune-liste, sælgere; eksponerer `rows`, `filtered`, `matchedIds`, `q`, `setQ`, `filters`, `setFilters`, `isFilterActive`, `loading`. Indeholder al filterlogik (`matchesMachines`, `matchesLastPurchase`, `matchesEmployees`, fritekstsøgning på navn/CVR/by/postnr/lokationer).
3. **`company-filter-panel.tsx`** — UI'et: søgefelt + collapsible filterpanel med alle 9 grupper (Kundestatus, Kilde, Tildeling, Maskiner + Maskintype, Geografi inkl. by/kommune/postnr-spænd, Seneste varekøb, Antal ansatte, Kundetype/binding). Tager `filters`, `setFilters`, `q`, `setQ`, `sellers`, `municipalities`, `templates?`, `isAdmin` som props.

Begge sider importerer disse. Fremtidige filterændringer rammer kun ét sted.

## Ændringer pr. fil

### Nye filer
- `src/components/company-filter/types.ts`
- `src/components/company-filter/use-company-filter.ts`
- `src/components/company-filter/company-filter-panel.tsx`
- `src/components/company-filter/index.ts` (re-eksport)

### `src/routes/_authenticated/virksomheder.tsx`
- Fjern lokal `FilterState`, `DEFAULT_FILTERS`, `EquipmentSummary`, alle `useEffect`-loaders, `matches*`-helpers og `FilterGroup`.
- Brug `useCompanyFilter()` + `<CompanyFilterPanel />`.
- Behold paginering, multiselect, bulk-bar, AssignToList/Reassign/SaveTemplate-dialoger.

### `src/routes/_authenticated/kontaktlister.tsx` (`OpretListeDialog`, step 2)
- Slet hele det gamle filtersæt (`searchTerm`, `filterIndustry`, `filterCity`, `filterMunicipality`, `filterCustomerTypes`, `filterUnassigned`, `filterMachine`, `filterSector`, `minEmployees`, `applyFilters`, `runSearch`).
- Brug `useCompanyFilter()`. Klient-side filtrering på fuld `companies`-liste — samme model som virksomhedslisten. Ingen "Søg"-knap længere; filteret er live.
- Behold:
  - Step 1 (navn, sælger, formål)
  - Fritekstsøgning på navn **og CVR** (kommer fra delt søgefelt, som allerede dækker begge)
  - "Vælg alle X virksomheder der matcher dit filter (ikke kun de viste)" — bind til `filtered` fra hooken
  - `CustomerStatusLegend` ("Sådan beregnes kundestatus") vises under filterpanelet
  - Preselect via `preselectedCompanyIds` (CVR-import-flow)
  - Preview-tabel (max 500 rækker) + "valgt"-tæller
- Drop `TABLE_PREVIEW_LIMIT`-hack hvor muligt — vi har allerede alle rækker i klienten via samme loader som virksomhedslisten.

## Tekniske detaljer

- Hooken laver præcis de samme batched-queries som i dag i `virksomheder.tsx` (companies paginært 1000 ad gangen, locations/equipment i 500-batches). Ingen ny netværkstrafik når begge er på samme side, fordi de to brugsflader ikke vises samtidigt.
- `templates` (filter_templates) bevares kun på `/virksomheder` — vises ikke i dialogen (skabeloner giver mindre mening i list-oprettelses-flowet).
- "Tildeling"-filteret i panelet er admin-only (samme som i dag).
- Bagudkompatibel `applyTemplate`-mapping (`machineStatus` → `machines`) flyttes med ind i hooken.
- Ingen DB-ændringer.

## Out of scope

- Ingen ændringer i visning/tildeling af eksisterende lister.
- Ingen ændringer i `AssignToListDialog` (bruges fra virksomhedslisten med allerede valgte virksomheder — har sin egen mindre formular).

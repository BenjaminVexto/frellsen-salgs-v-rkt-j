# Udstyrstype i Wittenborg-importen: ny regel + "Udlån"

## 1. Hvor udstyrstypen beregnes og læses i dag

Typen gemmes ikke i `machine_enrichment`, men i `location_equipment_units.udstyr_type` (CHECK: `leje_ub | leje_binding | kunde_ejet | ukendt`).

Beregning (kun TypeScript, ingen SQL-funktion):
- `src/lib/machines-import.functions.ts`
  - `classifyWittenborg()` (l. 137) – bruges både for "m/service" (l. 581) og "u/serviceaftale" (l. 629), med tællere `wittenborgTypeCounts` / `wittenborgUdenSnTypeCounts`.
  - `classifyRental()` (l. 168) – Maskinliste-enheder ud fra `udlanstype`.
- `src/routes/_authenticated/admin.import.maskiner.tsx` l. 372–374 og 654: etiketter og visningen "… pr. udstyrstype".

Læses af:
- `src/components/lokationer-sektion.tsx` (l. 195, 1534–1555, 1692): ejerskabsmærkat på afdelingens maskiner (`Ownership`-type + etiketter).
- `src/components/maskinliste-print.tsx` (l. 147): printet maskinliste ("Leje"/"Kundeejet"/"Udlån"/"Ukendt").
- Ikke læst af: Maskiner & Service (`udstyr_grundlag` bruger `machines.udlanstype` og `machine_enrichment.aftale_type` direkte), bonus (`bonus_maskin_*` bruger fakturalinjer/bonusklasse), handlingslisten. SQL-funktioner med "udstyr_type" i navnet (`udstyr_type_tekst`, `udstyr_type_leje`) handler om maskinkategori, ikke ejerskab.

## 2. Nuværende logik (citeret)

```text
// Trin 1: lease_leje_dato → Frellsen-ejet → trin 4.
// Trin 2: kobt_dato → kunde_ejet.
// Trin 3: G4-fallback på aftale_type.
// Trin 4 (kun Frellsen-ejet): binding_ophor → leje_binding, ellers leje_ub.
if (lease) frellsenOwned = true;
else if (kobt) return "kunde_ejet";
else {
  if (at.startsWith("1 [serviceaftale]") || at.startsWith("0")) return "kunde_ejet";
  if (at.startsWith("4 [lejeaftale") || at.startsWith("2 [lejeaftale")) frellsenOwned = true;
  else return "ukendt";
}
return binding ? "leje_binding" : "leje_ub";
```
Derfor bliver alt med lejedato "Leje u/binding", når binding mangler (u/serviceaftale-fanen har ingen binding-kolonne), og reservedele-feltet indgår slet ikke.

## 3. Ændringer

Ny `classifyWittenborg({ aftale_type, binding_ophor, reservedele })` i en lille browser-sikker fil `src/lib/udstyr-type.ts` (så den kan testes):
1. `reservedele` starter med "midlertidig udl" (trim, case-insensitivt) → `udlaan`
2. aftale_type starter med "4 [lejeaftale" og binding_ophor udfyldt → `leje_binding`
3. aftale_type "4 [lejeaftale" og binding tom → `leje_ub` (gælder også u/serviceaftale)
4. Alt andet → `kunde_ejet` (inkl. kun lease_leje_dato, købt dato, tom aftaletype). `ukendt` bruges ikke længere af Wittenborg.

Importen sender `reservedele` med ind i begge pas (feltet er allerede mappet, også "Gruppe 3" i u/serviceaftale).

Fjern `kundeprisgruppe1` fra `ENRICHMENT_EXPECTED` og den tilsvarende liste for u/serviceaftale i `admin.import.maskiner.tsx` (mappingen bevares, så kolonnen stadig læses hvis den findes).

### "Udlån" som ny værdi kræver også
- Migration: CHECK-constraint udvides med `'udlaan'`.
- Import: tællere + etiket "Udlån" i resultatvisningen.
- `lokationer-sektion.tsx`: tilføj `udlaan` til `Ownership`-typen og etiket "Udlån" (Frellsen-ejet, ikke kundeejet).
- `maskinliste-print.tsx`: `udlaan` → "Udlån".
- Eksisterende rækker opdateres først ved næste maskinimport (ingen manuel omskrivning).
- Maskinliste-enheder (`classifyRental`) ændres ikke.

### Tests
`src/lib/udstyr-type.test.ts`: Bolero/Klostercafeen-tilfældet → Udlån; Lejeaftale + binding → m/binding; Lejeaftale uden binding (u/service) → u/binding; kun lejedato + tom aftaletype → Kundeejet; "Midlertidig udl" vinder over Lejeaftale.

## Antagelse at bekræfte
"2 [Lejeaftale - betaler filter]" tæller i dag som leje. Med den nye regel (kun kode 4) bliver den Kundeejet. Jeg følger din regel, medmindre du siger, at kode 2 også skal være leje.

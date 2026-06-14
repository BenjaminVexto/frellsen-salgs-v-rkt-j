# Prismatrix-kobling: 4-nøgle matching

## Problem
`agreement_pricing` gemmer kun `kundeprisgruppe2` — KP1 og Fakt. kundenr smides væk under import. `getCompanyPricingSummary` filtrerer derfor kun på KP2-koden, så Ældre Sagen (KP2=98) får vist alle 98-rækker, inkl. Cheval Blancs KP1=22+KP2=98 og andre kombinations-rabatter.

## Den korrekte regel
En virksomheds rabat-rækker = unionen af:
1. **Kundespecifikke** — `fak_kundenr` = virksomhedens `visma_id`
2. **Kombi-gruppe** — `kundeprisgruppe1` matcher virksomhedens KP1 **OG** `kundeprisgruppe2` matcher virksomhedens KP2 (begge kræves, begge sat på rækken)
3. **Kun KP1-gruppe** — `kundeprisgruppe1` matcher, KP2 og `fak_kundenr` tomme på rækken
4. **Kun KP2-gruppe** — `kundeprisgruppe2` matcher, KP1 og `fak_kundenr` tomme på rækken
5. (Generelle rækker uden nogen nøgle ignoreres for nu — de er 3% af rækkerne og vises ikke pr. virksomhed.)

Matchet sker på **leading code** ("22" matcher "22 [Cheval Blanc A/S]"), så Cheval Blancs KP1=22+KP2=98 rabat aldrig falder ind under Ældre Sagen, der kun har KP2=98.

## Ændringer

### 1. Migration — `agreement_pricing`
- Tilføj `kundeprisgruppe1 text` og `fak_kundenr text`
- Indeks på begge

### 2. Importer (xlsx-mapper)
`admin.import.prismatrix.tsx`:
- Tilføj alias for "Kundeprisgruppe 1" → `kundeprisgruppe1`
- `FORCE_TEXT`, `PRICING_EXPECTED`, `PRICING_ANCHORS` udvides

### 3. Import server fn
`agreement-pricing-import.functions.ts`:
- Zod-skema accepterer `kundeprisgruppe1` + `fak_kundenr`
- Lagrer begge på rækken
- Dedup-hash inkluderer kp1 og kundenr så rækker ikke kolliderer

### 4. Matching server fn
`agreement-pricing.functions.ts`:
- Ny `fetchPricingForCompany(visma_id, kp1, kp2)` — henter union af de fire regler ovenfor, deduplikerer på `id`
- `getCompanyPricingSummary` bruger den nye fn og returnerer pr. række `match_source`: `kundenummer | kp1+kp2 | kp1 | kp2`
- `listPricingByKp2` (KP2-aftale-siden) er uændret — viser stadig alle rækker i gruppen, som er korrekt for aftale-visningen

### 5. UI
`company-pricing-summary.tsx`:
- Vis hvilken nøgle der matcher (kundenr-rabat / gruppe-rabat / kombi-rabat)
- "Se fuld prismatrix"-link åbner en ny drill-in tabel med præcis de rækker virksomheden ser

Ny komponent `company-prismatrix-table.tsx` (genbruger UI fra `prismatrix-table.tsx` men tager `companyId` i stedet for `kp2`). Vises på `/virksomheder/$id`.

## Re-import krævet
Efter migrationen er kolonnerne tomme. Fakturajournalen er uberørt — kun prismatrix-filen skal genimporteres på `/admin/import/prismatrix` for at populate `kundeprisgruppe1` + `fak_kundenr`.

## Verifikation
Ældre Sagen (id `8ec9b4ad…`, visma_id 3391300, KP1=60, KP2=98) skal efter re-import vise:
- 7 kundespecifikke rækker (`fak_kundenr = 3391300`)
- 0 KP1+KP2-kombi-rækker (medmindre der findes 60+98)
- KP1=60-only rækker hvis nogen
- KP2=98-only rækker hvis nogen
- **Ingen** rækker med KP1=22+KP2=98 (Cheval Blanc) eller andre kombinationer

Cheval Blanc Service Rest. (KP1=22, KP2=36) skal IKKE få Ældre Sagens rabatter og omvendt.

```text
Før (kun KP2):                  Efter (4-nøgle):
Ældre Sagen ← alle KP2=98       Ældre Sagen ← egne 7 + KP2=98-only + KP1=60-only
Cheval Blanc ← alle KP2=36      Cheval Blanc ← egne + KP1=22+KP2=36 + KP1=22-only + KP2=36-only
```

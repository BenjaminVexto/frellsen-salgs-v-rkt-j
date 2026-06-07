# Plan: Bindingsmærkat + Kundetype-mærkat

## 1. Datamodel (migration)

Tilføj to nye kolonner på `companies` — begge auto-udledt fra `customer_segment_3`, IKKE redigerbare i UI:

- `binding_status text` — enum-lignende værdier: `offentlig_aftale`, `frit_salg`, `intern_privat`, eller `NULL` (ukendt).
- `customer_category text` — den rene kategori uden talkode (fx `HoReCa (Hotel, Rest. og Café)`, `Firma Kunder (Almindelige)`).

Indeks på `binding_status` til filter. `is_public` beholdes i schema men markeres som deprecated (ikke skrives længere, ikke læses i UI).

## 2. Mapping (én kilde — nem at udvide)

Ny fil `src/lib/customer-segment-mapping.ts`:

```ts
// Parser "40 [Offentlige Udbudskunder]" → { code: "40", category: "Offentlige Udbudskunder" }
// Mapping fra category → binding_status
export const BINDING_BY_CATEGORY: Record<string, BindingStatus> = {
  "Offentlige Udbudskunder": "offentlig_aftale",
  "Offentlige aftale kunder": "offentlig_aftale",
  "Firma Kunder (Almindelige)": "frit_salg",
  "Kantinefirmaer": "frit_salg",
  "HoReCa (Hotel, Rest. og Café)": "frit_salg",
  "Indkøbsforeninger": "frit_salg",
  "Koncern og Kædeaftaler": "frit_salg",
  "Grossister, bagere og andet videresalg": "frit_salg",
  "Interne": "intern_privat",
  "Personaleforeninger, kaffeklubber, privatkøb": "intern_privat",
};
export function parseSegment3(raw): { category, code }
export function deriveBinding(raw): BindingStatus | null
```

Faktiske værdier i DB (bekræftet):
```
40 [Offentlige Udbudskunder]                   8937  → offentlig_aftale
45 [Offentlige aftale kunder]                  1514  → offentlig_aftale
25 [Firma Kunder (Almindelige)]                3495  → frit_salg
20 [HoReCa (Hotel, Rest. og Café)]              631  → frit_salg
35 [Indkøbsforeninger]                          494  → frit_salg
30 [Koncern og Kædeaftaler]                     143  → frit_salg
15 [Kantinefirmaer]                             141  → frit_salg
50 [Grossister, bagere og andet videresalg]      60  → frit_salg
10 [Personaleforeninger, ...privatkøb]          305  → intern_privat
 5 [Interne]                                     39  → intern_privat
 1 [Kund-UnderGrp 01]                             6  → NULL (ukendt)
```

## 3. Import (Visma)

I `admin.import.visma.tsx`: ved hver række beregnes `binding_status` + `customer_category` via mapping og skrives på companies. `is_public`-skrivning fjernes. Køres på hver reimport → felterne opdateres altid.

Backfill: UPDATE alle eksisterende rækker via mapping.

## 4. UI-komponenter

Ny `src/components/binding-status-badge.tsx`:
- `offentlig_aftale` → rød/destructive badge "Offentlig aftale" (advarsel-tone, ikon)
- `frit_salg` → neutral grøn/success "Frit salg"
- `intern_privat` → muted "Intern / privat"
- `null` → render intet

Ny `src/components/customer-category-badge.tsx`:
- Viser `customer_category` som outline-badge med neutral styling. Intet hvis NULL.

## 5. Visning

Erstat eksisterende `is_public`-rendering (typisk "Offentlig institution"-badge) i:
- `virksomheder_.$id.tsx` (detalje/kort)
- `virksomheder.tsx` (liste/søgeresultater) — vis begge badges i hver række
- `soesterselskaber-sektion.tsx`
- `salgsintelligens.tsx`
- `aftaler.index.tsx` / `aftaler.$id.tsx` / `kontaktlister.tsx` / `admin.import.*` — fjern eller skift til `binding_status`

## 6. Filter

I `virksomheder.tsx` (og evt. salgsintelligens): erstat eksisterende "kun offentlige"/is_public-filter med dropdown på `binding_status` (Alle / Offentlig aftale / Frit salg / Intern / privat / Ukendt). `admin-companies.functions.ts` + `agreements.functions.ts` skal acceptere parameteren og filtrere på `binding_status` i stedet for `is_public`.

## 7. Udførelse

1. Migration: tilføj kolonner + indeks.
2. Tilføj mapping-modul.
3. Tilføj badge-komponenter.
4. Opdater Visma-import til at skrive nye felter (fjern is_public-skrivning).
5. Kør backfill (UPDATE via mapping) i én batch.
6. Skift alle læse-/filtersteder fra `is_public` til `binding_status`.
7. Verificér på Vodskov Skole TF (forventet `offentlig_aftale`) og en HoReCa-kunde (`frit_salg` + kategori "HoReCa (Hotel, Rest. og Café)").

Skal jeg køre planen?

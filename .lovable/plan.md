## Mål

Fjern fanerne **Sovende kunder** og **Tidligere kunder** fra Salgsintelligens. De er overflødige nu hvor admin opretter kontaktlister med samme målgruppe direkte. Tvillinger-fanen ændres ikke — sovende/tidligere kunder er allerede inkluderet via "Aktiv kunde"-kategorien (alle Visma-kunder).

## Ændringer i `src/routes/_authenticated/salgsintelligens.tsx`

1. **Tab-typen** indsnævres fra `"mersalg" | "tvillinger" | "sovende" | "tidligere"` til `"mersalg" | "tvillinger"`.
2. **Tab-listen** beskæres til de to tilbageværende.
3. **Render-blokken** mister `{tab === "sovende" && …}` og `{tab === "tidligere" && …}`.
4. **Død kode fjernes:**
   - `SovendeKunder`-komponenten
   - `TidligereKunder`-komponenten
   - `DormantTable`-komponenten
   - `DormantRow`-typen
5. **Ubrugte imports** ryddes op: `Phone` fra lucide-react (kun brugt i DormantTable). `Users` og `AlertTriangle` tjekkes — fjernes hvis ubrugte efter oprydning.

## Ikke berørt

- Tvillinger-fanen (logik, badges, sortering forbliver som i dag).
- Flere afdelinger-fanen.
- Databasen — ingen schema-ændringer. `customer_type`-feltet og enum-værdierne `sovende_kunde`/`tidligere_kunde` beholdes, fordi de bruges andre steder (kontaktlister, virksomhedskort, derive_customer_type-trigger).
- Sidemenuen — `/salgsintelligens` ligger allerede under ADMIN.

## Filer der ændres

- `src/routes/_authenticated/salgsintelligens.tsx`

# Historisk bonus fra lønsedler (sep 2025 – aug 2026)

## Kontrol af data på forhånd
Summen af de 72 rækker passer allerede præcis med kontroltotalerne: Anders 193.099,07 · Claus 314.674,86 · Jes 268.132,17 · Mads 244.068,94 · Malene 108.000,00 · Ole 189.217,80. I dag er kun september 2026 låst (6 rækker) — der er ingen kollision med de historiske måneder.

## 1. Import
- Ny tabel **bonus_historik_loenseddel** med de rå rækker: sælger, optjeningsmåned, lønseddelmåned, 1561, 1563, importeret tidspunkt/af. Kun admin kan læse/skrive (plus telemarketing-spærring).
- Ny markering **kilde** på låste måneder: 'beregnet' (alle eksisterende, også september 2026) eller 'loenseddel'.
- De 72 rækker lægges ind i den rå tabel og låses som 'loenseddel': 1561/1563 som på lønsedlen (også skæve fordelinger), I alt = summen, DB-grundlag/maskinantal/ny kunde = 0, ingen maskinliste, note "Historisk jf. lønseddel". Sælgere findes via fulde navn i profilerne.
- En admin-funktion **genetabler historisk måned** (sælger + måned) låser igen fra den rå tabel, hvis en måned ved en fejl er låst op. Oplåsning er uændret (kun admin).

## 2. Efterregulering
- Låsning af en ny måned springer alle rækker med kilde 'loenseddel' over, når den beregner forskelle.
- Test: lås oktober 2026 i en transaktion der rulles tilbage og bekræft, at der ikke opstår reguleringer for september 2025 – august 2026. Oktober forbliver ulåst.

## 3. Sælgernes visning
- Måneder før september 2025 vises aldrig for sælgere — afskåret i databasen (bonus-funktionerne returnerer intet før 2025-09 for ikke-admin), så det gælder fanen, årstotaler, CSV og alt andet.
- Historiske måneder viser kun Provision I (DB-provision), Provision II (maskiner m.m.) og I alt, med teksten "Historisk udbetaling jf. lønseddel – detaljer findes ikke". Ingen klik til DB-grundlag eller maskinliste. Gælder både computer og telefon.
- Årstotaler summeres efter optjeningsmåned (låst beløb vinder over beregnet).
- Fast note: "Bonus for en måned udbetales med lønnen pr. sidste dag i den følgende måned."

## 4. Admin-visning
- Admin ser alle måneder, også før september 2025.
- For historiske måneder: to kolonnesæt side om side — **Historisk** (1561, 1563, i alt) og **Beregnet** (DB-provision, maskinbonus, i alt, antal maskiner W/A/R/K/E + brugt) samt **Forskel**. Maskinantal fremhæves.
- Admin kan åbne den beregnede maskinliste for en historisk måned (samme liste som i dag, mærket "Kun til sammenligning").
- Det beregnede tal bruges kun til visning — aldrig i udbetaling, lønfil eller efterregulering.

## 5. Kontrol (rapporteres i chatten)
- Totaler pr. sælger for sep 2025 – aug 2026 fra databasen mod de seks tal.
- September 2026: sammenlign alle felter før og efter — uændret.
- Playwright som sælger: måneder før september 2025 vises ikke; historisk måned viser kun de tre tal + teksten.

## Teknisk
- Migration: kolonne `kilde text not null default 'beregnet'` med check ('beregnet','loenseddel') på bonus_laas; tabel bonus_historik_loenseddel med GRANT, RLS (is_admin) og `tm_spaerret`; funktion `bonus_historik_genetabler(_user_id, _maaned)` (admin-tjek).
- `_bonus_laas_saelger`/efterreguleringslogik: filtrér `kilde <> 'loenseddel'` ved beregning af forskelle; `bonus_laas_start` må ikke overskrive en 'loenseddel'-række.
- `bonus_pr_maaned` og øvrige sælger-RPC'er: wrapper/filter `maaned >= '2025-09-01' OR is_admin(auth.uid())`; selve beregningen ændres ikke.
- Data (72 + 72 rækker) indsættes via datakald, ikke migration.
- Lønfil: historiske rækker indgår kun hvis admin eksplicit vælger deres måned (de er allerede udbetalt) — standardvalg er uændret.
- UI: `bonus-fane.tsx` (kilde-afhængig rækkevisning, note), `afregning-fane.tsx` (Historisk/Beregnet/Forskel), `bonus-afregning.functions.ts` (genetabler).
- Test i `src/lib/` for reglen "loenseddel-rækker giver aldrig regulering" + SQL-test med rollback.

## Antagelse
Lønfilen genereres ikke for de historiske måneder (de er udbetalt). Sig til, hvis de skal kunne eksporteres.

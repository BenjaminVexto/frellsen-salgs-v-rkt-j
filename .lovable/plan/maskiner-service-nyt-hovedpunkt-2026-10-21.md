# Maskiner & Service – nyt hovedpunkt

Formål: konsulenten ser Frellsen-udstyr på egne lokationer, hvad det tjener (leje vs. belastning), aktive serviceaftaler og deres netto, og hvor der skal handles. Admin ser pr. sælger og samlet. Visma-data ændres ikke.

## Trin 0 – Afstemning før bygning (første skridt)
Inden siden bygges, afstemmes datagrundlaget mod kontroltallene for Claus Wolsing, jan–sep 2026:
- leje 2.144.891 · belastning 2.495.522 · service faktureret 5.703.805 · montør/kørsel netto −1.761.111 · reservedele −807.311 · Brita-patroner −400.749
- Maskinoversigt: Wittenborg 356 / 1.109.970 · Rex-Royal 76 / 643.443 · Brita-filtre 1.304 (1.256 Leje u/b) · Bravilor/Bonamat 294 (155 udlån)

Kolonner, varegrupper, udlånstyper og aftaletyper i fakturajournal, maskinregister og aftaleregister bekræftes med forespørgsler. Rammer et tal ikke, rapporteres forskellen og årsagen i chatten, før vi går videre. Der gættes ikke på en årsag.

## Regler (fra din beskrivelse)
- Periode: som standard seneste 12 hele måneder rullende. Kalenderår og år til dato kan vælges.
- Sælger = lokationens sælger. Lokation = Lev.kund, afdeling 11.
- Leje: varegruppe 16/80. Maskintype udledes af varetekst (Wittenborg, Rex-Royal, Animo, Espresso/Krea/Kalerm, Vandkøler, Bravilor/Bonamat, Andet).
- Belastning: varenr 70000 (DB) fordeles pr. lokation:
  - Brita-filterhoved 44 kr./md., Bravilor/Bonamat 85 kr./md., Andet udlån 117 kr./md.
  - Resten fordeles på kaffemaskiner/vandkølere efter deres andel af lejen. Uden leje fordeles efter antal.
  - Uden aktivt Frellsen-udstyr vises beløbet som "Ufordelt".
  - Alle fordelte beløb mærkes "fordelt" med en forklaring.
  - Satserne kan redigeres af admin.
- Udstyr: aktive maskiner. Frellsen-ejet = udlånstype 3–8. Maskintype tages fra maskinens beskrivelse. Kundeejede maskiner vises separat.
- Service: indtægt = 16/82 ekskl. 70000. Udgift består af:
  - montør/kørsel (16/83), reservedele (18) og Brita-patroner (17) til kostpris, minus det der er faktureret kunden
  - plus kostpris på aftalelinjerne
  - plus filterhovedernes fordelte belastning (filtre hører til service, ikke leje)
- Varer-DB: alt uden for varegruppe 16/17/18.

## Siden
1. **Handlingsliste** øverst: a) udlån uden dækning, b) udskiftningskandidater (alder/tællerstand eller reparationer over 3.000 kr. på 12 mdr.), c) kundeejede maskiner uden serviceaftale, d) serviceaftaler i underskud med fornyelsesmåned, e) leje uden lejefakturering i 12 mdr., f) kun admin: belastning uden registreret udstyr. Hvert punkt viser antal og åbner en liste ved klik.
2. **Nøgletal** (klikbare): Frellsen-maskiner, Leje netto, Aktive serviceaftaler, Service netto, Lokationer i underskud.
3. **Maskinoversigt** pr. maskintype med Antal, Leje/leasing, Leje u/b, Udlån, Øvrige, Indtægt, Udgift (fordelt), Netto og en totalrække. Hvert tal åbner en sorterbar liste med link til kundekortet.
4. **Serviceaftaler** pr. maskintype og aftaletype med indtægt, udgifter opdelt og netto. Klik åbner aftaler pr. lokation med største underskud øverst og fornyelsesmåned. Lokationer med serviceaftale men uden varekøb vises også.
5. **Lokationsregnskab "Giver det mening?"**: Varer-DB + Leje + Service − Belastning − Serviceudgifter. Dårligste øverst, rød ved negativ. For udlån og leje u/b vises kaffe-DB pr. maskine pr. måned mod maskinens omkostning (dækningsgrad).
- Admin får sælgervælger som i Min salgsstatistik, inkl. "Alle".
- Mobil: nøgletal og handlingsliste øverst, tabeller som kort, samme klik-til-liste og plads over bundmenuen.
- Kundekort: boksen "Udstyr & service" pr. lokation viser leje, belastning, service netto og DB inkl. udstyr med link til siden.

## Adgang
- Sælgere ser kun egne lokationer: netto, dækning, indtægt og udgift pr. lokation og maskintype. Fakturalinjer med kostpris vises kun for admin.
- Telemarketing er spærret som resten af systemet.
- "Se som sælger" viser præcis sælgerens visning.

## Tekniske detaljer
- Nye tabeller:
  - `udstyr_lokation_maaned`: pr. lokation og måned, med beløb pr. maskintype og kategori (leje, belastning fordelt/ufordelt, service-indtægt, montør, reservedele, patroner, filterhoveder, aftalekost, varer-DB).
  - `udstyr_indstilling`: satser, admin-redigerbare.
  - Begge får RLS, GRANT og `tm_spaerret`.
- Tabellerne fyldes af SQL-funktionen `udstyr_refresh(lokationer, måneder)`. Den kaldes efter faktura- og maskinimport og ved ændrede satser, og køres med en refresh-kø som bonus_maskin_maaned. Første fyldning sker som backfill.
- Klassificeringen ligger i én SQL-funktion: varetekst giver maskintype for leje, beskrivelse giver maskintype for maskinregistret.
- Læsefunktioner (security definer, filtreret på lokationens sælger; admin vælger sælger):
  - `udstyr_overblik`
  - `udstyr_maskinoversigt`
  - `udstyr_drilldown(type, kolonne)`
  - `udstyr_service`
  - `udstyr_lokationsregnskab`
  - `udstyr_handlinger`
  - `udstyr_lokation_boks(company)`
  - `udstyr_linjer` (kun admin)
  - Lister over 1.000 rækker hentes med `hentAlle`.
- Serverfunktioner bruger `kraevIntern`.
- Ny route `/_authenticated/maskiner-service` med menupunkt (desktop) og punkt under Mere (mobil).
- Unit tests for fordelingsreglen: satser, rest efter lejeandel, fallback efter antal, ufordelt. Desuden en test for klassificering af varetekst.
- AGENTS.md får en regel om at siden læser fra den forudberegnede tabel.

## Antagelser (ret mig)
- Udskiftningskandidat: maskinen er over 5 år gammel, tællerstanden er over 100.000, eller reparationer på 12 mdr. er over 3.000 kr. Grænserne kan redigeres af admin.
- "Aktiv serviceaftale" = aftale i aftaleregistret uden udløbet slutdato.

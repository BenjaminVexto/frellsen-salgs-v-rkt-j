# Nye regler for maskinbonus (besluttet 20/10-2026)

Bygges oven på den nuværende maskinbonus pr. serienummer. DB-bonus og ny kunde-bonus røres ikke. Reglerne gælder for alle måneder, der ikke er låst (fra september 2026). Låste måneder ændres ikke; senere ændringer går via efterregulering som i dag.

**Hovedprincip:** bonus kun når Frellsen vinder en ny aftaleperiode via en maskine (salg eller ny leje). Bonus følger lokationen (Lev. kund).

## 1. Bonusklasser og satser
- Bonusklasse får to nye værdier: **Kalerm** og **Espresso** (ud over Wittenborg, Animo, Rex-Royal, Ingen).
- Bonusordningen får nye satsfelter: **Kalerm**, **Espresso** (standard 0 kr.) og **Brugt maskine** (standard 250 kr.), plus **Ombytningsgrænse** (standard 24 mdr.). Admin redigerer dem som de øvrige satser.
- Varer uden bonusklasse eller med "Ingen" giver aldrig bonus automatisk.
- Tilbudskataloget får de nye klasser i dropdown, badge og "Sæt bonusklasse".

## 2. Ny eller brugt
- Ny maskine: fuld sats efter bonusklasse. Brugt maskine: fast beløb (Brugt maskine-satsen) uanset model. Feltet "Brugte maskiner tæller med" styrer fortsat, om brugte er med.
- Brugt = serienummeret har tidligere været registreret hos en **anden** kunde (maskinhændelser eller historiske lejelinjer).
- Admin kan overstyre ny/brugt på rækken før låsning, med årsag.

## 3. Samme maskine hos samme kunde
- Et serienummer giver højst bonus én gang pr. lokation, uden tidsgrænse — også ved leje konverteret til salg. Erstatter den nuværende 3-måneders overtagelsesregel (feltet bevares, men bruges ikke længere og markeres som udfaset).
- Udeladte rækker får årsag "Samme maskine hos samme kunde".

## 4. Ombytning / opgradering
- Ny placering på en lokation, hvor en anden bonusberettiget maskine er taget retur/erstattet:
  - Den gamle maskine placeret inden for ombytningsgrænsen → **"Mulig ombytning — kræver vurdering"**, tæller ikke med som udgangspunkt.
  - Ældre end grænsen → **"Opgradering — kontrollér"**, tæller kun med efter admin-godkendelse.
- Godkendelse viser tjekliste: anden/større model, ny aftale med min. 2 års binding, Frellsen betaler ikke for den gamle maskine.
- Afvisningsårsager: teknisk ombytning, reklamation, tilbagekøb (Frellsen betaler for den gamle), andet.
- Alle vurderinger logges (hvem, hvornår, årsag) og fastfryses ved månedslås.

## 5. Afregning (admin)
- Ny sektion pr. sælger/måned: maskiner der kræver vurdering, uklassificerede maskiner og ny/brugt-overstyring.
- Advarsel før låsning, hvis måneden har uklassificerede maskinvarer eller uafgjorte ombytninger/opgraderinger.

## 6. Sælgerens bonusside
- Pr. maskine: serienummer, model, ny/brugt, sats og status ("Bonus" eller "Ingen bonus" + årsag i klart sprog). Ingen tekniske koder.
- Sammenklappelig boks **"Sådan beregnes maskinbonus"** med regelteksten ordret som leveret.

## 7. Sammenligning før låsning
Efter implementering laves en opgørelse af **september 2026 pr. sælger**: antal maskiner og maskinbonus med gamle regler vs. nye regler, plus antal rækker til vurdering. Vises i chatten. September låses ikke.

## Teknisk
Migrationer:
1. `products.bonusklasse` CHECK udvides med `kalerm`, `espresso`.
2. `bonus_ordning`: `bonus_kalerm numeric default 0`, `bonus_espresso numeric default 0`, `bonus_brugt numeric default 250`, `ombytning_mdr int default 24`; COMMENT DEPRECATED på `overtagelse_mdr`.
3. Ny tabel `bonus_maskin_vurdering` (user_id, maaned, serienr, lev_kundenr, beslutning: godkendt/afvist/ny/brugt, aarsag, tjekliste jsonb, besluttet_af, besluttet_at). GRANTs, RLS (admin skriver, sælger læser egne), `tm_spaerret`-policy, trigger der afviser ændringer når `bonus_laas` findes for sælgerens måned. Append-log i `bonus_laas_log`-stil.
4. `bonus_maskin_grundlag` omskrives: ny kolonner `ny_brugt`, `status` (bonus/udeladt/vurdering), `aarsag_tekst`; "første gang pr. serienr+lokation"-regel over hele historikken; brugt-detektion; ombytningsdetektion via maskinhændelser/lejelinjer på samme lokation inden for `ombytning_mdr`; vurderinger fra ny tabel anvendes. `bonus_maskin_grundlag_faktura` og en kopi af den nuværende funktion (`bonus_maskin_grundlag_v1`) bevares til sammenligning.
5. `bonus_maskin_detaljer` og `bonus_pr_maaned`: sats efter bonusklasse inkl. kalerm/espresso, brugt = `bonus_brugt`, kun `status='bonus'` tæller.
6. `bonus_laas_start`: gemmer vurderinger i låsen og returnerer advarsler.

Kode:
- `src/lib/bonus-ordning.ts`, `bonus-ordning-admin.tsx`: nye felter og beskrivelse.
- `admin.tilbudskatalog.tsx`, `products.functions.ts`: nye klasser.
- `bonus-fane.tsx`, `bonus-detaljer.tsx`, `bonus-maskin-visning.ts`: nye kolonner, klartekst-årsager, regelboks.
- `afregning-fane.tsx`, `bonus-afregning.functions.ts`: vurderingssektion, overstyring, låseadvarsel.
- Tests: én test pr. regel (samme serienr/lokation én gang, brugt = 250 kr., ombytning inden for 24 mdr. udelades, opgradering kun ved godkendelse, ingen/uklassificeret = 0 kr.).

Antagelse: "taget retur/erstattet" afgøres ud fra maskinhændelser og lejelinjer (maskinen forsvinder fra lokationen). Hvis datagrundlaget viser sig utilstrækkeligt, markeres sådanne rækker til vurdering frem for at gætte.

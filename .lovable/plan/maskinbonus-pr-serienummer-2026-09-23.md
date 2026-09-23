# Maskinbonus pr. serienummer

Maskinbonussen opgøres i dag ved at genkende tekst på fakturalinjer. Den lægges om, så hver maskine tælles pr. serienummer, og bonussatsen bestemmes af en bonusklasse på selve varen. Den nuværende beregning bevares under et nyt navn, så de to kan sammenlignes. DB-bonussen røres ikke.

## 1. Bonusklasse på varen

- Varekartoteket får feltet **Bonusklasse** med værdierne Wittenborg, Animo, Rex-Royal eller Ingen, plus en markering af, at en medarbejder har sat den manuelt. Visma-import overskriver aldrig en manuelt sat værdi — samme princip som Kategori i dag.
- Alle 515 maskinvarer i varegruppe 16 (også udgåede) får et automatisk forslag:
  - Wittenborg og Gaggia G300 → Wittenborg
  - Rex-Royal → Rex-Royal
  - Animo OptiMe og OptiBean → Animo
  - OptiVend, Bonamat, Bolero, Jclass, H2OMY, Niagara, Futurmat, Profitec, varer i kategorien Tilbehør samt service- og ydelsesvarer → Ingen
- De 68 varenumre, der optræder på fakturalinjer i gruppe 16 uden at findes i varekartoteket, oprettes som udgåede "stump"-varer med kilde faktura, så de også kan få en bonusklasse.

### Tilbudskatalog
- Varepanelet får en Bonusklasse-dropdown under Kategori med samme hjælpetekst-mønster; gemning markerer værdien som manuelt sat.
- Tabellen får en Bonus-kolonne (badge, kun læsning), filteret "Maskiner uden bonusklasse" (viser også udgåede varer) og en flervalgshandling "Sæt bonusklasse" for de markerede varer.

## 2. Maskinhændelser

Ny logbog over maskinhændelser, der kun tilføjes til — aldrig opdateres eller slettes. Hver gang maskinimporten (både Wittenborg med og uden serienummer) ser en ny kombination af serienummer, kundenummer, købsdato og leje-/lejestartdato, gemmes en ny linje med aftaletype, maskintype, tællerstand og importtidspunkt. Det giver en varig historik over, hvornår maskiner er købt, lejet eller overtaget.

## 3. Ny beregning

Den nye opgørelse tæller én enhed pr. serienummer, hvor købsdato eller lejedato falder i måneden:

- Serienummeret kobles til et varenummer via serienummer-linjen på samme ordre, og satsklassen læses fra varens bonusklasse.
- Serienumre uden match eller uden klasse returneres som "uklassificeret" med en årsag, så de kan vises i bonusopgørelsen i stedet for at forsvinde.
- **Overtagelse:** et køb tæller ikke som nyt salg, hvis samme serienummer tidligere har været lejet hos samme kunde mere end et antal måneder før købsdatoen. Grænsen sættes pr. bonusordning (nyt felt, standard 3 måneder), og både maskinhændelserne og de historiske lejelinjer bruges som grundlag.
- Udelukkede maskiner returneres også med årsag.

## 4. Afgrænsning

Den nuværende funktion bevares uændret under navnet `bonus_maskin_grundlag_faktura`, så den gamle og nye opgørelse kan sammenlignes side om side. DB-bonussen og dens regler ændres ikke.

## Migrationer

1. `products_bonusklasse` — kolonnerne `bonusklasse text CHECK (in 'wittenborg','animo','rex','ingen')` og `bonusklasse_manuel boolean not null default false`; indeks på bonusklasse.
2. `maskin_haendelser` — ny tabel (serienr, lev_kundenr, company_id, kobt_dato, lease_leje_dato, aftale_type, maskin_type, taellerstand, import_tid) med unikt indeks på (serienr, lev_kundenr, kobt_dato, lease_leje_dato), GRANTs, RLS og læseadgang for afdelingsbrugere; ingen UPDATE/DELETE-policy.
3. `bonus_ordning_overtagelse_mdr` — `overtagelse_mdr int not null default 3`.
4. `bonus_maskin_grundlag_serienr` — omdøber nuværende funktionskrop til `bonus_maskin_grundlag_faktura(...)` og opretter ny `bonus_maskin_grundlag(...)` pr. serienummer (SECURITY DEFINER, samme adgangscheck), med ekstra kolonner `serienr`, `bonusklasse`, `udeladt` og `aarsag`. `bonus_maskin_detaljer` og `bonus_pr_maaned` opdateres til at bruge bonusklasse i stedet for mærkegenkendelse og til at ignorere udeladte rækker i selve bonusberegningen.

Bonusklasse-forslaget og stump-varerne indsættes som dataopdatering efter migrationerne (ikke i en migration).

## Kodeændringer

- `src/lib/products.functions.ts` — bonusklasse i typen, validering og gemning (sætter `bonusklasse_manuel = true`), samt masse-handling.
- `src/routes/_authenticated/admin.tilbudskatalog.tsx` — dropdown, badge-kolonne, filter og flervalgshandling.
- `src/lib/machines-import.functions.ts` — nyt trin der indsætter maskinhændelser for begge Wittenborg-kilder; resten af importen uændret (Visma-import respekterer `bonusklasse_manuel`).
- `src/components/bonus/bonus-fane.tsx` — viser udeladte og uklassificerede maskiner med årsag.

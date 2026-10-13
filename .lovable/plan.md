# Telemarketing-rolle (eksternt bureau)

## Mål
Bureaubrugere logger ind og kan kun bruge Kontaktlister – kun de lister, de er sat på. Adgangen styres i databasen, ikke kun i menuen. Eksisterende brugere beholder præcis deres adgang.

## Trin
1. **Gennemgang først (kun læsning):** jeg laver en tjekliste over alle tabeller, views og funktioner med adgang for indloggede brugere og deres nuværende policies. Den kommer med i svaret.
2. **Rolle:** `telemarketing` tilføjes til rolle-listen. Hjælpefunktionen `er_telemarketing()` bliver security definer.
3. **Lukning af databasen:** alle policies, der i dag giver "alle indloggede" adgang, får `AND NOT er_telemarketing()`. Det gælder bl.a. salg, faktura, priser, bonus, maskiner, aftaler, tilbud, aktiviteter, profiler, salgskort og distrikter. Security-definer-funktioner, der returnerer salgs- eller kundedata, afviser telemarketing øverst. Admin og sælgere får ikke ændret noget.
4. **Bureauets adgang:**
   - Ny tabel `kontaktliste_ringer` (liste ↔ bureaubruger).
   - Nye felter på `contact_lists`: `moede_modtager` ('distrikt'|'fast'), `moede_saelger_user_id` (fast sælger eller den sælger, der bruges, når distriktet ikke giver en).
   - Bureauet kan læse egne lister og deres rækker via RLS.
   - Virksomhedsdata hentes kun gennem funktionen `tm_virksomheder(liste_id)`. Den giver navn, CVR, adresse, postnr./by, telefon, e-mail, hjemmeside, branche og ansatte. Bureauet får ingen direkte adgang til `companies`.
   - Kontaktpersoner: bureauet kan læse, oprette og rette kontaktpersoner på virksomheder på deres lister, via policies på `contacts`.
5. **Opkald:** ny tabel `kontaktliste_opkald` (liste, virksomhed, bruger, tidspunkt, udfald, årsag, note, ring_igen_at, mødedata). Bureauet læser og opretter kun sine egne opkald.
   - "Møde booket" går gennem funktionen `tm_book_moede`. Den finder sælgeren via det gældende distriktskort (postnr → flade → distrikt → sælger/dækkes af). Findes der ingen, bruges den valgte sælger. Funktionen opretter en opfølgningsaktivitet og en notifikation til sælgeren og returnerer kun sælgerens navn.
6. **Ønsker ikke kontakt:** nyt flag `ikke_kontakt` (+ tidspunkt og hvem) på `companies`. Det sættes via en funktion. Kun admin kan fjerne det. Virksomheder med flaget udelukkes i CVR-søgning og CVR-import og skjules i bureauets kø.
7. **Brugerstyring:** admin kan oprette telemarketing-brugere (servervalidering af admin), deaktivere dem (ban) og se sidste login.
8. **Navigation:** telemarketing-brugere ser kun "Kontaktlister" og ingen afdelingsvælger. Alle andre sider sender dem til /kontaktlister, også efter login.
9. **Kontaktliste (admin):** felterne "Ringes af", "Møder går til" og formålet som manus. "Opret liste fra CVR" kan sættes direkte til et bureau. Admin får også et overblik: ringet, opnået, møder, årsager til "ikke interesseret", antal pr. bureaubruger og pr. dag, samt CSV-eksport.
10. **Ringevisning:** kø ("Ring igen", der er forfaldne, først, derefter ikke-kontaktede), virksomhedskort med tel:-link, kontaktpersoner, tidligere opkald og udfaldsknapper. Efter 3× "Ingen svar" foreslås "Ikke opnået".
11. **Test:** testbruger, en liste med 3 virksomheder, menu og redirects. Direkte forespørgsler med bureauets login mod bl.a. sales_monthly, invoice_lines, companies, profiles og activities skal give 0 rækker eller fejl. Jeg tjekker også, at en sælger ser det samme som før, og at et booket møde lander hos den rigtige sælger. Bagefter slettes alt testdata.

## Antagelser
- "Opnået" = udfaldene ikke interesseret, ønsker ikke kontakt og møde booket.
- Bureauet ser ikke kundestatus. Profiler ser de kun som sælgerens navn, og kun via funktionen til mødebooking.
- Arbejdet leveres i 2–3 omgange: først database og sikkerhed med test, derefter ringevisning og overblik.

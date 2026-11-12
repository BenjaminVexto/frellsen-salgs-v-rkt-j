# Roadmap — Tilbud del 1: modtagerlinks, offentlig side, åbningssporing

## Aktuelt: Aktør-import flytter eksisterende afdelinger
- [x] Flyt samme leveringsnummer inden for samme afdeling til Fakt. kunde med bevaret ID og gammel virksomhed; ny virksomhed afvises ikke af den automatiske primærafdeling.
- [x] Afvent flytning før sælgertildeling, salgstilknytning og importresultat; vis flyttelog og fejl. Lokationsbundne aktiviteter, kontakter og månedssalg følger atomisk med.
- [x] Seks tests med de faktiske flyttefunktioner i isoleret PostgreSQL: 1784602/afd. 11 fra 1784600, 7158101/afd. 21 fra 7158100, bevarede ID/maskiner/historik, gammel konto, gentagelse og adgang. Indlogget importside åbner uden runtimefejl; build OK. Ingen rigtig import udført og de to eksisterende kunders data er urørte; flytning sker ved næste Aktør-import.

## Aktuelt: Egne opfølgninger og virksomhedslinks
- [x] Dagens fokus og Overskredet åbner den konkrete virksomhed med typed virksomhedslink.
- [x] Boosts ring-igen-opgaver og afsluttede listeudfald vises ikke som sælgerens egne; egne aktivitetsopfølgninger medtages, bookede salgsmuligheder bevares.
- [x] Fem regressionstests bestået; indlogget admin i Mads-visning: SameSystem og AGC er væk fra Overskredet, egen opfølgning Danske Advokater åbner korrekt virksomhed. Build OK, ingen runtimefejl, ingen data- eller adgangsændringer. Separat direkte Mads-session er ikke testet.

## Aktuelt: Afdelinger, seks måneder og virksomhedssøgning
- [x] Skift brugerrettede lokationsbetegnelser til Afdelinger; links og tekniske nøgler bevaret.
- [x] Seks kalendermåneders aktivgrænse i centrale statusregler, købsrytme og forklaringer; længere købsrytme og øvrige statusregler bevaret. Eksisterende adminfunktion opdaterede status for 21.793 konti uden ændring af salgs- eller bonusberegninger.
- [x] Aktive kunder som standard med lokale statusfaner og antal match i øvrige statusser; søgning og gruppevalg bevaret.
- [x] 26 regressionstests bestået; SQL-grænseprøver OK. Indlogget kontrol ved 1280 px: IBF viser 1 aktiv og 1 tidligere konto, faner viser de korrekte match, Alle viser begge; Afdelinger åbner korrekt uden runtimefejl.

## Aktuelt: Agent på kontaktlisteudfald
- [x] Agent A–H på opkaldsloggen, påkrævet for bureauet med eksisterende adgangskontrol bevaret; gamle registreringer er null.
- [x] Agentvalg med browserhukommelse, seneste-agentfilter og agent i liste/historik; direkte Ingen svar og fri note går også via dialogen.
- [x] 23 tests bestået og build OK; egen adminkonto verificeret med skjult agentvalg, agentfilter og reel note gemt/genlæst. Testnoter og aktiviteter slettet.
- [ ] Bureauets indloggede end-to-end-kontrol af Agent C og historik afventer adgang: sessionsoprettelse for bureaukontoen kræver godkendelse, som ikke er tilgængelig her.

## Aktuelt: Salgsstatistik-layout
- [x] Indholdstilpassede højder; midlertidig højdelås kun ved lokal datahentning.
- [x] Kompakte ens beløbstabeller og korrekt fælles månedsakse med synlige standardserier.
- [x] Fire tests bestået; graf 1–3 browserkontrolleret ved 1280 px: alle tabeller passer uden overflow, indholdshøjde = tabelhøjde, 12 punkter pr. serie og oktoberpunkter præcist over okt 2026. Tre runder visningsskift og serieklik: scroll 600 uændret, ingen datahentning/remontering/loading i øvrige grafer; service til/fra henter kun DB én gang. Build OK, ingen dataændringer. Browseren begrænser dog scroll til sidens nye bund, hvis kortere indhold gør den tidligere position fysisk umulig; det kræver tom plads på siden at undgå den naturlige grænse.

## Aktuelt: Isolerede visningsvalg i salgsstatistik
- [x] Grafvisning og serievalg er lokal state i en stabil grafkomponent; leje/service og beløbsdata er isoleret i hver beløbsgraf uden navigation.
- [x] To regressionstests bestået; indlogget browserkontrol af tre runder Tabel/Graf/Udvikling og serieklik på graf 3: scroll 1224 uændret, ingen datahentninger/remontering/loading i andre grafer. Graf 2 service til/fra: scroll 717 uændret, kun én DB-hentning, tilbagevalg genbruger cache; build OK. Ingen lagrede data ændret.

## Aktuelt: Fakturajournalens subtotaler og originalfil
- [x] Ret subtotal-/totallinjegenkendelse og acceptér tomme talfelter som null uden ændring af eksisterende data.
- [x] Gem uændret originalfil på importjobbet og vis download i Importhistorik.
- [x] 80 tests bestået; indlogget analyse viser tom DB udledt til 90 kr. og totallinje OK uden import. Originalfilens uændrede bytes, jobsti og historik-download verificeret med simulerede storage/job-svar uden writes; faktisk ny import bevidst ikke udført. Oktobertal urørte.

## Aktuelt: Sælgerindsats synlig for callere
- [x] Sikker læseadgang til konkurrentaftale, seneste sælgeraktivitet og virksomhedshistorik uden statusændringer.
- [x] Ringelistekolonne, Sælger aktiv-badge, inkluder/udelad-filter og sidepanel med markeret listehistorik.
- [x] 13 tests bestået; callerens rigtige liste viser 8 aktive og 819 øvrige, sælgerhistorik og liste-markering; uvedkommende virksomheder/lister og direkte datalæsning afvist, status uændret. Ingen testdata oprettet. Ingen aktive konkurrentaftaler på eksisterende kontaktlister til positiv browserkontrol.

## Aktuelt: Fakturajournal med overskrifter
- [x] Match overskrifter, afvis manglende/dobbelte felter og bevar 17/20-kolonners fallback.
- [x] Vis matching og ignorerede kolonner ved analyse; opdatér sidens tekst.
- [x] 72 tests bestået; indlogget analyse verificeret med omordnede kolonner, manglende felt og dublet; ingen testfakturaer importeret.

## Aktuelt: Digitalt katalog via Graph
- [x] Fælles Graph-hjælper til tilbud og katalog; admin-only katalogknap og serverkontrol.
- [x] Katalogafsendelse med sendt/fejlet, kontakt og aktivitet først efter succes, 7 dages opfølgning.
- [x] Første klik via /k/[id], redirect og Åbnet-dato på kundekortet.
- [x] 13 målrettede tests; indlogget katalogdialog og succesregistrering/7 dages opfølgning/302/første klik/Åbnet-dato verificeret. Testdata slettet; ingen rigtig mail sendt.

## Aktuelt: Fritekstsøgning på Virksomheder
- [x] Ordmatch på tværs af konto/lokationer med Unicode-ordstart og eksisterende tal-/telefonmatch.
- [x] Vis kun matchende gruppekonti ved fritekst; bevar overskrift og tilføj vis-alle-knap; ret tæller.
- [x] 9 målrettede tests og browserkontrol: DSV 11 konti, DSV hedehusene 4 konti, hovedgaden 630 og 2640 fungerer; vis-alle ændrer ikke matchtæller.

- [x] 1. Migration: `quote_recipients` + `quote_events` (RLS som quotes, tm_spaerret, grants)
- [x] 2. Migration: token-validerings-RPC `quote_recipient_by_token` (security definer, public read)
- [x] 3. Migration: sporings-RPC `quote_track_event` (aabnet/downloadet, tællere, status→under_opfølgning, notifikation til sælger)
- [x] 4. UI: Modtagere-sektion på PDF-tilbudsvisning + Aftaler & tilbud (tilføj, kopiér link, send-mail grå)
- [x] 5. Offentlig side `/t/$token` (noindex, pdf.js legacy v4, download, uden login)
- [x] 6. Sporing: aabnet ved sidebesøg, downloadet ved download, ikke for indloggede CRM-brugere
- [x] 7. Salgsmulighedskort: åbningslinje (ikke åbnet 3 dage / 2+ åbninger 48t / åbnet dato)
- [x] 8. Server function `sendTilbudMail` (Graph client credentials, deaktiveret uden secrets)
- [x] 9. Test: modtager på tilbud 18749, åbnet link uden login, logning verificeret, testdata slettet, status nulstillet til sendt

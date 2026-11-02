# Roadmap — Tilbud del 1: modtagerlinks, offentlig side, åbningssporing

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

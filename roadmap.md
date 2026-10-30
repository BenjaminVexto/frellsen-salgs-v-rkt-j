# Roadmap — Tilbud del 1: modtagerlinks, offentlig side, åbningssporing

## Aktuelt: Digitalt katalog via Graph
- [ ] Fælles Graph-hjælper til tilbud og katalog; admin-only katalogknap.
- [ ] Katalogafsendelse med sendt/fejlet, kontakt og aktivitet først efter succes, 7 dages opfølgning.
- [ ] Første klik via /k/[id], redirect og Åbnet-dato på kundekortet.
- [ ] Målrettede tests og kontrol af brugerflow; ingen kundemails under test.

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

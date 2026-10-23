# Roadmap — Tilbud del 1: modtagerlinks, offentlig side, åbningssporing

- [ ] 1. Migration: `quote_recipients` + `quote_events` (RLS som quotes, tm_spaerret, grants)
- [ ] 2. Migration: token-validerings-RPC `quote_recipient_by_token` (security definer, public read)
- [ ] 3. Migration: sporings-RPC `quote_track_event` (aabnet/downloadet, tællere, status→under_opfølgning, notifikation til sælger)
- [ ] 4. UI: Modtagere-sektion på PDF-tilbudsvisning + Aftaler & tilbud (tilføj, kopiér link, send-mail grå)
- [ ] 5. Offentlig side `/t/$token` (noindex, pdf.js, download, uden login)
- [ ] 6. Sporing: aabnet ved sidebesøg, downloadet ved download, ikke for indloggede CRM-brugere
- [ ] 7. Salgsmulighedskort: åbningslinje (ikke åbnet 3 dage / 2+ åbninger 48t / åbnet dato)
- [ ] 8. Server function `sendTilbudMail` (Graph client credentials, deaktiveret uden secrets)
- [ ] 9. Test: modtager på tilbud 18749, åbn link uden login, verificér logning, slet testdata, nulstil status

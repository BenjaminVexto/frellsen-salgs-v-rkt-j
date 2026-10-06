
- Målepunkter, portefølje og bonus læser salg fra sales_kunde_maaned/company_mp_info, som holdes ajour af triggere på sales_monthly og companies — så tallene er hurtige og aldrig skal genberegnes manuelt.
- Store serverfunktionssvar (portefølje) sendes som én JSON-streng, fordi TanStack Start begrænser antal serialiseringsposter pr. svar.
- Sælgertilskrivning sker pr. lokation (locations.saelger_user_id, sat af Aktør-importen via aktoer_anvend_saelgere på serveren); companies.assigned_to er kun hovedkontoens ansvarlige sælger — because one company can have locations with several sellers.
- DB/DG visibility is decided by the database function maa_se_db (admin or profiles.maa_se_db), never by the admin role alone — so it can be switched off per person.
- Address search and group (parent/sister) data come live from the CVR Elasticsearch distribution (produktionsenhed/virksomhed indexes) merged with cvr_penheder — because our local copy only covers CVRs already in the CRM.
- P-enheder kobles til lokationer via location_pnr_link (unik pr. P-nr + lokation, så én P-enhed kan dække flere konti på samme adresse); auto-matchning bruger addr_n_vej/addr_n_husnr + postnr og springer lokationer over, der matcher flere P-enheder — because usikre match ikke må kobles automatisk.


- Målepunkter, portefølje og bonus læser salg fra sales_kunde_maaned/company_mp_info, som holdes ajour af triggere på sales_monthly og companies — så tallene er hurtige og aldrig skal genberegnes manuelt.
- Store serverfunktionssvar (portefølje) sendes som én JSON-streng, fordi TanStack Start begrænser antal serialiseringsposter pr. svar.
- Sælgertilskrivning sker pr. lokation (locations.saelger_user_id, sat af Aktør-importen via aktoer_anvend_saelgere på serveren); companies.assigned_to er kun hovedkontoens ansvarlige sælger — because one company can have locations with several sellers.
- DB/DG visibility is decided by the database function maa_se_db (admin or profiles.maa_se_db), never by the admin role alone — so it can be switched off per person.
- Address search and group (parent/sister) data come live from the CVR Elasticsearch distribution (produktionsenhed/virksomhed indexes) merged with cvr_penheder — because our local copy only covers CVRs already in the CRM.
- P-enheder kobles til lokationer via location_pnr_link (unik pr. P-nr + lokation, så én P-enhed kan dække flere konti på samme adresse); auto-matchning bruger addr_n_vej/addr_n_husnr + postnr og springer lokationer over, der matcher flere P-enheder — because usikre match ikke må kobles automatisk.

- Aktiviteters dato vises og sorteres på activities.udfoert_at (brugervalgt, højst 14 dage tilbage, valideret af trigger); created_at er den uændrede registreringstid — so the two can be compared.
- Maskiners "Placering i bygningen" ligger i maskine_placering pr. serienr. (ikke på location_equipment_units, som importen sletter/genindsætter); importen må kun skrive via import_maskine_placering, der ignorerer tomme værdier og aldrig overskriver CRM-indtastninger — because brugerindtastninger ikke må gå tabt ved import.
- Fakturajournalens DB 0-linjer udledes pr. kunde mod Vismas summeringslinje (src/lib/invoice-db-udledning.ts, invoice_lines.db_kilde, invoice_db_afstemning) — never a general 'DB 0 = 100 %' rule, because real DB-0 sales (machines) exist.

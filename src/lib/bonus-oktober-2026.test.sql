-- Read-only regression tests; every result must be true.
SELECT public.maskin_bonusklasse('Animo OptiVend', DATE '2026-08-01') = 'ingen' AS optivend_before_september;
SELECT public.maskin_bonusklasse('Animo OptiVend', DATE '2026-09-01') = 'ingen' AS optivend_no_bonus_from_20_10_rules;
SELECT public.maskin_bonusklasse('Kalerm 1601', DATE '2026-10-01') = 'kalerm' AS kalerm_class;
SELECT public.maskin_bonusklasse('Profitec 700', DATE '2026-10-01') = 'espresso' AS profitec_espresso;
SELECT public.maskin_bonusklasse('Hi-Class 30L CO2', DATE '2026-10-01') = 'ingen' AS friskvand_no_bonus;
SELECT count(*) = 0 AS all_orders_have_brugt_250 FROM public.bonus_ordning WHERE bonus_brugt <> 250 OR bonus_kalerm <> 500 OR bonus_espresso <> 500 OR ombytning_mdr <> 24;
SELECT public.maskin_bonusklasse('Animo OptiBean', DATE '2026-08-01') = 'animo' AS optibean_unchanged;
SELECT public.maskin_bonusklasse('Rex-Royal', DATE '2026-09-01') = 'rex' AS rex_unchanged;
SELECT public.maskin_bonusklasse('Gaggia G300', DATE '2026-09-01') = 'wittenborg' AS gaggia_unchanged;
SELECT count(*) = 1 AND bool_and(db_provision_pct = 1.75 AND db_fradrag IS NULL AND db_bund = 0) AS ordning_175 FROM public.bonus_ordning WHERE id = '3d5cbb26-9ec5-4e22-b55d-d19b7013f5aa';
SELECT count(*) = 1 AND bool_and(db_provision_pct = 2 AND db_fradrag = 2000 AND db_bund = 2000) AS ordning_2_2000 FROM public.bonus_ordning WHERE id = 'c9286dea-56e9-4ec6-a119-319827386d64';
SELECT count(*) = 1 AND bool_and(db_provision_pct = 2 AND db_fradrag = 1000 AND db_bund = 3500) AS ordning_2_3500 FROM public.bonus_ordning WHERE id = 'a26eb263-6484-49f5-8b0c-08d316eee5cc';
SELECT count(*) = 1 AND bool_and(db_provision_pct = 2.88 AND db_fradrag IS NULL AND db_bund = 3500) AS ordning_288 FROM public.bonus_ordning WHERE id = '5537f3e3-7e22-4935-aedb-e91d38c7a60a';
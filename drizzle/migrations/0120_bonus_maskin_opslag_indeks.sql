CREATE INDEX IF NOT EXISTS bonus_invoice_serial_ordre_idx ON public.invoice_lines ((btrim(split_part(varetekst, ':', 2))), ordre_nr) WHERE afdeling_nr = 11 AND varegruppe_2 = '83' AND varetekst ILIKE 'serienr%';
CREATE INDEX IF NOT EXISTS bonus_invoice_ordre_vare_idx ON public.invoice_lines (ordre_nr, afdeling_nr, varegruppe_2, faktura_dato) WHERE varegruppe_1 = '16';
CREATE INDEX IF NOT EXISTS bonus_haendelser_kobt_idx ON public.maskin_haendelser (kobt_dato, serienr) WHERE kobt_dato IS NOT NULL;
CREATE INDEX IF NOT EXISTS bonus_haendelser_leje_idx ON public.maskin_haendelser (lease_leje_dato, serienr) WHERE lease_leje_dato IS NOT NULL;
CREATE INDEX IF NOT EXISTS bonus_haendelser_lev_sn_idx ON public.maskin_haendelser (lev_kundenr, serienr);
CREATE INDEX IF NOT EXISTS bonus_haendelser_sn_import_idx ON public.maskin_haendelser (serienr, import_tid DESC);
CREATE INDEX IF NOT EXISTS bonus_machines_lev_sn_idx ON public.machines (lev_kundenr, serienr);
CREATE INDEX IF NOT EXISTS bonus_machines_kobt_idx ON public.machines (kobt_dato, serienr) WHERE afdeling_nr=11;
CREATE INDEX IF NOT EXISTS bonus_machines_leje_idx ON public.machines (lease_leje_dato, serienr) WHERE afdeling_nr=11;
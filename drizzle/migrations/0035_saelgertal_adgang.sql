-- Kun admin og salgssupport må se andre sælgeres tal (maa_se_analyse giver ikke længere adgang her)
CREATE OR REPLACE FUNCTION public.maalepunkt_adgang(_saelger uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'salgssupport')
      OR (_saelger IS NOT NULL AND _saelger = auth.uid())
$function$;

-- Portefølje- og maskingrundlag-funktioner: tilføj adgangstjek på _saelger
DO $$
DECLARE r record; d text; nd text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace
           AND proname IN ('portfolio_aggregat','portfolio_totaler','portfolio_db_ytd','portfolio_aggregat_json','bonus_maskin_grundlag','bonus_maskin_grundlag_faktura')
  LOOP
    d := pg_get_functiondef(r.oid);
    nd := replace(d, '(_saelger IS NULL OR c.assigned_to = _saelger)', '(_saelger IS NULL OR c.assigned_to = _saelger) AND public.maalepunkt_adgang(_saelger)');
    nd := replace(nd, 'WHERE c.assigned_to = _saelger', 'WHERE c.assigned_to = _saelger AND public.maalepunkt_adgang(_saelger)');
    IF nd <> d THEN EXECUTE nd; END IF;
  END LOOP;
END $$;

-- Drill-down: DB kun for admin (serverside)
ALTER FUNCTION public.maalepunkt_db_detaljer(uuid, date, date, text, date, integer) RENAME TO _maalepunkt_db_detaljer_raw;
REVOKE EXECUTE ON FUNCTION public._maalepunkt_db_detaljer_raw(uuid, date, date, text, date, integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.maalepunkt_db_detaljer(_saelger uuid, _fra date, _til date, _kategori text DEFAULT NULL, _maaned date DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT r.company_id, r.navn, r.by,
    CASE WHEN public.is_admin(auth.uid()) THEN r.db ELSE NULL END, r.omsaetning
  FROM public._maalepunkt_db_detaljer_raw(_saelger, _fra, _til, _kategori, _maaned, _afdeling_nr) r
$$;
GRANT EXECUTE ON FUNCTION public.maalepunkt_db_detaljer(uuid, date, date, text, date, integer) TO authenticated;
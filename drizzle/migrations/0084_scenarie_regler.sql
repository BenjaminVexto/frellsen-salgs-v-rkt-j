CREATE TABLE public.scenarie_regel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenarie_id uuid NOT NULL REFERENCES public.distrikt_scenarie(id) ON DELETE CASCADE,
  sortering int NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('tildel','udeluk')),
  saelger_user_id uuid,
  saelger_fiktiv_id uuid REFERENCES public.scenarie_saelger(id) ON DELETE CASCADE,
  betingelse jsonb NOT NULL DEFAULT '{}'::jsonb,
  aktiv boolean NOT NULL DEFAULT true,
  oprettet_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scenarie_regel_scenarie_idx ON public.scenarie_regel(scenarie_id, sortering);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenarie_regel TO authenticated;
GRANT ALL ON public.scenarie_regel TO service_role;
ALTER TABLE public.scenarie_regel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin scenarie_regel" ON public.scenarie_regel FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Kopiér regler med, når et scenarie kopieres (fiktive sælgere mappes efter navn i det nye scenarie)
CREATE OR REPLACE FUNCTION public._scenarie_regel_kopier(_fra uuid, _til uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO scenarie_regel (scenarie_id, sortering, type, saelger_user_id, saelger_fiktiv_id, betingelse, aktiv)
  SELECT _til, r.sortering, r.type, r.saelger_user_id,
    (SELECT n.id FROM scenarie_saelger o JOIN scenarie_saelger n ON n.scenarie_id = _til AND n.navn = o.navn WHERE o.id = r.saelger_fiktiv_id LIMIT 1),
    r.betingelse, r.aktiv
  FROM scenarie_regel r WHERE r.scenarie_id = _fra
    AND (r.saelger_fiktiv_id IS NULL OR EXISTS (SELECT 1 FROM scenarie_saelger o JOIN scenarie_saelger n ON n.scenarie_id = _til AND n.navn = o.navn WHERE o.id = r.saelger_fiktiv_id));
$$;
REVOKE EXECUTE ON FUNCTION public._scenarie_regel_kopier(uuid, uuid) FROM PUBLIC, anon;

DROP FUNCTION public.admin_salgskort_lokationer();
CREATE FUNCTION public.admin_salgskort_lokationer()
 RETURNS TABLE(location_id uuid, company_id uuid, virksomhedsnavn text, zip_norm text, saelger_user_id uuid, saelger_navn text, salesperson_no text, afdeling_nr integer, customer_segment_1 text, customer_segment_2 text, customer_segment_3 text, customer_type text, agreement_types text, omsaetning_12m numeric, db_12m numeric, ansatte integer, ansatte_kilde text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  _last_full date := (date_trunc('month', now()) - interval '1 month')::date;
  _start_cur date := (date_trunc('month', now()) - interval '12 months')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin') THEN
    RAISE EXCEPTION 'Kun admin';
  END IF;
  RETURN QUERY
  WITH s AS (
    SELECT sm.location_id AS lid, sum(sm.revenue) AS rev, sum(coalesce(sm.contribution,0)) AS db
    FROM sales_monthly sm
    WHERE sm.period >= _start_cur AND sm.period <= _last_full AND sm.location_id IS NOT NULL
    GROUP BY sm.location_id
    HAVING sum(sm.revenue) <> 0
  ), pe AS (
    SELECT k.location_id AS lid, sum(coalesce(cp.ansatte_praecis, cp.ansatte_estimat))::int AS n
    FROM location_pnr_link k JOIN cvr_penheder cp ON cp.p_number = k.p_nummer
    WHERE coalesce(cp.ansatte_praecis, cp.ansatte_estimat) IS NOT NULL
    GROUP BY k.location_id
  )
  SELECT l.id, l.company_id, c.name::text, l.zip_norm::text,
    l.saelger_user_id, p.full_name::text, p.salesperson_no::text, l.afdeling_nr::int,
    c.customer_segment_1::text, c.customer_segment_2::text, c.customer_segment_3::text,
    c.customer_type::text, l.agreement_types::text, s.rev, s.db,
    coalesce(c.employees, pe.n)::int,
    CASE WHEN c.employees IS NOT NULL THEN 'virksomhed' WHEN pe.n IS NOT NULL THEN 'penhed' END
  FROM s
  JOIN locations l ON l.id = s.lid
  JOIN companies c ON c.id = l.company_id
  LEFT JOIN profiles p ON p.id = l.saelger_user_id
  LEFT JOIN pe ON pe.lid = l.id;
END $function$;
REVOKE EXECUTE ON FUNCTION public.admin_salgskort_lokationer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_salgskort_lokationer() TO authenticated;
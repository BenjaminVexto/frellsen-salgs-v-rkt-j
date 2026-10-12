CREATE TABLE public.postnummer_flader (
  flade int PRIMARY KEY,
  navn text,
  landsdel text,
  postnumre int[],
  lx numeric,
  ly numeric,
  geom jsonb
);
CREATE TABLE public.postnummer_flade_map (
  postnr text PRIMARY KEY,
  flade int REFERENCES public.postnummer_flader(flade)
);
GRANT SELECT ON public.postnummer_flader TO authenticated;
GRANT SELECT ON public.postnummer_flade_map TO authenticated;
GRANT ALL ON public.postnummer_flader TO service_role;
GRANT ALL ON public.postnummer_flade_map TO service_role;
ALTER TABLE public.postnummer_flader ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postnummer_flade_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læser flader" ON public.postnummer_flader FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin læser fladeopslag" ON public.postnummer_flade_map FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_salgskort_lokationer()
RETURNS TABLE (
  location_id uuid, company_id uuid, virksomhedsnavn text, zip_norm text,
  saelger_user_id uuid, saelger_navn text, salesperson_no text, afdeling_nr int,
  customer_segment_1 text, customer_segment_2 text, customer_segment_3 text,
  customer_type text, agreement_types text, omsaetning_12m numeric, db_12m numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET statement_timeout = '60s'
AS $$
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
  )
  SELECT l.id, l.company_id, c.name::text, l.zip_norm::text,
    l.saelger_user_id, p.full_name::text, p.salesperson_no::text, l.afdeling_nr::int,
    c.customer_segment_1::text, c.customer_segment_2::text, c.customer_segment_3::text,
    c.customer_type::text, l.agreement_types::text, s.rev, s.db
  FROM s
  JOIN locations l ON l.id = s.lid
  JOIN companies c ON c.id = l.company_id
  LEFT JOIN profiles p ON p.id = l.saelger_user_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_salgskort_lokationer() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_salgskort_lokationer() TO authenticated;
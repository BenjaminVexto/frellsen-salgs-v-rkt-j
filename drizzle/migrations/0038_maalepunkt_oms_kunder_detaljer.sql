CREATE OR REPLACE FUNCTION public.maalepunkt_oms_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL, _afdeling_nr integer DEFAULT NULL, _kun_forbrug boolean DEFAULT true)
RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
        _fg text[] := public.maalepunkt_forbrug_grupper();
        _adm boolean := public.is_admin(auth.uid());
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.city,
         CASE WHEN _adm THEN round(sum(sm.contribution), 2) END,
         round(sum(sm.revenue), 2)
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = ANY (_afd)
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND (_maaned IS NULL OR sm.period = date_trunc('month', _maaned)::date)
    AND (NOT _kun_forbrug OR substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg))
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kategori
  GROUP BY c.id, c.name, c.city
  ORDER BY 5 DESC;
END $$;

CREATE OR REPLACE FUNCTION public.maalepunkt_aktive_kunder_detaljer(_saelger uuid, _fra date, _til date, _kategori text, _maaned date DEFAULT NULL, _afdeling_nr integer DEFAULT NULL)
RETURNS TABLE(company_id uuid, navn text, by text, db numeric, omsaetning numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
        _fg text[] := public.maalepunkt_forbrug_grupper();
        _f date := date_trunc('month', coalesce(_maaned, _fra))::date;
        _t date := LEAST(date_trunc('month', coalesce(_maaned, _til))::date, (date_trunc('month', current_date) - interval '1 month')::date);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.city, NULL::numeric, round(sum(sm.revenue), 2)
  FROM public.companies c
  JOIN public.sales_monthly sm ON sm.company_id = c.id
  WHERE c.afdeling_nr = ANY (_afd)
    AND (_saelger IS NULL OR c.assigned_to = _saelger)
    AND c.afloest_af_company_id IS NULL
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) = _kategori
    AND sm.afdeling_nr = ANY (_afd) AND sm.revenue > 0
    AND substring(btrim(coalesce(sm.product_group_1,'')) FROM '^(\d+)') = ANY(_fg)
    AND sm.period >= (_f - interval '2 months')::date
    AND sm.period <= _t
  GROUP BY c.id, c.name, c.city
  ORDER BY 5 DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.maalepunkt_oms_detaljer(uuid,date,date,text,date,integer,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.maalepunkt_aktive_kunder_detaljer(uuid,date,date,text,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maalepunkt_oms_detaljer(uuid,date,date,text,date,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maalepunkt_aktive_kunder_detaljer(uuid,date,date,text,date,integer) TO authenticated;
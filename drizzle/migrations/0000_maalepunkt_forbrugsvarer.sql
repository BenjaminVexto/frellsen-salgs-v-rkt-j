-- Forbrugsvaregrupper (2,4,6,8,10,12,14,20,22,23) kan udvides her.
CREATE OR REPLACE FUNCTION public.maalepunkt_forbrug_grupper()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY['2','4','6','8','10','12','14','20','22','23']::text[]
$$;

GRANT EXECUTE ON FUNCTION public.maalepunkt_forbrug_grupper() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.maalepunkt_omsaetning(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT sm.period AS maaned,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
         round(sum(sm.revenue), 2) AS vaerdi
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND (NOT coalesce(_kun_forbrug, true)
         OR sm.product_group_1 = ANY (public.maalepunkt_forbrug_grupper()))
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.maalepunkt_omsaetning(uuid, date, date, boolean) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.maalepunkt_db(_saelger uuid, _fra date, _til date, _kun_forbrug boolean)
RETURNS TABLE(maaned date, kategori text, vaerdi numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;

  RETURN QUERY
  SELECT sm.period AS maaned,
         public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) AS kategori,
         round(sum(sm.contribution), 2) AS vaerdi
  FROM public.sales_monthly sm
  JOIN public.companies c ON c.id = sm.company_id
  WHERE sm.afdeling_nr = 11
    AND sm.period >= date_trunc('month', _fra)::date
    AND sm.period <= date_trunc('month', _til)::date
    AND sm.period < date_trunc('month', current_date)::date
    AND c.assigned_to = _saelger
    AND c.afloest_af_company_id IS NULL
    AND (NOT coalesce(_kun_forbrug, true)
         OR sm.product_group_1 = ANY (public.maalepunkt_forbrug_grupper()))
    AND public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3) IS NOT NULL
  GROUP BY 1, 2;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.maalepunkt_db(uuid, date, date, boolean) TO anon, authenticated, service_role;

-- Ældste og nyeste måned med salgsdata i afdeling 11 (til at afgøre om sidste års periode er dækket).
CREATE OR REPLACE FUNCTION public.maalepunkt_datadaekning()
RETURNS TABLE(foerste_periode date, sidste_periode date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT min(period)::date, max(period)::date
  FROM public.sales_monthly
  WHERE afdeling_nr = 11
$$;

GRANT EXECUTE ON FUNCTION public.maalepunkt_datadaekning() TO anon, authenticated, service_role;
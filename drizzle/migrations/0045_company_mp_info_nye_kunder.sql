-- Kundeoplysninger som "Nye kunder" grupperer på (CVR + adresse + postnr),
-- forudberegnet så adressenormaliseringen ikke køres for alle kunder pr. kald.
-- Holdes ajour af trigger på companies (Aktør-import, sælgertildeling, rettelser).
CREATE TABLE public.company_mp_info (
  company_id uuid PRIMARY KEY,
  gkey text NOT NULL,
  kat text,
  afdeling_nr integer,
  assigned_to uuid,
  gyldig boolean NOT NULL DEFAULT false,
  created_in_visma date
);
GRANT SELECT ON public.company_mp_info TO authenticated;
GRANT ALL ON public.company_mp_info TO service_role;
ALTER TABLE public.company_mp_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin kan læse kundenøgler" ON public.company_mp_info
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE INDEX idx_cmi_afd_saelger ON public.company_mp_info (afdeling_nr, assigned_to);
COMMENT ON TABLE public.company_mp_info IS
  'Forudberegnet fra companies: grupperingsnøgle for nye kunder (cvr|addr_base(address)|zip), kategori, afdeling, sælger. Ajourføres af trigger.';

INSERT INTO public.company_mp_info
SELECT c.id,
       coalesce(nullif(btrim(c.cvr), ''), '-') || '|' || public.addr_base(c.address) || '|' || coalesce(btrim(c.zip), ''),
       public.maalepunkt_kundekategori(c.binding_status, c.customer_segment_3),
       c.afdeling_nr, c.assigned_to, (c.afloest_af_company_id IS NULL), c.created_in_visma::date
FROM public.companies c;
ANALYZE public.company_mp_info;

CREATE OR REPLACE FUNCTION public._cmi_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.company_mp_info WHERE company_id = OLD.id;
    RETURN NULL;
  END IF;
  INSERT INTO public.company_mp_info (company_id, gkey, kat, afdeling_nr, assigned_to, gyldig, created_in_visma)
  VALUES (NEW.id,
          coalesce(nullif(btrim(NEW.cvr), ''), '-') || '|' || public.addr_base(NEW.address) || '|' || coalesce(btrim(NEW.zip), ''),
          public.maalepunkt_kundekategori(NEW.binding_status, NEW.customer_segment_3),
          NEW.afdeling_nr, NEW.assigned_to, (NEW.afloest_af_company_id IS NULL), NEW.created_in_visma::date)
  ON CONFLICT (company_id) DO UPDATE SET
    gkey = EXCLUDED.gkey, kat = EXCLUDED.kat, afdeling_nr = EXCLUDED.afdeling_nr,
    assigned_to = EXCLUDED.assigned_to, gyldig = EXCLUDED.gyldig, created_in_visma = EXCLUDED.created_in_visma;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_cmi_ins AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._cmi_sync();
CREATE TRIGGER trg_cmi_del AFTER DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public._cmi_sync();
CREATE TRIGGER trg_cmi_upd AFTER UPDATE OF cvr, address, zip, binding_status, customer_segment_3, afdeling_nr, assigned_to, afloest_af_company_id, created_in_visma
  ON public.companies FOR EACH ROW
  WHEN (OLD.cvr IS DISTINCT FROM NEW.cvr OR OLD.address IS DISTINCT FROM NEW.address
     OR OLD.zip IS DISTINCT FROM NEW.zip OR OLD.binding_status IS DISTINCT FROM NEW.binding_status
     OR OLD.customer_segment_3 IS DISTINCT FROM NEW.customer_segment_3
     OR OLD.afdeling_nr IS DISTINCT FROM NEW.afdeling_nr OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
     OR OLD.afloest_af_company_id IS DISTINCT FROM NEW.afloest_af_company_id
     OR OLD.created_in_visma IS DISTINCT FROM NEW.created_in_visma)
  EXECUTE FUNCTION public._cmi_sync();

CREATE OR REPLACE FUNCTION public.maalepunkt_nye_kunder(_saelger uuid, _fra date, _til date, _afdeling_nr integer DEFAULT NULL::integer)
 RETURNS TABLE(maaned date, kategori text, antal integer, db numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _afd int[] := public.maalepunkt_afdelinger(_saelger, _afdeling_nr);
BEGIN
  IF NOT public.maalepunkt_adgang(_saelger) THEN
    RAISE EXCEPTION 'Ingen adgang til disse målepunkter';
  END IF;
  RETURN QUERY
  WITH kand AS MATERIALIZED (
    SELECT i.company_id AS id, i.created_in_visma, i.kat AS kategori, i.gkey
    FROM public.company_mp_info i
    WHERE i.afdeling_nr = ANY (_afd)
      AND (_saelger IS NULL OR i.assigned_to = _saelger)
      AND i.gyldig
      AND i.created_in_visma IS NOT NULL
      AND i.kat IS NOT NULL
  ), agg AS (
    SELECT f.company_id,
           min(f.period) FILTER (WHERE f.pos_any) AS foerste_ordre,
           coalesce(sum(f.contrib) FILTER (
             WHERE f.period >= date_trunc('month', _fra)::date
               AND f.period <= date_trunc('month', _til)::date
               AND f.period < date_trunc('month', current_date)::date), 0) AS db_periode
    FROM public.sales_kunde_maaned f
    WHERE f.c_afd = ANY (_afd) AND f.gyldig AND f.kat IS NOT NULL
      AND (_saelger IS NULL OR f.saelger = _saelger)
      AND f.afdeling_nr = ANY (_afd)
    GROUP BY f.company_id
  ), acc AS (
    SELECT k.id, k.created_in_visma, k.kategori, k.gkey,
           a.foerste_ordre, coalesce(a.db_periode, 0) AS db_periode
    FROM kand k LEFT JOIN agg a ON a.company_id = k.id
  ), grp AS (
    SELECT a.gkey,
           min(a.foerste_ordre) AS foerste_ordre,
           sum(a.db_periode) AS db_periode,
           (array_agg(a.kategori ORDER BY a.created_in_visma, a.id))[1] AS kategori
    FROM acc a
    GROUP BY a.gkey
  )
  SELECT date_trunc('month', g.foerste_ordre)::date, g.kategori, count(*)::int, round(sum(g.db_periode), 2)
  FROM grp g
  WHERE g.foerste_ordre IS NOT NULL
    AND date_trunc('month', g.foerste_ordre)::date >= date_trunc('month', _fra)::date
    AND date_trunc('month', g.foerste_ordre)::date <= date_trunc('month', _til)::date
    AND date_trunc('month', g.foerste_ordre)::date < date_trunc('month', current_date)::date
  GROUP BY 1, 2;
END;
$function$;

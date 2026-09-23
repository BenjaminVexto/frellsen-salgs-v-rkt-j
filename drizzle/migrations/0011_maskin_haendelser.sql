CREATE TABLE IF NOT EXISTS public.maskin_haendelser (
  id bigserial PRIMARY KEY,
  serienr text NOT NULL,
  lev_kundenr text,
  company_id uuid REFERENCES public.companies(id),
  kobt_dato date,
  lease_leje_dato date,
  aftale_type text,
  maskin_type text,
  taellerstand numeric,
  import_tid timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.maskin_haendelser TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.maskin_haendelser_id_seq TO authenticated;
GRANT ALL ON public.maskin_haendelser TO service_role;
GRANT ALL ON SEQUENCE public.maskin_haendelser_id_seq TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS maskin_haendelser_unik_idx
  ON public.maskin_haendelser (
    serienr,
    coalesce(lev_kundenr, ''),
    coalesce(kobt_dato, '1900-01-01'::date),
    coalesce(lease_leje_dato, '1900-01-01'::date)
  );

CREATE INDEX IF NOT EXISTS maskin_haendelser_serienr_idx ON public.maskin_haendelser (serienr);
CREATE INDEX IF NOT EXISTS maskin_haendelser_company_idx ON public.maskin_haendelser (company_id);

ALTER TABLE public.maskin_haendelser ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brugere kan se maskinhaendelser i egne afdelinger"
  ON public.maskin_haendelser FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'salgssupport'::app_role)
    OR (company_id IS NOT NULL AND public.can_view_company(auth.uid(), company_id))
  );

CREATE POLICY "Admin kan indsaette maskinhaendelser"
  ON public.maskin_haendelser FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));
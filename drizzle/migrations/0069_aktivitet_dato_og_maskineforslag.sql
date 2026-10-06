ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS udfoert_at timestamptz NOT NULL DEFAULT now();
UPDATE public.activities SET udfoert_at = created_at WHERE udfoert_at <> created_at;
COMMENT ON COLUMN public.activities.udfoert_at IS 'Valgt dato/tid for aktiviteten (max 14 dage tilbage). created_at er den oprindelige registreringstid.';
CREATE INDEX IF NOT EXISTS activities_company_udfoert_idx ON public.activities(company_id, udfoert_at DESC);

CREATE OR REPLACE FUNCTION public.activities_udfoert_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    IF NEW.udfoert_at IS NOT DISTINCT FROM OLD.udfoert_at THEN RETURN NEW; END IF;
  END IF;
  IF NEW.udfoert_at IS NULL THEN NEW.udfoert_at := now(); END IF;
  IF NEW.udfoert_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Datoen må ikke ligge i fremtiden';
  END IF;
  IF NEW.udfoert_at < now() - interval '14 days' THEN
    RAISE EXCEPTION 'Datoen kan højst ligge 14 dage tilbage';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_activities_udfoert ON public.activities;
CREATE TRIGGER trg_activities_udfoert BEFORE INSERT OR UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.activities_udfoert_check();

-- Tør kørsel: foreslået lokation for maskiner uden lokation (gemmer intet).
CREATE OR REPLACE FUNCTION public.maskiner_uden_lokation_forslag()
RETURNS TABLE(machine_id text, lok_id uuid, lok_afdeling_nr integer, lok_company_id uuid, lok_company_navn text,
  lok_adresse text, lok_kundenr text, antal_match integer, adresse_ens boolean, ny_saelger_navn text, skifter_saelger boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, l.id, l.afdeling_nr, l.company_id, c.name,
    nullif(concat_ws(', ', l.address, nullif(concat_ws(' ', l.zip, l.city), '')), ''),
    l.visma_delivery_no, cnt.n::int,
    (public.addr_n_vej(l.address) = public.addr_n_vej(m.adresselinje2)
      AND public.addr_n_husnr(l.address) = public.addr_n_husnr(m.adresselinje2)),
    pn.full_name,
    (l.id IS NOT NULL AND l.saelger_user_id IS DISTINCT FROM gl.assigned_to)
  FROM public.machines m
  CROSS JOIN LATERAL (SELECT count(*) n FROM public.locations lx WHERE lx.visma_delivery_no = m.lev_kundenr) cnt
  LEFT JOIN LATERAL (SELECT lx.* FROM public.locations lx WHERE lx.visma_delivery_no = m.lev_kundenr AND cnt.n = 1 LIMIT 1) l ON true
  LEFT JOIN public.companies c ON c.id = l.company_id
  LEFT JOIN public.profiles pn ON pn.id = l.saelger_user_id
  LEFT JOIN LATERAL (SELECT c0.assigned_to FROM public.companies c0 WHERE c0.visma_id = m.fak_kundenr
                     ORDER BY (c0.afdeling_nr = m.afdeling_nr) DESC LIMIT 1) gl ON true
  WHERE m.record_status = 'aktiv'
    AND public.is_admin(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.locations l2
                    WHERE l2.afdeling_nr = m.afdeling_nr AND l2.visma_delivery_no = m.lev_kundenr)
$$;
REVOKE EXECUTE ON FUNCTION public.maskiner_uden_lokation_forslag() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.maskiner_uden_lokation_forslag() TO authenticated, service_role;
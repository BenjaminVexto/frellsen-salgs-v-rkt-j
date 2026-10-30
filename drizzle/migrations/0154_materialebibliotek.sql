CREATE TABLE public.materialer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel text NOT NULL CHECK (length(trim(titel)) > 0),
  type text NOT NULL DEFAULT 'link' CHECK (type IN ('link','pdf')),
  url text,
  pdf_path text,
  forside_billede_path text,
  mailtekst text NOT NULL DEFAULT '',
  aktiv boolean NOT NULL DEFAULT true,
  sortering integer NOT NULL DEFAULT 0,
  oprettet_at timestamptz NOT NULL DEFAULT now(),
  opdateret_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT materialer_kilde CHECK ((type = 'link' AND url ~ '^https?://') OR (type = 'pdf' AND pdf_path IS NOT NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.materialer TO authenticated;
GRANT ALL ON public.materialer TO service_role;
GRANT SELECT ON public.materialer TO anon;
ALTER TABLE public.materialer ENABLE ROW LEVEL SECURITY;
CREATE POLICY tm_spaerret ON public.materialer AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY "Indloggede læser materialer" ON public.materialer FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Admin opretter materialer" ON public.materialer FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admin retter materialer" ON public.materialer FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- forside_billede_path må være et fuldt link (migreret katalog) eller en sti i bucket materialer
INSERT INTO public.materialer (titel, type, url, forside_billede_path, mailtekst, aktiv, sortering)
SELECT 'Kaffekatalog', 'link', katalog_url, forside_billede_url, 'Her er vores katalog, som aftalt.', true, 0
FROM public.katalog_indstilling WHERE katalog_url ~ '^https?://';
COMMENT ON TABLE public.katalog_indstilling IS 'DEPRECATED: replaced by materialer';

ALTER TABLE public.katalog_udsendelser ADD COLUMN materiale_id uuid REFERENCES public.materialer(id) ON DELETE SET NULL;
ALTER TABLE public.katalog_udsendelser ADD COLUMN titel text;
ALTER TABLE public.katalog_udsendelser ADD COLUMN gruppe_id uuid;
CREATE INDEX katalog_udsendelser_gruppe_idx ON public.katalog_udsendelser(gruppe_id);

CREATE POLICY "Admin uploader materialer" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'materialer' AND public.is_admin(auth.uid()) AND lower(name) ~ '\.(jpe?g|png|pdf)$');
CREATE POLICY "Admin retter materialefiler" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'materialer' AND public.is_admin(auth.uid())) WITH CHECK (bucket_id = 'materialer' AND public.is_admin(auth.uid()));

-- Første klik: aktivt materiale → aktuel kilde; deaktiveret/ukendt → gemt url.
CREATE OR REPLACE FUNCTION public.materiale_foerste_klik(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u public.katalog_udsendelser; _m public.materialer;
BEGIN
  UPDATE public.katalog_udsendelser SET aabnet_at = COALESCE(aabnet_at, now()) WHERE id = _id AND status = 'sendt' RETURNING * INTO _u;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _m FROM public.materialer WHERE id = _u.materiale_id AND aktiv;
  IF FOUND THEN
    IF _m.type = 'pdf' THEN RETURN jsonb_build_object('pdf_path', _m.pdf_path); END IF;
    RETURN jsonb_build_object('url', _m.url);
  END IF;
  RETURN jsonb_build_object('url', _u.katalog_url);
END;
$$;
REVOKE ALL ON FUNCTION public.materiale_foerste_klik(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materiale_foerste_klik(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.materiale_afslut(_gruppe uuid, _afdeling_nr integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _u public.katalog_udsendelser; _titler text; _kontakt uuid; _aktivitet uuid;
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  SELECT * INTO _u FROM public.katalog_udsendelser WHERE gruppe_id = _gruppe AND sendt_af = auth.uid() AND status = 'sendt' ORDER BY created_at, id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Udsendelse ikke fundet'; END IF;
  IF _u.activity_id IS NOT NULL THEN RETURN _u.activity_id; END IF;
  SELECT string_agg(COALESCE(titel, 'Materiale'), ', ' ORDER BY created_at, id) INTO _titler FROM public.katalog_udsendelser WHERE gruppe_id = _gruppe AND sendt_af = auth.uid() AND status = 'sendt';
  SELECT id INTO _kontakt FROM public.contacts WHERE company_id = _u.company_id AND location_id IS NOT DISTINCT FROM _u.location_id AND lower(email) = lower(_u.modtager_email) LIMIT 1;
  IF _kontakt IS NULL THEN
    INSERT INTO public.contacts(company_id, location_id, name, email, kilde) VALUES (_u.company_id, _u.location_id, COALESCE(NULLIF(_u.modtager_navn, ''), _u.modtager_email), _u.modtager_email, 'crm');
  ELSIF NULLIF(_u.modtager_navn, '') IS NOT NULL THEN
    UPDATE public.contacts SET name = _u.modtager_navn WHERE id = _kontakt;
  END IF;
  INSERT INTO public.activities(company_id, location_id, created_by, activity_type, note, next_action, next_followup_date, afdeling_nr)
    VALUES (_u.company_id, _u.location_id, auth.uid(), 'email', 'Materiale sendt: ' || _titler || E'\nTil ' || CASE WHEN NULLIF(_u.modtager_navn, '') IS NOT NULL THEN _u.modtager_navn || ' <' || _u.modtager_email || '>' ELSE _u.modtager_email END, 'Følg op på tilsendt materiale', (now() AT TIME ZONE 'Europe/Copenhagen')::date + 7, COALESCE(_afdeling_nr, 11)) RETURNING id INTO _aktivitet;
  UPDATE public.katalog_udsendelser SET activity_id = _aktivitet WHERE gruppe_id = _gruppe AND sendt_af = auth.uid() AND status = 'sendt';
  RETURN _aktivitet;
END;
$$;
REVOKE ALL ON FUNCTION public.materiale_afslut(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materiale_afslut(uuid, integer) TO authenticated;
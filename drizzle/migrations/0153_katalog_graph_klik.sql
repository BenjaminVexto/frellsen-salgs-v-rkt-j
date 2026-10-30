ALTER TABLE public.katalog_udsendelser ADD COLUMN aabnet_at timestamptz;
GRANT UPDATE ON public.katalog_udsendelser TO authenticated;
CREATE POLICY "Ret egne katalogudsendelser" ON public.katalog_udsendelser FOR UPDATE TO authenticated USING (sendt_af = auth.uid() AND public.can_view_company(auth.uid(), company_id)) WITH CHECK (sendt_af = auth.uid() AND public.can_view_company(auth.uid(), company_id));
CREATE OR REPLACE FUNCTION public.katalog_foerste_klik(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text;
BEGIN
  UPDATE public.katalog_udsendelser SET aabnet_at = COALESCE(aabnet_at, now()) WHERE id = _id AND status = 'sendt' AND katalog_url ~ '^https?://' RETURNING katalog_url INTO _url;
  RETURN _url;
END;
$$;
REVOKE ALL ON FUNCTION public.katalog_foerste_klik(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.katalog_foerste_klik(uuid) TO anon, authenticated;
CREATE OR REPLACE FUNCTION public.katalog_afslut(_id uuid, _afdeling_nr integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE _u public.katalog_udsendelser; _kontakt uuid; _aktivitet uuid;
BEGIN
  IF auth.uid() IS NULL OR public.er_telemarketing() THEN RAISE EXCEPTION 'Ingen adgang'; END IF;
  SELECT * INTO _u FROM public.katalog_udsendelser WHERE id = _id AND sendt_af = auth.uid() AND status = 'sendt' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Udsendelse ikke fundet'; END IF;
  IF _u.activity_id IS NOT NULL THEN RETURN _u.activity_id; END IF;
  SELECT id INTO _kontakt FROM public.contacts WHERE company_id = _u.company_id AND location_id IS NOT DISTINCT FROM _u.location_id AND lower(email) = lower(_u.modtager_email) LIMIT 1;
  IF _kontakt IS NULL THEN
    INSERT INTO public.contacts(company_id, location_id, name, email, kilde) VALUES (_u.company_id, _u.location_id, COALESCE(NULLIF(_u.modtager_navn, ''), _u.modtager_email), _u.modtager_email, 'crm');
  ELSIF NULLIF(_u.modtager_navn, '') IS NOT NULL THEN
    UPDATE public.contacts SET name = _u.modtager_navn WHERE id = _kontakt;
  END IF;
  INSERT INTO public.activities(company_id, location_id, created_by, activity_type, note, next_action, next_followup_date, afdeling_nr)
    VALUES (_u.company_id, _u.location_id, auth.uid(), 'email', 'Katalog sendt til ' || CASE WHEN NULLIF(_u.modtager_navn, '') IS NOT NULL THEN _u.modtager_navn || ' <' || _u.modtager_email || '>' ELSE _u.modtager_email END, 'Følg op på tilsendt katalog', (now() AT TIME ZONE 'Europe/Copenhagen')::date + 7, COALESCE(_afdeling_nr, 11)) RETURNING id INTO _aktivitet;
  UPDATE public.katalog_udsendelser SET activity_id = _aktivitet WHERE id = _id;
  RETURN _aktivitet;
END;
$$;
REVOKE ALL ON FUNCTION public.katalog_afslut(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.katalog_afslut(uuid, integer) TO authenticated;
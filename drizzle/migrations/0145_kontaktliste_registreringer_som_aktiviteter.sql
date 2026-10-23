CREATE OR REPLACE FUNCTION public._udfald_tekst(_udfald text, _aarsag text, _note text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT concat_ws(' — ',
    concat_ws(' · ',
      CASE _udfald WHEN 'ingen_svar' THEN 'Ingen svar' WHEN 'ring_igen' THEN 'Optaget / ring igen'
        WHEN 'forkert_nummer' THEN 'Forkert nummer' WHEN 'ikke_interesseret' THEN 'Ikke interesseret'
        WHEN 'oensker_ikke_kontakt' THEN 'Ønsker ikke kontakt' WHEN 'tilbud_oensket' THEN 'Ønsker tilbud/materiale'
        WHEN 'moede_booket' THEN 'Møde booket' WHEN 'ikke_opnaaet' THEN 'Ikke opnået' WHEN 'note' THEN 'Note' ELSE _udfald END,
      CASE _aarsag WHEN 'har_leverandoer' THEN 'Har leverandør' WHEN 'ingen_kaffe' THEN 'Ingen kaffe'
        WHEN 'for_lille' THEN 'For lille' WHEN 'andet' THEN 'Andet' ELSE nullif(_aarsag,'') END),
    nullif(trim(_note),''))
$$;

CREATE OR REPLACE FUNCTION public._opkald_til_aktivitet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_act uuid;
BEGIN
  IF NEW.activity_id IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activities (company_id, created_by, activity_type, note, next_followup_date, contact_list_assignment_id, afdeling_nr, udfoert_at, created_at)
  SELECT NEW.company_id, NEW.user_id,
    (CASE WHEN NEW.udfald = 'moede_booket' THEN 'møde' WHEN NEW.udfald IN ('ingen_svar','forkert_nummer') THEN 'ikke_truffet' ELSE 'opkald' END)::public.activity_type,
    public._udfald_tekst(NEW.udfald, NEW.aarsag, NEW.note),
    (coalesce(NEW.ring_igen_at, CASE WHEN NEW.udfald='moede_booket' THEN NEW.moede_at END) AT TIME ZONE 'Europe/Copenhagen')::date,
    (SELECT id FROM public.contact_list_assignments WHERE contact_list_id = NEW.contact_list_id AND company_id = NEW.company_id LIMIT 1),
    c.afdeling_nr, coalesce(NEW.created_at, now()), coalesce(NEW.created_at, now())
  FROM public.companies c WHERE c.id = NEW.company_id
  RETURNING id INTO v_act;
  NEW.activity_id := v_act;
  RETURN NEW;
END $$;

CREATE TRIGGER opkald_til_aktivitet BEFORE INSERT ON public.kontaktliste_opkald
FOR EACH ROW EXECUTE FUNCTION public._opkald_til_aktivitet();

-- Backfill: historiske registreringer uden aktivitet (14-dages-vagten slås fra under backfill)
ALTER TABLE public.activities DISABLE TRIGGER trg_activities_udfoert;
DO $$
DECLARE r record; v_act uuid;
BEGIN
  FOR r IN SELECT o.* FROM public.kontaktliste_opkald o WHERE o.activity_id IS NULL ORDER BY o.created_at LOOP
    INSERT INTO public.activities (company_id, created_by, activity_type, note, next_followup_date, contact_list_assignment_id, afdeling_nr, udfoert_at, created_at, opportunity_id)
    SELECT r.company_id, r.user_id,
      (CASE WHEN r.udfald = 'moede_booket' THEN 'møde' WHEN r.udfald IN ('ingen_svar','forkert_nummer') THEN 'ikke_truffet' ELSE 'opkald' END)::public.activity_type,
      public._udfald_tekst(r.udfald, r.aarsag, r.note),
      (coalesce(r.ring_igen_at, CASE WHEN r.udfald='moede_booket' THEN r.moede_at END) AT TIME ZONE 'Europe/Copenhagen')::date,
      (SELECT id FROM public.contact_list_assignments WHERE contact_list_id = r.contact_list_id AND company_id = r.company_id LIMIT 1),
      c.afdeling_nr, r.created_at, r.created_at,
      (SELECT id FROM public.sales_opportunities WHERE kontaktliste_opkald_id = r.id)
    FROM public.companies c WHERE c.id = r.company_id
    RETURNING id INTO v_act;
    UPDATE public.kontaktliste_opkald SET activity_id = v_act WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE public.activities ENABLE TRIGGER trg_activities_udfoert;

-- Seneste aktivitet pr. virksomhed på en liste (alle roller, også telemarketing)
CREATE OR REPLACE FUNCTION public.tm_seneste_aktivitet(_list uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Ikke logget ind' USING ERRCODE = '42501'; END IF;
  IF public.er_telemarketing() AND NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(x.company_id, jsonb_build_object('at', x.udfoert_at, 'bruger', x.bruger, 'note', x.note))
    FROM (
      SELECT DISTINCT ON (a.company_id) a.company_id, a.udfoert_at, p.full_name AS bruger, a.note
      FROM public.contact_list_assignments cla
      JOIN public.activities a ON a.company_id = cla.company_id
      LEFT JOIN public.profiles p ON p.id = a.created_by
      WHERE cla.contact_list_id = _list
      ORDER BY a.company_id, a.udfoert_at DESC, a.created_at DESC
    ) x), '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.tm_seneste_aktivitet(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tm_seneste_aktivitet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_pre_request()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p text := coalesce(current_setting('request.path', true), '');
BEGIN
  IF p LIKE '/rpc/%' AND public.er_telemarketing()
     AND split_part(substr(p, 6), '?', 1) NOT IN ('tm_virksomheder','tm_registrer_opkald','registrer_udfald','tm_gem_kontakt','tm_er_ringer','tm_seneste_aktivitet','er_telemarketing','has_role','is_admin','my_afdelinger') THEN
    RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501';
  END IF;
END $function$;
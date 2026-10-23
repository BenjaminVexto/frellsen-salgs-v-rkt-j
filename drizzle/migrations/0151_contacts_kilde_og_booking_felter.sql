-- 1) Kilde på kontakter
CREATE TYPE public.kontakt_kilde AS ENUM ('visma', 'cvr', 'crm', 'telemarketing');

ALTER TABLE public.contacts ADD COLUMN kilde public.kontakt_kilde;

-- Backfill: CVR-direktører kendes på titlen, booking-kontakter på moede_contact_id, resten er tastet i CRM
UPDATE public.contacts SET kilde = 'cvr' WHERE title ILIKE '%(CVR)%';
UPDATE public.contacts SET kilde = 'telemarketing' WHERE kilde IS NULL AND id IN (SELECT moede_contact_id FROM public.kontaktliste_opkald WHERE moede_contact_id IS NOT NULL);
UPDATE public.contacts SET kilde = 'crm' WHERE kilde IS NULL;

ALTER TABLE public.contacts ALTER COLUMN kilde SET DEFAULT 'crm';
ALTER TABLE public.contacts ALTER COLUMN kilde SET NOT NULL;

-- 2) Modtager kobles til kontaktperson (navn/e-mail gemmes fortsat som snapshot)
ALTER TABLE public.quote_recipients ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX quote_recipients_contact_idx ON public.quote_recipients(contact_id);

-- 3) tm_gem_kontakt: nye kontakter fra booking får kilde telemarketing;
--    opdatering udfylder kun tomme felter og ændrer aldrig kilde
CREATE OR REPLACE FUNCTION public.tm_gem_kontakt(_list uuid, _company uuid, _id uuid, _navn text, _titel text, _telefon text, _email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contact_list_assignments WHERE contact_list_id = _list AND company_id = _company) THEN
    RAISE EXCEPTION 'Virksomheden er ikke på listen' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(_navn),'') = '' THEN RAISE EXCEPTION 'Navn mangler'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.contacts (company_id, name, title, phone, email, kilde) VALUES (_company, trim(_navn), _titel, _telefon, _email, 'telemarketing') RETURNING id INTO v;
  ELSE
    UPDATE public.contacts SET
      name = trim(_navn),
      title = coalesce(nullif(title, ''), _titel),
      phone = coalesce(nullif(phone, ''), _telefon),
      email = coalesce(nullif(email, ''), _email)
    WHERE id = _id AND company_id = _company RETURNING id INTO v;
    IF v IS NULL THEN RAISE EXCEPTION 'Kontaktperson findes ikke'; END IF;
  END IF;
  RETURN v;
END $$;

-- 4) registrer_udfald med kontaktfelter ved mødebooking (udfylder kun tomme felter)
DROP FUNCTION public.registrer_udfald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid);
CREATE FUNCTION public.registrer_udfald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL::text, _note text DEFAULT NULL::text, _ring_igen_at timestamptz DEFAULT NULL::timestamptz, _moede_at timestamptz DEFAULT NULL::timestamptz, _contact_id uuid DEFAULT NULL::uuid, _kontakt_titel text DEFAULT NULL::text, _kontakt_telefon text DEFAULT NULL::text, _kontakt_email text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a record; v_saelger uuid; v_act uuid; v_status public.assignment_status; v_navn text; v_kontakt text; v_id uuid; v_tid text;
  v_rolle text; v_forsoeg int; v_ingen int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Ikke logget ind' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.contact_list_assignments WHERE contact_list_id = _list AND company_id = _company LIMIT 1;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Virksomheden er ikke på listen' USING ERRCODE = '42501'; END IF;
  IF public.er_telemarketing() THEN
    IF NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501'; END IF;
    v_rolle := 'telemarketing';
  ELSIF public.is_admin(auth.uid()) THEN v_rolle := 'admin';
  ELSIF a.assigned_to = auth.uid() THEN v_rolle := 'saelger';
  ELSE RAISE EXCEPTION 'Ingen adgang til virksomheden på listen' USING ERRCODE = '42501';
  END IF;

  -- Fri note: ændrer ikke status og tæller ikke som opkald
  IF _udfald = 'note' THEN
    IF coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Skriv en note'; END IF;
    INSERT INTO public.kontaktliste_opkald (contact_list_id, company_id, user_id, rolle, udfald, note)
    VALUES (_list, _company, auth.uid(), v_rolle, 'note', trim(_note)) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'status', a.status, 'saelger', NULL);
  END IF;

  IF _udfald = 'ring_igen' AND _ring_igen_at IS NULL THEN RAISE EXCEPTION 'Vælg dato/tid for ring igen'; END IF;
  IF _udfald = 'ikke_interesseret' AND coalesce(_aarsag,'') NOT IN ('har_leverandoer','ingen_kaffe','for_lille','andet') THEN RAISE EXCEPTION 'Vælg årsag'; END IF;
  IF _udfald = 'ikke_interesseret' AND _aarsag = 'andet' AND coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Skriv en note ved årsagen "Andet"'; END IF;
  IF _udfald = 'moede_booket' THEN
    IF _moede_at IS NULL OR _contact_id IS NULL OR coalesce(trim(_note),'') = '' THEN
      RAISE EXCEPTION 'Møde kræver dato, tid, kontaktperson og note'; END IF;
    SELECT name INTO v_kontakt FROM public.contacts WHERE id = _contact_id AND company_id = _company;
    IF v_kontakt IS NULL THEN RAISE EXCEPTION 'Kontaktperson findes ikke på virksomheden'; END IF;
    -- Bookingens kontaktoplysninger udfylder kun tomme felter
    UPDATE public.contacts SET
      title = coalesce(nullif(title, ''), nullif(trim(_kontakt_titel), '')),
      phone = coalesce(nullif(phone, ''), nullif(trim(_kontakt_telefon), '')),
      email = coalesce(nullif(email, ''), nullif(trim(_kontakt_email), ''))
    WHERE id = _contact_id;
    v_saelger := public.tm_moede_saelger(_list, _company);
    IF v_saelger IS NULL AND v_rolle <> 'telemarketing' THEN v_saelger := auth.uid(); END IF;
    IF v_saelger IS NULL THEN RAISE EXCEPTION 'Der er ingen sælger til mødet – admin skal vælge en reservesælger på listen'; END IF;
    SELECT name INTO v_navn FROM public.companies WHERE id = _company;
    v_tid := to_char(_moede_at AT TIME ZONE 'Europe/Copenhagen', 'DD-MM-YYYY "kl." HH24:MI');
    INSERT INTO public.activities (company_id, created_by, activity_type, note, next_action, next_followup_date, contact_list_assignment_id, afdeling_nr, udfoert_at)
    VALUES (_company, auth.uid(), 'opfølgning_aftalt',
      'Møde booket af ' || CASE v_rolle WHEN 'telemarketing' THEN 'telemarketing' ELSE 'sælger' END || ' ' || v_tid || ' med ' || v_kontakt || E'\n' || _note,
      'Møde ' || v_tid, (_moede_at AT TIME ZONE 'Europe/Copenhagen')::date, a.id,
      (SELECT afdeling_nr FROM public.companies WHERE id = _company), now())
    RETURNING id INTO v_act;
    IF v_saelger <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, sender_id, company_id, activity_id, message, notification_type)
      VALUES (v_saelger, auth.uid(), _company, v_act, 'Nyt møde booket hos ' || v_navn || ' ' || v_tid || ' med ' || v_kontakt, 'moede_booket');
    END IF;
  END IF;
  IF _udfald = 'oensker_ikke_kontakt' THEN
    UPDATE public.companies SET ikke_kontakt = true, ikke_kontakt_at = now(), ikke_kontakt_af = auth.uid() WHERE id = _company;
  END IF;

  INSERT INTO public.kontaktliste_opkald (contact_list_id, company_id, user_id, rolle, udfald, aarsag, note, ring_igen_at, moede_at, moede_contact_id, moede_saelger_user_id, activity_id)
  VALUES (_list, _company, auth.uid(), v_rolle, _udfald, CASE WHEN _udfald = 'ikke_interesseret' THEN _aarsag END, nullif(trim(_note),''), _ring_igen_at, _moede_at, _contact_id, v_saelger, v_act)
  RETURNING id INTO v_id;

  v_forsoeg := (SELECT count(*) FROM public.kontaktliste_opkald WHERE contact_list_id = _list AND company_id = _company AND udfald = 'ingen_svar');
  v_ingen := (SELECT count(*) FROM public.kontaktliste_opkald o WHERE o.contact_list_id = _list AND o.company_id = _company AND o.udfald = 'ingen_svar'
    AND o.created_at > coalesce((SELECT max(created_at) FROM public.kontaktliste_opkald x WHERE x.contact_list_id = _list AND x.company_id = _company AND x.udfald NOT IN ('ingen_svar','note')), '-infinity'));
  v_status := CASE _udfald
    WHEN 'ingen_svar' THEN CASE WHEN v_ingen >= 3 THEN 'ikke_opnaaet' ELSE 'forsoegt' END
    WHEN 'ring_igen' THEN 'ring_igen' WHEN 'forkert_nummer' THEN 'forkert_nummer'
    WHEN 'ikke_interesseret' THEN 'ikke_interesseret' WHEN 'oensker_ikke_kontakt' THEN 'oensker_ikke_kontakt'
    WHEN 'tilbud_oensket' THEN 'tilbud_oensket' WHEN 'moede_booket' THEN 'møde_booket'
    WHEN 'ikke_opnaaet' THEN 'ikke_opnaaet' END;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Ukendt udfald'; END IF;
  UPDATE public.contact_list_assignments SET status = v_status, updated_at = now(), antal_forsoeg = v_forsoeg,
    status_aarsag = CASE WHEN _udfald = 'ikke_interesseret' THEN _aarsag END,
    next_followup_date = CASE WHEN _udfald = 'ring_igen' THEN (_ring_igen_at AT TIME ZONE 'Europe/Copenhagen')::date
                              WHEN _udfald = 'moede_booket' THEN (_moede_at AT TIME ZONE 'Europe/Copenhagen')::date ELSE next_followup_date END
  WHERE id = a.id;
  RETURN jsonb_build_object('id', v_id, 'status', v_status, 'saelger', (SELECT full_name FROM public.profiles WHERE id = v_saelger));
END $function$;
REVOKE ALL ON FUNCTION public.registrer_udfald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrer_udfald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) TO authenticated;

DROP FUNCTION public.tm_registrer_opkald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid);
CREATE FUNCTION public.tm_registrer_opkald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL::text, _note text DEFAULT NULL::text,
  _ring_igen_at timestamptz DEFAULT NULL::timestamptz, _moede_at timestamptz DEFAULT NULL::timestamptz, _contact_id uuid DEFAULT NULL::uuid,
  _kontakt_titel text DEFAULT NULL::text, _kontakt_telefon text DEFAULT NULL::text, _kontakt_email text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.registrer_udfald(_list, _company, _udfald, _aarsag, _note, _ring_igen_at, _moede_at, _contact_id, _kontakt_titel, _kontakt_telefon, _kontakt_email)
$$;
REVOKE ALL ON FUNCTION public.tm_registrer_opkald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tm_registrer_opkald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid, text, text, text) TO authenticated;
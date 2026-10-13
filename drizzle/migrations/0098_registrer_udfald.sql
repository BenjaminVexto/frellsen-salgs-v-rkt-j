CREATE OR REPLACE FUNCTION public.registrer_udfald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL, _note text DEFAULT NULL, _ring_igen_at timestamptz DEFAULT NULL, _moede_at timestamptz DEFAULT NULL, _contact_id uuid DEFAULT NULL)
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

  IF _udfald = 'ring_igen' AND _ring_igen_at IS NULL THEN RAISE EXCEPTION 'Vælg dato/tid for ring igen'; END IF;
  IF _udfald = 'ikke_interesseret' AND coalesce(_aarsag,'') NOT IN ('har_leverandoer','ingen_kaffe','for_lille','andet') THEN RAISE EXCEPTION 'Vælg årsag'; END IF;
  IF _udfald = 'moede_booket' THEN
    IF _moede_at IS NULL OR _contact_id IS NULL OR coalesce(trim(_note),'') = '' THEN
      RAISE EXCEPTION 'Møde kræver dato, tid, kontaktperson og note'; END IF;
    SELECT name INTO v_kontakt FROM public.contacts WHERE id = _contact_id AND company_id = _company;
    IF v_kontakt IS NULL THEN RAISE EXCEPTION 'Kontaktperson findes ikke på virksomheden'; END IF;
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
  VALUES (_list, _company, auth.uid(), v_rolle, _udfald, CASE WHEN _udfald = 'ikke_interesseret' THEN _aarsag END, _note, _ring_igen_at, _moede_at, _contact_id, v_saelger, v_act)
  RETURNING id INTO v_id;

  v_forsoeg := (SELECT count(*) FROM public.kontaktliste_opkald WHERE contact_list_id = _list AND company_id = _company AND udfald = 'ingen_svar');
  -- "Ingen svar" i træk efter seneste andet udfald
  v_ingen := (SELECT count(*) FROM public.kontaktliste_opkald o WHERE o.contact_list_id = _list AND o.company_id = _company AND o.udfald = 'ingen_svar'
    AND o.created_at > coalesce((SELECT max(created_at) FROM public.kontaktliste_opkald x WHERE x.contact_list_id = _list AND x.company_id = _company AND x.udfald <> 'ingen_svar'), '-infinity'));
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
REVOKE ALL ON FUNCTION public.registrer_udfald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrer_udfald(uuid, uuid, text, text, text, timestamptz, timestamptz, uuid) TO authenticated;

-- Bureauets gamle indgang bruger nu den fælles funktion
CREATE OR REPLACE FUNCTION public.tm_registrer_opkald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL, _note text DEFAULT NULL, _ring_igen_at timestamptz DEFAULT NULL, _moede_at timestamptz DEFAULT NULL, _contact_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.registrer_udfald(_list, _company, _udfald, _aarsag, _note, _ring_igen_at, _moede_at, _contact_id)
$$;

CREATE OR REPLACE FUNCTION public.tm_pre_request()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p text := coalesce(current_setting('request.path', true), '');
BEGIN
  IF p LIKE '/rpc/%' AND public.er_telemarketing()
     AND split_part(substr(p, 6), '?', 1) NOT IN ('tm_virksomheder','tm_registrer_opkald','registrer_udfald','tm_gem_kontakt','tm_er_ringer','er_telemarketing','has_role','is_admin','my_afdelinger') THEN
    RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.er_telemarketing()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'telemarketing')
$$;
GRANT EXECUTE ON FUNCTION public.er_telemarketing() TO authenticated, anon;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ikke_kontakt boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ikke_kontakt_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ikke_kontakt_af uuid;
CREATE OR REPLACE FUNCTION public._ikke_kontakt_vagt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ikke_kontakt AND NOT NEW.ikke_kontakt AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin kan fjerne "Ønsker ikke kontakt"';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ikke_kontakt_vagt ON public.companies;
CREATE TRIGGER trg_ikke_kontakt_vagt BEFORE UPDATE OF ikke_kontakt ON public.companies FOR EACH ROW EXECUTE FUNCTION public._ikke_kontakt_vagt();

ALTER TABLE public.contact_lists ADD COLUMN IF NOT EXISTS moede_modtager text NOT NULL DEFAULT 'distrikt';
ALTER TABLE public.contact_lists ADD COLUMN IF NOT EXISTS moede_saelger_user_id uuid;

CREATE TABLE public.kontaktliste_ringer (
  contact_list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_list_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kontaktliste_ringer TO authenticated;
GRANT ALL ON public.kontaktliste_ringer TO service_role;
ALTER TABLE public.kontaktliste_ringer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin styrer ringere" ON public.kontaktliste_ringer FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Ringer ser egne" ON public.kontaktliste_ringer FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tm_er_ringer(_list uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.kontaktliste_ringer WHERE contact_list_id = _list AND user_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.tm_er_ringer(uuid) TO authenticated;

CREATE TABLE public.kontaktliste_opkald (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  udfald text NOT NULL CHECK (udfald IN ('ingen_svar','ring_igen','forkert_nummer','ikke_interesseret','oensker_ikke_kontakt','moede_booket','ikke_opnaaet')),
  aarsag text,
  note text,
  ring_igen_at timestamptz,
  moede_at timestamptz,
  moede_contact_id uuid,
  moede_saelger_user_id uuid,
  activity_id uuid
);
CREATE INDEX ON public.kontaktliste_opkald (contact_list_id, company_id);
GRANT SELECT ON public.kontaktliste_opkald TO authenticated;
GRANT ALL ON public.kontaktliste_opkald TO service_role;
ALTER TABLE public.kontaktliste_opkald ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ser opkald" ON public.kontaktliste_opkald FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Ringer ser egne opkald" ON public.kontaktliste_opkald FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.tm_er_ringer(contact_list_id));

CREATE POLICY "Ringer ser tildelte lister" ON public.contact_lists FOR SELECT TO authenticated USING (public.tm_er_ringer(id));
CREATE POLICY "Ringer ser listens rækker" ON public.contact_list_assignments FOR SELECT TO authenticated USING (public.tm_er_ringer(contact_list_id));

DO $$
DECLARE t record; c text;
BEGIN
  FOR t IN SELECT cl.relname FROM pg_class cl JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND cl.relkind IN ('r','p')
      AND cl.relname NOT IN ('contact_lists','contact_list_assignments','kontaktliste_ringer','kontaktliste_opkald')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tm_spaerret ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY tm_spaerret ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()))', t.relname);
  END LOOP;
  FOREACH c IN ARRAY ARRAY['contact_lists','contact_list_assignments'] LOOP
    EXECUTE format('CREATE POLICY tm_ingen_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT (SELECT public.er_telemarketing()))', c);
    EXECUTE format('CREATE POLICY tm_ingen_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT (SELECT public.er_telemarketing()))', c);
    EXECUTE format('CREATE POLICY tm_ingen_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT (SELECT public.er_telemarketing()))', c);
  END LOOP;
END $$;

DROP POLICY IF EXISTS tm_spaerret ON storage.objects;
CREATE POLICY tm_spaerret ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

ALTER VIEW public.salgsintelligens_mersalg SET (security_invoker = on);
ALTER VIEW public.salgsintelligens_penhed_status SET (security_invoker = on);

CREATE OR REPLACE FUNCTION public.tm_moede_saelger(_list uuid, _company uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN l.moede_modtager = 'fast' THEN l.moede_saelger_user_id
  ELSE COALESCE((
    SELECT COALESCE(d.saelger_user_id, d.daekkes_af_user_id)
    FROM public.companies c
    JOIN public.postnummer_flade_map m ON m.postnr = left(regexp_replace(coalesce(c.zip,''),'\D','','g'),4)
    JOIN public.distrikt_flade df ON df.flade = m.flade
    JOIN public.distrikter d ON d.id = df.distrikt_id
    WHERE c.id = _company LIMIT 1), l.moede_saelger_user_id) END
  FROM public.contact_lists l WHERE l.id = _list
$$;
REVOKE EXECUTE ON FUNCTION public.tm_moede_saelger(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tm_virksomheder(_list uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.tm_er_ringer(_list) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'liste', (SELECT jsonb_build_object('id', l.id, 'navn', l.name, 'manus', coalesce(l.purpose, l.description)) FROM public.contact_lists l WHERE l.id = _list),
    'virksomheder', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', a.id, 'status', a.status, 'next_followup_date', a.next_followup_date,
      'company_id', c.id, 'navn', c.name, 'cvr', c.cvr, 'adresse', c.address, 'postnr', c.zip, 'by', c.city,
      'telefon', c.phone, 'email', c.email, 'hjemmeside', c.website, 'branche', c.main_branch_text, 'ansatte', c.employees,
      'moede_saelger', (SELECT p.full_name FROM public.profiles p WHERE p.id = public.tm_moede_saelger(_list, c.id)),
      'kontakter', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'navn', k.name, 'titel', k.title, 'telefon', k.phone, 'email', k.email) ORDER BY k.is_primary DESC NULLS LAST, k.name), '[]'::jsonb) FROM public.contacts k WHERE k.company_id = c.id),
      'opkald', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'at', o.created_at, 'udfald', o.udfald, 'aarsag', o.aarsag, 'note', o.note, 'ring_igen_at', o.ring_igen_at, 'moede_at', o.moede_at, 'bruger', (SELECT p.full_name FROM public.profiles p WHERE p.id = o.user_id)) ORDER BY o.created_at DESC), '[]'::jsonb) FROM public.kontaktliste_opkald o WHERE o.contact_list_id = _list AND o.company_id = c.id)
    )), '[]'::jsonb)
    FROM public.contact_list_assignments a JOIN public.companies c ON c.id = a.company_id
    WHERE a.contact_list_id = _list AND NOT c.ikke_kontakt));
END $$;
GRANT EXECUTE ON FUNCTION public.tm_virksomheder(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_gem_kontakt(_list uuid, _company uuid, _id uuid, _navn text, _titel text, _telefon text, _email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contact_list_assignments WHERE contact_list_id = _list AND company_id = _company) THEN
    RAISE EXCEPTION 'Virksomheden er ikke på listen' USING ERRCODE = '42501'; END IF;
  IF coalesce(trim(_navn),'') = '' THEN RAISE EXCEPTION 'Navn mangler'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.contacts (company_id, name, title, phone, email) VALUES (_company, trim(_navn), _titel, _telefon, _email) RETURNING id INTO v;
  ELSE
    UPDATE public.contacts SET name = trim(_navn), title = _titel, phone = _telefon, email = _email WHERE id = _id AND company_id = _company RETURNING id INTO v;
    IF v IS NULL THEN RAISE EXCEPTION 'Kontaktperson findes ikke'; END IF;
  END IF;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.tm_gem_kontakt(uuid,uuid,uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_registrer_opkald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL, _note text DEFAULT NULL,
  _ring_igen_at timestamptz DEFAULT NULL, _moede_at timestamptz DEFAULT NULL, _contact_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; v_saelger uuid; v_act uuid; v_status public.assignment_status; v_navn text; v_kontakt text; v_id uuid; v_tid text;
BEGIN
  IF NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.contact_list_assignments WHERE contact_list_id = _list AND company_id = _company LIMIT 1;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Virksomheden er ikke på listen' USING ERRCODE = '42501'; END IF;
  IF _udfald = 'ring_igen' AND _ring_igen_at IS NULL THEN RAISE EXCEPTION 'Vælg dato/tid for ring igen'; END IF;
  IF _udfald = 'ikke_interesseret' AND coalesce(_aarsag,'') = '' THEN RAISE EXCEPTION 'Vælg årsag'; END IF;
  IF _udfald = 'moede_booket' THEN
    IF _moede_at IS NULL OR _contact_id IS NULL OR coalesce(trim(_note),'') = '' THEN
      RAISE EXCEPTION 'Møde kræver dato, tid, kontaktperson og note'; END IF;
    SELECT name INTO v_kontakt FROM public.contacts WHERE id = _contact_id AND company_id = _company;
    IF v_kontakt IS NULL THEN RAISE EXCEPTION 'Kontaktperson findes ikke på virksomheden'; END IF;
    v_saelger := public.tm_moede_saelger(_list, _company);
    IF v_saelger IS NULL THEN RAISE EXCEPTION 'Der er ingen sælger til mødet – admin skal vælge en reservesælger på listen'; END IF;
    SELECT name INTO v_navn FROM public.companies WHERE id = _company;
    v_tid := to_char(_moede_at AT TIME ZONE 'Europe/Copenhagen', 'DD-MM-YYYY "kl." HH24:MI');
    INSERT INTO public.activities (company_id, created_by, activity_type, note, next_action, next_followup_date, contact_list_assignment_id, afdeling_nr, udfoert_at)
    VALUES (_company, auth.uid(), 'opfølgning_aftalt',
      'Møde booket af telemarketing ' || v_tid || ' med ' || v_kontakt || E'\n' || _note,
      'Møde ' || v_tid, (_moede_at AT TIME ZONE 'Europe/Copenhagen')::date, a.id,
      (SELECT afdeling_nr FROM public.companies WHERE id = _company), now())
    RETURNING id INTO v_act;
    INSERT INTO public.notifications (recipient_id, sender_id, company_id, activity_id, message, notification_type)
    VALUES (v_saelger, auth.uid(), _company, v_act, 'Nyt møde booket hos ' || v_navn || ' ' || v_tid || ' med ' || v_kontakt, 'moede_booket');
  END IF;
  IF _udfald = 'oensker_ikke_kontakt' THEN
    UPDATE public.companies SET ikke_kontakt = true, ikke_kontakt_at = now(), ikke_kontakt_af = auth.uid() WHERE id = _company;
  END IF;
  v_status := CASE _udfald
    WHEN 'ingen_svar' THEN 'kontaktet' WHEN 'ring_igen' THEN 'senere_emne' WHEN 'forkert_nummer' THEN 'ikke_relevant'
    WHEN 'ikke_interesseret' THEN 'tabt' WHEN 'oensker_ikke_kontakt' THEN 'ikke_relevant' WHEN 'moede_booket' THEN 'møde_booket'
    WHEN 'ikke_opnaaet' THEN 'ikke_relevant' END;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Ukendt udfald'; END IF;
  UPDATE public.contact_list_assignments SET status = v_status, updated_at = now(),
    next_followup_date = CASE WHEN _udfald = 'ring_igen' THEN (_ring_igen_at AT TIME ZONE 'Europe/Copenhagen')::date ELSE next_followup_date END
  WHERE id = a.id;
  INSERT INTO public.kontaktliste_opkald (contact_list_id, company_id, user_id, udfald, aarsag, note, ring_igen_at, moede_at, moede_contact_id, moede_saelger_user_id, activity_id)
  VALUES (_list, _company, auth.uid(), _udfald, _aarsag, _note, _ring_igen_at, _moede_at, _contact_id, v_saelger, v_act) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'saelger', (SELECT full_name FROM public.profiles WHERE id = v_saelger));
END $$;
GRANT EXECUTE ON FUNCTION public.tm_registrer_opkald(uuid,uuid,text,text,text,timestamptz,timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.telemarketing_brugere()
RETURNS TABLE(user_id uuid, navn text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.user_id, p.full_name FROM public.user_roles r LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.role = 'telemarketing' AND public.is_admin(auth.uid()) ORDER BY 2
$$;
GRANT EXECUTE ON FUNCTION public.telemarketing_brugere() TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_pre_request()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text := coalesce(current_setting('request.path', true), '');
BEGIN
  IF p LIKE '/rpc/%' AND public.er_telemarketing()
     AND split_part(substr(p, 6), '?', 1) NOT IN ('tm_virksomheder','tm_registrer_opkald','tm_gem_kontakt','tm_er_ringer','er_telemarketing','has_role','is_admin','my_afdelinger') THEN
    RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.tm_pre_request() TO authenticated, anon, authenticator;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.tm_pre_request';
NOTIFY pgrst, 'reload config';
